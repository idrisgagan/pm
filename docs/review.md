# Code review

Date: 2026-11-22. Scope: the whole repo at commit `6bb6620` (clean working tree). Separate from `docs/code_review.md`, which records the earlier review and its fixes.

## Summary

One Medium and six Low findings. No Critical or High findings.

The Medium finding breaks a rule in `CLAUDE.md`: "Bad model output must never cause a 500." An id too large for SQLite gives a 500 from the board routes and from the chat. In the chat it also throws away every other action in the same reply.

The code is in good shape otherwise. Board changes all go through `board.py`, the transaction and version rules are applied consistently, and the frontend's handling of out-of-order replies holds up under the cases I traced.

## Findings

| # | Severity | Finding | Where |
|---|---|---|---|
| M1 | Medium | Ids too large for SQLite cause a 500 | `backend/app/board.py`, `backend/app/chat.py`, `backend/app/api/board.py` |
| L1 | Low | Setting a card field to its current value counts as a change | `backend/app/board.py:198` |
| L2 | Low | Wrong method on a real `/api` route gives 404, not 405 | `backend/app/api/__init__.py:32` |
| L3 | Low | A slow logout reply can sign out a newer session | `frontend/src/app/page.tsx:19` |
| L4 | Low | A failed add-card loses the typed title and details | `frontend/src/components/NewCardForm.tsx:18` |
| L5 | Low | `DATABASE.md` describes migration transactions wrongly | `docs/DATABASE.md`, `backend/app/db.py:72` |
| L6 | Low | The in-memory session set never shrinks | `backend/app/sessions.py:9` |

### M1. Ids too large for SQLite cause a 500

SQLite integers stop at 2^63 - 1. Python's `sqlite3` raises `OverflowError` for anything larger. Nothing catches it, so FastAPI returns 500.

Ids reach SQL without an upper bound in three places:

- Path ids in `api/board.py` (`column_id: int`, `card_id: int`).
- `column_id` in `CardCreate` and `CardUpdate` (`board.py:63`, `board.py:71`).
- `card_id` from the AI in `chat._apply` (`chat.py:77`, `chat.py:80`, `chat.py:82`), which is passed straight to `board.update_card` or `board.delete_card` without any model check.

`chat.respond` catches only `NotFound` and `ValidationError`. The `OverflowError` leaves the `open_board` block, which rolls back, so actions that had already applied in that reply are lost too.

Checked with a throwaway test against the real app:

| Request | Result |
|---|---|
| `PATCH /api/cards/100000000000000000000` | 500 |
| `POST /api/cards` with `column_id` 10^20 | 500 |
| Chat reply: a valid `create`, then `delete` with `card_id` 10^20 | 500, and the created card is not on the board |

`backend/AGENTS.md` says bad input gets 422. These cases do not.

Fix: one bounded id type in `board.py`, for example `Id = Annotated[int, Field(ge=1, le=2**63 - 1)]`, used for `column_id` in both models and for the path ids in `api/board.py`. In `chat._apply`, check `card_id` the same way before calling `board`, and skip the action with a reason. Do not put the bound on `chat.Action` itself: that would turn one bad id into a 502 for the whole reply instead of one skipped action. Add tests for each of the three rows above.

### L1. Setting a card field to its current value counts as a change

`rename_column` returns `False` when the new title equals the current one (`board.py:181`). `update_card` does not compare. A title or details equal to the current value is written, the version goes up, and the chat reports the action as applied. A `position` equal to the card's current position does the same.

Checked: a chat `update` with the card's current title came back with 1 applied, 0 skipped, version 0 to 1. A `PATCH` with `{"position": 0}` on the first card raised the version again.

`backend/AGENTS.md` says "An action that writes nothing is skipped with reason `No change`", and `docs/code_review.md` says "No-op edits do not raise it." Neither is true for these cases. `docs/DATABASE.md` lists only three no-ops (empty edit, same column title, move naming the current column), so it matches the code.

The frontend never sends these edits, so users do not see it. The cost is an extra version and a misleading `applied` entry in chat replies.

Fix: either compare current values in `update_card` and return `False` when nothing differs, or narrow the wording in `backend/AGENTS.md` and `docs/code_review.md` to match `DATABASE.md`. I lean to the code change, because it makes `update_card` behave like `rename_column`.

