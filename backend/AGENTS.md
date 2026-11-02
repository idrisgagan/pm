# Backend

FastAPI app that serves the API under `/api` and the built frontend at `/`. It runs in the Docker container described in the root `Dockerfile`.

## Stack

- Python 3.14, managed with `uv` (`pyproject.toml`, `uv.lock`)
- FastAPI, served by Uvicorn
- Starlette `SessionMiddleware` (needs `itsdangerous`) for the sign-in cookie
- pytest, with `httpx2` for FastAPI's `TestClient`

## Layout

```
app/
  main.py          FastAPI app: session middleware, API routes, an /api catch-all, then the static mount at /.
  auth.py          Sign-in routes, the current_user dependency, and the session secret.
tests/
  conftest.py      Points PM_STATIC_DIR at tests/fixtures/static before the app is imported.
                   Fixtures: client (new per test, so cookies never carry over) and signed_in_client.
  fixtures/        A small fake frontend build, plus secret.txt outside it for traversal tests.
  test_auth.py     Sign-in, sign-out, session and cookie tests.
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
- Any other `/api/...` path: JSON 404, so API callers never get the frontend's HTML 404 page.

## Sign-in

- The session lives in a signed cookie, `pm_session`: httpOnly, `SameSite=Lax`, 14 days. The server stores nothing.
- Protect a route by adding `username: str = Depends(current_user)` from `app/auth.py`. It returns 401 when there is no valid session.
- The cookie is signed with `PM_SESSION_SECRET` from `.env`. If that is unset, the app logs a warning and uses a random secret, so every restart signs everyone out.
- `/`: the built frontend, served by `StaticFiles(html=True)` from `PM_STATIC_DIR`. The default is `frontend/out`, so run `npm run build` in `frontend/` first when running the backend outside Docker. Unknown pages get `404.html`. Starlette's `StaticFiles` rejects paths that resolve outside the folder.

Add new API routes above the `/api` catch-all in `main.py`. A route below it is never reached.

## Commands

Run from `backend/`:

```bash
uv sync                  # Install dependencies into .venv
uv run pytest            # Run the tests
uv run uvicorn app.main:app --reload   # Dev server on http://127.0.0.1:8000
uv add <package>         # Add a dependency (use --dev for test-only ones)
```

## In the container

- Code lives at `/app/backend`, and the virtual environment at `/app/.venv`. `backend/tests` is not copied into the image.
- The built frontend lives at `/app/frontend/out`, set by `PM_STATIC_DIR`. It is built in the Dockerfile's Node stage, and only `out/` is copied across.
- The app runs as the non-root user `app`.
- `/app/backend/data` is the `pm-data` Docker volume. Files written there survive container restarts.
- Environment variables come from the root `.env` file, passed with `--env-file`. The file is never copied into the image.
