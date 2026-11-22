import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app import db

SCHEMA = json.loads((Path(__file__).parents[2] / "docs" / "schema.json").read_text())


def sqlite_default(raw: str | None):
    # PRAGMA table_info quotes text defaults and leaves number defaults as
    # strings. schema.json holds the values themselves.
    if raw is None:
        return None
    if raw.startswith("'") and raw.endswith("'"):
        return raw[1:-1]
    try:
        return int(raw)
    except ValueError:
        return raw


def test_init_creates_the_schema_in_docs(database: Path) -> None:
    db.init()
    with sqlite3.connect(database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone() == (SCHEMA["version"],)
        for table, spec in SCHEMA["tables"].items():
            columns = {
                name: (type_, bool(not_null), bool(pk), sqlite_default(default))
                for _, name, type_, not_null, default, pk in conn.execute(
                    f"PRAGMA table_info({table})"
                )
            }
            assert columns == {
                name: (
                    c["type"], c.get("not_null", False), c.get("primary_key", False),
                    c.get("default"),
                )
                for name, c in spec["columns"].items()
            }
            foreign_keys = {
                from_column: (ref_table, to_column, on_delete)
                for _, _, ref_table, from_column, to_column, _, on_delete, _ in conn.execute(
                    f"PRAGMA foreign_key_list({table})"
                )
            }
            assert foreign_keys == {
                name: (ref["table"], ref["column"], ref["on_delete"])
                for name, column in spec["columns"].items()
                if (ref := column.get("references"))
            }
            unique = {
                tuple(name for _, _, name in conn.execute(f"PRAGMA index_info({index})"))
                for _, index, is_unique, _, _ in conn.execute(f"PRAGMA index_list({table})")
                if is_unique
            }
            assert unique == (
                {(name,) for name, column in spec["columns"].items() if column.get("unique")}
                | {tuple(group) for group in spec.get("unique", [])}
            )


def test_tables_are_strict(database: Path) -> None:
    db.init()
    with sqlite3.connect(database) as conn:
        sql = dict(conn.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table'"))
        for table in SCHEMA["tables"]:
            assert "STRICT" in sql[table]


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


def test_failed_migration_rolls_back_every_step(
    database: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with monkeypatch.context() as patch:
        patch.setattr(db, "MIGRATIONS", db.MIGRATIONS[:1])
        db.init()
    monkeypatch.setattr(db, "MIGRATIONS", [
        *db.MIGRATIONS[:1],
        ["CREATE TABLE extra (id INTEGER) STRICT"],
        ["NOT VALID SQL"],
    ])

    with pytest.raises(sqlite3.OperationalError):
        db.init()

    with sqlite3.connect(database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone() == (1,)
        assert "extra" not in {name for (name,) in conn.execute("SELECT name FROM sqlite_master")}


def test_parallel_init_on_a_fresh_file(database: Path) -> None:
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda _: db.init(), range(2)))

    with sqlite3.connect(database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone() == (SCHEMA["version"],)


def test_failed_step_leaves_the_previous_version(
    database: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db.init()
    broken_step = ["CREATE TABLE extra (id INTEGER) STRICT", "NOT VALID SQL"]
    monkeypatch.setattr(db, "MIGRATIONS", [*db.MIGRATIONS, broken_step])
    with pytest.raises(sqlite3.OperationalError):
        db.init()
    with sqlite3.connect(database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone() == (SCHEMA["version"],)
        tables = {name for (name,) in conn.execute("SELECT name FROM sqlite_master")}
        assert "extra" not in tables


def test_version_1_file_upgrades_and_keeps_its_boards(
    database: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with monkeypatch.context() as patch:
        patch.setattr(db, "MIGRATIONS", db.MIGRATIONS[:1])
        db.init()
    conn = db.connect()
    conn.execute("INSERT INTO users (username) VALUES ('user')")
    conn.execute("INSERT INTO boards (user_id) VALUES (1)")
    conn.close()

    db.init()

    with sqlite3.connect(database) as conn:
        assert conn.execute("PRAGMA user_version").fetchone() == (2,)
        assert conn.execute("SELECT user_id, version FROM boards").fetchall() == [(1, 0)]
