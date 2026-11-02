import json
from pathlib import Path

SCHEMA_PATH = Path(__file__).parents[2] / "docs" / "schema.json"

REQUIRED_COLUMNS = {
    "users": {"id", "username"},
    "boards": {"id", "user_id"},
    "columns": {"id", "board_id", "title", "position"},
    "cards": {"id", "column_id", "title", "details", "position"},
}


def load_tables() -> dict:
    return json.loads(SCHEMA_PATH.read_text())["tables"]


def test_schema_lists_the_four_tables_with_their_columns():
    tables = load_tables()
    assert set(tables) == set(REQUIRED_COLUMNS)
    for name, columns in REQUIRED_COLUMNS.items():
        assert set(tables[name]["columns"]) == columns


def test_foreign_keys_point_at_existing_columns():
    tables = load_tables()
    for table in tables.values():
        for column in table["columns"].values():
            if ref := column.get("references"):
                assert ref["column"] in tables[ref["table"]]["columns"]


def test_one_board_per_user():
    assert load_tables()["boards"]["columns"]["user_id"]["unique"] is True
