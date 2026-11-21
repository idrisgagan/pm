# Code review

Date: 2026-11-21. Scope: the whole repo at commit `f56f166`, after Parts 1 to 10.

This replaces the review of `ae223d6` (2026-11-01), which covered the course starter before the backend existed. That version is in git history.

## Summary

The app is in good shape. All tests pass: 110 backend, 49 unit, 18 browser, including both live AI tests. Lint and the type check are clean. 11 of the 12 items on the previous review's rebuild checklist are done, and the twelfth has one gap (L1).

There are no Critical or High findings. There is one Medium: when two saves overlap, an older server reply can arrive last and put stale data back on screen. Part 10 of `docs/PLAN.md` recorded this as a known limit for a chat reply and a board save. A probe showed it also happens between two ordinary board saves, with no chat involved. The rest are Low.

**Update, 2026-11-21:** M1 is fixed. L8, found later the same day during the backend refactor (Part 12 in `docs/PLAN.md`), is also fixed. See "Fix log". L1 to L7 are still open.

## Fix log

| Finding | Change | Verified by |
|---|---|---|
| M1 | Schema step 2 adds `boards.version`. Every board change adds one to it, and every board the API returns includes it. `KanbanBoard.show` drops any board with a lower version than the one on screen. Saves, reloads and chat replies all go through it. Recorded as Part 11 in `docs/PLAN.md`. | 4 new backend tests and 1 new unit test. Each of three deliberate breaks failed at least one of them. Full retest: backend 114 passed (live included), lint and type check clean, unit 50 passed, browser 18 passed (live included). The app on port 8000 upgraded the `pm-data` database to schema version 2 and kept its board. |
| L8 | `auth.check_credentials` compares UTF-8 bytes instead of strings. | 2 new cases in `test_auth.py`, which fail without the fix. On the running app, a non-ASCII sign-in returned 401. |

## Action list

| # | Action | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | Drop board replies older than the board on screen, using a version the server raises on every change | M1 | Medium | Done 2026-11-21 |
| 2 | Skip AI `update` and `move` actions that change no field, with a reason, and add tests | L1 | Low | Open |
| 3 | Decide whether a move to the card's own column with no position should do nothing | L2 | Low | Open |
| 4 | Bump `next` and `eslint-config-next` to 16.4.6, run `uv lock --upgrade`, rerun all tests | L4 | Low | Open |
| 5 | Ignore `test-results/` and `coverage/`, untrack `.last-run.json`, set `coverage.include` | L5 | Low | Open |
| 6 | Record that sign-out does not revoke the cookie, and revisit before the app leaves localhost | L3 | Low | Open |
| 7 | Later: a drag handle for cards, and a drop preview between columns | L6, L7 | Low | Open |
| 8 | Compare sign-in credentials as bytes, so non-ASCII input gets 401 instead of 500 | L8 | Low | Done 2026-11-21 |

2 to 5 can go in one change.

## Severity scale

| Severity | Meaning |
|---|---|
| Critical | Data loss, a security hole others can reach, or the app cannot be used. Fix now. |
| High | A main feature behaves wrongly with no workaround, or a security risk that must be fixed before the next release. |
| Medium | Wrong behavior that corrects itself or has a workaround. Fix soon. |
| Low | Edge cases, maintenance, docs, and risks accepted for a local single-user MVP. |

## Critical

None.

## High

None.

## Medium

### M1. An older save reply can overwrite a newer one on screen (fixed)

- **Where (at review time):** `frontend/src/components/KanbanBoard.tsx:67-80` (`save`), and `:252` (chat replies through `onBoard`)
- **What happens:** every save shows the change, sends the request, then replaces the whole board with the server's reply. Nothing checks which request a reply belongs to. If reply A arrives after reply B, the screen shows the board as it was after A, without B's change.
- **Evidence:** a temporary Vitest probe (deleted) renamed a column, held that reply back, edited a card title to "Second", and let that reply return. Then it released the rename reply, which held the board from before the edit. The card went back to "First" on screen, while the server had "Second". The comment at `KanbanBoard.tsx:65-66` said "the screen always ends up matching the database". That claim did not hold when saves overlapped.
- **Already known, in part:** `docs/PLAN.md` (end of Part 10, removed by the fix) said: "Known limit, not fixed: if a chat reply and a board save reach the browser at almost the same time, the one that arrives last decides what the screen shows until the next change or reload. The database is right either way." The probe used two board saves and no chat, so the limit is wider than recorded. It needs two board edits whose replies come back out of order. The probe forced that order. I did not measure how often it happens on the real app.
- **Effect:** the database is correct. The screen is wrong until the next save or reload. From code, not reproduced: a drag made from the wrong screen sends a position computed from the wrong card order, and a chat reply that returns while you edit the board can overwrite the edit on screen in the same way.
- **Action as first written:** a request counter in the browser, where a reply is applied only if its request is the newest. Not used. A chat request is sent first but its board is read last, so a counter would drop the AI's changes if you edit the board while it is thinking. The browser cannot know the order of changes. Only the server can.
- **Fixed, 2026-11-21:** the server raises `boards.version` on every change and returns it with every board. `KanbanBoard.show` drops a board with a lower version than the one on screen. The probe is now the unit test "keeps a newer reply when an older one arrives after it". The known-limit note is gone from `docs/PLAN.md`, and the code comment now describes the check. See "Fix log".

