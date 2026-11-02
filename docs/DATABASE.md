# Database

SQLite, one file per install. The schema is in `docs/schema.json` (version 1). The code is in `backend/app/db.py` (connections and schema steps) and `backend/app/board.py` (board reads and changes).

## Tables

```
users    id  username
boards   id  user_id    -> users    (unique: one board per user)
columns  id  board_id   -> boards   title  position
cards    id  column_id  -> columns  title  details  position
```

- Every `id` is an `INTEGER PRIMARY KEY`, so SQLite assigns it.
- Tables are created `STRICT`, so SQLite rejects a value of the wrong type instead of storing it.
- `details` defaults to an empty string. Every other column is required.
- Deleting a user deletes their board. Deleting a board deletes its columns, and deleting a column deletes its cards (`ON DELETE CASCADE`).
- There is no password column. Sign-in is hardcoded for the MVP (see `backend/app/auth.py`). Real accounts will add one through a migration.
- There are no timestamps. Nothing in the MVP shows or sorts by time.
- Length limits on titles and details are checked by the API, not the database.

## Order

`position` is 0, 1, 2 and so on, with no gaps:

- Columns are numbered within their board. The five columns are fixed and never reorder, so `(board_id, position)` is unique.
- Cards are numbered within their column. Moving or deleting a card renumbers the cards in the columns it left and joined. There is no unique constraint on card positions, because renumbering passes through duplicate values partway through.

## Seed data

The first time a user's board is read, the backend creates the `users` row if needed, then the board with the five columns and eight cards in `SEED` in `backend/app/board.py`. Seeding on first read, not at sign-in, means a signed-in user still gets a board after the database file is deleted.

## The database file

- The file is `backend/data/pm.db`. In Docker, `backend/data` is the `pm-data` volume, so the data survives container restarts and rebuilds.
- At startup the backend creates the file and the tables if they are missing.
- Every connection runs `PRAGMA foreign_keys = ON`. SQLite turns foreign key checks off by default, and the setting does not persist in the file.
- The pragma must run before any transaction starts, because SQLite ignores it inside one. Python's `sqlite3.connect(..., autocommit=False)` starts a transaction at once, so `db.py` connects with `autocommit=True` and starts transactions itself.
- Every board read or change runs in one `BEGIN IMMEDIATE` transaction (`db.transaction`). It takes the write lock at the start, so a second request waits its turn, for up to 5 seconds (Python's default `timeout`). With a plain `BEGIN`, a request that reads and then writes fails at once with "database is locked" when another request is writing.

## Schema changes

- The schema version is stored in the file with `PRAGMA user_version`. A new file starts at 0.
- `db.py` holds a numbered list of steps. Step 1 creates the version 1 tables.
- At startup the backend runs each step above the file's current version, in order, then sets `user_version` to the latest. Each step runs in a transaction, so a failed step leaves the file at the version before it.
- To change the schema, add a step to the list and update `docs/schema.json` and this page. Never edit a step that has already shipped.
