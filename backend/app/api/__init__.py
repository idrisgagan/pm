"""The HTTP API under /api: one router per area, then a catch-all.

Add a new area's router above the catch-all. A route after it is never reached."""

from fastapi import APIRouter, HTTPException

from app.api import auth, board, chat

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


router.include_router(auth.router)
router.include_router(board.router)
router.include_router(chat.router)


# Keep unknown /api paths as JSON 404s instead of falling through to the
# frontend's HTML 404 page. Must stay last.
@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str) -> None:
    raise HTTPException(status_code=404, detail="Not Found")
