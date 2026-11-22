"""Every read and change of a user's board. The board routes in api/board.py
and the AI chat in chat.py both go through these functions."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app import db

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
    # Goes up by one with every change, so a reply with a lower version is
    # older than one the frontend already has.
    version: int
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


def read(conn: sqlite3.Connection, board_id: int) -> Board:
    (version,) = conn.execute("SELECT version FROM boards WHERE id = ?", (board_id,)).fetchone()
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
    return Board(version=version, columns=list(columns.values()))


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


def _changed(conn: sqlite3.Connection, board_id: int) -> None:
    # Every change function calls this last, after its checks have passed.
    # A function that would write nothing returns before reaching it.
    conn.execute("UPDATE boards SET version = version + 1 WHERE id = ?", (board_id,))


def _renumber(conn: sqlite3.Connection, column_id: int, card_ids: list[int]) -> None:
    conn.executemany(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        [(column_id, position, card_id) for position, card_id in enumerate(card_ids)],
    )


@contextmanager
def open_board(conn: sqlite3.Connection, username: str) -> Iterator[int]:
    """One transaction on the user's board. Yields the board id for the
    change functions below, which do not open transactions of their own."""
    with db.transaction(conn):
        yield _board_id(conn, username)


def get_board(conn: sqlite3.Connection, username: str) -> Board:
    with open_board(conn, username) as board_id:
        return read(conn, board_id)


def rename_column(conn: sqlite3.Connection, board_id: int, column_id: int, title: str) -> bool:
    _check_column(conn, board_id, column_id)
    (current,) = conn.execute("SELECT title FROM columns WHERE id = ?", (column_id,)).fetchone()
    if current == title:
        return False
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))
    _changed(conn, board_id)
    return True


def create_card(conn: sqlite3.Connection, board_id: int, card: CardCreate) -> bool:
    _check_column(conn, board_id, card.column_id)
    conn.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (card.column_id, card.title, card.details, len(_card_ids(conn, card.column_id))),
    )
    _changed(conn, board_id)
    return True


def update_card(conn: sqlite3.Connection, board_id: int, card_id: int, changes: CardUpdate) -> bool:
    from_column = _card_column(conn, board_id, card_id)
    to_column = changes.column_id if changes.column_id is not None else from_column
    # Check before writing anything, so a bad column changes nothing.
    _check_column(conn, board_id, to_column)
    # A column_id on its own moves the card only when it names another column.
    # A position on its own moves it even within the same column.
    moving = changes.position is not None or (
        changes.column_id is not None and changes.column_id != from_column
    )
    if changes.title is None and changes.details is None and not moving:
        return False
    if changes.title is not None:
        conn.execute("UPDATE cards SET title = ? WHERE id = ?", (changes.title, card_id))
    if changes.details is not None:
        conn.execute("UPDATE cards SET details = ? WHERE id = ?", (changes.details, card_id))
    if moving:
        # Take the card out first, so a same-column move counts positions
        # without it.
        target = _card_ids(conn, to_column, without=card_id)
        position = len(target) if changes.position is None else changes.position
        target.insert(min(position, len(target)), card_id)
        _renumber(conn, to_column, target)
        if to_column != from_column:
            _renumber(conn, from_column, _card_ids(conn, from_column))
    _changed(conn, board_id)
    return True


def delete_card(conn: sqlite3.Connection, board_id: int, card_id: int) -> bool:
    column_id = _card_column(conn, board_id, card_id)
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _renumber(conn, column_id, _card_ids(conn, column_id))
    _changed(conn, board_id)
    return True
