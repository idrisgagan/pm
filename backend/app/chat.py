"""The AI chat route. The AI sees the board and the conversation, replies, and
can change cards through the same board functions the API uses."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, StringConstraints, ValidationError

from app import ai, board
from app.board import Connection, Username

INSTRUCTIONS = """You help the user manage their Kanban board. The board is below as JSON.
Answer the user's message in `reply`. When they ask for changes to cards, list them in `actions`, in order:
- create: column_id, title, details (may be empty)
- update: card_id, and the new title and/or details
- move: card_id, and the new column_id and/or position (0 is the top of the column)
- delete: card_id
Set every field an action does not use to null. Use only the numeric ids in the board. Column ids and card ids are separate.
Columns cannot be added, removed or renamed. If nothing should change, return an empty `actions` list.

Board:
"""


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=4000)]


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    history: list[Message] = Field(default=[], max_length=20)


class Action(BaseModel):
    type: Literal["create", "update", "move", "delete"]
    card_id: int | None
    column_id: int | None
    title: str | None
    details: str | None
    position: int | None


class AIOutput(BaseModel):
    reply: str
    actions: list[Action]


class Skipped(BaseModel):
    action: Action
    reason: str


class ChatResponse(BaseModel):
    reply: str
    applied: list[Action]
    skipped: list[Skipped]
    board: board.Board


def _apply(conn: Connection, board_id: int, action: Action) -> None:
    # Only the fields the action uses, so the board models' own checks
    # (title length, position >= 0, required ids) decide what is valid.
    def fields(*names: str) -> dict:
        return action.model_dump(include=set(names), exclude_none=True)

    match action.type:
        case "create":
            card = board.CardCreate.model_validate(fields("column_id", "title", "details"))
            board.create_card(conn, board_id, card)
        case "update":
            changes = board.CardUpdate.model_validate(fields("title", "details"))
            board.update_card(conn, board_id, action.card_id, changes)
        case "move":
            changes = board.CardUpdate.model_validate(fields("column_id", "position"))
            board.update_card(conn, board_id, action.card_id, changes)
        case "delete":
            board.delete_card(conn, board_id, action.card_id)


router = APIRouter(prefix="/api")


@router.post("/chat")
def chat(body: ChatRequest, username: Username, conn: Connection) -> ChatResponse:
    # Read, then call the AI outside any transaction, so a slow answer does
    # not hold the database lock. Ids are checked again when applied.
    current = board.get_board(conn, username)
    output = ai.ask(
        [
            {"role": "system", "content": INSTRUCTIONS + current.model_dump_json()},
            *(message.model_dump() for message in body.history),
            {"role": "user", "content": body.message},
        ],
        AIOutput,
    )

    applied: list[Action] = []
    skipped: list[Skipped] = []
    with board.open_board(conn, username) as board_id:
        for action in output.actions:
            try:
                _apply(conn, board_id, action)
            except board.NotFound as exc:
                skipped.append(Skipped(action=action, reason=str(exc)))
            except ValidationError as exc:
                error = exc.errors()[0]
                skipped.append(Skipped(action=action, reason=f"{error['loc'][0]}: {error['msg']}"))
            else:
                applied.append(action)
        updated = board.read(conn, board_id)
    return ChatResponse(reply=output.reply, applied=applied, skipped=skipped, board=updated)
