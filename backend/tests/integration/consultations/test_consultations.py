"""@requirement RF-24

Pruebas de integración de la consulta rápida al médico: el paciente envía un
mensaje que lleva su última lectura, el médico vinculado lo responde y cada
parte ve solo lo suyo. Escribir exige consentimiento vigente; leer, no.
"""

import pytest

from tests.integration.conftest import _create_user, _login_headers

pytestmark = pytest.mark.integration

ITEM_KEYS = {
    "reason",
    "onset",
    "medications",
    "urgent",
    "wants_meet",
    "contact_phone",
    "meet_url",
    "checkup_general",
    "checkup_pressure",
    "checkup_symptoms",
    "checkup_conduct",
    "id",
    "patient_id",
    "patient_name",
    "physician_id",
    "physician_name",
    "message",
    "response",
    "status",
    "created_at",
    "responded_at",
    "reading",
}


def _add_reading(db, patient_id, systolic, diastolic, status="valid", hours_ago=1):
    db.execute(
        "insert into readings (patient_id, systolic, diastolic, source, measured_at, validation_status) "
        "select id, %s, %s, 'manual', now() - make_interval(hours => %s), %s "
        "from patient_profiles where user_id = %s",
        (systolic, diastolic, hours_ago, status, patient_id),
    )


def _body(message="Tengo mareos desde ayer con presión 150/95", **extra):
    return {"message": message, "reason": "dizziness_headache", "onset": "since_yesterday", **extra}


def _ask(client, headers, message="Tengo mareos desde ayer con presión 150/95", **extra):
    return client.post("/api/consultations", headers=headers, json=_body(message, **extra))


def _meet(**overrides):
    body = {"meet_url": "https://meet.google.com/abc-defg-hij"}
    body.update(overrides)
    return body


def _checkup(**overrides):
    body = {
        "response": "Registra tus lecturas de hoy y mañana.",
        "checkup_general": "Estable, sin dolor.",
        "checkup_pressure": "Revisé 150/95.",
        "checkup_symptoms": "Mareo de ayer.",
        "checkup_conduct": "Seguir el registro diario.",
    }
    body.update(overrides)
    return body


def test_patient_sends_a_message_that_goes_to_the_linked_physician(
    client, consented_patient_headers, consented_patient_id, physician_id
):
    response = _ask(client, consented_patient_headers, "  Tengo mareos  ")

    assert response.status_code == 201
    body = response.json()
    assert set(body) == ITEM_KEYS
    assert body["message"] == "Tengo mareos"
    assert body["status"] == "in_review"
    assert body["response"] is None
    assert body["responded_at"] is None
    assert body["patient_id"] == str(consented_patient_id)
    assert body["physician_id"] == str(physician_id)
    assert body["physician_name"] == "Médico de prueba"
    assert body["patient_name"] == "Paciente de prueba"
    assert body["reading"] is None
    assert body["reason"] == "dizziness_headache"
    assert body["onset"] == "since_yesterday"
    assert body["medications"] is None
    assert body["urgent"] is False
    assert body["wants_meet"] is False
    assert body["contact_phone"] is None


def test_the_request_carries_the_latest_valid_reading(
    client, consented_patient_headers, consented_patient_id, physician_id, db
):
    _add_reading(db, consented_patient_id, 170, 110, hours_ago=1)
    _add_reading(db, consented_patient_id, 120, 80, hours_ago=5)
    _add_reading(db, consented_patient_id, 300, 200, status="out_of_range", hours_ago=0)

    body = _ask(client, consented_patient_headers).json()

    assert body["reading"]["systolic"] == 170
    assert body["reading"]["diastolic"] == 110
    assert set(body["reading"]) == {"systolic", "diastolic", "measured_at"}


def test_it_requires_a_session_and_the_patient_role(client, admin_headers, physician_headers):
    assert client.post("/api/consultations", json=_body()).status_code == 401
    assert _ask(client, admin_headers).status_code == 403
    assert _ask(client, physician_headers).status_code == 403


def test_writing_needs_current_consent_and_stores_nothing_without_it(client, patient_headers, db):
    response = _ask(client, patient_headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "No hay consentimiento informado vigente"
    assert db.execute("select count(*) from teleconsultations").fetchone()[0] == 0


def test_a_patient_without_an_assigned_physician_gets_a_clear_conflict(client, consented_patient_headers, db):
    response = _ask(client, consented_patient_headers)

    assert response.status_code == 409
    assert response.json()["detail"] == "Aún no tienes un médico asignado"
    assert db.execute("select count(*) from teleconsultations").fetchone()[0] == 0


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"message": "hola"},
        {"message": "hola", "reason": "dizziness_headache"},
        _body(""),
        _body("   "),
        _body("a" * 2001),
        _body(reason="otra_cosa"),
        _body(onset="ayer"),
        _body(physician_id="no-es-un-id"),
        _body(urgent="sí"),
        _body(medications="a" * 501),
        _body(status="answered"),
        _body(contact_phone="3168765432"),
    ],
)
def test_invalid_bodies_are_rejected_and_store_nothing(client, consented_patient_headers, physician_id, db, payload):
    response = client.post("/api/consultations", headers=consented_patient_headers, json=payload)

    assert response.status_code == 422
    assert db.execute("select count(*) from teleconsultations").fetchone()[0] == 0


