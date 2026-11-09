"""@requirement RF-02
@requirement RF-15
@requirement RF-27

Operación del administrador: vínculos, destinatarios, rastro y sesiones.
"""

import pytest
from psycopg.types.json import Jsonb

pytestmark = pytest.mark.integration


def test_physician_cannot_open_the_admin_directory(client, physician_headers):
    response = client.get("/api/admin/links", headers=physician_headers)
    assert response.status_code == 403


def test_admin_assigns_and_removes_a_physician(client, admin_headers, db, consented_patient_id):
    created = client.post(
        "/api/accounts/register",
        json={
            "email": "medico-nuevo@hta.demo",
            "password": "s3cret-demo",
            "full_name": "Médico Nuevo",
            "birth_date": "1980-01-02",
        },
    )
    assert created.status_code == 201
    physician_id = created.json()["id"]
    assert client.patch(
        f"/api/accounts/{physician_id}/role",
        json={"role": "physician"},
        headers=admin_headers,
    ).status_code == 204

    assigned = client.post(
        "/api/admin/physicians",
        json={"patient_user_id": str(consented_patient_id), "physician_user_id": physician_id},
        headers=admin_headers,
    )
    assert assigned.status_code == 204
    again = client.post(
        "/api/admin/physicians",
        json={"patient_user_id": str(consented_patient_id), "physician_user_id": physician_id},
        headers=admin_headers,
    )
    assert again.status_code == 409

    listed = client.get("/api/admin/links", headers=admin_headers).json()
    assert any(item["physician_user_id"] == physician_id for item in listed["physicians"])
    assert "systolic" not in listed

    removed = client.delete(
        f"/api/admin/physicians/{consented_patient_id}/{physician_id}",
        headers=admin_headers,
    )
    assert removed.status_code == 204
    missing = client.delete(
        f"/api/admin/physicians/{consented_patient_id}/{physician_id}",
        headers=admin_headers,
    )
    assert missing.status_code == 404


def test_admin_authorizes_a_caregiver_and_changes_scope(client, admin_headers, consented_patient_id):
    created = client.post(
        "/api/accounts/register",
        json={
            "email": "cuidador-nuevo@hta.demo",
            "password": "s3cret-demo",
            "full_name": "Cuidador Nuevo",
            "birth_date": "1982-04-05",
        },
    )
    caregiver_id = created.json()["id"]
    client.patch(
        f"/api/accounts/{caregiver_id}/role",
        json={"role": "caregiver"},
        headers=admin_headers,
    )

    authorized = client.post(
        "/api/admin/caregivers",
        json={
            "patient_user_id": str(consented_patient_id),
            "caregiver_user_id": caregiver_id,
            "authorized_scope": "readings",
        },
        headers=admin_headers,
    )
    assert authorized.status_code == 201
    link_id = authorized.json()["id"]

    unknown = client.patch(
        f"/api/admin/caregivers/{link_id}",
        json={"authorized_scope": "full"},
        headers=admin_headers,
    )
    assert unknown.status_code == 422

    changed = client.patch(
        f"/api/admin/caregivers/{link_id}",
        json={"authorized_scope": "minimal"},
        headers=admin_headers,
    )
    assert changed.status_code == 204

    revoked = client.delete(f"/api/admin/caregivers/{link_id}", headers=admin_headers)
    assert revoked.status_code == 204


def test_admin_edits_recipients_and_not_thresholds(client, admin_headers, db):
    config_id = db.execute(
        "insert into alert_config (metric, high_threshold, critical_high, recipients) "
        "values ('systolic', 140, 180, %s) returning id",
        (Jsonb(["physician"]),),
    ).fetchone()[0]

    listed = client.get("/api/admin/alert-config", headers=admin_headers)
    assert listed.status_code == 200
    row = next(item for item in listed.json()["items"] if item["id"] == str(config_id))
    assert row["high_threshold"] == 140
    assert row["recipients"] == ["physician"]

    rejected = client.patch(
        f"/api/admin/alert-config/{config_id}/recipients",
        json={"recipients": ["patient"], "high_threshold": 200},
        headers=admin_headers,
    )
    assert rejected.status_code == 422

    updated = client.patch(
        f"/api/admin/alert-config/{config_id}/recipients",
        json={"recipients": ["patient", "physician", "patient"]},
        headers=admin_headers,
    )
    assert updated.status_code == 204
    stored = db.execute("select recipients, high_threshold from alert_config where id = %s", (config_id,)).fetchone()
    assert stored[0] == ["patient", "physician"]
    assert int(stored[1]) == 140


