# Project plan

Build the Project Management MVP described in `AGENTS.md`, in ten parts. Each part has a goal, a checklist, tests, and success criteria. Tick items as they are done. Do not start a part until the one before it meets its success criteria.

The "Rebuild checklist" in `docs/code_review.md` lists bugs found in an earlier build of this app. The checklist items below that come from it are marked *(review)*.

## Decisions for approval

These shape later parts. All four were approved as recommended on 2026-11-01.

| # | Decision | Recommendation | Alternative |
|---|---|---|---|
| D1 | How sign-in works (Part 4) | Backend `POST /api/login` checks `user`/`password` and sets an httpOnly session cookie. API routes reject requests without it and take the user from the cookie. | Frontend-only check, with the backend trusting a username header. Simpler, but anyone who can reach the port can use the API as any user. |
| D2 | Can users add or delete columns? | No. Five seeded columns that can only be renamed, as `AGENTS.md` says. No create or delete column endpoints. | Add column endpoints now. That means more code and more tests for something the MVP does not need. |
| D3 | AI client library (Parts 8 and 9) | `openai` Python SDK pointed at the OpenRouter base URL, with a Pydantic model for the structured output. | Plain `httpx` calls with hand-built JSON. Fewer dependencies, more parsing code. |
| D4 | Card editing (required by `AGENTS.md`, missing from the demo) | Add it in Part 7: click a card's title or details to edit, save on blur or Enter. | A separate edit dialog. |

## Part 1: Plan

Goal: enrich this document with a checklist, tests and success criteria for each part. Create `frontend/AGENTS.md` describing the existing frontend. Get user approval.

- [x] Read `AGENTS.md`, the frontend code and tests, and `docs/code_review.md`
- [x] Write this plan
- [x] Write `frontend/AGENTS.md`
- [x] User approves the plan, including D1 to D4 (approved 2026-11-01, all four as recommended)

Tests: none.

Success criteria: the user has approved this plan and `frontend/AGENTS.md`.

## Part 2: Scaffolding

Goal: Docker setup, a FastAPI backend in `backend/`, and start and stop scripts in `scripts/`. Serve a static "hello world" page and one API call, running locally.

