"""@requirement RF-02

Pruebas de integración de la desactivación: la cuenta queda seudonimizada,
conserva su historial clínico, revoca sus refrescos y pierde el acceso en el
acto aunque el token de acceso siga vigente. La auditoría de la baja no guarda
la identidad anterior.
"""

import pytest

pytestmark = pytest.mark.integration


def test_deactivation_pseudonymizes_and_preserves_clinical_data(
    client, admin_headers, db, patient_with_reading, reading_patient_login
):
    user_id, reading_id = patient_with_reading
    previous_email = db.execute("select email from users where id = %s", (user_id,)).fetchone()[0]
    refresh_token = reading_patient_login["refresh_token"]
    response = client.post(f"/api/accounts/{user_id}/deactivate", headers=admin_headers)
    assert response.status_code == 204
    row = db.execute("select email, full_name, active, password_hash from users where id = %s", (user_id,)).fetchone()
    assert row[0].startswith("deactivated+")
    assert row[1] == "Cuenta desactivada"
    assert row[2] is False
    assert row[3] == "!"
    assert db.execute("select 1 from readings where id = %s", (reading_id,)).fetchone() is not None
    assert db.execute("select count(*) from refresh_tokens where user_id = %s and revoked_at is null", (user_id,)).fetchone()[0] == 0
    refreshed = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 401
    detail = db.execute(
        "select details from audit_logs where action = 'accounts.deactivated'"
    ).fetchone()[0]
    assert detail is None or previous_email not in str(detail)
    assert db.execute(
        "select count(*) from audit_logs where details::text ilike %s",
        (f"%{previous_email}%",),
    ).fetchone()[0] == 0


def test_admin_cannot_deactivate_self(client, admin_headers, admin_id):
    response = client.post(f"/api/accounts/{admin_id}/deactivate", headers=admin_headers)
    assert response.status_code == 409


def test_valid_access_token_of_deactivated_account_is_rejected_immediately(
    client, admin_headers, patient_login, patient_id
):
    before = client.get("/api/accounts", headers=patient_login)
    assert before.status_code == 403
    client.post(f"/api/accounts/{patient_id}/deactivate", headers=admin_headers)
    after = client.get("/api/accounts", headers=patient_login)
    assert after.status_code == 401
