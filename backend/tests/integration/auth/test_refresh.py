"""@requirement RF-01

Pruebas de integración de la rotación del token de refresco: revocación del
token usado, reutilización que revoca todos los refrescos de la cuenta, cierre
de la sesión, token vencido y rechazo de la cuenta inactiva.
"""

import hashlib

import pytest

pytestmark = pytest.mark.integration


def test_refresh_rotates_and_revokes_the_old_token(client, db, logged_in, active_user):
    first = logged_in["refresh_token"]
    response = client.post("/api/auth/refresh", json={"refresh_token": first})
    assert response.status_code == 200
    second = response.json()["refresh_token"]
    assert second != first
    reused = client.post("/api/auth/refresh", json={"refresh_token": first})
    assert reused.status_code == 401
    row = db.execute(
        "select count(*) from audit_logs "
        "where actor_user_id = %s and action = 'auth.refresh'",
        (active_user.id,),
    ).fetchone()
    assert row[0] == 1


def test_refresh_of_deactivated_account_is_rejected(client, db, logged_in, active_user):
    db.execute("update users set active = false where id = %s", (active_user.id,))
    response = client.post("/api/auth/refresh", json={"refresh_token": logged_in["refresh_token"]})
    assert response.status_code == 401


def test_reuse_revokes_every_refresh_token_of_the_account(client, db, logged_in, active_user):
    first = logged_in["refresh_token"]
    second = client.post("/api/auth/refresh", json={"refresh_token": first}).json()["refresh_token"]
    assert client.post("/api/auth/refresh", json={"refresh_token": first}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": second}).status_code == 401
    row = db.execute(
        "select 1 from audit_logs "
        "where actor_user_id = %s and action = 'auth.refresh_reuse' limit 1",
        (active_user.id,),
    ).fetchone()
    assert row is not None


def test_logout_revokes_the_refresh_token(client, db, logged_in, active_user):
    revoked = client.post("/api/auth/logout", json={"refresh_token": logged_in["refresh_token"]})
    assert revoked.status_code == 204
    response = client.post("/api/auth/refresh", json={"refresh_token": logged_in["refresh_token"]})
    assert response.status_code == 401
    row = db.execute(
        "select count(*) from audit_logs "
        "where actor_user_id = %s and action = 'auth.logout'",
        (active_user.id,),
    ).fetchone()
    assert row[0] == 1


def test_expired_refresh_token_is_rejected(client, db, logged_in):
    token = logged_in["refresh_token"]
    db.execute(
        "update refresh_tokens set expires_at = now() - interval '1 hour' "
        "where token_hash = %s",
        (hashlib.sha256(token.encode("utf-8")).hexdigest(),),
    )
    response = client.post("/api/auth/refresh", json={"refresh_token": token})
    assert response.status_code == 401
