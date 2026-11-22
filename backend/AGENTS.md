# Backend

FastAPI app that serves the API under `/api` and the built frontend at `/`. It runs in the Docker container described in the root `Dockerfile`.

## Stack

- Python 3.14, managed with `uv` (`pyproject.toml`, `uv.lock`)
- FastAPI, served by Uvicorn
- Starlette `SessionMiddleware` (needs `itsdangerous`) for the sign-in cookie
- `openai` SDK pointed at OpenRouter for AI calls. It uses `httpx2`
- pytest, with `httpx2` for FastAPI's `TestClient`

## Layout

```
app/
  main.py          Wiring only: database setup, session middleware, the API router, error handlers, then the static mount at /.
  config.py        Settings from the environment: PM_STATIC_DIR and the session secret.
  errors.py        Turns board.NotFound into 404, ai.NotConfigured into 503 and ai.AIError into 502.
  db.py            SQLite connections, transactions and schema steps. Creates the database at startup.
  auth.py          The sign-in check against the MVP credentials.
  sessions.py      Session ids of signed-in users, held in memory. Logout removes one.
  board.py         Board models, seed data, and every board read and change.
  ai.py            OpenRouter client: ask(messages, output) returns a reply parsed into a Pydantic model.
  chat.py          The AI chat: prompt, AI output model, and respond(), which applies the AI's actions.
  api/             The HTTP layer. Only this package, main.py and errors.py import FastAPI.
    __init__.py    The /api router: /api/health, each area's router, then the /api catch-all, last.
    deps.py        Username (requires sign-in) and Connection (a database connection per request).
    auth.py        /api/login, /api/logout, /api/me.
    board.py       /api/board, /api/columns/{id}, /api/cards and /api/cards/{id}.
    chat.py        /api/chat, with the request limits.
tests/
  conftest.py      Points PM_STATIC_DIR at tests/fixtures/static before the app is imported.
                   Fixtures: database (a temp file per test, used automatically), client (new per
                   test, so cookies never carry over) and signed_in_client.
  fixtures/        A small fake frontend build, plus secret.txt outside it for traversal tests.
  test_auth.py     Sign-in (including non-ASCII and surrogate input), sign-out, session revocation and cookie tests.
  test_board.py    Board routes: seed, rename, create, edit, move, delete, validation, version, ownership, parallel requests.
  test_ai.py       The OpenRouter client against a fake OpenRouter: request shape, errors, unreadable output.
  test_chat.py     /api/chat: limits, prompt, each action applied or skipped, plus one live test skipped without a key.
  test_db.py       Schema matches docs/schema.json, schema steps (including a version 1 file upgrading), foreign keys.
  test_main.py     Tests for health, the /api catch-all and static serving.
  test_schema.py   Checks docs/schema.json (see docs/DATABASE.md).
pyproject.toml     Dependencies and pytest settings.
uv.lock            Locked versions. Commit it with any dependency change.
```

## Routes

- `GET /api/health`: `{"status": "ok"}`. Used by the Docker health check and the start scripts.
- `POST /api/login`: body `{"username", "password"}`. The MVP credentials are `user` / `password`. Success returns `{"username"}` and sets the `pm_session` cookie. Failure returns 401 `Invalid username or password`, without saying which field was wrong.
- `POST /api/logout`: clears the session. Returns 204.
- `GET /api/me`: `{"username"}` when signed in, otherwise 401 `Not signed in`.
- `GET /api/board`: the signed-in user's board, created from the seed data on first read. Shape: `{"version", "columns": [{"id", "title", "cards": [{"id", "title", "details"}]}]}`, columns and cards in order. `version` goes up by one with every change, and a failed change leaves it alone (see `docs/DATABASE.md`).
- `PATCH /api/columns/{id}`: body `{"title"}`. Renames a column.
- `POST /api/cards`: body `{"column_id", "title", "details"?}`. Adds a card at the end of the column. Returns 201.
- `PATCH /api/cards/{id}`: any of `{"title", "details", "column_id", "position"}`. Edits or moves a card. Moving with only `column_id` puts it last in the target column. If the card is already in that column, the request changes nothing. A position past the end also puts it last. An empty `{}` changes nothing.
- `DELETE /api/cards/{id}`: deletes a card.
- All five board routes need sign-in and return the whole board. Titles are 1 to 200 characters after trimming spaces, details up to 2,000, and positions 0 or more. Bad input gets 422. A column or card that is missing, or belongs to another user, gets 404.
- `POST /api/chat`: needs sign-in. Body `{"message", "history"?}`. `message` is 1 to 2,000 characters after trimming. `history` is up to 20 `{"role": "user" | "assistant", "content"}` items, each up to 4,000 characters. Returns `{"reply", "applied", "skipped", "board"}`. See "AI" below.
- Any unmatched `/api` path, including bare `/api` and HEAD or OPTIONS requests: JSON 404, so API callers never get the frontend's HTML 404 page.
- `/`: the built frontend, served by `StaticFiles(html=True)` from `PM_STATIC_DIR`. The default is `frontend/out`, so run `npm run build` in `frontend/` first when running the backend outside Docker. Unknown pages get `404.html`. Starlette's `StaticFiles` rejects paths that resolve outside the folder.

## Sign-in

