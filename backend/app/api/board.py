"""Board routes. Each opens the user's board in one transaction, makes at most
one change through app/board.py, and returns the whole board."""

from fastapi import APIRouter

from app import board
from app.api.deps import Connection, Username

router = APIRouter()


@router.get("/board")
def read_board(username: Username, conn: Connection) -> board.Board:
    return board.get_board(conn, username)


@router.patch("/columns/{column_id}")
def patch_column(
    column_id: int, body: board.ColumnUpdate, username: Username, conn: Connection
) -> board.Board:
    with board.open_board(conn, username) as board_id:
        board.rename_column(conn, board_id, column_id, body.title)
        return board.read(conn, board_id)


@router.post("/cards", status_code=201)
def post_card(body: board.CardCreate, username: Username, conn: Connection) -> board.Board:
    with board.open_board(conn, username) as board_id:
        board.create_card(conn, board_id, body)
        return board.read(conn, board_id)


@router.patch("/cards/{card_id}")
def patch_card(
    card_id: int, body: board.CardUpdate, username: Username, conn: Connection
) -> board.Board:
    with board.open_board(conn, username) as board_id:
        board.update_card(conn, board_id, card_id, body)
        return board.read(conn, board_id)


@router.delete("/cards/{card_id}")
def remove_card(card_id: int, username: Username, conn: Connection) -> board.Board:
    with board.open_board(conn, username) as board_id:
        board.delete_card(conn, board_id, card_id)
        return board.read(conn, board_id)
