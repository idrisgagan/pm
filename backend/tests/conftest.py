import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Point the app at a small fake frontend build. This runs before any test
# module imports app.main, which reads PM_STATIC_DIR at import time.
FIXTURES_DIR = Path(__file__).parent / "fixtures"
os.environ["PM_STATIC_DIR"] = str(FIXTURES_DIR / "static")

from app.main import app  # noqa: E402


@pytest.fixture
def client() -> Iterator[TestClient]:
    # A new client per test, so session cookies never carry over between tests.
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def signed_in_client(client: TestClient) -> TestClient:
    response = client.post("/api/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    return client
