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

- [ ] Read the static export guide in `frontend/node_modules/next/dist/docs/` before changing config
- [ ] `next.config.ts`: `output: "export"`. Check that `npm run build` writes `frontend/out/`
- [ ] Dockerfile gets a frontend build stage on Node 22 or later, for example `node:24-slim` (vitest 5 needs Node 22.12+) *(review)*
- [ ] Copy `frontend/out/` into the runtime image
- [ ] Point the existing `StaticFiles(directory=..., html=True)` mount at the built frontend. Keep it after all `/api` routes. No hand-written file route *(review)*
- [ ] Remove the Part 2 hello page (`backend/app/static/`)
- [ ] Playwright gets a second config that runs against the container on port 8000. The dev-server config stays for frontend-only work

Tests:
- pytest: `/` returns the built `index.html`, and a static asset under `/_next/` is served
- pytest: requests for `/../`, `/%2e%2e/` and `/..%2f` paths return 404 and never a file outside the static folder *(review)*
- Unit: existing Vitest tests still pass
- E2E: existing Playwright tests pass against the container

Success criteria: the Kanban demo loads at `http://127.0.0.1:8000/` from the container, and all tests pass.

## Part 4: Fake user sign-in

Goal: on first visit to `/`, users must sign in with `user` / `password` to see the board, and they can sign out.

Following D1:
- [ ] `POST /api/login`: checks the hardcoded credentials and sets an httpOnly, `SameSite=Lax` session cookie signed with a secret from `.env`. Wrong credentials return 401
- [ ] `POST /api/logout`: clears the cookie
- [ ] `GET /api/me`: returns the username, or 401
- [ ] A FastAPI dependency gives each protected route the current user, or returns 401
- [ ] Frontend: call `/api/me` on load. Show the login form if 401, otherwise show the board. Add a Sign out button
- [ ] Login form shows an error for wrong credentials and does not reveal which field was wrong

Tests:
- pytest: login success and failure, logout, `/api/me` with and without a cookie, and a protected route returns 401 without a cookie
- Unit: login form validation and error display
- E2E: wrong password shows an error; correct login shows the board; a reload keeps you signed in; Sign out returns to the login form

Success criteria: the board is only reachable after signing in, the session survives a reload, and all tests pass.

## Part 5: Database modeling

Goal: propose a schema for the Kanban, save it as JSON, document the approach in `docs/`, and get sign-off.

- [ ] `docs/schema.json`: tables `users`, `boards`, `columns`, `cards`, with column types, keys and constraints
- [ ] One board per user (unique `user_id`). Columns and cards ordered by an integer `position`
- [ ] Seed: on first sign-in, create the user's board with the five demo columns and eight cards
- [ ] `docs/DATABASE.md`: the tables, how ordering works, how the database file is created, and the plan for later schema changes (version number in `PRAGMA user_version`, with migration steps run at startup)
- [ ] Foreign keys enforced with `PRAGMA foreign_keys = ON` on every connection *(review)*
- [ ] User sign-off before Part 6

Tests:
- pytest: `docs/schema.json` parses and lists the four tables with their required columns

Success criteria: the user has signed off on the schema.

## Part 6: Backend API

Goal: API routes to read and change the signed-in user's board, with thorough backend unit tests. Create the database if it does not exist.

- [ ] `backend/app/db.py`: create the database and tables at startup if missing, and apply `PRAGMA user_version` migrations
- [ ] Open SQLite with `check_same_thread=False`, because FastAPI may run a sync dependency and its route on different threads *(review)*
- [ ] `backend/app/board.py`: one module for all board changes (rename column, create, update, move and delete card), used by the API now and by the AI in Part 9 *(review)*
- [ ] Same-column moves remove the card before computing its new position *(review)*
- [ ] Every change checks that the column or card belongs to the user's board. Return 404 otherwise
- [ ] Routes:
  - `GET /api/board`
  - `PATCH /api/columns/{id}`: rename. Reject empty titles
  - `POST /api/cards`
  - `PATCH /api/cards/{id}`: title, details, column and position
  - `DELETE /api/cards/{id}`
- [ ] Pydantic models validate request bodies, with length limits on titles and details

Tests:
- pytest fixture: each test gets a fresh temporary database through `monkeypatch`. No test touches `backend/data/` *(review)*
- Seed on first access; `GET /api/board` shape
- Card moves: up and down within a column, to another column, to an empty column, and positions out of range *(review)*
- Ownership: a second user cannot read or change the first user's cards or columns
- Validation: empty or too-long titles return 422
- Parallel requests: several at once all succeed *(review)*
- Integration: run the Part 2 to 6 flows against the running container

Success criteria: all routes work against a real SQLite file, data survives a container restart, and all tests pass.

## Part 7: Frontend + Backend

Goal: the frontend uses the backend API, so the board persists.

- [ ] `src/lib/api.ts`: typed client for the Part 6 routes. Send cookies, and treat 401 as signed out
- [ ] Load the board from `GET /api/board` after sign-in. Show a loading state only on first load *(review)*
- [ ] Apply changes to the screen first, then call the API. On error, reload the board and show a short message
- [ ] Column rename saves on blur or Enter, and ignores empty titles *(review)*
- [ ] Card editing, following D4
- [ ] Do not call the API from inside a React state updater function *(review)*
- [ ] Update `frontend/AGENTS.md`

Tests:
- Unit: API client error handling; rename saves once on blur; card edit
- E2E (container): add, edit, move (between columns and within one) and delete a card, rename a column, then reload and check every change is still there
- E2E: a failed API call shows the message and the board matches the server

Success criteria: every change survives a page reload and a container restart, and all tests pass.

## Part 8: AI connectivity

Goal: the backend can call the AI through OpenRouter. Check it with a "2+2" test.

- [ ] Read `OPENROUTER_API_KEY` from the environment. A missing key gives a clear error at call time, not at startup
- [ ] `backend/app/ai.py`: client for OpenRouter with model `openai/gpt-oss-120b`, following D3, with a timeout
- [ ] Temporary `POST /api/ai/ping` (signed-in only) that sends "What is 2+2?" and returns the answer
- [ ] Check whether OpenRouter's providers for this model support JSON-schema structured output. Record the result in this plan, because Part 9 depends on it

Tests:
- pytest: a missing key gives a clear error; network errors and non-200 responses become a 502 with a short message (OpenRouter mocked)
- Live test, skipped when no key is set: the answer contains "4"

Success criteria: the live "2+2" test passes, and the structured-output check is recorded.

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
