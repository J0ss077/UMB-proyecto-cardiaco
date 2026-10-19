"""@requirement RF-01

Pruebas de integración del inicio de sesión: emisión del par de tokens,
registro del acceso y de los intentos fallidos en la auditoría, y rechazo de la
cuenta inactiva.
"""

import pytest

pytestmark = pytest.mark.integration


def test_login_returns_tokens_and_audits(client, db, active_user):
    response = client.post("/api/auth/login", json={"email": active_user.email, "password": "s3cret"})
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "admin"
    assert body["access_token"]
    row = db.execute("select action from audit_logs where actor_user_id = %s", (active_user.id,)).fetchone()
    assert row[0] == "auth.login"


def test_wrong_password_is_generic(client, active_user):
    response = client.post("/api/auth/login", json={"email": active_user.email, "password": "nope"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales inválidas"


def test_unknown_email_says_the_same(client):
    response = client.post("/api/auth/login", json={"email": "nadie@example.com", "password": "x"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales inválidas"


def test_failed_login_is_audited_without_actor(client, db, active_user):
    response = client.post("/api/auth/login", json={"email": active_user.email, "password": "nope"})
    assert response.status_code == 401
    row = db.execute(
        "select action from audit_logs "
        "where actor_user_id is null and details->>'email' = %s",
        (active_user.email,),
    ).fetchone()
    assert row[0] == "auth.login_failed"


def test_inactive_account_cannot_log_in(client, db, active_user):
    db.execute("update users set active = false where id = %s", (active_user.id,))
    response = client.post("/api/auth/login", json={"email": active_user.email, "password": "s3cret"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales inválidas"
