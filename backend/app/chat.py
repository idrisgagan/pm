"""The AI chat. The AI sees the board and the conversation, replies, and can
change cards through the same board functions the board routes use. The
route is in api/chat.py."""

import sqlite3
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints, ValidationError

from app import ai, board

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

MAX_REPLY_CHARS = 4000
MAX_ACTIONS = 20

# Only these fields are used for each action type. Anything else the AI sends
# is ignored and left out of the applied action.
ACTION_FIELDS = {
    "create": ("column_id", "title", "details"),
    "update": ("card_id", "title", "details"),
    "move": ("card_id", "column_id", "position"),
    "delete": ("card_id",),
}


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=4000)]


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


def _apply(conn: sqlite3.Connection, board_id: int, action: Action) -> Action | None:
    # Only the fields the action uses, so the board models' own checks
    # (title length, position >= 0, required ids) decide what is valid.
    fields = action.model_dump(include=set(ACTION_FIELDS[action.type]), exclude_none=True)
    match action.type:
        case "create":
            changed = board.create_card(conn, board_id, board.CardCreate.model_validate(fields))
        case "update":
            changes = board.CardUpdate.model_validate(fields)
            changed = board.update_card(conn, board_id, action.card_id, changes)
        case "move":
            changes = board.CardUpdate.model_validate(fields)
            changed = board.update_card(conn, board_id, action.card_id, changes)
        case "delete":
            changed = board.delete_card(conn, board_id, action.card_id)
    if not changed:
        return None
    # Report only the fields this action type used. A move with a stray title
    # is applied as a move and reported without the title.
    return action.model_copy(
        update={
            name: getattr(action, name) if name in fields else None
            for name in ("card_id", "column_id", "title", "details", "position")
        }
    )


def respond(
    conn: sqlite3.Connection, username: str, message: str, history: list[Message]
) -> ChatResponse:
    # Read, then call the AI outside any transaction, so a slow answer does
    # not hold the database lock. The board below is a snapshot: another
    # request can change it while the AI answers. Ids are checked again when
    # applied, but positions and titles are applied to the current board, so
    # an action can land somewhere the AI did not expect. That is the accepted
    # trade-off for not holding the write lock during the call.
    current = board.get_board(conn, username)
    output = ai.ask(
        [
            # The version is for the frontend, not the AI.
            {"role": "system", "content": INSTRUCTIONS + current.model_dump_json(exclude={"version"})},
            *(entry.model_dump() for entry in history),
            {"role": "user", "content": message},
        ],
        AIOutput,
    )
    if len(output.reply) > MAX_REPLY_CHARS or len(output.actions) > MAX_ACTIONS:
        raise ai.AIError("The AI service gave an answer the app could not read.")

    applied: list[Action] = []
    skipped: list[Skipped] = []
    with board.open_board(conn, username) as board_id:
        for action in output.actions:
            try:
                used = _apply(conn, board_id, action)
            except board.NotFound as exc:
                skipped.append(Skipped(action=action, reason=str(exc)))
            except ValidationError as exc:
                error = exc.errors()[0]
                skipped.append(Skipped(action=action, reason=f"{error['loc'][0]}: {error['msg']}"))
            else:
                if used is None:
                    skipped.append(Skipped(action=action, reason="No change"))
                else:
                    applied.append(used)
        updated = board.read(conn, board_id)
    return ChatResponse(reply=output.reply, applied=applied, skipped=skipped, board=updated)
