"""Turns the app's own exceptions into JSON error responses."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import ai, board


def board_not_found(request: Request, exc: board.NotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


def ai_not_configured(request: Request, exc: ai.NotConfigured) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


def ai_failed(request: Request, exc: ai.AIError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


def register(app: FastAPI) -> None:
    app.add_exception_handler(board.NotFound, board_not_found)
    app.add_exception_handler(ai.NotConfigured, ai_not_configured)
    app.add_exception_handler(ai.AIError, ai_failed)
