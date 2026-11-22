"""The sign-in check. The routes are in api/auth.py."""

import secrets

# MVP credentials, fixed by AGENTS.md. The database will hold real users later.
USERNAME = "user"
PASSWORD = "password"


def check_credentials(username: str, password: str) -> bool:
    # Check both fields every time, so the response does not reveal which was
    # wrong. Compared as bytes: compare_digest raises on non-ASCII strings.
    # surrogatepass also encodes lone surrogates, which JSON can carry.
    username_ok = secrets.compare_digest(
        username.encode("utf-8", "surrogatepass"), USERNAME.encode()
    )
    password_ok = secrets.compare_digest(
        password.encode("utf-8", "surrogatepass"), PASSWORD.encode()
    )
    return username_ok and password_ok
