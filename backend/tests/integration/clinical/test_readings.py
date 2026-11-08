"""@requirement RF-19

Pruebas de integración del alta y la consulta de lecturas, de la ventana
domiciliaria y del listado de síntomas.

Cubren los dos caminos de escritura clínica: la lectura se guarda como
``valid`` o ``out_of_range`` según su plausibilidad fisiológica, ningún valor
imposible se descarta y la compuerta de consentimiento impide escribir sin una
aceptación vigente. Del lado de la lectura, el paciente ve sus lecturas y el
médico y el cuidador autorizado solo las del paciente vinculado; el resumen de
la ventana descarta el primer día, exige ocho lecturas válidas en dos fechas y
no se calcula sin consentimiento. El listado de síntomas sigue la misma regla
de acceso. La respuesta viaja con el identificador de la cuenta, nunca con el
del perfil, y la auditoría del alta con síntoma se comprueba dentro de la misma
transacción.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

# La escritura clínica de este archivo sigue declarando el requerimiento del
# alta de lecturas y síntomas, además de la consulta de RF-19.
# @requirement RF-05

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


def test_empty_symptom_discards_the_reading_and_its_audit(
    client, db, consented_patient_headers
):
    """Una lectura válida con un síntoma vacío se rechaza sin escribir nada.

    La lectura se construye antes de validar el síntoma y la transacción se
    revierte entera: el 422 no deja lectura ni fila de auditoría clínica.
    """
    response = client.post(
        "/api/readings",
        json={"systolic": 138, "diastolic": 88, "symptom": {}},
        headers=consented_patient_headers,
    )
    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "El síntoma necesita un texto o un estado de ánimo"
    )
    assert db.execute("select count(*) from readings").fetchone()[0] == 0
    assert db.execute(
        "select count(*) from audit_logs "
        "where action in ('reading.created', 'symptom.created')"
    ).fetchone()[0] == 0


def _profile_id(db, user_id):
    """Devuelve el perfil de paciente de una cuenta creada por una fixture."""
    return db.execute(
        "select id from patient_profiles where user_id = %s", (user_id,)
    ).fetchone()[0]


CLINICAL_READ_PATHS = (
    "/api/readings",
    "/api/readings/summary",
    "/api/symptoms",
)


@pytest.mark.parametrize("path", CLINICAL_READ_PATHS)
def test_physician_of_another_patient_gets_403(
    client, physician_headers, other_patient_id, path
):
    response = client.get(
        f"{path}?patient_id={other_patient_id}", headers=physician_headers
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_caregiver_with_readings_scope_sees_the_patient(
    client, caregiver_headers, consented_patient_id, home_readings
):
    body = client.get(
        f"/api/readings?patient_id={consented_patient_id}",
        headers=caregiver_headers,
    ).json()
    assert body["total"] >= 8


def test_caregiver_with_minimal_scope_is_rejected(
    client, caregiver_minimal_headers, consented_patient_id
):
    response = client.get(
        f"/api/readings?patient_id={consented_patient_id}",
        headers=caregiver_minimal_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_caregiver_of_another_patient_gets_403(
    client, caregiver_headers, other_caregiver_headers, consented_patient_id
):
    """El cuidador ajeno no entra aunque el paciente tenga otro cuidador.

    ``caregiver_headers`` deja un vínculo con alcance ``readings`` hacia el
    paciente con consentimiento. Si la resolución de alcance olvidara comparar
    el identificador del cuidador, este otro cuidador pasaría la compuerta y la
    petición no respondería 403.
    """
    response = client.get(
        f"/api/readings?patient_id={consented_patient_id}",
        headers=other_caregiver_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


@pytest.mark.parametrize("path", CLINICAL_READ_PATHS)
def test_admin_cannot_read_clinical_data(
    client, admin_headers, consented_patient_id, path
):
    response = client.get(
        f"{path}?patient_id={consented_patient_id}", headers=admin_headers
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_physician_must_pass_a_patient_for_the_readings(client, physician_headers):
    response = client.get("/api/readings", headers=physician_headers)
    assert response.status_code == 403


def test_patient_cannot_read_another_patients_readings(
    client, patient_headers, other_patient_id
):
    response = client.get(
        f"/api/readings?patient_id={other_patient_id}", headers=patient_headers
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_physician_reads_a_linked_patients_readings(
    client, physician_headers, consented_patient_id, home_readings
):
    body = client.get(
        f"/api/readings?patient_id={consented_patient_id}", headers=physician_headers
    ).json()
    assert body["total"] >= 8
    assert all(item["patient_id"] == str(consented_patient_id) for item in body["items"])


def test_readings_are_ordered_and_paginated(
    client, consented_patient_headers, consented_patient_id, home_readings
):
    body = client.get(
        "/api/readings?limit=5&offset=0", headers=consented_patient_headers
    ).json()
    assert len(body["items"]) == 5
    assert body["total"] >= 8
    assert body["total"] > len(body["items"])
    assert all(item["patient_id"] == str(consented_patient_id) for item in body["items"])
    measured = [item["measured_at"] for item in body["items"]]
    assert measured == sorted(measured, reverse=True)


def test_reading_filters_are_inclusive(
    client, db, consented_patient_headers, consented_patient_id
):
    profile_id = _profile_id(db, consented_patient_id)
    for day in (1, 2, 3):
        db.execute(
            "insert into readings "
            "(patient_id, systolic, diastolic, source, measured_at) "
            "values (%s, 120, 80, 'manual', %s)",
            (profile_id, datetime(2026, 1, day, tzinfo=timezone.utc)),
        )
    body = client.get(
        "/api/readings",
        headers=consented_patient_headers,
        params={
            "since": "2026-01-01T00:00:00+00:00",
            "until": "2026-01-02T00:00:00+00:00",
        },
    ).json()
    assert body["total"] == 2
    measured = [
        datetime.fromisoformat(item["measured_at"].replace("Z", "+00:00"))
        for item in body["items"]
    ]
    assert measured == [
        datetime(2026, 1, 2, tzinfo=timezone.utc),
        datetime(2026, 1, 1, tzinfo=timezone.utc),
    ]
    naive = client.get(
        "/api/readings",
        headers=consented_patient_headers,
        params={"since": "2026-01-01T00:00:00"},
    )
    assert naive.status_code == 422


def test_window_summary_discards_the_first_day_and_needs_eight_valid(
    client, consented_patient_headers, home_readings
):
    summary = client.get(
        "/api/readings/summary", headers=consented_patient_headers
    ).json()
    assert summary["sufficient"] is True
    assert summary["valid_count"] == 8
    assert summary["days_with_readings"] == 2
    assert summary["mean_systolic"] == 125.5
    assert summary["mean_diastolic"] == 79.5
    start = datetime.fromisoformat(summary["window_start"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(summary["window_end"].replace("Z", "+00:00"))
    assert end - start == timedelta(days=7)


def test_window_excludes_the_reading_exactly_at_the_seven_day_edge(
    client, db, consented_patient_headers, consented_patient_id
):
    profile_id = _profile_id(db, consented_patient_id)
    db.execute("delete from readings where patient_id = %s", (profile_id,))
    db.execute(
        "insert into readings "
        "(patient_id, systolic, diastolic, source, measured_at, validation_status) "
        "values (%s, 120, 80, 'manual', now() - interval '7 days 1 second', 'valid')",
        (profile_id,),
    )
    summary = client.get(
        "/api/readings/summary", headers=consented_patient_headers
    ).json()
    assert summary["valid_count"] == 0
    assert summary["sufficient"] is False
    assert summary["mean_systolic"] is None
    assert summary["mean_diastolic"] is None


def test_summary_requires_consent(client, patient_headers, patient_id):
    response = client.get("/api/readings/summary", headers=patient_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "No hay consentimiento informado vigente"


def test_physician_reads_the_home_window_summary(
    client, physician_headers, consented_patient_id, home_readings
):
    body = client.get(
        f"/api/readings/summary?patient_id={consented_patient_id}",
        headers=physician_headers,
    ).json()
    assert body["sufficient"] is True
    assert body["valid_count"] == 8


def test_symptoms_are_listed_for_the_patient(client, patient_headers, db, patient_id):
    profile_id = _profile_id(db, patient_id)
    db.execute(
        "insert into symptoms_mood (patient_id, free_text, mood, recorded_at) "
        "values (%s, 'mareo', 'bien', '2026-01-01T00:00:00+00:00')",
        (profile_id,),
    )
    db.execute(
        "insert into symptoms_mood (patient_id, free_text, recorded_at) "
        "values (%s, 'dolor de cabeza', '2026-01-02T00:00:00+00:00')",
        (profile_id,),
    )
    body = client.get("/api/symptoms", headers=patient_headers).json()
    assert body["total"] == 2
    assert [item["free_text"] for item in body["items"]] == [
        "dolor de cabeza",
        "mareo",
    ]
    assert body["items"][0]["patient_id"] == str(patient_id)
    first = client.get(
        "/api/symptoms?limit=1&offset=0", headers=patient_headers
    ).json()
    second = client.get(
        "/api/symptoms?limit=1&offset=1", headers=patient_headers
    ).json()
    assert first["total"] == 2
    assert [item["free_text"] for item in first["items"]] == ["dolor de cabeza"]
    assert [item["free_text"] for item in second["items"]] == ["mareo"]


def test_physician_lists_a_linked_patients_symptoms(
    client, db, physician_headers, consented_patient_id
):
    db.execute(
        "insert into symptoms_mood (patient_id, free_text, recorded_at) "
        "values (%s, 'mareo', now())",
        (_profile_id(db, consented_patient_id),),
    )
    body = client.get(
        f"/api/symptoms?patient_id={consented_patient_id}", headers=physician_headers
    ).json()
    assert body["total"] == 1
    assert body["items"][0]["patient_id"] == str(consented_patient_id)


def test_reading_and_symptom_lists_never_expose_the_profile_id(
    client, db, consented_patient_headers, consented_patient_id, home_readings
):
    profile_id = _profile_id(db, consented_patient_id)
    db.execute(
        "insert into symptoms_mood (patient_id, free_text, recorded_at) "
        "values (%s, 'mareo', now())",
        (profile_id,),
    )
    readings = client.get("/api/readings", headers=consented_patient_headers)
    symptoms = client.get("/api/symptoms", headers=consented_patient_headers)
    assert str(profile_id) not in readings.text
    assert str(profile_id) not in symptoms.text
    assert set(readings.json()["items"][0]) == {
        "id",
        "patient_id",
        "systolic",
        "diastolic",
        "heart_rate",
        "source",
        "measured_at",
        "validation_status",
    }
    assert set(symptoms.json()["items"][0]) == {
        "id",
        "patient_id",
        "free_text",
        "mood",
        "recorded_at",
    }


def test_summary_of_a_linked_patient_without_consent_is_rejected(
    client, db, physician_headers, consented_patient_id
):
    db.execute(
        "update consents set revoked_at = now() where patient_id = "
        "(select id from patient_profiles where user_id = %s)",
        (consented_patient_id,),
    )
    response = client.get(
        f"/api/readings/summary?patient_id={consented_patient_id}",
        headers=physician_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "No hay consentimiento informado vigente"
