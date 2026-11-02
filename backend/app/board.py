"""Every read and change of a user's board. The API routes below and the AI
chat (Part 9) both go through these functions."""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, StringConstraints

from app import db
from app.auth import current_user

# The board every user starts with: five fixed columns and eight cards.
SEED = [
    ("Backlog", [
        ("Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
        ("Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ]),
    ("Discovery", [
        ("Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ]),
    ("In Progress", [
        ("Refine status language", "Standardize column labels and tone across the board."),
        ("Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ]),
    ("Review", [
        ("QA micro-interactions", "Verify hover, focus, and loading states."),
    ]),
    ("Done", [
        ("Ship marketing page", "Final copy approved and asset pack delivered."),
        ("Close onboarding sprint", "Document release notes and share internally."),
    ]),
]

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(max_length=2000)]


class Card(BaseModel):
    id: int
    title: str
    details: str


class Column(BaseModel):
    id: int
    title: str
    cards: list[Card]


class Board(BaseModel):
    columns: list[Column]


class ColumnUpdate(BaseModel):
    title: Title


class CardCreate(BaseModel):
    column_id: int
    title: Title
    details: Details = ""


class CardUpdate(BaseModel):
    title: Title | None = None
    details: Details | None = None
    column_id: int | None = None
    # A position past the end of the column puts the card last.
    position: int | None = Field(default=None, ge=0)


class NotFound(Exception):
    pass


def _board_id(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute(
        "SELECT boards.id FROM boards JOIN users ON users.id = boards.user_id"
        " WHERE users.username = ?",
        (username,),
    ).fetchone()
    if row:
        return row[0]
    # First read for this user: create the user if needed, then the seed board.
    conn.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (username,))
    (user_id,) = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    board_id = conn.execute(
        "INSERT INTO boards (user_id) VALUES (?) RETURNING id", (user_id,)
    ).fetchone()[0]
    for column_position, (column_title, cards) in enumerate(SEED):
        column_id = conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?) RETURNING id",
            (board_id, column_title, column_position),
        ).fetchone()[0]
        conn.executemany(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            [(column_id, title, details, i) for i, (title, details) in enumerate(cards)],
        )
    return board_id


def _read(conn: sqlite3.Connection, board_id: int) -> Board:
    columns = {
        column_id: Column(id=column_id, title=title, cards=[])
        for column_id, title in conn.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
        )
    }
    for card_id, column_id, title, details in conn.execute(
        "SELECT cards.id, column_id, cards.title, details FROM cards"
        " JOIN columns ON columns.id = cards.column_id"
        " WHERE board_id = ? ORDER BY cards.position",
        (board_id,),
    ):
        columns[column_id].cards.append(Card(id=card_id, title=title, details=details))
    return Board(columns=list(columns.values()))


def _check_column(conn: sqlite3.Connection, board_id: int, column_id: int) -> None:
    if not conn.execute(
        "SELECT 1 FROM columns WHERE id = ? AND board_id = ?", (column_id, board_id)
    ).fetchone():
        raise NotFound("Column not found")


def _card_column(conn: sqlite3.Connection, board_id: int, card_id: int) -> int:
    row = conn.execute(
        "SELECT column_id FROM cards JOIN columns ON columns.id = cards.column_id"
        " WHERE cards.id = ? AND board_id = ?",
        (card_id, board_id),
    ).fetchone()
    if not row:
        raise NotFound("Card not found")
    return row[0]


def _card_ids(conn: sqlite3.Connection, column_id: int, without: int | None = None) -> list[int]:
    return [
        card_id
        for (card_id,) in conn.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
        )
        if card_id != without
    ]


def _renumber(conn: sqlite3.Connection, column_id: int, card_ids: list[int]) -> None:
    conn.executemany(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        [(column_id, position, card_id) for position, card_id in enumerate(card_ids)],
    )


def get_board(conn: sqlite3.Connection, username: str) -> Board:
    with db.transaction(conn):
        return _read(conn, _board_id(conn, username))


def rename_column(conn: sqlite3.Connection, username: str, column_id: int, title: str) -> Board:
    with db.transaction(conn):
        board_id = _board_id(conn, username)
        _check_column(conn, board_id, column_id)
        conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))
        return _read(conn, board_id)


def create_card(conn: sqlite3.Connection, username: str, card: CardCreate) -> Board:
    with db.transaction(conn):
        board_id = _board_id(conn, username)
        _check_column(conn, board_id, card.column_id)
        conn.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            (card.column_id, card.title, card.details, len(_card_ids(conn, card.column_id))),
        )
        return _read(conn, board_id)


def update_card(
    conn: sqlite3.Connection, username: str, card_id: int, changes: CardUpdate
) -> Board:
    with db.transaction(conn):
        board_id = _board_id(conn, username)
        from_column = _card_column(conn, board_id, card_id)
        if changes.title is not None:
            conn.execute("UPDATE cards SET title = ? WHERE id = ?", (changes.title, card_id))
        if changes.details is not None:
            conn.execute("UPDATE cards SET details = ? WHERE id = ?", (changes.details, card_id))
        if changes.column_id is not None or changes.position is not None:
            to_column = changes.column_id if changes.column_id is not None else from_column
            _check_column(conn, board_id, to_column)
            # Take the card out first, so a same-column move counts positions
            # without it.
            target = _card_ids(conn, to_column, without=card_id)
            position = len(target) if changes.position is None else changes.position
            target.insert(min(position, len(target)), card_id)
            _renumber(conn, to_column, target)
            if to_column != from_column:
                _renumber(conn, from_column, _card_ids(conn, from_column))
        return _read(conn, board_id)


def delete_card(conn: sqlite3.Connection, username: str, card_id: int) -> Board:
    with db.transaction(conn):
        board_id = _board_id(conn, username)
        column_id = _card_column(conn, board_id, card_id)
        conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        _renumber(conn, column_id, _card_ids(conn, column_id))
        return _read(conn, board_id)


router = APIRouter(prefix="/api")

Connection = Annotated[sqlite3.Connection, Depends(db.get_connection)]
Username = Annotated[str, Depends(current_user)]


@router.get("/board")
def read_board(username: Username, conn: Connection) -> Board:
    return get_board(conn, username)


@router.patch("/columns/{column_id}")
def patch_column(column_id: int, body: ColumnUpdate, username: Username, conn: Connection) -> Board:
    return rename_column(conn, username, column_id, body.title)


@router.post("/cards", status_code=201)
def post_card(body: CardCreate, username: Username, conn: Connection) -> Board:
    return create_card(conn, username, body)


@router.patch("/cards/{card_id}")
def patch_card(card_id: int, body: CardUpdate, username: Username, conn: Connection) -> Board:
    return update_card(conn, username, card_id, body)


@router.delete("/cards/{card_id}")
def remove_card(card_id: int, username: Username, conn: Connection) -> Board:
    return delete_card(conn, username, card_id)
