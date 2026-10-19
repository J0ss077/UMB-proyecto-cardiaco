"""@requirement RF-03

Pruebas de integración del consentimiento informado: el paciente acepta una
versión concreta del documento, una segunda aceptación se conserva como fila
propia, la revocación cierra todas las aceptaciones vigentes y conserva el
historial, una versión nueva exige una aceptación nueva y la auditoría registra
quién aceptó y quién revocó.
"""

import pytest

from hta.auth.passwords import hash_password

pytestmark = pytest.mark.integration


def test_patient_accepts_consent(client, patient_headers, patient_id, db):
    response = client.post("/api/consent", json={"version": 1, "content_ref": "consent-v1.md"},
                           headers=patient_headers)
    assert response.status_code == 201
    status = client.get("/api/consent", headers=patient_headers).json()
    assert status["active"] is True
    assert status["requires_acceptance_of_version"] is None
    consent_id = db.execute("select id from consents").fetchone()[0]
    audit = db.execute(
        "select actor_user_id, entity, entity_id, details "
        "from audit_logs where action = 'consent.accepted'"
    ).fetchone()
    assert audit == (patient_id, "consents", consent_id, {"version": 1})


def test_revocation_blocks_new_consent_but_keeps_history(client, patient_headers, patient_id, db):
    client.post("/api/consent", json={"version": 1, "content_ref": "v1"}, headers=patient_headers)
    client.post("/api/consent/revoke", headers=patient_headers)
    assert client.get("/api/consent", headers=patient_headers).json()["active"] is False
    rows = db.execute("select version, accepted_at, revoked_at from consents").fetchall()
    assert len(rows) == 1
    assert rows[0][2] is not None
    audit = db.execute(
        "select actor_user_id, entity, details "
        "from audit_logs where action = 'consent.revoked'"
    ).fetchone()
    assert audit == (patient_id, "consents", {"version": 1})
    assert db.execute(
        "select count(*) from audit_logs where action = 'consent.revoked'"
    ).fetchone()[0] == 1


def test_second_acceptance_appends_and_one_revocation_closes_every_row(
    client, patient_headers, db
):
    first = client.post("/api/consent", json={"version": 1, "content_ref": "v1"},
                        headers=patient_headers)
    second = client.post("/api/consent", json={"version": 1, "content_ref": "v1"},
                         headers=patient_headers)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert client.get("/api/consent", headers=patient_headers).json()["active"] is True

    assert client.post("/api/consent/revoke", headers=patient_headers).status_code == 204

    rows = db.execute("select id, version, revoked_at from consents").fetchall()
    assert len(rows) == 2
    assert all(row[1] == 1 for row in rows)
    assert all(row[2] is not None for row in rows)
    for version in (1, 2):
        status = client.get("/api/consent", headers=patient_headers,
                            params={"required_version": version}).json()
        assert status["active"] is False
    audits = db.execute(
        "select entity_id, details from audit_logs where action = 'consent.revoked'"
    ).fetchall()
    assert len(audits) == 2
    assert {row[0] for row in audits} == {row[0] for row in rows}
    assert all(row[1] == {"version": 1} for row in audits)


def test_new_version_requires_new_acceptance(client, patient_headers):
    client.post("/api/consent", json={"version": 1, "content_ref": "v1"}, headers=patient_headers)
    response = client.get("/api/consent", headers=patient_headers,
                          params={"required_version": 2})
    assert response.json()["active"] is False
    assert response.json()["requires_acceptance_of_version"] == 2


def test_patient_without_acceptance_requires_the_default_version(client, patient_headers):
    response = client.get("/api/consent", headers=patient_headers)
    assert response.status_code == 200
    assert response.json() == {"active": False, "requires_acceptance_of_version": 1}


def test_revoking_without_active_consent_is_idempotent(client, patient_headers, db):
    assert client.post("/api/consent/revoke", headers=patient_headers).status_code == 204
    assert db.execute(
        "select count(*) from audit_logs where action = 'consent.revoked'"
    ).fetchone()[0] == 0
    client.post("/api/consent", json={"version": 1, "content_ref": "v1"}, headers=patient_headers)
    assert client.post("/api/consent/revoke", headers=patient_headers).status_code == 204
    assert client.post("/api/consent/revoke", headers=patient_headers).status_code == 204
    assert db.execute(
        "select count(*) from audit_logs where action = 'consent.revoked'"
    ).fetchone()[0] == 1


def test_admin_cannot_accept_consent(client, admin_headers, db):
    response = client.post("/api/consent", json={"version": 1, "content_ref": "v1"},
                           headers=admin_headers)
    assert response.status_code == 403
    assert db.execute("select count(*) from consents").fetchone()[0] == 0


def test_patient_without_profile_cannot_accept_consent(client, db):
    email = "sin-perfil@hta.demo"
    db.execute(
        "insert into users (email, password_hash, role, full_name) "
        "values (%s, %s, 'patient', %s)",
        (email, hash_password("s3cret"), "Paciente sin perfil"),
    )
    login = client.post("/api/auth/login", json={"email": email, "password": "s3cret"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    response = client.post("/api/consent", json={"version": 1, "content_ref": "v1"},
                           headers=headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"
    assert db.execute("select count(*) from consents").fetchone()[0] == 0
