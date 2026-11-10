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


def test_health_page_only_reports_whether_each_component_answers(client):
    """La página pública no publica cifras clínicas, entorno ni detalles de configuración."""
    response = client.get("/api/health", headers={"Accept": "text/html"})
    assert response.status_code == 200
    assert "Operativo" in response.text
    for forbidden in (
        "Lecturas",
        "Consultas",
        "Alertas",
        "Teleconsultas",
        "Entorno",
        "Migraciones",
        "Tablas del registro",
        "ingesta abierta",
        "ingesta cerrada",
    ):
        assert forbidden not in response.text
