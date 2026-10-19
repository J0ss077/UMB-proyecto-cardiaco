"""@requirement RF-02

Pruebas de integración del registro público de pacientes: la cuenta creada
siempre tiene rol de paciente, el rol no se puede elegir desde el cuerpo, un
correo repetido lo rechaza la restricción única de la base aunque cambie de
mayúsculas o traiga espacios, y el inicio de sesión acepta la dirección con la
que se registró la cuenta.
"""

import pytest

pytestmark = pytest.mark.integration


def test_public_registration_creates_patient_only(client, db):
    response = client.post("/api/accounts/register", json={
        "email": "nuevo@example.com", "password": "s3cret!", "full_name": "Nuevo Paciente",
        "birth_date": "1970-05-01",
    })
    assert response.status_code == 201
    created_id = response.json()["id"]
    row = db.execute("select role from users where email = %s", ("nuevo@example.com",)).fetchone()
    assert row[0] == "patient"
    profile = db.execute(
        "select 1 from patient_profiles p join users u on u.id = p.user_id where u.email = %s",
        ("nuevo@example.com",),
    ).fetchone()
    assert profile is not None
    audit = db.execute(
        "select actor_user_id::text, entity, entity_id::text "
        "from audit_logs where action = 'accounts.register'"
    ).fetchone()
    assert audit == (created_id, "users", created_id)


def test_registration_cannot_choose_role(client):
    response = client.post("/api/accounts/register", json={
        "email": "x@example.com", "password": "s3cret!", "full_name": "X",
        "birth_date": "1970-05-01", "role": "admin",
    })
    assert response.status_code == 422


def test_duplicate_email_in_any_case_is_rejected(client, db):
    payload = {"email": "Dup@Example.com", "password": "s3cret!", "full_name": "Duplicado",
               "birth_date": "1970-05-01"}
    assert client.post("/api/accounts/register", json=payload).status_code == 201
    payload["email"] = "  dup@example.com  "
    second = client.post("/api/accounts/register", json=payload)
    assert second.status_code == 409
    assert second.json()["detail"] == "El correo ya está registrado"
    assert db.execute("select count(*) from users where email ilike 'dup@example.com'").fetchone()[0] == 1
    assert db.execute("select count(*) from patient_profiles").fetchone()[0] == 1


def test_login_accepts_the_address_registered_with_other_case(client):
    payload = {"email": "MiXeD@Example.com", "password": "s3cret!",
               "full_name": "Mixto", "birth_date": "1970-05-01"}
    assert client.post("/api/accounts/register", json=payload).status_code == 201
    response = client.post(
        "/api/auth/login",
        json={"email": "MiXeD@Example.com", "password": "s3cret!"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "patient"
