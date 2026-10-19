"""Pruebas de integración del endpoint de salud."""

import pytest

pytestmark = pytest.mark.integration


def test_health_reports_dependencies(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "ok",
        "mongo": "ok",
    }
