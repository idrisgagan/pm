# Backend

FastAPI app that serves the API under `/api` and the built frontend at `/`. It runs in the Docker container described in the root `Dockerfile`.

## Stack

- Python 3.14, managed with `uv` (`pyproject.toml`, `uv.lock`)
- FastAPI, served by Uvicorn
- pytest, with `httpx2` for FastAPI's `TestClient`

## Layout

```
app/
  main.py          FastAPI app. API routes, then an /api catch-all, then the static mount at /.
tests/
  conftest.py      Points PM_STATIC_DIR at tests/fixtures/static before the app is imported.
  fixtures/        A small fake frontend build, plus secret.txt outside it for traversal tests.
  test_main.py     Tests for the routes and static serving.
pyproject.toml     Dependencies and pytest settings.
uv.lock            Locked versions. Commit it with any dependency change.
```

## Routes

- `GET /api/health`: `{"status": "ok"}`. Used by the Docker health check and the start scripts.
- `GET /api/hello`: `{"message": "Hello from FastAPI"}`.
- Any other `/api/...` path: JSON 404, so API callers never get the frontend's HTML 404 page.
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
