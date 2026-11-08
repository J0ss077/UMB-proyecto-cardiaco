"""@requirement RF-16

Pruebas de integración del listado, la consulta y las transiciones humanas de
las alertas.

Cubren el alcance de cada cuenta con la misma matriz de las lecturas, los
filtros por estado y severidad, el orden y la paginación del listado, la
consulta de una alerta y la máquina de estados de las transiciones. Las
transiciones exigen el rol de médico además del acceso: un paciente o un
cuidador que lo intenta recibe 403 y la alerta no cambia. Ninguna transición
prohíbida se acepta, el 409 nombra el estado actual, el descarte exige una nota
y la validación escribe a la persona que validó. Cada transición deja su evento
de auditoría y la respuesta pública lleva el identificador de la cuenta del
paciente, nunca el del perfil.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from hta.auth.passwords import hash_password

pytestmark = pytest.mark.integration

# Tipo de alerta que usa la siembra de demostración y, por tanto, las fixtures
# de esta suite. El esquema lo declara como texto libre y no lo enumera.
ALERT_TYPE = "crisis_hipertensiva"


def _profile_id(db, user_id):
    """Devuelve el perfil de paciente de una cuenta creada por una fixture."""
    return db.execute(
        "select id from patient_profiles where user_id = %s", (user_id,)
    ).fetchone()[0]


def _insert_alert(
    db,
    patient_user_id,
    severity="high",
    status="open",
    created_at=None,
    note=None,
):
    """Inserta una alerta del paciente indicado y devuelve su identificador.

    ``created_at`` sin valor usa el instante actual, para que varias alertas
    creadas por la misma prueba queden ordenadas por el reloj del servidor.
    """
    (alert_id,) = db.execute(
        "insert into alerts "
        "(patient_id, type, severity, status, created_at, note) "
        "select id, %s, %s, %s, coalesce(%s, now()), %s "
        "from patient_profiles where user_id = %s returning id",
        (ALERT_TYPE, severity, status, created_at, note, patient_user_id),
    ).fetchone()
    return alert_id


def test_patient_sees_only_own_alerts(
    client, db, patient_headers, patient_id, other_patient_id
):
    """El paciente ve su alerta y no la del otro paciente, aunque exista.

    La prueba siembra una alerta para cada paciente: el listado sin
    ``patient_id`` resuelve el perfil de la sesión y no puede traer la ajena.
    """
    mine = _insert_alert(db, patient_id, "high")
    _insert_alert(db, other_patient_id, "critical")
    body = client.get("/api/alerts", headers=patient_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(mine)
    assert all(item["patient_id"] == body["items"][0]["patient_id"] for item in body["items"])
    assert body["items"][0]["patient_id"] == str(patient_id)


def test_consented_patient_lists_only_own_alerts(
    client, consented_patient_headers, open_alert_id, validated_alert_id
):
    body = client.get("/api/alerts", headers=consented_patient_headers).json()
    assert body["total"] == 2
    assert {item["id"] for item in body["items"]} == {
        str(open_alert_id),
        str(validated_alert_id),
    }


def test_physician_must_pass_a_patient_for_the_alert_list(
    client, physician_headers, open_alert_id
):
    response = client.get("/api/alerts", headers=physician_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_physician_lists_a_linked_patients_alerts(
    client, physician_headers, consented_patient_id, open_alert_id
):
    body = client.get(
        f"/api/alerts?patient_id={consented_patient_id}",
        headers=physician_headers,
    ).json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(open_alert_id)
    assert body["items"][0]["patient_id"] == str(consented_patient_id)


def test_alert_listing_filters_by_status_and_severity(
    client, physician_headers, consented_patient_id, open_alert_id, validated_alert_id
):
    url = f"/api/alerts?patient_id={consented_patient_id}"
    open_page = client.get(f"{url}&status=open", headers=physician_headers).json()
    assert open_page["total"] == 1
    assert open_page["items"][0]["id"] == str(open_alert_id)

    validated_page = client.get(
        f"{url}&status=validated", headers=physician_headers
    ).json()
    assert validated_page["total"] == 1
    assert validated_page["items"][0]["id"] == str(validated_alert_id)

    critical_page = client.get(
        f"{url}&severity=critical", headers=physician_headers
    ).json()
    assert critical_page["total"] == 1
    assert critical_page["items"][0]["id"] == str(open_alert_id)

    both_page = client.get(
        f"{url}&status=validated&severity=critical", headers=physician_headers
    ).json()
    assert both_page["total"] == 0


def test_alert_filter_outside_the_enum_is_rejected(
    client, physician_headers, consented_patient_id
):
    for query in ("status=closed", "severity=urgent"):
        response = client.get(
            f"/api/alerts?patient_id={consented_patient_id}&{query}",
            headers=physician_headers,
        )
        assert response.status_code == 422


def test_alert_listing_is_ordered_and_paginated(
    client, db, physician_headers, consented_patient_id
):
    created = [
        datetime(2026, 1, day, tzinfo=timezone.utc) for day in (1, 2, 3)
    ]
    ids = [
        _insert_alert(db, consented_patient_id, "medium", "open", moment)
        for moment in created
    ]
    url = f"/api/alerts?patient_id={consented_patient_id}"
    first = client.get(f"{url}&limit=2", headers=physician_headers).json()
    assert first["total"] == 3
    assert [item["id"] for item in first["items"]] == [str(ids[2]), str(ids[1])]
    second = client.get(f"{url}&limit=2&offset=2", headers=physician_headers).json()
    assert [item["id"] for item in second["items"]] == [str(ids[0])]
    assert second["total"] == 3


def test_alert_detail_publishes_the_account_and_never_the_profile(
    client, db, physician_headers, consented_patient_id, open_alert_id
):
    response = client.get(f"/api/alerts/{open_alert_id}", headers=physician_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(open_alert_id)
    assert body["patient_id"] == str(consented_patient_id)
    assert body["status"] == "open"
    assert set(body) == {
        "id",
        "patient_id",
        "type",
        "severity",
        "status",
        "note",
        "created_at",
        "validated_by",
        "validated_at",
        "dismissal_reason",
    }
    assert str(_profile_id(db, consented_patient_id)) not in response.text


def test_alert_responses_never_expose_the_profile_id(
    client, db, physician_headers, consented_patient_id, open_alert_id
):
    profile_id = _profile_id(db, consented_patient_id)
    listing = client.get(
        f"/api/alerts?patient_id={consented_patient_id}", headers=physician_headers
    )
    detail = client.get(f"/api/alerts/{open_alert_id}", headers=physician_headers)
    assert listing.status_code == 200
    assert detail.status_code == 200
    assert str(profile_id) not in listing.text
    assert str(profile_id) not in detail.text


def test_unknown_alert_returns_404(client, physician_headers):
    response = client.get(f"/api/alerts/{uuid4()}", headers=physician_headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "La alerta no existe"


def test_alert_of_another_patient_is_refused_with_the_shared_message(
    client, patient_headers, open_alert_id
):
    """El 403 de una alerta ajena es el mismo `Permiso denegado` de siempre.

    El 404 queda para el identificador sin fila; la negativa de alcance no
    distingue a quién pertenece la alerta.
    """
    response = client.get(f"/api/alerts/{open_alert_id}", headers=patient_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_caregiver_with_readings_scope_lists_the_alerts(
    client, caregiver_headers, consented_patient_id, open_alert_id
):
    body = client.get(
        f"/api/alerts?patient_id={consented_patient_id}",
        headers=caregiver_headers,
    ).json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == str(open_alert_id)


def test_caregiver_with_readings_scope_cannot_dismiss(
    client, db, caregiver_headers, open_alert_id
):
    """El cuidador autorizado lee la alerta, pero no puede moverla."""
    response = client.post(
        f"/api/alerts/{open_alert_id}/dismiss",
        json={"note": "motivo del cuidador"},
        headers=caregiver_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"
    row = db.execute(
        "select status, note from alerts where id = %s", (open_alert_id,)
    ).fetchone()
    assert row == ("open", None)
    assert db.execute(
        "select count(*) from audit_logs where action = 'alert.dismissed'"
    ).fetchone()[0] == 0


def test_caregiver_with_readings_scope_cannot_validate(
    client, db, caregiver_headers, open_alert_id
):
    """El cuidador autorizado tampoco puede validar: la compuerta es por ruta."""
    response = client.post(
        f"/api/alerts/{open_alert_id}/validate",
        json={"note": "nota del cuidador"},
        headers=caregiver_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"
    row = db.execute(
        "select status, validated_by, validated_at from alerts where id = %s",
        (open_alert_id,),
    ).fetchone()
    assert row == ("open", None, None)
    assert db.execute(
        "select count(*) from audit_logs where action = 'alert.validated'"
    ).fetchone()[0] == 0


def test_caregiver_with_minimal_scope_is_rejected(
    client, caregiver_minimal_headers, consented_patient_id
):
    response = client.get(
        f"/api/alerts?patient_id={consented_patient_id}",
        headers=caregiver_minimal_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_other_caregiver_cannot_read_the_alert(
    client, other_caregiver_headers, open_alert_id
):
    response = client.get(
        f"/api/alerts/{open_alert_id}", headers=other_caregiver_headers
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_physician_validates_an_open_alert(
    client, db, physician_headers, open_alert_id, physician_id
):
    response = client.post(
        f"/api/alerts/{open_alert_id}/validate",
        json={"note": "confirmada en consulta"},
        headers=physician_headers,
    )
    assert response.status_code == 204
    row = db.execute(
        "select status, validated_by, validated_at from alerts where id = %s",
        (open_alert_id,),
    ).fetchone()
    assert row[0] == "validated"
    assert row[1] == physician_id
    assert row[2] is not None


def test_validation_records_the_actor_and_the_note_in_the_audit(
    client, db, physician_headers, physician_id, open_alert_id
):
    client.post(
        f"/api/alerts/{open_alert_id}/validate",
        json={"note": "confirmada en consulta"},
        headers=physician_headers,
    )
    audit = db.execute(
        "select actor_user_id, entity, details from audit_logs "
        "where action = 'alert.validated'",
    ).fetchone()
    assert audit == (
        physician_id,
        "alerts",
        {"note": "confirmada en consulta"},
    )
    stored = db.execute(
        "select note from alerts where id = %s", (open_alert_id,)
    ).fetchone()
    assert stored[0] is None


def test_alert_cannot_be_validated_twice(client, physician_headers, validated_alert_id):
    response = client.post(
        f"/api/alerts/{validated_alert_id}/validate",
        json={},
        headers=physician_headers,
    )
    assert response.status_code == 409
    assert "validated" in response.json()["detail"]


def test_patient_cannot_validate_an_alert(
    client, db, patient_headers, open_alert_id
):
    response = client.post(
        f"/api/alerts/{open_alert_id}/validate",
        json={},
        headers=patient_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"
    row = db.execute(
        "select status, validated_by from alerts where id = %s",
        (open_alert_id,),
    ).fetchone()
    assert row == ("open", None)
    assert db.execute(
        "select count(*) from audit_logs where action = 'alert.validated'"
    ).fetchone()[0] == 0


def test_patient_cannot_validate_own_alert(
    client, db, patient_headers, patient_id
):
    """El rol, y no el alcance, rechaza al paciente dueño de la alerta.

    Sin la compuerta de rol, el resolutor de acceso dejaría pasar al paciente
    sobre su propia alerta. La prueba comprueba el 403, el mensaje y que la
    fila y la auditoría no cambiaron.
    """
    alert_id = _insert_alert(db, patient_id, "high")
    response = client.post(
        f"/api/alerts/{alert_id}/validate",
        json={},
        headers=patient_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"
    row = db.execute(
        "select status, validated_by, validated_at from alerts where id = %s",
        (alert_id,),
    ).fetchone()
    assert row == ("open", None, None)
    assert db.execute(
        "select count(*) from audit_logs where entity_id = %s", (alert_id,)
    ).fetchone()[0] == 0


def test_dismissal_requires_a_note(client, physician_headers, open_alert_id):
    assert (
        client.post(
            f"/api/alerts/{open_alert_id}/dismiss",
            json={},
            headers=physician_headers,
        ).status_code
        == 422
    )


def test_dismissal_rejects_a_blank_note(client, db, physician_headers, open_alert_id):
    response = client.post(
        f"/api/alerts/{open_alert_id}/dismiss",
        json={"note": "   "},
        headers=physician_headers,
    )
    assert response.status_code == 422
    row = db.execute(
        "select status, note from alerts where id = %s", (open_alert_id,)
    ).fetchone()
    assert row == ("open", None)
    assert db.execute(
        "select count(*) from audit_logs where action = 'alert.dismissed'"
    ).fetchone()[0] == 0


def test_every_transition_is_audited(client, db, physician_headers, open_alert_id):
    client.post(
        f"/api/alerts/{open_alert_id}/acknowledge",
        json={},
        headers=physician_headers,
    )
    row = db.execute(
        "select action from audit_logs where entity_id = %s "
        "order by occurred_at desc limit 1",
        (open_alert_id,),
    ).fetchone()
    assert row[0] == "alert.acknowledged"


def test_acknowledge_only_changes_the_status(
    client, db, physician_headers, open_alert_id
):
    response = client.post(
        f"/api/alerts/{open_alert_id}/acknowledge",
        json={},
        headers=physician_headers,
    )
    assert response.status_code == 204
    row = db.execute(
        "select status, validated_by, validated_at from alerts where id = %s",
        (open_alert_id,),
    ).fetchone()
    assert row == ("acknowledged", None, None)


def test_acknowledged_alert_can_be_validated(
    client, db, physician_headers, physician_id, open_alert_id
):
    assert (
        client.post(
            f"/api/alerts/{open_alert_id}/acknowledge",
            json={},
            headers=physician_headers,
        ).status_code
        == 204
    )
    response = client.post(
        f"/api/alerts/{open_alert_id}/validate",
        json={},
        headers=physician_headers,
    )
    assert response.status_code == 204
    row = db.execute(
        "select status, validated_by, validated_at from alerts where id = %s",
        (open_alert_id,),
    ).fetchone()
    assert row[0] == "validated"
    assert row[1] == physician_id
    assert row[2] is not None


def test_open_alert_can_be_dismissed_directly(
    client, db, physician_headers, open_alert_id
):
    """El descarte conserva la descripción clínica y deja el motivo en la auditoría."""
    description = "Lecturas de 186/122 y 184/120 mmHg; pendiente de revisión."
    db.execute(
        "update alerts set note = %s where id = %s",
        (description, open_alert_id),
    )
    response = client.post(
        f"/api/alerts/{open_alert_id}/dismiss",
        json={"note": "lectura mal tomada"},
        headers=physician_headers,
    )
    assert response.status_code == 204
    row = db.execute(
        "select status, note from alerts where id = %s", (open_alert_id,)
    ).fetchone()
    assert row == ("dismissed", description)
    audit = db.execute(
        "select action, details from audit_logs where entity_id = %s",
        (open_alert_id,),
    ).fetchone()
    assert audit == ("alert.dismissed", {"note": "lectura mal tomada"})


def test_acknowledged_alert_can_be_dismissed(
    client, db, physician_headers, open_alert_id
):
    client.post(
        f"/api/alerts/{open_alert_id}/acknowledge",
        json={},
        headers=physician_headers,
    )
    response = client.post(
        f"/api/alerts/{open_alert_id}/dismiss",
        json={"note": "duplicada de otra alerta"},
        headers=physician_headers,
    )
    assert response.status_code == 204
    actions = [
        row[0]
        for row in db.execute(
            "select action from audit_logs where entity_id = %s order by occurred_at",
            (open_alert_id,),
        ).fetchall()
    ]
    assert actions == ["alert.acknowledged", "alert.dismissed"]


@pytest.mark.parametrize(
    "current,action",
    [
        ("validated", "acknowledge"),
        ("validated", "dismiss"),
        ("validated", "validate"),
        ("acknowledged", "acknowledge"),
        ("dismissed", "validate"),
    ],
)
def test_rejected_transition_returns_409_naming_the_current_state(
    client,
    db,
    physician_headers,
    consented_patient_id,
    current,
    action,
):
    alert_id = _insert_alert(
        db, consented_patient_id, "high", current, note="motivo original"
    )
    response = client.post(
        f"/api/alerts/{alert_id}/{action}",
        json={"note": "motivo nuevo"},
        headers=physician_headers,
    )
    assert response.status_code == 409
    assert current in response.json()["detail"]
    assert db.execute(
        "select status from alerts where id = %s", (alert_id,)
    ).fetchone()[0] == current


def test_rejected_transition_does_not_write_a_note(
    client, db, physician_headers, validated_alert_id
):
    before = db.execute(
        "select note from alerts where id = %s", (validated_alert_id,)
    ).fetchone()[0]
    response = client.post(
        f"/api/alerts/{validated_alert_id}/acknowledge",
        json={"note": "no debe guardarse"},
        headers=physician_headers,
    )
    assert response.status_code == 409
    after = db.execute(
        "select note from alerts where id = %s", (validated_alert_id,)
    ).fetchone()[0]
    assert after == before


def test_admin_cannot_read_alerts(
    client, admin_headers, consented_patient_id, open_alert_id
):
    paths = (
        "/api/alerts",
        f"/api/alerts?patient_id={consented_patient_id}",
        f"/api/alerts/{open_alert_id}",
    )
    for path in paths:
        response = client.get(path, headers=admin_headers)
        assert response.status_code == 403
        assert response.json()["detail"] == "Permiso denegado"


@pytest.mark.parametrize("action", ("acknowledge", "validate", "dismiss"))
def test_admin_cannot_transition_alerts(
    client, admin_headers, open_alert_id, action
):
    response = client.post(
        f"/api/alerts/{open_alert_id}/{action}",
        json={"note": "motivo"},
        headers=admin_headers,
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


@pytest.mark.parametrize("action", ("acknowledge", "validate", "dismiss"))
def test_unknown_alert_cannot_be_transitioned(client, physician_headers, action):
    response = client.post(
        f"/api/alerts/{uuid4()}/{action}",
        json={"note": "motivo"},
        headers=physician_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "La alerta no existe"


def test_physician_of_another_patient_cannot_validate(
    client, db, open_alert_id
):
    """El rol de médico no basta: el vínculo con el paciente sigue mandando."""
    email = "medico-ajeno@hta.demo"
    db.execute(
        "insert into users (email, password_hash, role, full_name) "
        "values (%s, %s, 'physician', %s)",
        (email, hash_password("s3cret"), "Médico ajeno"),
    )
    login = client.post(
        "/api/auth/login", json={"email": email, "password": "s3cret"}
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    response = client.post(
        f"/api/alerts/{open_alert_id}/validate", json={}, headers=headers
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"
    assert db.execute(
        "select status from alerts where id = %s", (open_alert_id,)
    ).fetchone()[0] == "open"


def test_alert_listing_returns_a_type_and_a_severity(
    client, physician_headers, consented_patient_id, open_alert_id
):
    body = client.get(
        f"/api/alerts?patient_id={consented_patient_id}",
        headers=physician_headers,
    ).json()
    item = body["items"][0]
    assert item["type"] == ALERT_TYPE
    assert item["severity"] == "critical"
    assert item["created_at"].endswith("Z") or item["created_at"].endswith("+00:00")
    assert UUID(item["id"]) == open_alert_id


def test_detail_reports_the_dismissal_reason_from_the_audit_trail(
    client, db, physician_headers, consented_patient_id, open_alert_id
):
    """El detalle explica el descarte sin duplicar el texto en la alerta.

    ``dismissal_reason`` se lee de la auditoría y solo viaja en el detalle; el
    listado no lo lleva para no pagar una consulta por cada alerta.
    """
    open_body = client.get(
        f"/api/alerts/{open_alert_id}", headers=physician_headers
    ).json()
    assert open_body["dismissal_reason"] is None

    reason = "Lectura mal tomada; se confirmó en consulta."
    dismissed = client.post(
        f"/api/alerts/{open_alert_id}/dismiss",
        json={"note": reason},
        headers=physician_headers,
    )
    assert dismissed.status_code == 204

    detail = client.get(
        f"/api/alerts/{open_alert_id}", headers=physician_headers
    ).json()
    assert detail["status"] == "dismissed"
    assert detail["dismissal_reason"] == reason
    assert detail["note"] is None
    assert db.execute(
        "select details->>'note' from audit_logs "
        "where action = 'alert.dismissed' and entity_id = %s",
        (open_alert_id,),
    ).fetchone()[0] == reason

    listing = client.get(
        f"/api/alerts?patient_id={consented_patient_id}",
        headers=physician_headers,
    ).json()
    assert "dismissal_reason" not in listing["items"][0]