## Low

### L1. AI actions that change nothing count as applied

- **Where:** `backend/app/chat.py:66-71`
- **Evidence:** a probe sent `update` with only `card_id`, and `move` with only `card_id`. The response had both in `applied`, none in `skipped`, and the board was unchanged. `CardUpdate` with no fields is valid, and `update_card` then changes no card. Since the M1 fix, it still raises the board's version.
- **Effect:** the AI's reply can say it changed a card, and no note appears under it, because the frontend only notes skipped actions. The previous rebuild checklist asked to "return only the actions that were applied" for this reason.
- **Action:** in `_apply`, raise a skip reason when an `update` has neither title nor details, or a `move` has neither column nor position. Add one test for each.

### L2. A move to the card's own column with no position sends it to the bottom

- **Where:** `backend/app/board.py:201-207`
- **Evidence:** a probe sent `PATCH /api/cards/1` with `{"column_id": 1}`, which is card 1's own column. Backlog went from `[1, 2]` to `[2, 1]`. `backend/AGENTS.md:48` documents "Moving with only `column_id` puts it last". It does not say this also applies within the same column.
- **Effect:** the frontend always sends a position, so only the AI can trigger it, for example "move card 1 to Backlog" when it is already there.
- **Action:** my lean is to treat it as no change when the column is the same and no position is given. Otherwise, document it in `backend/AGENTS.md`.

### L3. Sign-out does not end the session on the server

- **Where:** `backend/app/main.py:23-28`, `backend/app/api/auth.py:31-34`
- **Evidence:** a probe saved the cookie, signed out, and sent the old cookie again. `/api/me` returned 200. The cookie is `Max-Age=1209600` (14 days), httpOnly, `SameSite=Lax`, and has no `Secure` flag. `backend/AGENTS.md:57` already says "The server stores nothing".
- **Effect:** someone who copies the cookie can keep using it after sign-out. For one user on localhost over plain HTTP, this is acceptable.
- **Action:** none in code for the MVP. Before the app runs anywhere other than localhost, store sessions server-side or shorten `max_age`, and set `https_only=True`.

### L4. Dependencies

- `npm audit --omit=dev`: 1 moderate, `next` 16.4.3. Its 7 advisories cover caching (`use cache`, Cache Components), image optimization, Edge runtime routes and self-hosted servers that forward fetched responses. The app is a static export and uses none of these. The fix is 16.4.6, a patch release.
- Full `npm audit`: 8 moderate. One is `next`, and the other 7 are the `minimatch` chain under `typescript-eslint`, accepted in the previous review. No high or critical.
- Python: `fastapi` 0.162.0 (latest 0.165.0), `openai` 3.42.1 (latest 3.57.0), `httpx2` 2.16.0 (latest 2.16.2). I could not run a Python vulnerability audit (see "Not checked").
- **Action:** set `next` and `eslint-config-next` to 16.4.6. Run `uv lock --upgrade` in `backend/`. Rerun all tests. `AGENTS.md` asks for the latest versions.

### L5. Generated files are tracked or linted (open from the previous review)

- `frontend/test-results/.last-run.json` is committed, and neither `.gitignore` covers `test-results/`.
- `eslint.config.mjs` does not ignore `coverage/`, so lint scans the coverage report after a coverage run.
- `vitest.config.ts` has no `coverage.include`, so config files count toward coverage at 0%.
- **Action:** add `/test-results/` to `frontend/.gitignore` and run `git rm --cached frontend/test-results/.last-run.json`. Add `"coverage/**"` to `globalIgnores`. Add `include: ["src/**/*.{ts,tsx}"]` under `coverage`.

### L6. Each card is a button with buttons inside it

- **Where:** `frontend/src/components/KanbanCard.tsx:50-66`
- **Evidence (from code):** `useSortable` gives the `article` `role="button"`. Inside it are the edit buttons, the edit fields and Remove. `frontend/AGENTS.md` describes the same structure: "A card is a button named after its title. Inside it: `Edit <title>` ... `Delete <title>`". The axe-core accessibility checker flags this pattern with its `nested-interactive` rule.
- **Action:** next time accessibility gets attention, move drag activation to a small handle button and drop the role from the `article`. The keyboard tests in `kanban.spec.ts` will catch regressions.

### L7. No drop preview between columns (open from the previous review)

There is still no `onDragOver` handler. A card dragged to another column shows no gap until it is dropped. The only way to drop at the bottom of a non-empty column is the empty space below its last card. Revisit if users find it awkward.

