# Code review

Date: 2026-11-22. Scope: the whole repo in the working tree after the fixes below. This replaces the 2026-11-21 review in this file, which found 4 Medium and 27 Low findings and is in git history. All 31 findings are now fixed. Nothing is committed.

## Summary

All 31 findings are fixed: 4 Medium, 27 Low. No Critical or High findings. The seven findings left open by the earlier review are also fixed: its L1 is M3 here, L2 is L12, L3 is L14, L4 is L20, L5 is L24, L6 is L5 and L7 is L10.

Final checks pass: 149 backend tests, 64 frontend unit tests, 18 browser tests, lint, type check, shell syntax, whitespace and all Docker base-image digests. Live AI calls ran in the backend suite and the browser suite.

The fixes change three behaviors worth knowing:

- A board `version` now counts writes, not content. No-op edits do not raise it. `docs/DATABASE.md` says this.
- A copied session cookie stops working after logout. Sessions are held in memory, so they end on restart, even with `PM_SESSION_SECRET` set.
- Titles and details edit fields reset when a newer saved value arrives. An open field can no longer write old text over a chat rename.

## Status

| # | Fix | Finding | Verified by |
|---|---|---|---|
| 1 | Card edit fields keyed on the saved value | M1 | `KanbanBoard.test.tsx`, browser edit test |
| 2 | Empty `choices` and `TypeError` from the SDK become 502 | M2 | `test_ai.py` |
| 3 | No-op board and AI actions skipped; `applied` echoes only used fields | M3 | `test_board.py`, `test_chat.py` |
| 4 | Save-failed message survives other saves already in flight | M4 | `KanbanBoard.test.tsx` |
| 5 | Same-version reply dropped while a save is pending | L1 | `KanbanBoard.test.tsx` |
| 6 | Handlers build the next board from a ref to the latest board | L2 | `KanbanBoard.test.tsx` |
| 7 | Restored draft capped at 2,000 code points | L3 | `ChatSidebar.test.tsx` |
| 8 | History cut by code point, not UTF-16 unit | L4 | `ChatSidebar.test.tsx` |
| 9 | Card is an `article` with a separate drag handle | L5 | `KanbanBoard.test.tsx`, browser drag tests |
| 10 | Columns have `aria-label` | L6 | `KanbanColumn.test.tsx` |
| 11 | Sign out shows the login form without waiting on the request | L7 | `page.test.tsx` |
| 12 | `applied` contains only the fields the action used | L8 | `test_chat.py` |
| 13 | Last card dropped on its own column sends no PATCH | L9 | `kanban.test.ts` |
| 14 | Dragged-over column marked before the drop | L10 | `KanbanColumn.test.tsx` |
| 15 | Exact 20 by 4,000 history limits tested | L11 | `ChatSidebar.test.tsx` |
| 16 | `column_id` alone in the card's own column is a no-op | L12 | `test_board.py`, `backend/AGENTS.md` |
| 17 | Lone surrogates in credentials return 401 | L13 | `test_auth.py` |
| 18 | Logout revokes the session id in memory | L14 | `test_auth.py` |
| 19 | `/api` catch-all covers HEAD, OPTIONS and bare `/api` | L15 | `test_main.py` |
| 20 | Reply capped at 4,000 characters, actions at 20 | L16 | `test_chat.py` |
| 21 | Board snapshot trade-off documented in code and docs | L17 | Read `chat.py`, `backend/AGENTS.md` |
| 22 | Parallel `init` serialized; login fields limited to 200 | L18 | `test_db.py`, `test_auth.py` |
| 23 | Schema test checks foreign keys, indexes, defaults and STRICT | L19 | `test_db.py` |
| 24 | Dependencies upgraded; `frontend/AGENTS.md` version updated | L20 | All suites after `uv lock --upgrade` and `npm install` |
| 25 | Windows failure paths fixed | L21 | Code review |
| 26 | Health wait timeout and container cleanup added | L22 | `bash -n`, byte comparison |
| 27 | Nested `.env` patterns fixed | L23 | `git check-ignore` |
| 28 | Generated test output untracked; lint and coverage config fixed | L24 | `git ls-files` |
| 29 | Base images pinned by digest | L25 | `docker buildx imagetools inspect` |
| 30 | Stale docs updated | L26 | Read `AGENTS.md`, `CLAUDE.md`, `docs/PLAN.md` |
| 31 | Brittle assertions and keyboard sync fixed | L27 | All 18 browser tests |

