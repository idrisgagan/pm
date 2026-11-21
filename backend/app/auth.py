"""The sign-in check. The routes are in api/auth.py."""

import secrets

# MVP credentials, fixed by AGENTS.md. The database will hold real users later.
USERNAME = "user"
PASSWORD = "password"


def check_credentials(username: str, password: str) -> bool:
    # Check both fields every time, so the response does not reveal which was
    # wrong. Compared as bytes: compare_digest raises on non-ASCII strings.
    username_ok = secrets.compare_digest(username.encode(), USERNAME.encode())
    password_ok = secrets.compare_digest(password.encode(), PASSWORD.encode())
    return username_ok and password_ok
