"""Pruebas unitarias del endpoint de salud: no requieren base de datos."""

import pytest
from fastapi.testclient import TestClient

from hta.app import create_app

CLOSED_DATABASE_URL = "postgresql://usuario:clave@127.0.0.1:1/hta"
CLOSED_MONGO_URL = "mongodb://127.0.0.1:1"


def _client(monkeypatch, mongo_url: str) -> TestClient:
    """Construye un cliente con ambas dependencias apuntando a un puerto cerrado."""
    monkeypatch.setenv("HTA_DATABASE_URL", CLOSED_DATABASE_URL)
    monkeypatch.setenv("HTA_MONGO_URL", mongo_url)
    monkeypatch.setenv("HTA_JWT_SECRET", "secreto-de-prueba-para-las-pruebas-unitarias")
    return TestClient(create_app())


def test_health_degrades_when_dependencies_are_unreachable(monkeypatch):
    """Con ambas dependencias caídas responde 200 y declara el estado degradado."""
    with _client(monkeypatch, CLOSED_MONGO_URL) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "database": "fail",
        "mongo": "fail",
    }


@pytest.mark.parametrize(
    "mongo_url",
    ["", "mongodb://", "mongodb://127.0.0.1:notaport"],
    ids=["vacia", "malformada", "puerto-invalido"],
)
def test_health_does_not_raise_on_unusable_mongo_url(monkeypatch, mongo_url):
    """Una URL vacía, malformada o con puerto inválido no rompe el handler.

    ``MongoClient`` lanza ``ConfigurationError``, ``InvalidURI`` y ``ValueError``
    al construirse, antes de cualquier ping. El endpoint debe informarlas como
    ``mongo: fail`` en lugar de propagarlas como un 500.
    """
    with _client(monkeypatch, mongo_url) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "database": "fail",
        "mongo": "fail",
    }


def test_health_returns_html_page_for_browsers(monkeypatch):
    """Un navegador recibe la página con el estado de cada componente."""
    with _client(monkeypatch, CLOSED_MONGO_URL) as client:
        response = client.get("/api/health", headers={"Accept": "text/html"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Hay servicios con problemas" in response.text
    assert "Caído" in response.text
    assert "usuario:clave" not in response.text


def test_health_keeps_json_when_format_is_json(monkeypatch):
    """El parámetro format=json fuerza el contrato aunque llegue Accept: text/html."""
    with _client(monkeypatch, CLOSED_MONGO_URL) as client:
        response = client.get(
            "/api/health?format=json", headers={"Accept": "text/html"}
        )

    assert response.json()["status"] == "degraded"
