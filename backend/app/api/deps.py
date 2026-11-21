"""Dependencies the API routes share: the signed-in user and a database connection."""

import sqlite3
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app import db


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


# Add `username: Username` to a route to require sign-in.
Username = Annotated[str, Depends(current_user)]
# Opened per request and closed after.
Connection = Annotated[sqlite3.Connection, Depends(db.get_connection)]
