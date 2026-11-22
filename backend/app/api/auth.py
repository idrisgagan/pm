"""Sign-in routes: /api/login, /api/logout and /api/me."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, BeforeValidator, StringConstraints

from app import auth, sessions
from app.api.deps import Username


def _text(value: object) -> object:
    # Pydantic rejects lone surrogates, and its own error body cannot encode
    # them either. Replace them first so they are just bad credentials.
    if not isinstance(value, str):
        return value
    return value.encode("utf-8", "surrogatepass").decode("utf-8", "replace")


Credential = Annotated[str, BeforeValidator(_text), StringConstraints(max_length=200)]


class LoginRequest(BaseModel):
    username: Credential
    password: Credential


class User(BaseModel):
    username: str


router = APIRouter()


@router.post("/login")
def login(credentials: LoginRequest, request: Request) -> User:
    if not auth.check_credentials(credentials.username, credentials.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session.clear()
    request.session["sid"] = sessions.create()
    request.session["username"] = credentials.username
    return User(username=credentials.username)


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    sessions.revoke(request.session.get("sid"))
    request.session.clear()
    return Response(status_code=204)


@router.get("/me")
def me(username: Username) -> User:
    return User(username=username)
