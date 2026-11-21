"""Builds the app: database setup, the session cookie, the API under /api,
error responses, then the built frontend at /."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import api, config, db, errors


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.init()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)

# Signed, httpOnly session cookie. Lax keeps it off cross-site POSTs.
app.add_middleware(
    SessionMiddleware,
    secret_key=config.session_secret(),
    session_cookie="pm_session",
    same_site="lax",
)

app.include_router(api.router)
errors.register(app)

# Mounted last so the /api routes take precedence. check_dir=False lets the
# API start before the frontend has been built.
app.mount(
    "/",
    StaticFiles(directory=config.STATIC_DIR, html=True, check_dir=False),
    name="static",
)
