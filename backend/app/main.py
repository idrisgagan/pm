import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

# The built frontend. The Docker image sets PM_STATIC_DIR; locally it is
# frontend/out after `npm run build`.
STATIC_DIR = Path(
    os.environ.get(
        "PM_STATIC_DIR",
        Path(__file__).resolve().parents[2] / "frontend" / "out",
    )
)

app = FastAPI(title="Project Management MVP")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


# Keep unknown /api paths as JSON 404s instead of falling through to the
# frontend's HTML 404 page. Must stay after every other /api route.
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str) -> None:
    raise HTTPException(status_code=404, detail="Not Found")


# Mounted last so the /api routes above take precedence. check_dir=False lets
# the API start before the frontend has been built.
app.mount(
    "/",
    StaticFiles(directory=STATIC_DIR, html=True, check_dir=False),
    name="static",
)
