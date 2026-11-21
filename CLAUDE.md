# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

- `AGENTS.md`: requirements, tech decisions, color scheme and coding standards. Follow its standards: keep it simple, no extra features, no emojis, find the root cause before fixing.
- `docs/PLAN.md`: the build plan. Parts 1 to 11 are done. Record new work there in the same style: checklist, tests, success criteria.
- `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md`: detailed docs for each folder (routes, behavior, test hooks). Update the matching file when you change behavior.
- `docs/DATABASE.md` and `docs/schema.json`: the database rules and schema.

## Commands

Run the app (Docker, http://127.0.0.1:8000, sign in with `user` / `password`):

```bash
scripts/start-mac.sh     # build image pm-app, run with volume pm-data and root .env
scripts/stop-mac.sh      # removes the container, keeps the data volume
```

Backend (from `backend/`, uses `uv`):

```bash
uv run pytest                                   # all tests, live AI test skipped
uv run pytest tests/test_board.py::test_name    # one test
uv run --env-file ../.env pytest                # include the live AI test
uv run uvicorn app.main:app --reload            # dev server; run `npm run build` in frontend/ first
```

Frontend (from `frontend/`):

```bash
npm run lint
npm run test:unit                                # Vitest
npx vitest run src/lib/kanban.test.ts            # one unit test file
npm run test:e2e                                 # Playwright, builds the Docker image each run
npx playwright test tests/kanban.spec.ts -g "name"   # one browser test
npm run test:all                                 # unit, then browser
set -a && . ../.env && set +a && npm run test:e2e    # include the live AI browser test
```

`npm run dev` shows the login screen but cannot sign in, because no backend answers `/api` on port 3000. To see frontend changes working, rebuild with the start script.

## Architecture

One Docker image. Stage 1 builds the Next.js app as a static export (`output: "export"`, written to `frontend/out`). Stage 2 runs FastAPI, which serves `/api/*` and mounts the static files at `/` from `PM_STATIC_DIR`. Because the frontend is a static export, it has no server features (no API routes, rewrites or Server Actions). All logic lives in the backend.

Request flow:

- Sign-in: `POST /api/login` sets a signed httpOnly `pm_session` cookie (Starlette `SessionMiddleware`, secret from `PM_SESSION_SECRET`). Routes take the user with `Depends(auth.current_user)`. The frontend cannot read the cookie and asks `/api/me` instead.
- Board: every board route returns the whole board, with a `version` that goes up by one with every change. The frontend's `KanbanBoard.save` shows the change, calls the API, then replaces its state with the server's reply. On failure it reloads the board. Every reply goes through `show`, which drops a board older than the one on screen, so replies that arrive out of order cannot undo a newer change.
- AI chat: `POST /api/chat` reads the board, calls OpenRouter (`openai/gpt-oss-120b`, JSON-schema structured output) outside any transaction, then applies the returned actions in one transaction. Bad actions are skipped with a reason. The response's `board` replaces the board on screen.

Rules that span several files:

- All board changes go through the functions in `backend/app/board.py`, inside `with board.open_board(conn, username) as board_id:`. The change functions do not open their own transaction, so the chat can apply several in one. They check ids before writing, so a `NotFound` means nothing changed, which the chat relies on to skip one action and keep going. Each one ends with `_changed(conn, board_id)` to raise the board's version. A new change function must do the same.
- New `/api` routes must be registered above the `/api/{path}` catch-all in `backend/app/main.py`, or they are never reached.
- Schema changes: add a new step to `db.MIGRATIONS`, and update `docs/schema.json` and `docs/DATABASE.md`. Never edit a step that has shipped. `tests/test_db.py` checks that the live schema matches `docs/schema.json`.
- The frontend tags ids (`column-3`, `card-3`) because dnd-kit needs one id space. The backend uses plain integers. Convert with `fromApi` and `toApiId` in `frontend/src/lib/kanban.ts`.
- Input limits are set in the backend and repeated in the frontend: titles 200 characters, details 2,000, chat message 2,000, history 20 items of 4,000. Change both sides together.
- `OPENROUTER_API_KEY` is read on each call, so the app starts without it. Missing key gives 503, any OpenRouter or parsing failure gives 502 (`ai.AIError`). Bad model output must never cause a 500.

## Testing notes

- Backend tests use a fresh SQLite file per test (autouse `database` fixture) and fake OpenRouter with the `fake_openrouter` fixture in `backend/tests/conftest.py`, which runs the real `openai` SDK on an `httpx2.MockTransport`. `conftest.py` sets `PM_STATIC_DIR` to a fake build before importing the app.
- Playwright builds the image and runs a throwaway container `pm-app-e2e` on port 8001 with no volume, so it never touches the app on 8000. Tests run one at a time and reset the board with `openFreshBoard`. Card ids change on every reset, so find cards by title.
- Next.js adds an empty `role="alert"` to every page. Scope alert locators to a form, header or the chat sidebar.
- The Mac and Linux scripts are identical. Keep them in sync. The Windows scripts have never been run.
- `frontend/AGENTS.md` starts with a block that `next dev` writes. It says this Next.js version differs from training data: read `node_modules/next/dist/docs/` before writing Next.js code.
