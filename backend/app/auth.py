import logging
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# MVP credentials, fixed by AGENTS.md. The database will hold real users later.
USERNAME = "user"
PASSWORD = "password"


def session_secret() -> str:
    secret = os.environ.get("PM_SESSION_SECRET")
    if secret:
        return secret
    logger.warning(
        "PM_SESSION_SECRET is not set. Using a random secret, so sessions end "
        "when the app restarts."
    )
    return secrets.token_urlsafe(32)


class LoginRequest(BaseModel):
    username: str
    password: str


class User(BaseModel):
    username: str


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


router = APIRouter(prefix="/api")


@router.post("/login")
def login(credentials: LoginRequest, request: Request) -> User:
    # Check both fields every time, so the response does not reveal which was wrong.
    username_ok = secrets.compare_digest(credentials.username, USERNAME)
    password_ok = secrets.compare_digest(credentials.password, PASSWORD)
    if not (username_ok and password_ok):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session.clear()
    request.session["username"] = credentials.username
    return User(username=credentials.username)


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


@router.get("/me")
def me(username: str = Depends(current_user)) -> User:
    return User(username=username)
