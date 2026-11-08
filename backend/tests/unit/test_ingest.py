"""@requirement RF-04

Pruebas unitarias de la compuerta de la clave y del bloqueo de deduplicación.

La compuerta se prueba llamando a su función, sin levantar la aplicación. El
bloqueo se prueba sobre una conexión falsa que anota las sentencias: así se
comprueba que la ingesta lo toma antes de mirar la pareja, sin depender de una
carrera real entre dos peticiones.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException

from hta.ingest import service
from hta.ingest.router import check_device_key

pytestmark = pytest.mark.unit


def test_unconfigured_key_closes_the_route():
    """Sin clave configurada la ruta responde 503 en lugar de quedar abierta."""
    with pytest.raises(HTTPException) as error:
        check_device_key("", "cualquier-clave")
    assert error.value.status_code == 503


def test_missing_key_is_rejected():
    """Con clave configurada, una petición sin cabecera responde 401."""
    with pytest.raises(HTTPException) as error:
        check_device_key("clave-de-prueba", None)
    assert error.value.status_code == 401


def test_wrong_key_is_rejected():
    """Una clave distinta responde 401."""
    with pytest.raises(HTTPException) as error:
        check_device_key("clave-de-prueba", "clave-equivocada")
    assert error.value.status_code == 401


def test_matching_key_is_accepted():
    """La clave configurada no lanza rechazo."""
    assert check_device_key("clave-de-prueba", "clave-de-prueba") is None


class _FakeCursor:
    """Cursor falso que devuelve una fila fija."""

    def __init__(self, row=None):
        self._row = row

    async def fetchone(self):
        """Devuelve la fila que la sentencia simulada produce."""
        return self._row


class _ScriptedConnection:
    """Conexión falsa que responde por sentencia y anota el orden.

    Simula el camino completo de ``ingest`` sin PostgreSQL: la cuenta activa,
    el consentimiento vigente, el bloqueo, la ausencia de una lectura previa, el
    alta, la auditoría y la lectura devuelta.
    """

    def __init__(self, patient_id, profile_id, reading_id):
        self.patient_id = patient_id
        self.profile_id = profile_id
        self.reading_id = reading_id
        self.statements = []

    async def execute(self, query, params=None):
        """Anota la sentencia y devuelve la fila que le corresponde."""
        self.statements.append((query, params))
        if "from patient_profiles pp" in query:
            return _FakeCursor((self.profile_id, True))
        if "select exists" in query:
            return _FakeCursor((True,))
        if "pg_advisory_xact_lock" in query:
            return _FakeCursor()
        if "insert into readings" in query:
            return _FakeCursor((self.reading_id,))
        if "limit 1" in query:
            return _FakeCursor()
        if "from readings r join" in query:
            return _FakeCursor(
                (
                    self.reading_id,
                    self.patient_id,
                    130,
                    85,
                    None,
                    "device",
                    datetime(2026, 11, 8, 10, 0, tzinfo=timezone.utc),
                    "valid",
                )
            )
        return _FakeCursor()

    async def commit(self):
        """Cierra la transacción simulada."""


def test_ingest_takes_the_pair_lock_before_the_dedup_check(monkeypatch):
    """La ingesta bloquea la pareja antes de buscar la lectura existente."""
    patient_id = uuid4()
    profile_id = uuid4()
    reading_id = uuid4()
    conn = _ScriptedConnection(patient_id, profile_id, reading_id)
    monkeypatch.setattr(service, "_store_raw", lambda payload, measured_at: None)
    payload = service.IngestPayload(
        device_id="sim-1",
        patient_id=patient_id,
        systolic=130,
        diastolic=85,
        measured_at=datetime(2026, 11, 8, 10, 0, tzinfo=timezone.utc),
    )

    outcome = asyncio.run(service.ingest(conn, payload))

    queries = [query for query, _params in conn.statements]
    lock_index = next(
        index
        for index, query in enumerate(queries)
        if "pg_advisory_xact_lock" in query
    )
    dedup_index = next(
        index for index, query in enumerate(queries) if "limit 1" in query
    )
    insert_index = next(
        index
        for index, query in enumerate(queries)
        if "insert into readings" in query
    )
    assert lock_index < dedup_index < insert_index
    assert conn.statements[lock_index][1] == (
        service._lock_key("sim-1", payload.measured_at),
    )
    assert outcome.created is True
    assert outcome.reading.id == reading_id


def test_lock_key_is_stable_across_time_zones():
    """El mismo instante con otro desplazamiento produce la misma clave."""
    utc = datetime(2026, 11, 8, 15, 0, tzinfo=timezone.utc)
    bogota = datetime(2026, 11, 8, 10, 0, tzinfo=timezone(timedelta(hours=-5)))
    assert service._lock_key("sim-1", utc) == service._lock_key("sim-1", bogota)
    assert service._lock_key("sim-1", utc) != service._lock_key("sim-2", utc)
    assert service._lock_key("sim-1", utc) != service._lock_key(
        "sim-1", utc + timedelta(seconds=1)
    )
