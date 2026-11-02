# Project Management MVP

A Kanban board with an AI assistant, running locally in Docker. See `AGENTS.md` for requirements and `docs/PLAN.md` for the build plan.

## Run

Requires Docker. Put `OPENROUTER_API_KEY=...` in a `.env` file at the repo root for AI features.

```bash
scripts/start-mac.sh      # or start-linux.sh, or start-windows.ps1
scripts/stop-mac.sh       # keeps your data
```

The app runs at http://127.0.0.1:8000.

## Test

```bash
cd backend && uv run pytest
cd frontend && npm run test:all
```
