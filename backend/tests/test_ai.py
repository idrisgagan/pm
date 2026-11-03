import json
import os
from collections.abc import Callable

import httpx2
import pytest
from fastapi.testclient import TestClient

from app import ai

Handler = Callable[[httpx2.Request], httpx2.Response]


def completion(content: str) -> httpx2.Response:
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
                    "finish_reason": "stop",
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


def test_ping_needs_sign_in(client: TestClient) -> None:
    assert client.post("/api/ai/ping").status_code == 401


def test_ping_returns_the_answer(signed_in_client: TestClient, fake_openrouter) -> None:
    seen = fake_openrouter(lambda request: completion("2 + 2 = 4"))

    response = signed_in_client.post("/api/ai/ping")

    assert response.status_code == 200
    assert response.json() == {"answer": "2 + 2 = 4"}
    [request] = seen
    assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer test-key"
    body = json.loads(request.content)
    assert body["model"] == "openai/gpt-oss-120b"
    assert body["messages"] == [{"role": "user", "content": "What is 2+2?"}]


def test_missing_key_is_a_clear_error(
    signed_in_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = signed_in_client.post("/api/ai/ping")

    assert response.status_code == 503
    assert response.json() == {"detail": "AI is not configured: OPENROUTER_API_KEY is not set."}


@pytest.mark.parametrize("status", [400, 401, 402, 429, 500, 503])
def test_error_status_becomes_502(signed_in_client: TestClient, fake_openrouter, status: int) -> None:
    seen = fake_openrouter(lambda request: httpx2.Response(status, json={"error": {"message": "no"}}))

    response = signed_in_client.post("/api/ai/ping")

    assert response.status_code == 502
    assert response.json() == {"detail": f"The AI service returned an error ({status})."}
    assert len(seen) == 1  # no retries


@pytest.mark.parametrize(
    ("error", "detail"),
    [
        (httpx2.ConnectError("refused"), "Could not reach the AI service."),
        (httpx2.ReadTimeout("slow"), "The AI service took too long to answer."),
    ],
)
def test_network_failure_becomes_502(
    signed_in_client: TestClient, fake_openrouter, error: Exception, detail: str
) -> None:
    def fail(request: httpx2.Request) -> httpx2.Response:
        raise error

    seen = fake_openrouter(fail)

    response = signed_in_client.post("/api/ai/ping")

    assert response.status_code == 502
    assert response.json() == {"detail": detail}
    assert len(seen) == 1


@pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set")
def test_live_two_plus_two(signed_in_client: TestClient) -> None:
    response = signed_in_client.post("/api/ai/ping")

    assert response.status_code == 200, response.text
    assert "4" in response.json()["answer"]