def test_the_patient_lists_the_own_consultations_newest_first_with_the_envelope(
    client, consented_patient_headers, physician_id
):
    first = _ask(client, consented_patient_headers, "primera").json()
    second = _ask(client, consented_patient_headers, "segunda").json()

    page = client.get("/api/consultations", headers=consented_patient_headers).json()

    assert page["total"] == 2
    assert [item["id"] for item in page["items"]] == [second["id"], first["id"]]
    small = client.get("/api/consultations?limit=1&offset=1", headers=consented_patient_headers).json()
    assert small["total"] == 2
    assert [item["id"] for item in small["items"]] == [first["id"]]


def test_reading_the_history_does_not_need_consent(client, consented_patient_headers, consented_patient_id, physician_id, db):
    _ask(client, consented_patient_headers)
    db.execute("update consents set revoked_at = now()")

    assert client.get("/api/consultations", headers=consented_patient_headers).json()["total"] == 1


def test_a_patient_cannot_list_another_patients_consultations(client, consented_patient_headers, other_patient_id):
    assert client.get(f"/api/consultations?patient_id={other_patient_id}", headers=consented_patient_headers).status_code == 403


def test_the_physician_lists_what_was_sent_to_them_and_filters_by_status(
    client, consented_patient_headers, physician_headers
):
    waiting = _ask(client, consented_patient_headers, "en revision").json()
    meeting = _ask(client, consented_patient_headers, "con reunion", wants_meet=True).json()
    client.post(f"/api/consultations/{meeting['id']}/meet", headers=physician_headers, json=_meet())

    everything = client.get("/api/consultations", headers=physician_headers).json()
    only_review = client.get("/api/consultations?status=in_review", headers=physician_headers).json()
    only_pending = client.get("/api/consultations?status=pending", headers=physician_headers).json()

    assert everything["total"] == 2
    assert [item["id"] for item in only_review["items"]] == [waiting["id"]]
    assert [item["id"] for item in only_pending["items"]] == [meeting["id"]]
    assert client.get("/api/consultations?status=answered", headers=physician_headers).status_code == 422
    assert client.get("/api/consultations?status=wat", headers=physician_headers).status_code == 422


def test_the_physician_can_filter_by_patient(client, consented_patient_headers, consented_patient_id, physician_headers):
    _ask(client, consented_patient_headers)
    mine = client.get(f"/api/consultations?patient_id={consented_patient_id}", headers=physician_headers).json()
    assert mine["total"] == 1


def test_another_physician_sees_nothing_and_cannot_answer(client, consented_patient_headers, physician_id, db):
    created = _ask(client, consented_patient_headers).json()
    _create_user(db, "otro-medico@hta.demo", "physician", "Otro médico")
    other = _login_headers(client, "otro-medico@hta.demo")

    assert client.get("/api/consultations", headers=other).json() == {"items": [], "total": 0}
    assert client.post(f"/api/consultations/{created['id']}/complete", headers=other, json=_checkup(response="x")).status_code == 403


def test_the_caregiver_and_the_admin_have_no_access(client, admin_headers, caregiver_headers):
    for headers in (admin_headers, caregiver_headers):
        assert client.get("/api/consultations", headers=headers).status_code == 403


def test_comments_only_close_from_review_and_the_patient_sees_them(
    client, consented_patient_headers, physician_headers
):
    created = _ask(client, consented_patient_headers).json()

    closed = client.post(
        f"/api/consultations/{created['id']}/complete",
        headers=physician_headers,
        json=_checkup(response="  Registra tus lecturas de hoy y mañana  "),
    )

    assert closed.status_code == 200
    body = closed.json()
    assert body["status"] == "completed"
    assert body["response"] == "Registra tus lecturas de hoy y mañana"
    assert body["meet_url"] is None
    assert body["checkup_general"] == "Estable, sin dolor."
    assert body["checkup_pressure"] == "Revisé 150/95."
    assert body["checkup_symptoms"] == "Mareo de ayer."
    assert body["checkup_conduct"] == "Seguir el registro diario."
    assert body["responded_at"] is not None
    seen = client.get("/api/consultations", headers=consented_patient_headers).json()["items"][0]
    assert seen["response"] == "Registra tus lecturas de hoy y mañana"
    assert seen["status"] == "completed"


