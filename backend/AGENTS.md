# Backend

FastAPI app that serves the API under `/api` and static files at `/`. It runs in the Docker container described in the root `Dockerfile`.

## Stack

- Python 3.14, managed with `uv` (`pyproject.toml`, `uv.lock`)
- FastAPI, served by Uvicorn
- pytest, with `httpx2` for FastAPI's `TestClient`

## Layout

```
app/
  main.py          FastAPI app. API routes first, then the static mount at /.
  static/          Files served at /. Currently a hello page that calls /api/hello.
tests/
  test_main.py     Tests for the routes and the static page.
pyproject.toml     Dependencies and pytest settings.
uv.lock            Locked versions. Commit it with any dependency change.
```

## Routes

- `GET /api/health`: `{"status": "ok"}`. Used by the Docker health check and the start scripts.
- `GET /api/hello`: `{"message": "Hello from FastAPI"}`.
- `/`: static files from `app/static/`, with `index.html` for directories.

Add new API routes before the static mount in `main.py`, or the mount will answer first.

## Commands

Run from `backend/`:

```bash
uv sync                  # Install dependencies into .venv
uv run pytest            # Run the tests
uv run uvicorn app.main:app --reload   # Dev server on http://127.0.0.1:8000
uv add <package>         # Add a dependency (use --dev for test-only ones)
```

## In the container

- Code lives at `/app/backend`, and the virtual environment at `/app/.venv`.
- The app runs as the non-root user `app`.
- `/app/backend/data` is the `pm-data` Docker volume. Files written there survive container restarts.
- Environment variables come from the root `.env` file, passed with `--env-file`. The file is never copied into the image.