## Severity scale

| Severity | Meaning |
|---|---|
| Critical | Data loss, a security hole others can reach, or the app cannot be used. Fix now. |
| High | A main feature behaves wrongly with no workaround, or a security risk that must be fixed before the next release. |
| Medium | Wrong behavior that corrects itself or has a workaround. Fix soon. |
| Low | Edge cases, maintenance, docs, and risks accepted for a local single-user MVP. |

## Medium findings

### M1. An open card edit field wrote an old title over a newer board

The input and textarea used `defaultValue` with no `key`, so React kept the DOM node when a chat reply or reload changed the card. Blurring sent the old text to the server and lost the new title.

**Fix:** `frontend/src/components/KanbanCard.tsx` keys the title input on `card.title` and the textarea on `card.details`. A newer saved value remounts the field with that value.

**Verified by:** a new `KanbanBoard.test.tsx` case opens the title field, applies a faked chat rename and blurs. No PATCH is sent. The browser edit test still passes.

### M2. An AI reply with no choices returned 500

The SDK accepts a completion with `choices: []`. Indexing `[0]` raised `IndexError`, and no handler turned it into a 502. The SDK can also raise `TypeError` while parsing a malformed response before `ask` sees it.

**Fix:** `backend/app/ai.py` catches `TypeError` in the existing handler and checks the choices list before reading it. Both paths raise `AIError`, which `errors.py` maps to 502.

**Verified by:** new `test_ai.py` cases for an empty choices list and a response with no choices field.

### M3. No-op changes raised the version and were reported as applied

An empty card edit, a column renamed to its current title and an AI action with only an id wrote nothing but still called `_changed`. Two no-op AI actions appeared in `applied` with an empty `skipped` list.

**Fix:** `backend/app/board.py` change functions return `True` or `False`. A function that would write nothing returns before `_changed`. `backend/app/chat.py` puts no-op actions in `skipped` with reason `No change`, and `applied` echoes only the fields the action used. `docs/DATABASE.md` now says the version counts changes, not content.

**Verified by:** new `test_board.py` and `test_chat.py` cases for the empty PATCH, same-title rename and no-op AI actions.

### M4. A later successful save hid an earlier failed save

If save B failed while save A was still in flight, A's success called `setError(null)` and removed B's failure message.

**Fix:** `frontend/src/components/KanbanBoard.tsx` gives each save an id and a set of pending ids. A failure marks every save already in flight as blocked. A blocked save cannot clear the message; a save started after the failure can.

**Verified by:** two new `KanbanBoard.test.tsx` cases cover both orderings.

## Low findings

### L1. A same-version reply could replace an optimistic board

`shownVersion` only changed in `show`, so an optimistic board left it behind and a reply at that version was accepted. A chat reply built before a pending delete could bring the card back.

**Fix:** `show` also drops a reply at the current version while any save is pending.

**Verified by:** a new `KanbanBoard.test.tsx` case with a pending delete and a v0 chat reply.

### L2. Rapid changes computed the next board from a stale render

Handlers used the `board` value from their render, so two edits before the next render each started from the same board.

**Fix:** `KanbanBoard.tsx` holds the latest board in `boardRef`. Handlers pass a builder to `save`, which builds both the optimistic board and the API payload from that ref. No API call runs inside a React state updater.

