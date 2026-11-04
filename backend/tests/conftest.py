import os
from collections.abc import Callable, Iterator
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient

# Point the app at a small fake frontend build. This runs before any test
# module imports app.main, which reads PM_STATIC_DIR at import time.
FIXTURES_DIR = Path(__file__).parent / "fixtures"
os.environ["PM_STATIC_DIR"] = str(FIXTURES_DIR / "static")

from app import ai, db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    # A fresh database file per test. No test touches backend/data.
    path = tmp_path / "pm.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    return path


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


Handler = Callable[[httpx2.Request], httpx2.Response]


def completion(content: str | None, finish_reason: str = "stop") -> httpx2.Response:
    return httpx2.Response(
        200,
        json={
            "id": "gen-1",
            "object": "chat.completion",
            "created": 0,
            "model": ai.MODEL,
            "choices": [
                {
                    "index": 0,
                    "finish_reason": finish_reason,
                    "message": {"role": "assistant", "content": content},
                }
            ],
        },
    )


@pytest.fixture
def fake_openrouter(monkeypatch: pytest.MonkeyPatch) -> Callable[[Handler], list[httpx2.Request]]:
    # The real SDK, talking to a handler instead of the network. Returns the
    # list of requests the handler saw.
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

    def install(handler: Handler) -> list[httpx2.Request]:
        seen: list[httpx2.Request] = []

        def record(request: httpx2.Request) -> httpx2.Response:
            seen.append(request)
            return handler(request)

        monkeypatch.setattr(ai, "http_client", httpx2.Client(transport=httpx2.MockTransport(record)))
        return seen

    return install