- [x] `backend/pyproject.toml` with FastAPI and Uvicorn, plus pytest and `httpx2` for tests (Starlette's `TestClient` deprecates `httpx` in favour of `httpx2`), managed by `uv`, with `uv.lock` committed
- [x] `backend/app/main.py`: `GET /api/health` returns `{"status": "ok"}`, `GET /api/hello` returns a JSON greeting, and `/` serves `app/static/index.html` through a `StaticFiles` mount, the same mechanism Part 3 uses for the frontend. The page calls `/api/hello` and shows the result
- [x] `Dockerfile` at the repo root: Python 3.14 slim image (changed from 3.12, approved 2026-11-01), `uv` 0.13.6 copied from its official image, dependencies installed with `uv sync --frozen`, runs as a non-root user, `HEALTHCHECK` on `/api/health`
- [x] Container binds to `127.0.0.1:8000` only *(review)*
- [x] Named Docker volume `pm-data` at `/app/backend/data`, so data survives restarts *(review)*
- [x] `.env` passed with `--env-file`. Never copied into the image
- [x] `scripts/start-mac.sh`, `start-linux.sh`, `start-windows.ps1`: build the image, replace any old container, run detached, wait for `/api/health`
- [x] `scripts/stop-*`: stop and remove the container, keep the volume
- [x] `.dockerignore` excludes `.env`, `node_modules`, `.next`, `out`, `.venv`, `backend/data`
- [x] Root `README.md`: how to start, stop and test, in a few lines
- [x] Fill in `backend/AGENTS.md` and `scripts/AGENTS.md`

Tests:
- [x] pytest: `/api/health` and `/api/hello` return the expected JSON, `/` returns the hello page, and an unknown `/api` path returns 404
- [x] Manual, on macOS with `/bin/bash` 3.2:
  - start script with no `.env`: warning shown, app healthy
  - `/api/health`, `/api/hello` and `/` respond
  - port bound to `127.0.0.1` only
  - runs as user `app` on Python 3.14.10
  - Docker reports `healthy`
  - the app can write to the volume
  - the stop script removes the container and keeps the volume
  - the Linux start script with a dummy `.env` passes its values in, and the file written earlier is still there
  - in Chromium, the page shows the `/api/hello` message
- [ ] Windows scripts: not run. No Windows machine was available

Success criteria: one command starts the app, and `/` and `/api/hello` respond in the browser. The backend tests pass. Met on macOS.

## Part 3: Add in Frontend

Goal: build the frontend statically and serve it from FastAPI, so the demo Kanban board shows at `/`.

- [x] Read the static export guide in `frontend/node_modules/next/dist/docs/` before changing config
- [x] `next.config.ts`: `output: "export"`. `npm run build` writes `frontend/out/`. Removed the `start` script, which does not work with a static export
- [x] Dockerfile gets a frontend build stage on `node:24-slim` (vitest 5 needs Node 22.12+) *(review)*
- [x] Copy only `frontend/out/` into the runtime image. No Node or `node_modules` in it. `backend/tests` is excluded from the image
- [x] Point the existing `StaticFiles(directory=..., html=True)` mount at the built frontend, set by `PM_STATIC_DIR` (default `frontend/out`). Keep it after all `/api` routes. No hand-written file route *(review)*
- [x] Unknown `/api/...` paths return a JSON 404 instead of the frontend's HTML 404 page (added in this part)
- [x] Remove the Part 2 hello page (`backend/app/static/`)
- [x] Playwright gets a second config, `playwright.container.config.ts` (`npm run test:e2e:container`), that runs against the container on port 8000. The dev-server config stays for frontend-only work

Tests:
- [x] pytest, against a small fake build in `backend/tests/fixtures/static/`: `/` returns `index.html`, an asset under `/_next/` is served, an unknown page returns the 404 page, an unknown `/api` path returns JSON 404
- [x] pytest: `/%2e%2e/`, `/..%2f` and `/_next/%2e%2e/...` paths return 404 and never `fixtures/secret.txt`, which sits outside the static folder. The test client resolves a plain `/../` before sending, so the encoded forms are what reach the app. A deliberately naive file route leaked the secret on the same requests, so the tests can catch the bug *(review)*
- [x] Container: `curl --path-as-is` for `/../../`, `/%2e%2e/`, `/..%2f`, `/_next/../` and `/etc/passwd` paths all return 404 with no file contents
- [x] Unit: existing Vitest tests still pass
- [x] E2E: all 6 Playwright tests pass against the container, 60 of 60 with `--repeat-each=10 --workers=4`. One keyboard test was flaky at first: dnd-kit's `KeyboardSensor` adds its arrow-key listener in a `setTimeout` after pick-up, and the test could press the arrow first. The test now waits one task in the page before the arrow key

Success criteria: the Kanban demo loads at `http://127.0.0.1:8000/` from the container, and all tests pass. Met.

## Part 4: Fake user sign-in

Goal: on first visit to `/`, users must sign in with `user` / `password` to see the board, and they can sign out.

Following D1:
- [x] `POST /api/login`: checks the hardcoded credentials and sets an httpOnly, `SameSite=Lax` session cookie (`pm_session`, Starlette `SessionMiddleware`, 14 days) signed with `PM_SESSION_SECRET` from `.env`. Wrong credentials return 401. If the secret is unset, the app logs a warning and uses a random one, so restarts sign everyone out
- [x] `POST /api/logout`: clears the cookie
- [x] `GET /api/me`: returns the username, or 401
- [x] A FastAPI dependency, `current_user`, gives each protected route the current user, or returns 401
- [x] Frontend: call `/api/me` on load. Show the login form if 401, otherwise show the board. Add a Sign out button
- [x] Login form shows an error for wrong credentials and does not reveal which field was wrong
- [x] Removed `/api/hello`, which only served the Part 2 hello page
- [x] Playwright now runs only against the Docker app, approved 2026-11-01. The dev server has no backend, so sign-in cannot work there. Removed the dev-server config and `test:e2e:container`

Tests:
- [x] pytest (18): login success, cookie flags, `/api/me` with and without a session, 4 kinds of bad credentials, missing field, logout, tampered cookie rejected
- [x] Unit (9 new): login form success, wrong credentials, server unreachable, both fields required; page shows the form when signed out, the board when signed in, after signing in, after signing out, and after a failed sign-out request
- [x] E2E (11): login form shows first; wrong password shows the error; reload keeps you signed in; Sign out returns to the login form and stays there after reload; `/api/me` is 401 without a session; the 6 board tests now sign in first. 55 of 55 with `--repeat-each=5 --workers=4`
- [x] Container: the cookie is sent as `httponly; samesite=lax`. A session ends on restart without `PM_SESSION_SECRET` and survives a restart with it

Success criteria: the board is only reachable after signing in, the session survives a reload, and all tests pass. Met.

## Part 5: Database modeling

Goal: propose a schema for the Kanban, save it as JSON, document the approach in `docs/`, and get sign-off.

- [x] `docs/schema.json`: tables `users`, `boards`, `columns`, `cards`, with column types, keys and constraints
- [x] One board per user (unique `user_id`). Columns and cards ordered by an integer `position`
- [x] Seed: the first time a user's board is read, create the user and the board with the five demo columns and eight cards. Seeding on first read, not at sign-in, still works when the database file is deleted while the session cookie is valid
- [x] `docs/DATABASE.md`: the tables, how ordering works, how the database file is created, and the plan for later schema changes (version number in `PRAGMA user_version`, with migration steps run at startup)
- [x] Foreign keys enforced with `PRAGMA foreign_keys = ON` on every connection *(review)*. Documented here; `db.py` does it in Part 6
- [x] User sign-off before Part 6. Signed off with three choices: no password column until real accounts, seed on first board read, and number ids (the frontend tags them `column-3` and `card-3` for drag and drop in Part 7)

Tests:
- [x] pytest (3): `docs/schema.json` lists the four tables with their required columns, every foreign key points at an existing column, and `boards.user_id` is unique

Success criteria: the user has signed off on the schema. Met.

## Part 6: Backend API

Goal: API routes to read and change the signed-in user's board, with thorough backend unit tests. Create the database if it does not exist.

- [x] `backend/app/db.py`: create the database and tables at startup if missing, and apply `PRAGMA user_version` migrations
- [x] Every connection runs `PRAGMA foreign_keys = ON` before any transaction starts (see `docs/DATABASE.md`). Test that deleting a column deletes its cards
- [x] Add `backend/data/` to `.gitignore`, so a database created outside Docker is never committed
- [x] Open SQLite with `check_same_thread=False`, because FastAPI may run a sync dependency and its route on different threads *(review)*
- [x] Every board read or change runs in one `BEGIN IMMEDIATE` transaction. A plain `BEGIN` failed the parallel test with "database is locked"
- [x] `backend/app/board.py`: one module for all board changes (rename column, create, update, move and delete card), used by the API now and by the AI in Part 9 *(review)*
- [x] Same-column moves remove the card before computing its new position *(review)*
- [x] Every change checks that the column or card belongs to the user's board. Return 404 otherwise
- [x] Routes, each returning the whole board:
  - `GET /api/board`
  - `PATCH /api/columns/{id}`: rename. Reject empty titles
  - `POST /api/cards`
  - `PATCH /api/cards/{id}`: title, details, column and position
  - `DELETE /api/cards/{id}`
- [x] Pydantic models validate request bodies: titles 1 to 200 characters after trimming spaces, details up to 2,000, positions 0 or more. A position past the end puts the card last

Tests:
- [x] pytest fixture: each test gets a fresh temporary database through `monkeypatch`. No test touches `backend/data/` *(review)*
- [x] pytest (33 new, 54 total): sign-in required on all five routes; seed on first read and only once; rename; create; edit; moves up and down within a column, to another column, to an empty column, past the end, negative; delete closes the gap; unknown ids; validation limits; the database matches `docs/schema.json`; a failed schema step leaves the old version; cascade delete
- [x] Ownership: the signed-in user gets 404 on all five ways to touch another user's columns and cards, and the other board is unchanged
- [x] Parallel requests: 30 card creates, 10 at a time, on a user with no board yet, all succeed *(review)*
- [x] Each of these breaks fails its test: plain `BEGIN`, `check_same_thread` left on, a same-column move without removing the card first, and a card lookup that ignores the board
- [x] Integration against the container: 401 without a session, seed board, rename, create, move, 20 parallel creates all 201, no errors in the logs. After a stop and start, the board is identical. Frontend unit (15) and browser (11) tests still pass

Success criteria: all routes work against a real SQLite file, data survives a container restart, and all tests pass. Met.

## Part 7: Frontend + Backend

Goal: the frontend uses the backend API, so the board persists.

Browser tests run in a throwaway container on port 8001, approved 2026-11-02. Once the board saves, tests against port 8000 would wipe the user's board, and parallel tests would fight over the one board.

- [x] `src/lib/api.ts`: typed client for the Part 6 routes. Cookies go with same-origin requests by default. A 401 from a board call shows the login form
- [x] Load the board from `GET /api/board` after sign-in. Show a loading state only on first load *(review)*
- [x] Apply changes to the screen first, then call the API. The server's board then replaces the local one. On error, reload the board and show a short message. Exception: a new card shows once the server replies, because it needs its id from the server
- [x] Backend ids become `column-3` and `card-3` in the frontend (`fromApi`, `toApiId` in `src/lib/kanban.ts`). Removed the frontend seed data and `createId`
- [x] Column rename saves on blur or Enter, and ignores empty or unchanged titles *(review)*
- [x] Card editing, following D4: click the title or details. Enter or blur saves, Escape cancels, Shift+Enter adds a line in details, and an empty title keeps the old one
- [x] Do not call the API from inside a React state updater function *(review)*
- [x] Cards set themselves as the dnd-kit activator node. Before this, Space on the Remove button picked the card up. Edit fields stop pointer events from reaching the drag listener. Disabling the sortable instead set `aria-disabled` on the whole card
- [x] Cards get `aria-label` set to their title. Without it, the card's name was every label inside it joined up
- [x] Review L5: removed the unused `useMemo`, and test ids no longer repeat the prefix (`card-3`, not `card-card-3`)
- [x] Playwright builds the image and starts container `pm-app-e2e` on `127.0.0.1:8001` with no volume, so each run starts from an empty database. Tests run one at a time, and each resets the board through the API first
- [x] Update `frontend/AGENTS.md`

Tests:
- [x] Unit (31, up from 15): API client sends JSON and throws `ApiError` with the status; the board loads from the server; rename saves once on blur and skips empty titles; card title saves on Enter; details save on blur with Shift+Enter lines; Escape and an empty title do not save; add, remove; a failed save shows the message and reloads; a 401 signs out
- [x] E2E (15): add, edit, delete, rename, mouse move between columns, keyboard reorder and keyboard move, each checked again after a reload. A failed save (PATCH forced to 500 with `page.route`) shows the message and the board matches the server. 15 of 15 against the container, and 75 of 75 with `--repeat-each=5` against the backend run with `uv`
- [x] Tests catch the bugs: saving each keystroke, Escape not restoring the value, a drag that does not send its position, and a failed save that does not reload each fail a test
- [x] Container restart: rename, create, edit, two moves and a delete through the API on a container with its own volume, then stop and start. The board was identical. The app on port 8000 was not touched
- [x] Playwright's stop signal (SIGTERM) stops the test container, and `--rm` removes it

Success criteria: every change survives a page reload and a container restart, and all tests pass. Met.

## Part 8: AI connectivity

Goal: the backend can call the AI through OpenRouter. Check it with a "2+2" test.

- [x] Read `OPENROUTER_API_KEY` from the environment. A missing key gives a clear error at call time, not at startup. It returns 503 "AI is not configured: OPENROUTER_API_KEY is not set.", so it reads differently from an OpenRouter failure
- [x] `backend/app/ai.py`: client for OpenRouter with model `openai/gpt-oss-120b`, following D3 (`openai` 3.42.1, which uses `httpx2`), with a 30 second timeout. SDK retries are off, so a failing call gives up within the timeout
- [x] Temporary `POST /api/ai/ping` (signed-in only) that sends "What is 2+2?" and returns the answer
- [x] Check whether OpenRouter's providers for this model support JSON-schema structured output. Record the result in this plan, because Part 9 depends on it

Structured output result (2026-11-03):
- OpenRouter's endpoint list for `openai/gpt-oss-120b` (`/api/v1/models/openai/gpt-oss-120b/endpoints`) has 27 provider endpoints. 20 list `structured_outputs` in their supported parameters. This is OpenRouter's own listing.
- Live: 25 requests with a `json_schema` response format (`strict: true`) and `provider: {"require_parameters": true}`, which tells OpenRouter to route only to providers that support every parameter sent. All 25 replies were valid JSON matching the schema.
- Content was not always right. The prompt asked for one card called Test in column 1. 21 of 25 replies did that. By provider: PrimeIntellect 16 of 16, DekaLLM 3 of 4 (one reply had no actions), CoreWeave 2 of 5 (three garbage titles, one also with `column_id` 0).
- For Part 9: use JSON-schema structured output with `require_parameters`. Schema-valid output can still be wrong, so actions must still be checked against the board. Whether to steer away from particular providers is a Part 9 decision; 25 requests is a small sample.

Tests:
- [x] pytest (12 new: 11 with OpenRouter faked, plus the live test. 65 pass and 1 is skipped without a key): ping needs sign-in; the answer comes back, and the request goes to `https://openrouter.ai/api/v1/chat/completions` with the key and model; a missing key gives the 503; 400, 401, 402, 429, 500 and 503 from OpenRouter each become 502 with one request (no retries); a refused connection and a timeout each become 502 with their own message. OpenRouter is faked with `httpx2.MockTransport` behind the real SDK
- [x] Live test, skipped when no key is set: the answer contains "4". Passed with the key; the answer was "2 + 2 = 4."
- [x] Tests catch the bugs: turning SDK retries back on fails 5 tests, and catching connection errors before timeouts fails 1
- [x] Container: built from this branch and run with the real `.env` on port 8001. `/api/ai/ping` gave 401 signed out and `{"answer":"2 + 2 = 4."}` signed in, with no errors in the logs

Success criteria: the live "2+2" test passes, and the structured-output check is recorded. Met.

## Part 9: AI with board context and structured outputs

Goal: every AI call sends the board JSON, the user's question and the conversation history. The AI replies with structured output: a message for the user and, optionally, changes to the board.

- [ ] `POST /api/chat`: body has `message` and `history`, both with length limits *(review)*
- [ ] Prompt: short instructions, plus the board once as compact JSON *(review)*
- [ ] Output model: `reply` (string) and `actions` (a list of create, update, move or delete card, using the backend's numeric ids)
- [ ] Use JSON-schema structured output if Part 8 found it supported. Otherwise ask for JSON in the prompt and validate it with the same Pydantic model
- [ ] Invalid model output returns 502 with a short message, never 500 *(review)*
- [ ] Apply actions through the Part 6 board module in one transaction. Skip actions that point to ids not on the user's board *(review)*
- [ ] Response includes `reply`, the applied actions, the skipped actions with a reason, and the updated board *(review)*
- [ ] Remove `/api/ai/ping`

Tests:
- pytest, OpenRouter mocked: each action type applied; several actions in one reply; unknown or prefixed ids skipped and reported; invalid JSON and missing fields return 502; history and message limits
- Live test, skipped without a key: "Add a card called Test to Backlog" creates that card

Success criteria: chat requests change the board correctly in mocked and live tests, and bad model output never causes a 500.

## Part 10: AI chat sidebar

Goal: a sidebar on the board page for full AI chat. When the AI changes the board, the board updates on screen automatically.

- [ ] `ChatSidebar` component next to the board, using the color scheme in `AGENTS.md`
- [ ] Conversation history in page state, sent with each message
- [ ] Enter sends, Shift+Enter adds a new line. Disable sending while a reply is pending
- [ ] Message labels are readable on both user and assistant bubbles *(review)*
- [ ] When the response has a board, replace the board on screen with it. No full-page loading screen, and the chat draft is kept *(review)*
- [ ] Show skipped actions as a short note under the reply
- [ ] Errors show in the sidebar and leave the board unchanged
- [ ] Update `frontend/AGENTS.md`

Tests:
- Unit: sending, pending state, error display, board replaced from the response
- E2E with the AI mocked at the backend: ask for a card, see it appear on the board without a reload
- Live E2E, skipped without a key: one real request that creates a card

Success criteria: a user can ask the AI to create, edit, move or delete cards and see the board update, and all tests pass.
