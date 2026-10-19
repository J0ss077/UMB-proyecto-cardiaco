"""@requirement RF-02

Pruebas de integración del cambio de rol: solo un administrador puede cambiar
el rol de otra cuenta, todo cambio queda auditado con el rol anterior y el
nuevo, y un valor fuera del enum se rechaza sin tocar la fila.
"""

import pytest

pytestmark = pytest.mark.integration


def test_admin_can_change_role(client, admin_headers, db, admin_id, patient_id):
    response = client.patch(f"/api/accounts/{patient_id}/role",
                            json={"role": "physician"}, headers=admin_headers)
    assert response.status_code == 204
    row = db.execute("select role from users where id = %s", (patient_id,)).fetchone()
    assert row[0] == "physician"
    audit = db.execute(
        "select actor_user_id, details from audit_logs where action = 'accounts.role_changed'"
    ).fetchone()
    assert audit[0] == admin_id
    assert audit[1] == {"previous": "patient", "new": "physician"}


def test_patient_cannot_change_roles(client, patient_headers, other_patient_id):
    response = client.patch(f"/api/accounts/{other_patient_id}/role",
                            json={"role": "admin"}, headers=patient_headers)
    assert response.status_code == 403


def test_invalid_role_is_rejected(client, admin_headers, db, patient_id):
    response = client.patch(f"/api/accounts/{patient_id}/role",
                            json={"role": "superuser"}, headers=admin_headers)
    assert response.status_code == 422
    row = db.execute("select role from users where id = %s", (patient_id,)).fetchone()
    assert row[0] == "patient"
