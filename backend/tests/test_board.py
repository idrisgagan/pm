import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import board, db

SEED_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def get_board(client: TestClient) -> dict:
    response = client.get("/api/board")
    assert response.status_code == 200
    return response.json()


def column(data: dict, title: str) -> dict:
    return next(c for c in data["columns"] if c["title"] == title)


def card_titles(data: dict, title: str) -> list[str]:
    return [card["title"] for card in column(data, title)["cards"]]


def card_id(data: dict, title: str) -> int:
    return next(card["id"] for c in data["columns"] for card in c["cards"] if card["title"] == title)


def move(client: TestClient, card: int, **changes: int) -> dict:
    response = client.patch(f"/api/cards/{card}", json=changes)
    assert response.status_code == 200
    return response.json()


def assert_positions_have_no_gaps(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        for (column_id,) in conn.execute("SELECT id FROM columns"):
            positions = [
                p for (p,) in conn.execute(
                    "SELECT position FROM cards WHERE column_id = ? ORDER BY position",
                    (column_id,),
                )
            ]
            assert positions == list(range(len(positions)))


@pytest.fixture
def backlog_abc(signed_in_client: TestClient) -> dict:
    """Backlog holds A, B, C in that order."""
    data = get_board(signed_in_client)
    backlog = column(data, "Backlog")
    for card in backlog["cards"]:
        signed_in_client.delete(f"/api/cards/{card['id']}")
    for title in "ABC":
        response = signed_in_client.post(
            "/api/cards", json={"column_id": backlog["id"], "title": title}
        )
        data = response.json()
    assert card_titles(data, "Backlog") == ["A", "B", "C"]
    return data


@pytest.mark.parametrize(
    "method, path",
    [
        ("GET", "/api/board"),
        ("PATCH", "/api/columns/1"),
        ("POST", "/api/cards"),
        ("PATCH", "/api/cards/1"),
        ("DELETE", "/api/cards/1"),
    ],
)
def test_board_routes_need_sign_in(client: TestClient, method: str, path: str) -> None:
    response = client.request(method, path, json={})
    assert response.status_code == 401


def test_first_read_creates_the_seed_board(signed_in_client: TestClient) -> None:
    data = get_board(signed_in_client)
    assert [c["title"] for c in data["columns"]] == SEED_COLUMNS
    assert [len(c["cards"]) for c in data["columns"]] == [2, 1, 2, 1, 2]
    assert column(data, "Backlog")["cards"][0] == {
        "id": 1,
        "title": "Align roadmap themes",
        "details": "Draft quarterly themes with impact statements and metrics.",
    }


def test_second_read_returns_the_same_board(signed_in_client: TestClient, database: Path) -> None:
    assert get_board(signed_in_client) == get_board(signed_in_client)
    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT count(*) FROM boards").fetchone() == (1,)


def test_rename_column(signed_in_client: TestClient) -> None:
    backlog_id = column(get_board(signed_in_client), "Backlog")["id"]
    response = signed_in_client.patch(f"/api/columns/{backlog_id}", json={"title": "  Ideas "})
    assert response.status_code == 200
    assert response.json()["columns"][0]["title"] == "Ideas"
    assert get_board(signed_in_client)["columns"][0]["title"] == "Ideas"


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_rename_column_rejects_bad_titles(signed_in_client: TestClient, title: str) -> None:
    backlog_id = column(get_board(signed_in_client), "Backlog")["id"]
    response = signed_in_client.patch(f"/api/columns/{backlog_id}", json={"title": title})
    assert response.status_code == 422


def test_rename_column_accepts_200_characters(signed_in_client: TestClient) -> None:
    backlog_id = column(get_board(signed_in_client), "Backlog")["id"]
    response = signed_in_client.patch(f"/api/columns/{backlog_id}", json={"title": "x" * 200})
    assert response.status_code == 200


def test_create_card_goes_to_the_end(signed_in_client: TestClient) -> None:
    review_id = column(get_board(signed_in_client), "Review")["id"]
    response = signed_in_client.post("/api/cards", json={"column_id": review_id, "title": "New"})
    assert response.status_code == 201
    new_card = column(response.json(), "Review")["cards"][-1]
    assert new_card["title"] == "New"
    assert new_card["details"] == ""


@pytest.mark.parametrize(
    "body",
    [{"title": ""}, {"title": "x" * 201}, {"title": "ok", "details": "x" * 2001}, {}],
)
def test_create_card_rejects_bad_input(signed_in_client: TestClient, body: dict) -> None:
    review_id = column(get_board(signed_in_client), "Review")["id"]
    response = signed_in_client.post("/api/cards", json={"column_id": review_id, **body})
    assert response.status_code == 422


def test_create_card_in_unknown_column(signed_in_client: TestClient) -> None:
    response = signed_in_client.post("/api/cards", json={"column_id": 999, "title": "New"})
    assert response.status_code == 404
    assert response.json() == {"detail": "Column not found"}


def test_edit_card_keeps_its_place(backlog_abc: dict, signed_in_client: TestClient) -> None:
    data = move(signed_in_client, card_id(backlog_abc, "B"), title="B2", details="More")
    assert card_titles(data, "Backlog") == ["A", "B2", "C"]
    assert column(data, "Backlog")["cards"][1]["details"] == "More"


def test_move_down_and_up_within_a_column(
    backlog_abc: dict, signed_in_client: TestClient, database: Path
) -> None:
    a = card_id(backlog_abc, "A")
    assert card_titles(move(signed_in_client, a, position=2), "Backlog") == ["B", "C", "A"]
    assert card_titles(move(signed_in_client, a, position=0), "Backlog") == ["A", "B", "C"]
    c = card_id(backlog_abc, "C")
    assert card_titles(move(signed_in_client, c, position=1), "Backlog") == ["A", "C", "B"]
    assert_positions_have_no_gaps(database)


def test_move_to_another_column(
    backlog_abc: dict, signed_in_client: TestClient, database: Path
) -> None:
    done_id = column(backlog_abc, "Done")["id"]
    data = move(signed_in_client, card_id(backlog_abc, "B"), column_id=done_id, position=1)
    assert card_titles(data, "Backlog") == ["A", "C"]
    assert card_titles(data, "Done") == ["Ship marketing page", "B", "Close onboarding sprint"]
    assert_positions_have_no_gaps(database)


def test_move_to_another_column_without_a_position_goes_last(
    backlog_abc: dict, signed_in_client: TestClient
) -> None:
    done_id = column(backlog_abc, "Done")["id"]
    data = move(signed_in_client, card_id(backlog_abc, "A"), column_id=done_id)
    assert card_titles(data, "Done")[-1] == "A"


def test_move_to_an_empty_column(backlog_abc: dict, signed_in_client: TestClient) -> None:
    discovery = column(backlog_abc, "Discovery")
    signed_in_client.delete(f"/api/cards/{discovery['cards'][0]['id']}")
    data = move(signed_in_client, card_id(backlog_abc, "C"), column_id=discovery["id"], position=0)
    assert card_titles(data, "Discovery") == ["C"]
    assert card_titles(data, "Backlog") == ["A", "B"]


def test_position_past_the_end_goes_last(backlog_abc: dict, signed_in_client: TestClient) -> None:
    data = move(signed_in_client, card_id(backlog_abc, "A"), position=99)
    assert card_titles(data, "Backlog") == ["B", "C", "A"]


def test_negative_position_is_rejected(backlog_abc: dict, signed_in_client: TestClient) -> None:
    response = signed_in_client.patch(
        f"/api/cards/{card_id(backlog_abc, 'A')}", json={"position": -1}
    )
    assert response.status_code == 422


def test_delete_card_closes_the_gap(
    backlog_abc: dict, signed_in_client: TestClient, database: Path
) -> None:
    response = signed_in_client.delete(f"/api/cards/{card_id(backlog_abc, 'A')}")
    assert response.status_code == 200
    assert card_titles(response.json(), "Backlog") == ["B", "C"]
    assert_positions_have_no_gaps(database)


def test_unknown_card_is_404(signed_in_client: TestClient) -> None:
    assert signed_in_client.patch("/api/cards/999", json={"title": "x"}).status_code == 404
    assert signed_in_client.delete("/api/cards/999").status_code == 404


def test_cannot_touch_another_users_board(signed_in_client: TestClient) -> None:
    conn = db.connect()
    try:
        other = board.get_board(conn, "other").model_dump()
    finally:
        conn.close()
    other_column = other["columns"][0]["id"]
    other_card = other["columns"][0]["cards"][0]["id"]
    my_card = column(get_board(signed_in_client), "Backlog")["cards"][0]["id"]

    responses = [
        signed_in_client.patch(f"/api/columns/{other_column}", json={"title": "Mine"}),
        signed_in_client.post("/api/cards", json={"column_id": other_column, "title": "x"}),
        signed_in_client.patch(f"/api/cards/{other_card}", json={"title": "Mine"}),
        signed_in_client.patch(f"/api/cards/{my_card}", json={"column_id": other_column}),
        signed_in_client.delete(f"/api/cards/{other_card}"),
    ]
    assert [r.status_code for r in responses] == [404] * 5

    conn = db.connect()
    try:
        assert board.get_board(conn, "other").model_dump() == other
    finally:
        conn.close()


def test_parallel_requests_all_succeed(signed_in_client: TestClient, database: Path) -> None:
    # No board exists yet, so the first requests also race to create it.
    def add(i: int) -> int:
        return signed_in_client.post(
            "/api/cards", json={"column_id": 1, "title": f"Card {i}"}
        ).status_code

    with ThreadPoolExecutor(max_workers=10) as pool:
        statuses = list(pool.map(add, range(30)))

    assert statuses == [201] * 30
    assert len(column(get_board(signed_in_client), "Backlog")["cards"]) == 2 + 30
    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT count(*) FROM boards").fetchone() == (1,)
    assert_positions_have_no_gaps(database)
