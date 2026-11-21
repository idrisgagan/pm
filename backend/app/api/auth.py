"""Sign-in routes: /api/login, /api/logout and /api/me."""

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app import auth
from app.api.deps import Username


class LoginRequest(BaseModel):
    username: str
    password: str


class User(BaseModel):
    username: str


router = APIRouter()


@router.post("/login")
def login(credentials: LoginRequest, request: Request) -> User:
    if not auth.check_credentials(credentials.username, credentials.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session.clear()
    request.session["username"] = credentials.username
    return User(username=credentials.username)


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


@router.get("/me")
def me(username: Username) -> User:
    return User(username=username)