def test_a_requested_meeting_is_sent_before_the_checkup(client, consented_patient_headers, physician_headers):
    created = _ask(client, consented_patient_headers, wants_meet=True).json()
    url = f"/api/consultations/{created['id']}"

    early = client.post(f"{url}/complete", headers=physician_headers, json=_checkup())
    sent = client.post(f"{url}/meet", headers=physician_headers, json=_meet())
    again = client.post(f"{url}/meet", headers=physician_headers, json=_meet())
    closed = client.post(f"{url}/complete", headers=physician_headers, json=_checkup())

    assert early.status_code == 409
    assert early.json()["detail"] == "Primero envía el enlace de Meet"
    assert sent.status_code == 200
    assert sent.json()["status"] == "pending"
    assert sent.json()["meet_url"] == "https://meet.google.com/abc-defg-hij"
    assert sent.json()["response"] is None
    assert again.status_code == 409
    assert closed.status_code == 200
    assert closed.json()["status"] == "completed"


def test_a_completed_consultation_cannot_be_completed_again(client, consented_patient_headers, physician_headers):
    created = _ask(client, consented_patient_headers).json()
    url = f"/api/consultations/{created['id']}/complete"
    client.post(url, headers=physician_headers, json=_checkup(response="primera"))

    again = client.post(url, headers=physician_headers, json=_checkup(response="segunda"))

    assert again.status_code == 409
    assert client.get("/api/consultations", headers=physician_headers).json()["items"][0]["response"] == "primera"


def test_the_patient_cannot_answer_and_an_unknown_id_is_a_404(client, consented_patient_headers, physician_headers):
    created = _ask(client, consented_patient_headers).json()

    assert client.post(f"/api/consultations/{created['id']}/complete", headers=consented_patient_headers, json=_checkup(response="x")).status_code == 403
    missing = client.post("/api/consultations/00000000-0000-0000-0000-000000000000/complete", headers=physician_headers, json=_checkup(response="x"))
    assert missing.status_code == 404
    assert missing.json()["detail"] == "La consulta no existe"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"response": ""},
        {"response": "   "},
        {"response": "a" * 2001},
        {"response": "ok", "status": "x"},
        {
            "response": "ok",
            "meet_url": "https://meet.google.com/abc-defg-hij",
            "checkup_general": "Estable",
            "checkup_pressure": "150/95",
            "checkup_symptoms": "Mareo",
            "checkup_conduct": "Registro",
        },
    ],
)
def test_an_invalid_checkup_is_rejected_and_changes_nothing(client, consented_patient_headers, physician_headers, payload):
    created = _ask(client, consented_patient_headers).json()

    response = client.post(f"/api/consultations/{created['id']}/complete", headers=physician_headers, json=payload)

    assert response.status_code == 422
    assert client.get("/api/consultations", headers=physician_headers).json()["items"][0]["status"] == "in_review"


def test_the_audit_records_the_events_without_the_text(client, consented_patient_headers, physician_headers, db):
    created = _ask(client, consented_patient_headers, "mensaje secreto del paciente").json()
    client.post(
        f"/api/consultations/{created['id']}/complete",
        headers=physician_headers,
        json=_checkup(response="respuesta secreta del médico"),
    )

    rows = db.execute(
        "select action, details::text from audit_logs where action like 'consultation.%' order by occurred_at"
    ).fetchall()

    assert [row[0] for row in rows] == ["consultation.created", "consultation.completed"]
    assert all("secreta" not in (row[1] or "") for row in rows)


def test_the_new_columns_and_the_sixteen_tables(db):
    columns = {
        row[0]
        for row in db.execute(
            "select column_name from information_schema.columns where table_name = 'teleconsultations'"
        ).fetchall()
    }
    assert {
        "message",
        "response",
        "created_at",
        "responded_at",
        "reading_id",
        "reason",
        "onset",
        "medications",
        "urgent",
        "contact_phone",
        "wants_meet",
        "meet_url",
        "checkup_general",
        "checkup_pressure",
        "checkup_symptoms",
        "checkup_conduct",
    } <= columns
    assert db.execute(
        "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' "
        "and table_name <> 'schema_migrations'"
    ).fetchone()[0] == 16
    assert db.execute(
        "select confdeltype from pg_constraint where conname = 'teleconsultations_reading_id_fkey'"
    ).fetchone()[0] == "n"


def test_deactivating_the_patient_keeps_the_clinical_consultation(client, admin_headers, consented_patient_headers, consented_patient_id, physician_id, db):
    _ask(client, consented_patient_headers)

    assert client.post(f"/api/accounts/{consented_patient_id}/deactivate", headers=admin_headers).status_code == 204

    assert db.execute("select count(*) from teleconsultations").fetchone()[0] == 1


