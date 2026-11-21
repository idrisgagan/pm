"""The AI chat route, /api/chat. The chat itself is in app/chat.py."""

from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, Field, StringConstraints

from app import chat as ai_chat
from app.api.deps import Connection, Username


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    history: list[ai_chat.Message] = Field(default=[], max_length=20)


router = APIRouter()


@router.post("/chat")
def chat(body: ChatRequest, username: Username, conn: Connection) -> ai_chat.ChatResponse:
    return ai_chat.respond(conn, username, body.message, body.history)
