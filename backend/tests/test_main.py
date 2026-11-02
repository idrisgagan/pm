import pytest
from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_api_route_is_json_404(client: TestClient) -> None:
    response = client.get("/api/missing")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_root_serves_index(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Index page" in response.text


def test_serves_build_assets(client: TestClient) -> None:
    response = client.get("/_next/static/app.js")
    assert response.status_code == 200
    assert 'console.log("asset")' in response.text


def test_unknown_page_serves_404_page(client: TestClient) -> None:
    response = client.get("/no-such-page")
    assert response.status_code == 404
    assert "Custom 404 page" in response.text


# The test client resolves a plain "/../" before sending, so these use encoded
# forms, which reach the app as "/../secret.txt".
@pytest.mark.parametrize(
    "path",
    ["/%2e%2e/secret.txt", "/..%2fsecret.txt", "/_next/%2e%2e/%2e%2e/%2e%2e/secret.txt"],
)
def test_paths_outside_static_folder_are_not_served(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 404
    assert "TOP-SECRET" not in response.text