**Verified by:** a new `KanbanBoard.test.tsx` case with two delayed PATCHes.

### L3. Two field errors were shown as an AI failure

A failed message plus text typed while waiting could exceed the backend's 2,000-character limit and get a 422, which the UI showed as an AI failure.

**Fix:** `ChatSidebar.tsx` truncates the restored draft to 2,000 code points.

**Verified by:** a new `ChatSidebar.test.tsx` case sends exactly 2,000 code points on retry.

### L4. History truncation split UTF-16 units

`slice(0, 4000)` cut between surrogate pairs. Pydantic counts code points.

**Fix:** the sidebar uses `Array.from(text).slice(0, 4000).join("")`.

**Verified by:** a new `ChatSidebar.test.tsx` case keeps an emoji whole at the cut.

### L5. A card was a button containing buttons and fields

dnd-kit gave the card `role="button"` while the card held Edit, Remove and input elements.

**Fix:** the card is an `article`; a separate button holds the activator ref, listeners and dnd-kit attributes. Dragging starts from that handle. Do not use dnd-kit's `disabled` option, which sets `aria-disabled` on the whole card.

**Verified by:** a new `KanbanBoard.test.tsx` case checks that no button contains another button, input or textarea. Browser drag tests use the handle.

### L6. Columns had no accessible name

The `section` had only a `data-testid`.

**Fix:** `KanbanColumn.tsx` sets `aria-label={column.title}`.

**Verified by:** a new `KanbanColumn.test.tsx` case finds the named region.

### L7. Sign out waited on a request with no timeout or feedback

A hanging logout request kept the user on the board. A 401 from the board load also kept the loading text on screen.

**Fix:** `page.tsx` calls `setSession` first, then sends logout in the background. The board's 401 path already called `onSignOut`.

**Verified by:** a new `page.test.tsx` case with a logout promise that never resolves.

### L8. AI actions carried fields their type ignores

A `move` with a stray `title` was reported as applied without renaming anything.

**Fix:** `chat.py` has one field list per action type. `applied` copies the action with unused fields set to null.

**Verified by:** a new `test_chat.py` case checks the reported shape.

### L9. Dropping the last card on its own column sent a no-op PATCH

The same-column branch always returned a new array, so the caller's identity check did not catch it.

**Fix:** `frontend/src/lib/kanban.ts` returns the same array when the card is already last in that column. The caller skips the save.

**Verified by:** a new `kanban.test.ts` case.

### L10. There was no drop preview between columns

**Fix:** `KanbanBoard.tsx` handles `onDragOver`, resolves the column from the hovered id and passes `preview` to `KanbanColumn`. The column shows the existing yellow ring.

**Verified by:** a new `KanbanColumn.test.tsx` case checks `data-preview` on the hovered column. This is a ring, not a gap in the card list.

### L11. History had no exact-boundary test

**Fix:** `ChatSidebar.test.tsx` now tests 20 messages at exactly 4,000 characters and a 4,001st character being cut.

**Verified by:** three new cases cover the emoji boundary, 20 messages at the limit and the first cut character. Backend limits were already tested.

### L12. A same-column move with only `column_id` sent the card to the bottom

`PATCH /api/cards/1` with `{"column_id": 1}` reordered the card and raised the version. The docs did not say this happened in the card's own column.

**Fix:** `update_card` treats `column_id` alone as a move only when it names another column. A `position` still moves the card within its column. `backend/AGENTS.md` says this.

**Verified by:** a new `test_board.py` case and the route docs.

### L13. A lone surrogate in credentials returned 500

`username.encode()` used strict UTF-8.

**Fix:** `auth.py` encodes with `surrogatepass`; `api/auth.py` replaces surrogates before Pydantic validation so its error body can be encoded. Both return 401 for a bad credential.

**Verified by:** `test_auth.py` cases send raw JSON with a lone surrogate in each field.

