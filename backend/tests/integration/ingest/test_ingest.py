"""@requirement RF-04

Pruebas de integración de la ingesta de lecturas desde dispositivos.

Cubren el camino que no pasa por una sesión: el dispositivo se autentica con la
clave compartida, la lectura se guarda en los dos almacenes con su estado de
plausibilidad y un reintento no duplica ni la lectura ni el documento crudo.
También comprueban que ningún rechazo escribe: sin clave, con clave equivocada,
sin consentimiento, con una cuenta desactivada o con un paciente desconocido no
queda lectura ni documento.

La base de MongoDB es la misma de la demostración, así que la suite no la vacía:
borra únicamente los documentos de su propio ``device_id``, antes y después de
cada prueba.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from hta.consent.service import CURRENT_VERSION

pytestmark = pytest.mark.integration

# Identificador de dispositivo propio de esta suite. No se usa un valor de la
# demostración para que la limpieza no borre documentos ajenos.
DEVICE_ID = "sim-1-pruebas"

# Marca fija de la medición: un valor del pasado para que la compuerta de fecha
# no dependa del momento en que corre la prueba y para que el reintento envíe
# exactamente la misma pareja de deduplicación.
MEASURED_AT = "2026-11-08T10:00:00Z"


@pytest.fixture(autouse=True)
def clean_raw_readings(mongo_db):
    """Borra solo los documentos crudos de esta suite, antes y después."""
    mongo_db["raw_readings"].delete_many({"device_id": DEVICE_ID})
    yield
    mongo_db["raw_readings"].delete_many({"device_id": DEVICE_ID})


def _payload(patient_id, **overrides):
    """Cuerpo de una lectura de dispositivo, con los campos de la prueba."""
    body = {
        "device_id": DEVICE_ID,
        "patient_id": str(patient_id),
        "systolic": 130,
        "diastolic": 85,
        "measured_at": MEASURED_AT,
    }
    body.update(overrides)
    return body


def _raw_count(mongo_db):
    """Documentos crudos de esta suite en MongoDB."""
    return mongo_db["raw_readings"].count_documents({"device_id": DEVICE_ID})


def test_device_key_is_required(client):
    response = client.post(
        "/api/ingest/readings",
        json={"device_id": DEVICE_ID, "systolic": 130, "diastolic": 85},
    )
    assert response.status_code == 401


def test_wrong_device_key_is_rejected(client, db, mongo_db, consented_patient_id):
    response = client.post(
        "/api/ingest/readings",
        json=_payload(consented_patient_id),
        headers={"X-Device-Key": "clave-equivocada"},
    )
    assert response.status_code == 401
    assert db.execute("select count(*) from readings").fetchone()[0] == 0
    assert _raw_count(mongo_db) == 0


def test_valid_reading_is_stored_in_both_stores(
    client, db, mongo_db, device_headers, consented_patient_id
):
    response = client.post(
        "/api/ingest/readings",
        json=_payload(consented_patient_id),
        headers=device_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["patient_id"] == str(consented_patient_id)
    assert body["source"] == "device"
    assert body["validation_status"] == "valid"

    row = db.execute(
        "select patient_id, systolic, diastolic, heart_rate, source, "
        "device_id, validation_status from readings"
    ).fetchone()
    profile_id = db.execute(
        "select id from patient_profiles where user_id = %s",
        (consented_patient_id,),
    ).fetchone()[0]
    assert row == (
        profile_id,
        130,
        85,
        None,
        "device",
        DEVICE_ID,
        "valid",
    )
    assert _raw_count(mongo_db) == 1
    raw = mongo_db["raw_readings"].find_one({"device_id": DEVICE_ID})
    assert raw["patient_id"] == str(consented_patient_id)
    assert raw["systolic"] == 130
    assert raw["diastolic"] == 85
    assert raw["received_at"] is not None


def test_repeated_ingest_does_not_duplicate(
    client, db, mongo_db, device_headers, consented_patient_id
):
    payload = _payload(consented_patient_id)
    first = client.post(
        "/api/ingest/readings", json=payload, headers=device_headers
    )
    second = client.post(
        "/api/ingest/readings", json=payload, headers=device_headers
    )
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json() == first.json()
    assert db.execute(
        "select count(*) from readings where source = 'device'"
    ).fetchone()[0] == 1
    assert _raw_count(mongo_db) == 1
    assert db.execute(
        "select count(*) from audit_logs where action = 'reading.ingested'"
    ).fetchone()[0] == 1


def test_same_pair_for_another_patient_is_a_different_reading(
    client, db, mongo_db, device_headers, consented_patient_id, other_patient_id
):
    """El mismo dispositivo e instante para otro paciente no devuelve el primero."""
    db.execute(
        "insert into consents (patient_id, version) "
        "select id, %s from patient_profiles where user_id = %s",
        (CURRENT_VERSION, other_patient_id),
    )
    first = client.post(
        "/api/ingest/readings",
        json=_payload(consented_patient_id),
        headers=device_headers,
    )
    second = client.post(
        "/api/ingest/readings",
        json=_payload(other_patient_id),
        headers=device_headers,
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] != first.json()["id"]
    assert second.json()["patient_id"] == str(other_patient_id)
    assert db.execute(
        "select count(*) from readings where source = 'device'"
    ).fetchone()[0] == 2
    assert _raw_count(mongo_db) == 2
    patients = {
        document["patient_id"]
        for document in mongo_db["raw_readings"].find({"device_id": DEVICE_ID})
    }
    assert patients == {str(consented_patient_id), str(other_patient_id)}


def test_out_of_range_reading_is_preserved(
    client, db, mongo_db, device_headers, consented_patient_id
):
    response = client.post(
        "/api/ingest/readings",
        json=_payload(consented_patient_id, systolic=300, diastolic=200),
        headers=device_headers,
    )
    assert response.status_code == 201
    assert response.json()["validation_status"] == "out_of_range"
    assert db.execute(
        "select validation_status from readings where source = 'device'"
    ).fetchone()[0] == "out_of_range"
    assert _raw_count(mongo_db) == 1


def test_without_consent_nothing_is_stored(
    client, db, mongo_db, device_headers, patient_id
):
    response = client.post(
        "/api/ingest/readings",
        json=_payload(patient_id),
        headers=device_headers,
    )
    assert response.status_code == 403
    assert "consentimiento" in response.json()["detail"].lower()
    assert db.execute("select count(*) from readings").fetchone()[0] == 0
    assert _raw_count(mongo_db) == 0


def test_deactivated_patient_is_rejected(
    client, db, mongo_db, device_headers, consented_patient_id
):
    db.execute(
        "update users set active = false where id = %s",
        (consented_patient_id,),
    )
    response = client.post(
        "/api/ingest/readings",
        json=_payload(consented_patient_id),
        headers=device_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "La cuenta del paciente está desactivada"
    assert db.execute("select count(*) from readings").fetchone()[0] == 0
    assert _raw_count(mongo_db) == 0


def test_unknown_patient_is_rejected(
    client, db, mongo_db, device_headers
):
    response = client.post(
        "/api/ingest/readings",
        json=_payload(uuid4()),
        headers=device_headers,
    )
    assert response.status_code == 422
    assert db.execute("select count(*) from readings").fetchone()[0] == 0
    assert _raw_count(mongo_db) == 0