- Login creates a random session id in `sessions.py`, holds it in an in-memory set, and puts it in the signed `pm_session` cookie along with the username. The cookie is httpOnly, `SameSite=Lax`, 14 days.
- Logout revokes that id and clears the session. A copied old cookie gets 401. A restart empties the set and signs everyone out, even with `PM_SESSION_SECRET` set. There is no database migration for sessions.
- Protect a route by adding `username: Username` from `app/api/deps.py`. It returns 401 unless the cookie has a valid id.
- The cookie is signed with `PM_SESSION_SECRET` from `.env`, read in `config.py`. If that is unset, the app logs a warning and uses a random secret.
- The cookie uses HTTP because the app runs on localhost over HTTP. An HTTPS deployment must set `https_only=True` in `SessionMiddleware` in `main.py`.

Routes live in `app/api/`, and the logic they call lives in the modules above it. To add an area, write its router in `app/api/` and include it in `app/api/__init__.py` above the catch-all. A route below the catch-all is never reached.

## Database

See `docs/DATABASE.md` for the tables and the rules. In code:

- Routes get a connection by adding `conn: Connection` from `app/api/deps.py`. It is opened per request and closed after.
- Open the user's board with `with board.open_board(conn, username) as board_id:`. It runs one `db.transaction` and yields the board id. Inside it, call `board.rename_column`, `create_card`, `update_card` or `delete_card`, then `board.read` for the result. The change functions do not open transactions of their own, so the AI chat can apply several in one. Call them rather than writing new SQL in routes, so the AI and the API change the board the same way.
- Every change function returns `True` when it wrote something and `False` when it was a no-op. It calls `_changed(conn, board_id)` only on a write, which raises the board's `version`. A new change function must do the same. Otherwise its reply has the same version as the board before it, and that older board can replace it on screen. The version counts changes, not content: different versions can hold the same board.
- A change function checks ids before it writes, so one that raises `NotFound` has changed nothing. The AI chat depends on this: it catches `NotFound` inside the transaction and carries on.
- To change the schema, add a step to `db.MIGRATIONS`. Never edit a step that has shipped.
- `board.NotFound` becomes a 404 through the handler in `errors.py`.

## AI

- `ai.ask(messages, output)` sends the messages to `openai/gpt-oss-120b` through `https://openrouter.ai/api/v1` with JSON-schema structured output built from the Pydantic model `output`, and `provider: {"require_parameters": true}` so OpenRouter routes only to providers that support it. It returns the parsed model.
- `OPENROUTER_API_KEY` is read on each call, so the app starts without it. Without it, AI routes return 503 "AI is not configured: OPENROUTER_API_KEY is not set."
- Timeout is 30 seconds, and SDK retries are off. A timeout, a failed connection, a non-2xx reply from OpenRouter, a reply with no usable `choices`, or a reply that does not match the model raises `ai.AIError`, which `errors.py` turns into a 502 with a short message.
- Tests fake OpenRouter with the `fake_openrouter` fixture and `completion()` helper in `tests/conftest.py`. The fixture sets `ai.http_client` to an `httpx2.Client` on a `MockTransport`, so the real SDK runs, including its error handling.

The chat (`chat.respond`, called by the route in `api/chat.py`):

- Reads the board, then calls the AI outside any transaction, so a slow answer does not hold the database lock. The board is a snapshot. Ids are checked again when actions are applied, but positions and titles are applied to the current board. Another request can change the board while the AI answers, so an action can land somewhere the AI did not expect. This is the accepted trade-off for not holding the write lock during the call.
- Prompt: a system message with short instructions and the board once as compact JSON without its `version`, then `history`, then `message`.
- The AI returns `{"reply", "actions"}`. Each action has `type` (`create`, `update`, `move` or `delete`) and `card_id`, `column_id`, `title`, `details`, `position`, with unused fields null. Ids are the numbers in the board JSON. A reply over 4,000 characters or 20 actions is treated as unreadable output and gets 502; nothing is applied.
- Actions are applied in order in one transaction, through the `board.py` change functions. An action whose card or column is not on the user's board, or that fails the board's own checks (title length, position below 0), is skipped with a reason, and the rest still apply. An action that writes nothing is skipped with reason `No change`.
- `applied` echoes only the fields the action type uses, with the rest null. A `move` with a stray `title` is applied as a move and reported without that title. `skipped` echoes the original action with a `reason`. The response also carries the updated `board`.

## Commands

Run from `backend/`:

```bash
uv sync                  # Install dependencies into .venv
uv run pytest            # Run the tests (the live AI test is skipped)
uv run --env-file ../.env pytest   # Also run the live AI test with the real key
uv run uvicorn app.main:app --reload   # Dev server on http://127.0.0.1:8000
uv add <package>         # Add a dependency (use --dev for test-only ones)
```

## In the container

- Code lives at `/app/backend`, and the virtual environment at `/app/.venv`. `backend/tests` is not copied into the image.
- The built frontend lives at `/app/frontend/out`, set by `PM_STATIC_DIR`. It is built in the Dockerfile's Node stage, and only `out/` is copied across.
- The app runs as the non-root user `app`.
- `/app/backend/data` is the `pm-data` Docker volume and holds `pm.db`. It survives container restarts and rebuilds.
- Environment variables come from the root `.env` file, passed with `--env-file`. The file is never copied into the image.
