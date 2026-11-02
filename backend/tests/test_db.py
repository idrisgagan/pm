import json
import sqlite3
from pathlib import Path

import pytest

from app import db

SCHEMA = json.loads((Path(__file__).parents[2] / "docs" / "schema.json").read_text())


def test_init_creates_the_schema_in_docs(database: Path) -> None:
    db.init()
    with sqlite3.connect(database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone() == (SCHEMA["version"],)
        for table, spec in SCHEMA["tables"].items():
            columns = {
                name: (type_, bool(not_null), bool(pk))
                for _, name, type_, not_null, _, pk in conn.execute(f"PRAGMA table_info({table})")
            }
            assert columns == {
                name: (c["type"], c.get("not_null", False), c.get("primary_key", False))
                for name, c in spec["columns"].items()
            }


def test_init_twice_keeps_the_data(database: Path) -> None:
    db.init()
    conn = db.connect()
    conn.execute("INSERT INTO users (username) VALUES ('user')")
    conn.close()
    db.init()
    with sqlite3.connect(database) as conn:
        assert conn.execute("SELECT username FROM users").fetchall() == [("user",)]


def test_deleting_a_column_deletes_its_cards() -> None:
    db.init()
    conn = db.connect()
    conn.execute("INSERT INTO users (username) VALUES ('user')")
    conn.execute("INSERT INTO boards (user_id) VALUES (1)")
    conn.execute("INSERT INTO columns (board_id, title, position) VALUES (1, 'Backlog', 0)")
    conn.execute("INSERT INTO cards (column_id, title, position) VALUES (1, 'Card', 0)")
    conn.execute("DELETE FROM columns")
    assert conn.execute("SELECT count(*) FROM cards").fetchone() == (0,)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO cards (column_id, title, position) VALUES (99, 'Card', 0)")
    conn.close()


def test_failed_step_leaves_the_previous_version(
    database: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.init()
    broken_step = ["CREATE TABLE extra (id INTEGER) STRICT", "NOT VALID SQL"]
    monkeypatch.setattr(db, "MIGRATIONS", [*db.MIGRATIONS, broken_step])
    with pytest.raises(sqlite3.OperationalError):
        db.init()
    with sqlite3.connect(database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone() == (1,)
        tables = {name for (name,) in conn.execute("SELECT name FROM sqlite_master")}
        assert "extra" not in tables
