import pytest
from fastapi.testclient import TestClient


def test_me_without_session_is_401(client: TestClient) -> None:
    response = client.get("/api/me")
    assert response.status_code == 401
    assert response.json() == {"detail": "Not signed in"}


def test_login_sets_session_cookie(client: TestClient) -> None:
    response = client.post("/api/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith("pm_session=")
    assert "httponly" in cookie
    assert "samesite=lax" in cookie


def test_me_after_login(signed_in_client: TestClient) -> None:
    response = signed_in_client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


@pytest.mark.parametrize(
    "username, password",
    [("user", "wrong"), ("wrong", "password"), ("", ""), ("USER", "password"),
     ("usér", "password"), ("user", "pässwörd")],
)
def test_login_rejects_bad_credentials(client: TestClient, username: str, password: str) -> None:
    response = client.post("/api/login", json={"username": username, "password": password})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}
    assert "set-cookie" not in response.headers
    assert client.get("/api/me").status_code == 401


# Raw JSON: httpx2 will not encode a lone surrogate in a normal json= body.
@pytest.mark.parametrize(
    "body",
    [
        '{"username": "\\ud800", "password": "password"}',
        '{"username": "user", "password": "\\ud800"}',
        '{"username": "\\ud800", "password": "\\ud800"}',
    ],
)
def test_lone_surrogate_is_bad_credentials(client: TestClient, body: str) -> None:
    response = client.post("/api/login", content=body, headers={"content-type": "application/json"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password"}


@pytest.mark.parametrize("field", ["username", "password"])
def test_long_credentials_are_rejected(client: TestClient, field: str) -> None:
    payload = {"username": "user", "password": "password", field: "x" * 201}
    assert client.post("/api/login", json=payload).status_code == 422


def test_200_character_credentials_are_checked(client: TestClient) -> None:
    response = client.post("/api/login", json={"username": "x" * 200, "password": "x" * 200})
    assert response.status_code == 401


def test_login_requires_both_fields(client: TestClient) -> None:
    response = client.post("/api/login", json={"username": "user"})
    assert response.status_code == 422


def test_logout_ends_session(signed_in_client: TestClient) -> None:
    response = signed_in_client.post("/api/logout")
    assert response.status_code == 204
    assert signed_in_client.get("/api/me").status_code == 401


def test_logout_revokes_a_copied_cookie(signed_in_client: TestClient) -> None:
    cookie = signed_in_client.cookies.get("pm_session")
    assert cookie
    assert signed_in_client.post("/api/logout").status_code == 204

    signed_in_client.cookies.set("pm_session", cookie)

    assert signed_in_client.get("/api/me").status_code == 401
    assert signed_in_client.get("/api/board").status_code == 401


def test_tampered_cookie_is_rejected(client: TestClient) -> None:
    client.cookies.set("pm_session", "eyJ1c2VybmFtZSI6ICJ1c2VyIn0=.forged.signature")
    assert client.get("/api/me").status_code == 401
