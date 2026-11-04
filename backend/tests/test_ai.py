"""The OpenRouter client in ai.py, exercised through /api/chat against a fake
OpenRouter. Chat behaviour itself is in test_chat.py."""

import json

import httpx2
import pytest
from conftest import completion
from fastapi.testclient import TestClient

UNREADABLE = {"detail": "The AI service gave an answer the app could not read."}


def send(client: TestClient):
    return client.post("/api/chat", json={"message": "Hello"})


def test_request_asks_for_structured_output(signed_in_client: TestClient, fake_openrouter) -> None:
    seen = fake_openrouter(lambda request: completion('{"reply": "Hi", "actions": []}'))

    response = send(signed_in_client)

    assert response.status_code == 200
    [request] = seen
    assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer test-key"
    body = json.loads(request.content)
    assert body["model"] == "openai/gpt-oss-120b"
    assert body["provider"] == {"require_parameters": True}
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True
    schema = body["response_format"]["json_schema"]["schema"]
    assert schema["required"] == ["reply", "actions"]


def test_missing_key_is_a_clear_error(
    signed_in_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    response = send(signed_in_client)

    assert response.status_code == 503
    assert response.json() == {"detail": "AI is not configured: OPENROUTER_API_KEY is not set."}


@pytest.mark.parametrize("status", [400, 401, 402, 429, 500, 503])
def test_error_status_becomes_502(signed_in_client: TestClient, fake_openrouter, status: int) -> None:
    seen = fake_openrouter(lambda request: httpx2.Response(status, json={"error": {"message": "no"}}))

    response = send(signed_in_client)

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

    response = send(signed_in_client)

    assert response.status_code == 502
    assert response.json() == {"detail": detail}
    assert len(seen) == 1


ACTION = {"card_id": 1, "column_id": None, "title": None, "details": None, "position": None}


@pytest.mark.parametrize(
    "content",
    [
        pytest.param("Sure, done!", id="not JSON"),
        pytest.param('{"reply": "Hi"', id="cut off JSON"),
        pytest.param('{"actions": []}', id="no reply"),
        pytest.param('{"reply": "Hi"}', id="no actions"),
        pytest.param('{"reply": "Hi", "actions": [{"type": "delete"}]}', id="action missing fields"),
        pytest.param(
            json.dumps({"reply": "Hi", "actions": [{**ACTION, "type": "archive"}]}),
            id="unknown action type",
        ),
        pytest.param(
            json.dumps({"reply": "Hi", "actions": [{**ACTION, "type": "delete", "card_id": "card-1"}]}),
            id="prefixed id",
        ),
        pytest.param(None, id="no content"),
        pytest.param("", id="empty content"),
    ],
)
def test_unreadable_output_becomes_502(
    signed_in_client: TestClient, fake_openrouter, content: str | None
) -> None:
    fake_openrouter(lambda request: completion(content))
    before = signed_in_client.get("/api/board").json()

    response = send(signed_in_client)

    assert response.status_code == 502
    assert response.json() == UNREADABLE
    assert signed_in_client.get("/api/board").json() == before


def test_output_cut_off_by_length_becomes_502(signed_in_client: TestClient, fake_openrouter) -> None:
    fake_openrouter(lambda request: completion('{"reply": "Hi', finish_reason="length"))

    response = send(signed_in_client)

    assert response.status_code == 502
    assert response.json() == UNREADABLE
