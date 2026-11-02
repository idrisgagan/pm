import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

# backend/data is the pm-data volume in Docker. Tests point this at a temp file.
DB_PATH = Path(__file__).resolve().parents[1] / "data" / "pm.db"

# Schema steps, in order. Step N takes the file to PRAGMA user_version N.
# Never edit a step that has shipped; add a new one. See docs/DATABASE.md.
MIGRATIONS = [
    [
        """CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE
        ) STRICT""",
        """CREATE TABLE boards (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE
        ) STRICT""",
        """CREATE TABLE columns (
            id INTEGER PRIMARY KEY,
            board_id INTEGER NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            position INTEGER NOT NULL,
            UNIQUE (board_id, position)
        ) STRICT""",
        """CREATE TABLE cards (
            id INTEGER PRIMARY KEY,
            column_id INTEGER NOT NULL REFERENCES columns (id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            position INTEGER NOT NULL
        ) STRICT""",
    ],
]


def connect() -> sqlite3.Connection:
    # autocommit=True: no transaction opens on its own, so the foreign_keys
    # pragma takes effect (SQLite ignores it inside a transaction), and
    # transaction() below decides when one starts. check_same_thread=False
    # because FastAPI can run a dependency and its route on different threads.
    conn = sqlite3.connect(DB_PATH, autocommit=True, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[None]:
    # IMMEDIATE takes the write lock up front. A plain BEGIN that reads first
    # and writes later fails at once with "database is locked" when another
    # connection is writing, instead of waiting for it.
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        for number, statements in enumerate(MIGRATIONS[version:], start=version + 1):
            with transaction(conn):
                for statement in statements:
                    conn.execute(statement)
                conn.execute(f"PRAGMA user_version = {number}")
    finally:
        conn.close()


def get_connection() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
