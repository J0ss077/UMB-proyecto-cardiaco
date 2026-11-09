"""@requirement RF-02

Cambio de contraseña del personal: el médico y el cuidador lo piden y un
administrador lo aprueba; el administrador cambia la suya sin aprobación.
"""

import pytest

pytestmark = pytest.mark.integration

CURRENT = "s3cret"
NEW = "nueva-clave-9"
URL = "/api/account/password-change"


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


@pytest.fixture(params=["physician_headers", "caregiver_headers"])
def requester(request):
    headers = request.getfixturevalue(request.param)
    email = "medico-consulta@hta.demo" if request.param == "physician_headers" else "cuidador-lecturas@hta.demo"
    return headers, email


def test_the_status_starts_as_none(client, requester):
    headers, _ = requester
    assert client.get(URL, headers=headers).json() == {"status": "none", "requested_at": None}


def test_a_request_needs_the_current_password_and_changes_nothing_until_approved(client, requester, db):
    headers, email = requester
    response = client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": NEW})

    assert response.status_code == 202
    assert response.json()["status"] == "pending" and response.json()["requested_at"]
    assert client.get(URL, headers=headers).json()["status"] == "pending"
    assert _login(client, email, CURRENT).status_code == 200
    assert _login(client, email, NEW).status_code == 401
    stored = db.execute("select pending_password_hash from users where email = %s", (email,)).fetchone()[0]
    assert stored and NEW not in stored


def test_a_wrong_current_password_is_rejected_without_a_request(client, requester, db):
    headers, _ = requester
    response = client.post(URL, headers=headers, json={"current_password": "otra-clave-1", "new_password": NEW})

    assert response.status_code == 400
    assert client.get(URL, headers=headers).json()["status"] == "none"


@pytest.mark.parametrize("new", ["corta", "s3cret"])
def test_an_invalid_new_password_is_rejected(client, requester, new):
    headers, _ = requester
    assert client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": new}).status_code == 422


def test_a_new_request_replaces_the_pending_one(client, requester, admin_headers, db):
    headers, email = requester
    client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": NEW})
    client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": "otra-nueva-7"})
    user_id = db.execute("select id from users where email = %s", (email,)).fetchone()[0]

    assert client.post(f"/api/admin/password-requests/{user_id}/approve", headers=admin_headers).status_code == 204

    assert _login(client, email, "otra-nueva-7").status_code == 200
    assert _login(client, email, NEW).status_code == 401


def test_the_admin_lists_pending_requests_without_any_secret(client, requester, admin_headers):
    headers, email = requester
    client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": NEW})

    items = client.get("/api/admin/password-requests", headers=admin_headers).json()["items"]

    assert len(items) == 1
    assert items[0]["email"] == email and items[0]["role"] in {"physician", "caregiver"}
    assert set(items[0]) == {"user_id", "email", "full_name", "role", "requested_at"}


def test_approving_sets_the_new_password_closes_sessions_and_clears_the_request(client, requester, admin_headers, db):
    headers, email = requester
    old = _login(client, email, CURRENT).json()
    client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": NEW})
    user_id = db.execute("select id from users where email = %s", (email,)).fetchone()[0]

    assert client.post(f"/api/admin/password-requests/{user_id}/approve", headers=admin_headers).status_code == 204

    assert _login(client, email, NEW).status_code == 200
    assert _login(client, email, CURRENT).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": old["refresh_token"]}).status_code == 401
    assert client.get("/api/admin/password-requests", headers=admin_headers).json()["items"] == []
    row = db.execute("select pending_password_hash, password_change_requested_at from users where id = %s", (user_id,)).fetchone()
    assert row == (None, None)


def test_rejecting_keeps_the_current_password(client, requester, admin_headers, db):
    headers, email = requester
    client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": NEW})
    user_id = db.execute("select id from users where email = %s", (email,)).fetchone()[0]

    assert client.post(f"/api/admin/password-requests/{user_id}/reject", headers=admin_headers).status_code == 204

    assert _login(client, email, CURRENT).status_code == 200
    assert _login(client, email, NEW).status_code == 401
    assert client.get(URL, headers=headers).json()["status"] == "none"


def test_the_requester_can_cancel(client, requester):
    headers, _ = requester
    client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": NEW})
    assert client.delete(URL, headers=headers).status_code == 204
    assert client.get(URL, headers=headers).json()["status"] == "none"


def test_approving_or_rejecting_without_a_pending_request_is_404(client, admin_headers, physician_id):
    assert client.post(f"/api/admin/password-requests/{physician_id}/approve", headers=admin_headers).status_code == 404
    assert client.post(f"/api/admin/password-requests/{physician_id}/reject", headers=admin_headers).status_code == 404


def test_only_the_admin_decides(client, physician_headers, caregiver_headers, patient_headers, physician_id):
    for headers in (physician_headers, caregiver_headers, patient_headers):
        assert client.get("/api/admin/password-requests", headers=headers).status_code == 403
        assert client.post(f"/api/admin/password-requests/{physician_id}/approve", headers=headers).status_code == 403
        assert client.post(f"/api/admin/password-requests/{physician_id}/reject", headers=headers).status_code == 403


def test_it_needs_a_session_and_is_not_for_patients(client, patient_headers):
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={"current_password": CURRENT, "new_password": NEW}).status_code == 401
    for method in ("get", "delete"):
        assert getattr(client, method)(URL, headers=patient_headers).status_code == 403
    assert client.post(URL, headers=patient_headers, json={"current_password": CURRENT, "new_password": NEW}).status_code == 403


def test_the_admin_changes_the_own_password_without_approval(client, admin_headers, active_user):
    response = client.post(URL, headers=admin_headers, json={"current_password": CURRENT, "new_password": NEW})

    assert response.status_code == 200
    assert response.json() == {"status": "changed", "requested_at": None}
    assert _login(client, active_user.email, NEW).status_code == 200
    assert _login(client, active_user.email, CURRENT).status_code == 401
    assert client.get("/api/admin/password-requests", headers=admin_headers).json()["items"] == []


def test_the_admin_must_give_the_current_password_too(client, admin_headers):
    assert client.post(URL, headers=admin_headers, json={"current_password": "otra-clave-1", "new_password": NEW}).status_code == 400


def test_the_audit_names_the_event_and_never_a_password(client, requester, admin_headers, db):
    headers, email = requester
    client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": NEW})
    user_id = db.execute("select id from users where email = %s", (email,)).fetchone()[0]
    client.post(f"/api/admin/password-requests/{user_id}/approve", headers=admin_headers)

    rows = db.execute(
        "select action, entity_id, details::text from audit_logs where action like 'password.%' order by occurred_at"
    ).fetchall()

    assert [r[0] for r in rows] == ["password.change_requested", "password.change_approved"]
    assert all(r[1] == user_id for r in rows)
    assert all(NEW not in (r[2] or "") and CURRENT not in (r[2] or "") for r in rows)


def test_deactivation_discards_a_pending_request(client, requester, admin_headers, db):
    headers, email = requester
    client.post(URL, headers=headers, json={"current_password": CURRENT, "new_password": NEW})
    user_id = db.execute("select id from users where email = %s", (email,)).fetchone()[0]

    assert client.post(f"/api/accounts/{user_id}/deactivate", headers=admin_headers).status_code == 204

    assert db.execute("select pending_password_hash from users where id = %s", (user_id,)).fetchone()[0] is None
    assert client.get("/api/admin/password-requests", headers=admin_headers).json()["items"] == []
