# Project Management MVP

A Kanban board with an AI assistant, running locally in Docker. See `AGENTS.md` for requirements and `docs/PLAN.md` for the build plan.

## Run

Requires Docker. Create a `.env` file at the repo root with:

```
OPENROUTER_API_KEY=...      # for AI features
PM_SESSION_SECRET=...       # any long random string; keeps you signed in across restarts
```

Sign in with `user` / `password`.

```bash
scripts/start-mac.sh      # or start-linux.sh, or start-windows.ps1
scripts/stop-mac.sh       # keeps your data
```

The app runs at http://127.0.0.1:8000.

## Test

```bash
cd backend && uv run pytest        # add --env-file ../.env after "run" to include the live AI test
cd frontend && npm run test:all    # unit tests, then browser tests in a throwaway container on port 8001
```
