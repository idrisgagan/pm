"""Dependencies the API routes share: the signed-in user and a database connection."""

import sqlite3
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app import db, sessions


def current_user(request: Request) -> str:
    if not sessions.is_valid(request.session.get("sid")):
        raise HTTPException(status_code=401, detail="Not signed in")
    return request.session["username"]


# Add `username: Username` to a route to require sign-in.
Username = Annotated[str, Depends(current_user)]
# Opened per request and closed after.
Connection = Annotated[sqlite3.Connection, Depends(db.get_connection)]
