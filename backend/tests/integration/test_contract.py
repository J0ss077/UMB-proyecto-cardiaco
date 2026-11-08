"""@requirement none

Pruebas de integración del contrato HTTP y de los orígenes que CORS permite.

El contrato versionado es el acuerdo con la interfaz web: la última prueba
compara el esquema que genera la aplicación con el archivo confirmado, para que
un cambio de ruta, de modelo o de código de estado no se publique sin
regenerarlo. El generador se carga por ruta con ``importlib``, igual que las
pruebas de ``scripts/``: el directorio de scripts no es un paquete de Python.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration

# La raíz del repositorio se deduce del archivo y no del directorio de trabajo:
# la suite se puede lanzar desde la raíz o desde backend/ y el contrato vive en
# la misma ruta en ambos casos.
ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = ROOT / "docs" / "api" / "openapi.json"
SCRIPT_PATH = ROOT / "scripts" / "export_openapi.py"


def _load_export_script():
    """Carga ``scripts/export_openapi.py`` por ruta y devuelve el módulo."""
    spec = importlib.util.spec_from_file_location("export_openapi", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


export_openapi = _load_export_script()
generate_contract = export_openapi.generate_contract


def test_cors_allows_the_react_dev_origin(client):
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    allowed = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed


def test_cors_rejects_an_unknown_origin(client):
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert 400 <= response.status_code < 500
    assert "access-control-allow-origin" not in response.headers


def test_accounts_list_uses_the_paginated_envelope(client, admin_headers, db):
    body = client.get("/api/accounts", headers=admin_headers).json()
    assert set(body) == {"items", "total"}
    assert isinstance(body["items"], list)


def test_accounts_list_paginates_and_counts_every_row(client, admin_headers, db):
    for index in range(6):
        db.execute(
            "insert into users (email, password_hash, role, full_name) "
            "values (%s, %s, 'patient', %s)",
            (f"paciente-{index}@hta.demo", "huella-de-prueba", f"Paciente {index}"),
        )
    response = client.get("/api/accounts?limit=2", headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 2
    assert body["total"] == 7


def test_accounts_list_rejects_a_limit_above_the_maximum(client, admin_headers):
    response = client.get("/api/accounts?limit=500", headers=admin_headers)
    assert response.status_code == 422


def test_openapi_contract_is_committed_and_current():
    generated = generate_contract()
    committed = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    assert generated == committed