### L14. A copied session cookie worked after sign-out

Logout cleared the cookie but did not revoke the session.

**Fix:** `backend/app/sessions.py` holds random session ids in memory. Login creates one, every signed-in route checks it and logout revokes it. A copied cookie gets 401. A restart signs everyone out, even with `PM_SESSION_SECRET` set. This is recorded in `backend/AGENTS.md`.

**Verified by:** `test_auth.py` cases for a copied cookie after logout and a tampered cookie.

### L15. The `/api` catch-all missed three cases

`HEAD` and `OPTIONS` were not declared, and bare `/api` fell through to the frontend's HTML 404 page.

**Fix:** `backend/app/api/__init__.py` registers both `""` and `/{path:path}` for all seven methods, after the real routers.

**Verified by:** `test_main.py` parametrizes all seven methods over both paths.

### L16. AI output size and action count were not capped

**Fix:** `chat.py` rejects a reply over 4,000 characters or more than 20 actions as unreadable output. Nothing is applied and the route returns 502.

**Verified by:** new `test_chat.py` cases at both limits.

### L17. AI actions were built from a board snapshot that could go stale

The board is read, the AI answers outside the transaction, then actions are applied against the current board. Ids are checked again, but positions and titles are not.

**Fix:** accepted behavior, now documented in the `respond` docstring and `backend/AGENTS.md`. Avoiding a 30-second write lock is deliberate.

**Verified by:** a new `test_chat.py` case mutates the board while the AI answers and checks that ids are rechecked but a stale position is applied to the current board. The behavior is documented in `chat.py` and `backend/AGENTS.md`.

### L18. Two startup and input limits were unguarded

`db.init()` read `user_version` outside the transaction; login fields had no length limit.

**Fix:** `db.py` runs the schema steps under the transaction. `api/auth.py` limits each credential to 200 characters.

**Verified by:** `test_db.py` has a parallel `init` case on a fresh file; `test_auth.py` checks 200 characters is accepted and rejects longer input.

### L19. The schema test did not check constraints

**Fix:** `test_db.py` compares `docs/schema.json` against `PRAGMA foreign_key_list`, `index_list`, `table_info` defaults and `STRICT`, as well as `user_version`.

**Verified by:** the expanded `test_db.py`.

### L20. Dependencies were behind the latest

**Fix:** `next` and `eslint-config-next` are pinned at 16.4.6. `uv lock --upgrade` moved `fastapi` to 0.165.0, `openai` to 3.57.0, `pydantic` to 2.14.4, `httpx2` and `httpcore2` to 2.16.2, with transitives. `frontend/AGENTS.md` names the new Next.js version. OpenRouter and the app work on the new `openai` version; no rollback was needed.

**Verified by:** the full suites after the upgrade. `npm audit` moderate advisories went from 8 to 7; the remaining ones are in the `minimatch` chain under `typescript-eslint`.

### L21. The Windows scripts had untested failure paths

**Fix:** both PowerShell scripts use `$ErrorActionPreference = "Continue"` so Docker progress on stderr is not a terminating error on Windows PowerShell 5.1. They check `$LASTEXITCODE` after the container lookup and `docker rm -f`.

**Verified by:** code review. The scripts have still not been run; there is no Windows host here.

### L22. The bash health wait could hang and left a failed container behind

**Fix:** `start-mac.sh` and `start-linux.sh` use `curl -sf --max-time 2`, and remove the container on the failure path. The two files are byte-identical for Mac and Linux.

**Verified by:** `bash -n` on all four shell scripts and byte comparison.

### L23. Ignore patterns left gaps for nested env files

**Fix:** `.dockerignore` and `.gitignore` use `**/.env*`.

**Verified by:** code review. Still not confirmed with a nested `.env` build.

### L24. Generated Playwright output was tracked

