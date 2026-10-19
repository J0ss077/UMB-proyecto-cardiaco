"""Pruebas de integración del endpoint de salud."""


def test_health_reports_dependencies(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"
