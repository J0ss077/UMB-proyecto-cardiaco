"""@requirement RF-05

Pruebas de integración del alta manual de lecturas con síntomas.

Cubren el primer camino de escritura clínica: la lectura se guarda como
``valid`` o ``out_of_range`` según su plausibilidad fisiológica, ningún valor
imposible se descarta, la compuerta de consentimiento impide escribir sin una
aceptación vigente y un paciente no puede escribir para otra cuenta. El alta
suelta de un síntoma comprueba la misma compuerta y deja su propia fila y su
auditoría. La auditoría del alta con síntoma se comprueba dentro de la misma
transacción, y la respuesta viaja con el identificador de la cuenta, nunca con
el del perfil.
"""

from __future__ import annotations

from uuid import UUID

import pytest

pytestmark = pytest.mark.integration


def test_patient_registers_a_reading(
    client, db, consented_patient_headers, consented_patient_id
):
    response = client.post(
        "/api/readings",
        json={"systolic": 138, "diastolic": 88},
        headers=consented_patient_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["systolic"] == 138
    assert body["validation_status"] == "valid"
    assert body["patient_id"] == str(consented_patient_id)
    row = db.execute(
        "select count(*) from readings where id = %s", (body["id"],)
    ).fetchone()
    assert row[0] == 1
    audit = db.execute(
        "select actor_user_id, entity, entity_id from audit_logs "
        "where action = 'reading.created'"
    ).fetchone()
    assert audit == (consented_patient_id, "readings", UUID(body["id"]))


def test_impossible_reading_is_preserved_as_out_of_range(
    client, db, consented_patient_headers
):
    response = client.post(
        "/api/readings",
        json={"systolic": 300, "diastolic": 200},
        headers=consented_patient_headers,
    )
    assert response.status_code == 201
    assert response.json()["validation_status"] == "out_of_range"
    stored = db.execute("select validation_status from readings").fetchone()
    assert stored[0] == "out_of_range"


def test_systolic_below_diastolic_is_out_of_range(
    client, db, consented_patient_headers
):
    response = client.post(
        "/api/readings",
        json={"systolic": 80, "diastolic": 120},
        headers=consented_patient_headers,
    )
    assert response.status_code == 201
    assert response.json()["validation_status"] == "out_of_range"
    assert db.execute(
        "select count(*) from readings where systolic = 80 and diastolic = 120"
    ).fetchone()[0] == 1


def test_revoked_consent_blocks_the_reading(
    client, db, consented_patient_headers, consented_patient_id
):
    db.execute(
        "update consents set revoked_at = now() where patient_id = "
        "(select id from patient_profiles where user_id = %s)",
        (consented_patient_id,),
    )
    response = client.post(
        "/api/readings",
        json={"systolic": 120, "diastolic": 80},
        headers=consented_patient_headers,
    )
    assert response.status_code == 403
    assert "consentimiento" in response.json()["detail"].lower()
    assert db.execute("select count(*) from readings").fetchone()[0] == 0
    assert db.execute(
        "select count(*) from audit_logs where action = 'reading.created'"
    ).fetchone()[0] == 0


def test_patient_cannot_write_for_another_patient(
    client, db, consented_patient_headers, other_patient_id
):
    response = client.post(
        "/api/readings",
        json={
            "systolic": 120,
            "diastolic": 80,
            "patient_id": str(other_patient_id),
        },
        headers=consented_patient_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"
    assert db.execute("select count(*) from readings").fetchone()[0] == 0


def test_reading_and_symptoms_are_recorded_together(
    client, db, consented_patient_headers, consented_patient_id
):
    response = client.post(
        "/api/readings",
        json={
            "systolic": 142,
            "diastolic": 92,
            "symptom": {"free_text": "dolor de cabeza leve", "mood": "ansioso"},
        },
        headers=consented_patient_headers,
    )
    assert response.status_code == 201
    reading_id = UUID(response.json()["id"])
    symptom = db.execute(
        "select id, patient_id, free_text, mood from symptoms_mood"
    ).fetchone()
    assert db.execute("select count(*) from symptoms_mood").fetchone()[0] == 1
    profile_id = db.execute(
        "select id from patient_profiles where user_id = %s",
        (consented_patient_id,),
    ).fetchone()[0]
    assert symptom[1] == profile_id
    assert symptom[2:] == ("dolor de cabeza leve", "ansioso")
    audit = db.execute(
        "select actor_user_id, entity, entity_id from audit_logs "
        "where action = 'symptom.created'"
    ).fetchone()
    assert audit == (consented_patient_id, "symptoms_mood", symptom[0])
    assert db.execute(
        "select count(*) from audit_logs "
        "where action = 'reading.created' and entity_id = %s",
        (reading_id,),
    ).fetchone()[0] == 1


def test_patient_registers_a_symptom_alone(
    client, db, consented_patient_headers, consented_patient_id
):
    response = client.post(
        "/api/symptoms",
        json={"free_text": "mareo", "mood": "bien"},
        headers=consented_patient_headers,
    )
    assert response.status_code == 201
    body = response.json()
    row = db.execute(
        "select id, patient_id, free_text, mood from symptoms_mood"
    ).fetchone()
    assert row[0] == UUID(body["id"])
    profile_id = db.execute(
        "select id from patient_profiles where user_id = %s",
        (consented_patient_id,),
    ).fetchone()[0]
    assert row[1] == profile_id
    assert row[2:] == ("mareo", "bien")
    audit = db.execute(
        "select actor_user_id, entity, entity_id from audit_logs "
        "where action = 'symptom.created'"
    ).fetchone()
    assert audit == (consented_patient_id, "symptoms_mood", row[0])
    assert db.execute("select count(*) from readings").fetchone()[0] == 0


def test_revoked_consent_blocks_the_standalone_symptom(
    client, db, consented_patient_headers, consented_patient_id
):
    db.execute(
        "update consents set revoked_at = now() where patient_id = "
        "(select id from patient_profiles where user_id = %s)",
        (consented_patient_id,),
    )
    response = client.post(
        "/api/symptoms",
        json={"free_text": "mareo"},
        headers=consented_patient_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "No hay consentimiento informado vigente"
    assert db.execute("select count(*) from symptoms_mood").fetchone()[0] == 0
    assert db.execute(
        "select count(*) from audit_logs where action = 'symptom.created'"
    ).fetchone()[0] == 0


def test_future_measured_at_is_rejected(client, db, consented_patient_headers):
    response = client.post(
        "/api/readings",
        json={
            "systolic": 120,
            "diastolic": 80,
            "measured_at": "2099-01-01T00:00:00Z",
        },
        headers=consented_patient_headers,
    )
    assert response.status_code == 422
    assert db.execute("select count(*) from readings").fetchone()[0] == 0