def test_the_patient_lists_the_doctors_they_can_write_to(client, consented_patient_headers, physician_id, db, consented_patient_id):
    other = _create_user(db, "segundo-medico@hta.demo", "physician", "Segundo médico")
    db.execute(
        "insert into patient_physician (patient_id, physician_id) "
        "select id, %s from patient_profiles where user_id = %s",
        (other, consented_patient_id),
    )

    page = client.get("/api/consultations/recipients", headers=consented_patient_headers).json()

    assert page["total"] == 2
    assert {item["full_name"] for item in page["items"]} == {"Médico de prueba", "Segundo médico"}
    assert set(page["items"][0]) == {"id", "full_name"}


def test_the_recipients_list_is_for_patients_only_and_empty_without_doctors(client, consented_patient_headers, admin_headers, physician_headers):
    assert client.get("/api/consultations/recipients", headers=admin_headers).status_code == 403
    assert client.get("/api/consultations/recipients", headers=physician_headers).status_code == 403
    assert client.get("/api/consultations/recipients").status_code == 401


def test_without_a_linked_doctor_the_recipients_list_is_empty(client, consented_patient_headers):
    assert client.get("/api/consultations/recipients", headers=consented_patient_headers).json() == {"items": [], "total": 0}


def test_the_patient_chooses_which_linked_doctor_receives_the_consultation(
    client, consented_patient_headers, consented_patient_id, physician_id, db
):
    other = _create_user(db, "segundo-medico@hta.demo", "physician", "Segundo médico")
    db.execute(
        "insert into patient_physician (patient_id, physician_id) "
        "select id, %s from patient_profiles where user_id = %s",
        (other, consented_patient_id),
    )

    chosen = _ask(client, consented_patient_headers, physician_id=str(other))

    assert chosen.status_code == 201
    assert chosen.json()["physician_id"] == str(other)
    assert chosen.json()["physician_name"] == "Segundo médico"
    default = _ask(client, consented_patient_headers).json()
    assert default["physician_id"] == str(physician_id)


def test_a_doctor_who_is_not_linked_cannot_be_chosen(client, consented_patient_headers, physician_id, db):
    stranger = _create_user(db, "ajeno@hta.demo", "physician", "Médico ajeno")

    response = _ask(client, consented_patient_headers, physician_id=str(stranger))

    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"
    assert db.execute("select count(*) from teleconsultations").fetchone()[0] == 0


def test_a_chosen_account_that_is_not_a_doctor_is_rejected_too(client, consented_patient_headers, consented_patient_id, physician_id):
    assert _ask(client, consented_patient_headers, physician_id=str(consented_patient_id)).status_code == 403


def test_the_extra_details_reach_the_physician(client, consented_patient_headers, physician_headers, physician_id):
    _ask(
        client,
        consented_patient_headers,
        reason="medication",
        onset="over_a_week",
        medications="  losartán 50 mg  ",
        wants_meet=True,
    )

    item = client.get("/api/consultations", headers=physician_headers).json()["items"][0]

    assert item["reason"] == "medication"
    assert item["onset"] == "over_a_week"
    assert item["medications"] == "losartán 50 mg"
    assert item["urgent"] is False
    assert item["wants_meet"] is True


def test_sharing_the_phone_copies_the_profile_phone_and_requires_one(
    client, consented_patient_headers, consented_patient_id, physician_headers, physician_id, db
):
    without = _ask(client, consented_patient_headers, share_phone=True)
    assert without.status_code == 409
    assert without.json()["detail"] == "Agrega tu teléfono en tu perfil para compartirlo"
    assert db.execute("select count(*) from teleconsultations").fetchone()[0] == 0

    db.execute("update patient_profiles set phone = '+57 316 8765 432' where user_id = %s", (consented_patient_id,))
    shared = _ask(client, consented_patient_headers, share_phone=True).json()
    private = _ask(client, consented_patient_headers).json()

    assert shared["contact_phone"] == "+57 316 8765 432"
    assert private["contact_phone"] is None


def test_deactivation_removes_the_shared_phone_but_keeps_the_consultation(
    client, admin_headers, consented_patient_headers, consented_patient_id, physician_id, db
):
    db.execute("update patient_profiles set phone = '3168765432' where user_id = %s", (consented_patient_id,))
    _ask(client, consented_patient_headers, share_phone=True)

    client.post(f"/api/accounts/{consented_patient_id}/deactivate", headers=admin_headers)

    assert db.execute("select count(*), count(contact_phone) from teleconsultations").fetchone() == (1, 0)


def test_the_audit_does_not_carry_the_new_details(client, consented_patient_headers, physician_id, db):
    _ask(client, consented_patient_headers, medications="medicamento secreto", wants_meet=True)

    details = db.execute("select details::text from audit_logs where action = 'consultation.created'").fetchone()[0]

    assert details is None or "secreto" not in details