**Fix:** `frontend/.gitignore` has `/test-results/`, and `git rm --cached` removed `frontend/test-results/.last-run.json` from the index. `eslint.config.mjs` ignores `coverage/**` and `vitest.config.ts` limits coverage to `src/`.

**Verified by:** `git ls-files` and the ignored-file check. The staged deletion is in the working tree.

### L25. Image dependencies used mutable tags

**Fix:** `Dockerfile` pins `node:24-slim`, `python:3.14-slim` and `ghcr.io/astral-sh/uv:0.13.6` by digest.

**Verified by:** `docker buildx imagetools inspect` resolved all three digests. The browser suite rebuilt the image from the pinned Dockerfile.

### L26. Two docs described the project before the build

**Fix:** root `AGENTS.md` now describes the static-export build. `CLAUDE.md` matches `docs/PLAN.md` on the unrun Windows scripts.

**Verified by:** read all three files.

### L27. Several tests asserted implementation details

The keyboard helper matched dnd-kit's exact announcement text and checked `aria-pressed` after the arrow key. `aria-pressed` stays true for the whole drag, so it never waited for the new drop target. Both keyboard e2e tests failed because the drop used the old target. The other brittle assertions were an `/^Edit (?!details)/` locator, a fixed drop offset and exact Tailwind class strings.

**Fix:** cards are found by role and title, titles by `data-testid="card-title"`, and drags use the card the test targets as the drop point. Tailwind assertions check labels and order. The keyboard helper records dnd-kit's live region text after pick-up and waits for it to change after the arrow key. That is a stable sync point with no wording or id match.

**Verified by:** all 18 browser tests pass, including both keyboard tests, with the live AI key.

## In good shape

- **Board changes:** every write goes through `board.py` inside one `BEGIN IMMEDIATE` transaction. Ids are checked before any write. The chat applies several actions in one transaction and skips bad ones.
- **AI failure handling:** non-2xx replies, timeouts, connection failures, malformed output, oversized output and a missing key all become 502 or 503. The AI call runs outside the transaction.
- **Ownership:** the signed-in user cannot touch another user's columns or cards through any route or action. Tests cover both paths.
- **Concurrency:** `check_same_thread=False`, `BEGIN IMMEDIATE`, serialized schema setup and per-test temporary databases are in place. Parallel creates and parallel `init` are tested.
- **Static serving:** `StaticFiles(html=True)` with a traversal test.
- **Docker:** runs as a non-root user, binds to `127.0.0.1:8000`, keeps data in the `pm-data` volume, has a health check, and excludes root and nested `.env` files from the image.
- **Docs:** `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md` and `docs/DATABASE.md` match the code. Input limits agree on both sides: titles 200, details 2,000, message 2,000, history 20 of 4,000.

## What I checked

| Check | Result |
|---|---|
| Read every changed source, test, config, script and doc file, except lock files | Done |
| `uv run --env-file ../.env pytest -q` | 149 passed, live AI included |
| `npm run lint` | Clean |
| `npx tsc --noEmit` | 0 errors |
| `npm run test:unit` | 64 passed in 7 files |
| `npm run test:e2e` with the live AI key | 18 passed in a rebuilt container |
| `git diff --check` | Clean |
| `bash -n scripts/*.sh` | All four pass |
| `docker buildx imagetools inspect` on all three base images | Digests resolve |
| Reconciled the 31 findings against the diff and test names | All fixed |
| `pm-app` on port 8000 | Untouched; e2e uses `pm-app-e2e` on 8001 |

## Not checked

- Python vulnerability audit. `pip-audit` was not run.
- The Windows scripts. There is no Windows host here, so the fixes are from code only.
- How the app looks in a real browser. Only the Playwright tests drove it.
- The quality of the AI's answers beyond the live tests.
- Whether a nested `.env` is excluded by the current `.dockerignore` patterns. This follows Docker's documented matching rules; no build test used a nested `.env`.
- No commit or push. All changes are in the working tree.