### L8. A non-ASCII username or password caused a 500 (found later, fixed)

- **Where:** `backend/app/auth.py` (at the time: `backend/app/auth.py:48-49`, in the login route)
- **Evidence:** found while moving the sign-in check during the backend refactor. Before the change, a test client sent `usér` and `用户` as usernames with a wrong password, and each got 500 instead of 401. `secrets.compare_digest` raises `TypeError` for non-ASCII strings.
- **Effect:** no data or security impact. From code, not tried in the browser: the sign-in form shows "Could not reach the server. Try again." for any status other than 401, so someone who typed an accented character saw that instead of "Invalid username or password."
- **Fixed, 2026-11-21:** compare UTF-8 bytes, which `compare_digest` accepts. See "Fix log".

## In good shape

- **Board changes:** every change goes through `board.py` inside one `BEGIN IMMEDIATE` transaction. Ids are checked before any write. The chat applies several actions in one transaction and skips bad ones. Tests cover ownership (`test_board.py:254`, `test_chat.py:279`) and parallel requests (`test_board.py:280`).
- **AI failure handling:** every OpenRouter failure becomes a 502, and a missing key becomes a 503. Bad model output cannot cause a 500. The AI call runs outside the transaction (`test_chat.py:303`).
- **Static serving:** `StaticFiles(html=True)` with a traversal test (`test_main.py:42`).
- **Cross-site requests:** a probe sent a `text/plain` POST, the type a plain HTML form can send, and got 422. With `SameSite=Lax`, a form on another site cannot make changes.
- **Docker:** runs as a non-root user, binds to `127.0.0.1`, keeps data in the `pm-data` volume, and has a health check. `.env` is excluded from the build.
- **Docs:** `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md` and `docs/DATABASE.md` match the code. The only gap is the same-column case in L2. The code comment quoted in M1 was wrong at review time and has since been corrected. Input limits match on both sides: titles 200, details 2,000, message 2,000, history 20 of 4,000.

## Previous review status

| Item | Status | Evidence |
|---|---|---|
| M1 to M4, L1, L5 | Fixed before this review | See git history of this file |
| L2 generated files | Open | L5 here |
| L3 empty column title | Fixed | `KanbanColumn.tsx:51-58`, test "does not save an empty column title" |
| L4 drop position | Open | L7 here |

Rebuild checklist from the review of `5facb0a`:

| Item | Status | Evidence |
|---|---|---|
| Node 22+ build image | Done | `Dockerfile:3` (`node:24-slim`) |
| Bind to `127.0.0.1`, data volume | Done | `scripts/start-mac.sh:13-14` |
| No files served from outside the web folder | Done | `main.py:35-39`, `test_main.py:42` |
| `check_same_thread=False`, parallel test | Done | `db.py:44`, `test_board.py:280` |
| Same-column move removes the card first | Done | `board.py:202-206`, `test_board.py:149` |
| One module for board changes | Done | `board.py`, used by `chat.py` and `api/board.py` |
| Database fixture per test | Done | `conftest.py:18-23` |
| Refresh in background, loading screen only once | Done | `KanbanBoard.tsx:90-96` |
| Column rename on blur or Enter, skip empty | Done | `KanbanColumn.tsx:51-60` |
| Catch `ValidationError`, return applied actions only | Mostly done | `chat.py:100-102`. L1 is the remaining gap |
| Board sent once, history capped | Done | `chat.py:85`, `api/chat.py:14`, `test_chat.py:77` |
| Chat label color by role | Done | `ChatSidebar.tsx:117-122` |

The checklist also asked to accept or strip `card-` and `col-` id prefixes. Ids are integers in the AI's output schema, so a prefixed id cannot reach the code.

## What I checked

| Check | Result |
|---|---|
| Read every tracked source, test, config, script and doc file, except lock files | Done |
| `uv run --env-file ../.env pytest` | 110 passed, 0 skipped |
| `npm run lint` | Clean |
| `npx tsc --noEmit` | 0 errors |
| `npm run test:unit` | 49 passed |
| `npm run test:e2e` with the key | 18 passed |
| Start script, smoke test of `/`, login, `/api/me`, `/api/board`, stop script | All 200. No containers left, `pm-data` kept |
| `npm audit`, `npm outdated`, `uv tree --outdated` | See L4 |
| Backend probes (scratchpad, not in repo) | Confirmed L1, L2, L3 and the cross-site result |
| Frontend race probe (temporary file, deleted) | Confirmed M1 |

Findings marked "from code" were read, not reproduced.

## Not checked

- Python vulnerability audit. The `pip-audit` run was blocked by a permission check in this session.
- The Windows scripts. They have never been run, as `scripts/AGENTS.md` says.
- How the app looks in a real browser. Only the Playwright tests drove it.
- The quality of the AI's answers beyond the single live test.