### L2. Wrong method on a real `/api` route gives 404, not 405

The catch-all in `api/__init__.py` accepts every method. Starlette tries routes in order: `/api/board` matches the path but not `PUT`, so it moves on and the catch-all answers. Checked: `PUT /api/board` returns 404.

No caller depends on this. It matters only for anyone calling the API by hand. Fix if wanted: in the catch-all, return 405 when another route matches the path. Otherwise note the behavior in `backend/AGENTS.md`.

### L3. A slow logout reply can sign out a newer session

`handleSignOut` shows the login form at once and sends `/api/logout` without waiting. The logout reply clears the cookie (checked: `set-cookie: pm_session=null; ... expires=Thu, 01 Jan 1970`). If the user signs in again before that reply arrives, the late reply deletes the new session cookie. The next board call gets 401 and the user is sent back to the login form.

On localhost the logout reply takes milliseconds, so this needs a stalled request. The code comment in `page.tsx` names a hanging request as the case it is designed for, which is the case where this happens.

Fix: have `LoginForm` wait for the pending logout before calling `login` (keep the promise from `handleSignOut` and pass it down), or disable the Sign in button until it settles.

### L4. A failed add-card loses the typed title and details

`NewCardForm.handleSubmit` calls `onAdd`, then clears and closes the form straight away. A new card is not shown until the server replies (`KanbanBoard.handleAddCard`). If the save fails, the board reloads and shows the error, but the card and the text the user typed are gone.

Fix: keep the form's text until the save succeeds. That needs `onAdd` to return the save's promise, or a success flag, so the form can reset only then.

### L5. `DATABASE.md` describes migration transactions wrongly

`DATABASE.md` says: "Each step runs in a transaction, so a failed step leaves the file at the version before it." `db.init` runs every pending step inside one transaction (`db.py:72`). If the file is at version 1 and step 3 fails, step 2 is rolled back too, and the file stays at version 1.

The code is the safer design (it also stops two processes racing on a fresh file). Fix the doc: "All pending steps run in one transaction, so a failure leaves the file at the version it had before startup."

### L6. The in-memory session set never shrinks

`sessions.create` adds an id on every login. Only `revoke` (logout) removes one. The cookie expires after 14 days, but its id stays in `_valid` until the app restarts. For one local user this is a few bytes per login and does not matter. It would matter for a long-running deployment with many users, which the database-backed sessions in the plan would replace anyway. No fix needed now. Worth a line in `backend/AGENTS.md` under Sign-in so it is not forgotten.

## Checked and not raised

- Out-of-order replies in `KanbanBoard.show`, including a failed save while another is in flight, a chat reply with no applied actions, and a chat reply that lands between an optimistic change and its reply. Each case either drops the stale board or is corrected by the next reply.
- Drag-and-drop positions: the index `moveCard` produces matches the backend's "position among the other cards" rule for same-column and cross-column moves.
- Chat action handling for null ids, negative positions, empty updates and moves, and stray fields. All are skipped or ignored as documented.
- Cross-site requests: `SameSite=Lax` keeps the cookie off cross-site POSTs. A JSON body sent as `text/plain` also gets 422 (checked), so a plain HTML form cannot change the board.
- The container port is bound to `127.0.0.1` in all three start scripts, so the hardcoded password is not reachable from the network.
- `httpx2` is a dev dependency but is imported by `ai.py` at runtime. It is safe: `openai` depends on it (`uv.lock`), so `uv sync --no-dev` installs it.
- Code points vs UTF-16: the frontend's `maxLength` limits are stricter than the backend's, so the frontend never sends text the backend rejects.

## What I ran

| Check | Result |
|---|---|
| `uv run pytest` (backend) | 148 passed, 1 skipped (the live AI test, no key in the shell) |
| `npm run test:unit` | 64 passed |
| `npm run lint` | No errors |
| `npx tsc --noEmit` | No errors |
| `npm run test:e2e` | 17 passed, 1 skipped (the live chat test, no key in the shell) |
| Throwaway probe test (scratchpad, not committed) | Confirmed M1, L1, L2, the cookie-clearing reply in L3, and the `text/plain` case |

Not run: the live AI tests (backend and browser) and the Windows scripts. L4 and L5 come from reading the code, not from a test.