def test_admin_sets_the_threshold_band_and_rejects_an_inverted_one(client, admin_headers, db, admin_id):
    config_id = db.execute(
        "insert into alert_config (metric, high_threshold, critical_high, recipients) "
        "values ('systolic', 140, 180, %s) returning id",
        (Jsonb(["physician"]),),
    ).fetchone()[0]

    saved = client.patch(
        f"/api/admin/alert-config/{config_id}",
        json={"low_threshold": 90, "high_threshold": 145, "critical_low": 80, "critical_high": 180},
        headers=admin_headers,
    )
    assert saved.status_code == 204
    stored = db.execute(
        "select low_threshold, high_threshold, critical_low, critical_high from alert_config where id = %s",
        (config_id,),
    ).fetchone()
    assert [int(value) for value in stored] == [90, 145, 80, 180]

    inverted = client.patch(
        f"/api/admin/alert-config/{config_id}",
        json={"low_threshold": 160, "high_threshold": 140, "critical_low": None, "critical_high": 180},
        headers=admin_headers,
    )
    assert inverted.status_code == 422
    assert "menor" in inverted.json()["detail"]
    untouched = db.execute("select low_threshold from alert_config where id = %s", (config_id,)).fetchone()[0]
    assert int(untouched) == 90

    cleared = client.patch(
        f"/api/admin/alert-config/{config_id}",
        json={"low_threshold": None, "high_threshold": None, "critical_low": None, "critical_high": None},
        headers=admin_headers,
    )
    assert cleared.status_code == 204
    empty = db.execute(
        "select low_threshold, high_threshold, critical_low, critical_high from alert_config where id = %s",
        (config_id,),
    ).fetchone()
    assert list(empty) == [None, None, None, None]

    audit = db.execute(
        "select count(*) from audit_logs where action = 'alert_config.thresholds_updated' and entity_id = %s",
        (config_id,),
    ).fetchone()[0]
    assert audit == 2


def test_audit_filters_by_activity_type(client, admin_headers, db, admin_id):
    db.execute(
        "insert into audit_logs (actor_user_id, action, entity) values (%s, 'accounts.deactivated', 'users')",
        (admin_id,),
    )
    db.execute(
        "insert into audit_logs (actor_user_id, action, entity) values (%s, 'auth.login', 'users')",
        (admin_id,),
    )

    page = client.get("/api/admin/audit?topic=accounts", headers=admin_headers)
    assert page.status_code == 200
    actions = {item["action"] for item in page.json()["items"]}
    assert "accounts.deactivated" in actions
    assert "auth.login" not in actions
    assert all(action.startswith("accounts.") for action in actions)

    unknown = client.get("/api/admin/audit?topic=inventado", headers=admin_headers)
    assert unknown.status_code == 422


def test_audit_hides_clinical_details(client, admin_headers, db, admin_id):
    db.execute(
        "insert into audit_logs (actor_user_id, action, entity, details) "
        "values (%s, 'reading.created', 'readings', %s)",
        (admin_id, Jsonb({"systolic": 180})),
    )
    db.execute(
        "insert into audit_logs (actor_user_id, action, entity, details) "
        "values (%s, 'accounts.role_changed', 'users', %s)",
        (admin_id, Jsonb({"previous": "patient", "new": "caregiver"})),
    )

    page = client.get("/api/admin/audit?action=reading.created", headers=admin_headers)
    assert page.status_code == 200
    body = page.json()
    assert body["total"] >= 1
    assert body["items"][0]["details"] is None
    assert body["items"][0]["details_withheld"] is True

    roles = client.get("/api/admin/audit?action=accounts.role_changed", headers=admin_headers).json()
    assert roles["items"][0]["details"] == {"previous": "patient", "new": "caregiver"}
    assert roles["items"][0]["details_withheld"] is False


def test_admin_revokes_another_accounts_sessions_but_not_their_own(client, admin_headers, admin_id, db):
    other = client.post(
        "/api/accounts/register",
        json={
            "email": "sesion-ajena@hta.demo",
            "password": "s3cret-demo",
            "full_name": "Sesión Ajena",
            "birth_date": "1990-06-07",
        },
    ).json()["id"]
    db.execute(
        "insert into refresh_tokens (user_id, token_hash, expires_at) "
        "values (%s, 'huella-de-prueba-sesion', now() + interval '1 day')",
        (other,),
    )

    denied = client.post(f"/api/accounts/{admin_id}/revoke-sessions", headers=admin_headers)
    assert denied.status_code == 409

    closed = client.post(f"/api/accounts/{other}/revoke-sessions", headers=admin_headers)
    assert closed.status_code == 204
    remaining = db.execute(
        "select count(*) from refresh_tokens where user_id = %s and revoked_at is null",
        (other,),
    ).fetchone()[0]
    assert remaining == 0


def test_account_list_reports_consent_and_sessions(client, admin_headers, consented_patient_id):
    page = client.get("/api/accounts?limit=200", headers=admin_headers)
    assert page.status_code == 200
    patient = next(item for item in page.json()["items"] if item["id"] == str(consented_patient_id))
    assert patient["consent"] == "active"
    assert isinstance(patient["active_sessions"], int)
    admin = next(item for item in page.json()["items"] if item["role"] == "admin")
    assert admin["consent"] is None
