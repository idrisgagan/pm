"""Session ids for signed-in users, held in memory.

Logout revokes the id, so a copied cookie stops working. A restart empties the
set, so everyone is signed out.
"""

import secrets

_valid: set[str] = set()


def create() -> str:
    sid = secrets.token_urlsafe(32)
    _valid.add(sid)
    return sid


def is_valid(sid: str | None) -> bool:
    return sid is not None and sid in _valid


def revoke(sid: str | None) -> None:
    if sid is not None:
        _valid.discard(sid)
