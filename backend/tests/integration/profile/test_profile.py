"""@requirement RF-01

Pruebas de integración del perfil del paciente: lectura y actualización de los
datos de contacto y del contacto de confianza, con auditoría que no guarda los
valores y con la seudonimización de la desactivación.
"""

import base64

import pytest

pytestmark = pytest.mark.integration

PROFILE_KEYS = {
    "avatar",
    "user_id",
    "email",
    "full_name",
    "birth_date",
    "sex",
    "document_number",
    "phone",
    "diagnosis_date",
    "trusted_contact_phone",
    "trusted_contact_email",
}


def test_patient_reads_the_own_profile(client, patient_headers, patient_id, db):
    db.execute(
        "update patient_profiles set birth_date = '1958-03-14', sex = 'Masculino', "
        "document_number = '12.345.678-9', diagnosis_date = '2025-08-15' where user_id = %s",
        (patient_id,),
    )

    response = client.get("/api/profile", headers=patient_headers)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == PROFILE_KEYS
    assert body["user_id"] == str(patient_id)
    assert body["email"] == "paciente@hta.demo"
    assert body["full_name"] == "Paciente de prueba"
    assert body["birth_date"] == "1958-03-14"
    assert body["sex"] == "Masculino"
    assert body["document_number"] == "12.345.678-9"
    assert body["diagnosis_date"] == "2025-08-15"
    assert body["phone"] is None
    assert body["trusted_contact_phone"] is None
    assert body["trusted_contact_email"] is None


def test_profile_requires_a_session(client):
    assert client.get("/api/profile").status_code == 401
    assert client.patch("/api/profile", json={"phone": "3168765432"}).status_code == 401


def test_only_patients_have_a_profile(client, admin_headers, physician_headers):
    for headers in (admin_headers, physician_headers):
        assert client.get("/api/profile", headers=headers).status_code == 403
        assert client.patch("/api/profile", headers=headers, json={"phone": "3168765432"}).status_code == 403


def test_patient_updates_name_phone_and_trusted_contact(client, patient_headers, patient_id, db):
    response = client.patch(
        "/api/profile",
        headers=patient_headers,
        json={
            "full_name": "  Manuel Alejandro González  ",
            "phone": "+57 316 8765 432",
            "trusted_contact_phone": "+57 300 1112233",
            "trusted_contact_email": "Familiar@Correo.com",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Manuel Alejandro González"
    assert body["phone"] == "+57 316 8765 432"
    assert body["trusted_contact_phone"] == "+57 300 1112233"
    assert body["trusted_contact_email"] == "familiar@correo.com"
    assert client.get("/api/profile", headers=patient_headers).json() == body
    assert db.execute("select full_name from users where id = %s", (patient_id,)).fetchone()[0] == "Manuel Alejandro González"


def test_a_partial_update_leaves_the_other_fields_alone(client, patient_headers):
    client.patch("/api/profile", headers=patient_headers, json={"phone": "3168765432", "trusted_contact_phone": "3001112233"})

    body = client.patch("/api/profile", headers=patient_headers, json={"phone": "3170000000"}).json()

    assert body["phone"] == "3170000000"
    assert body["trusted_contact_phone"] == "3001112233"


def test_null_clears_an_optional_field(client, patient_headers):
    client.patch("/api/profile", headers=patient_headers, json={"trusted_contact_email": "a@b.co"})

    body = client.patch("/api/profile", headers=patient_headers, json={"trusted_contact_email": None}).json()

    assert body["trusted_contact_email"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"full_name": "   "},
        {"full_name": None},
        {"phone": "abc"},
        {"trusted_contact_email": "sin-arroba"},
        {"email": "otro@hta.demo"},
        {"birth_date": "1980-01-01"},
        {"sex": "Femenino"},
        {"document_number": "999"},
        {"diagnosis_date": "2020-01-01"},
        {"role": "admin"},
        {"patient_id": "00000000-0000-0000-0000-000000000000"},
    ],
)
def test_invalid_or_forbidden_updates_are_rejected_and_change_nothing(client, patient_headers, db, payload):
    before = client.get("/api/profile", headers=patient_headers).json()
    audits_before = db.execute("select count(*) from audit_logs where action = 'profile.updated'").fetchone()[0]

    response = client.patch("/api/profile", headers=patient_headers, json=payload)

    assert response.status_code == 422
    assert client.get("/api/profile", headers=patient_headers).json() == before
    assert db.execute("select count(*) from audit_logs where action = 'profile.updated'").fetchone()[0] == audits_before


def test_the_audit_names_the_fields_but_never_the_values(client, patient_headers, patient_id, db):
    client.patch(
        "/api/profile",
        headers=patient_headers,
        json={"phone": "3168765432", "trusted_contact_email": "familiar@correo.com"},
    )

    row = db.execute(
        "select actor_user_id, entity, entity_id, details::text from audit_logs where action = 'profile.updated'"
    ).fetchone()
    assert row[0] == patient_id
    assert row[1] == "users"
    assert row[2] == patient_id
    assert "phone" in row[3] and "trusted_contact_email" in row[3]
    assert "3168765432" not in row[3]
    assert "familiar@correo.com" not in row[3]


def test_a_patient_cannot_reach_another_profile(client, patient_headers, other_patient_id):
    body = client.get("/api/profile", headers=patient_headers).json()
    assert body["user_id"] != str(other_patient_id)
    response = client.get(f"/api/profile?patient_id={other_patient_id}", headers=patient_headers)
    assert response.json()["user_id"] == body["user_id"]


def test_deactivation_clears_the_personal_contact_data(client, admin_headers, patient_headers, patient_id, db):
    client.patch(
        "/api/profile",
        headers=patient_headers,
        json={"phone": "3168765432", "trusted_contact_phone": "3001112233", "trusted_contact_email": "a@b.co"},
    )
    db.execute("update patient_profiles set document_number = '12345' where user_id = %s", (patient_id,))

    assert client.post(f"/api/accounts/{patient_id}/deactivate", headers=admin_headers).status_code == 204

    row = db.execute(
        "select phone, document_number, trusted_contact_phone, trusted_contact_email "
        "from patient_profiles where user_id = %s",
        (patient_id,),
    ).fetchone()
    assert row == (None, None, None, None)


def test_the_new_columns_are_nullable_text_inside_the_sixteen_tables(db):
    columns = dict(
        db.execute(
            "select column_name, data_type from information_schema.columns "
            "where table_name = 'patient_profiles' and column_name in "
            "('document_number', 'phone', 'trusted_contact_phone', 'trusted_contact_email', 'avatar')"
        ).fetchall()
    )
    assert columns == {
        "document_number": "text",
        "phone": "text",
        "trusted_contact_phone": "text",
        "trusted_contact_email": "text",
        "avatar": "text",
    }
    assert db.execute(
        "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' "
        "and table_name <> 'schema_migrations'"
    ).fetchone()[0] == 16


def _avatar(mime="image/jpeg", payload=b"\xff\xd8\xff\xe0" + b"\x01" * 64):
    return f"data:{mime};base64,{base64.b64encode(payload).decode()}"


def test_patient_sets_reads_and_removes_the_profile_photo(client, patient_headers):
    photo = _avatar()

    set_response = client.patch("/api/profile", headers=patient_headers, json={"avatar": photo})

    assert set_response.status_code == 200
    assert set_response.json()["avatar"] == photo
    assert client.get("/api/profile", headers=patient_headers).json()["avatar"] == photo

    removed = client.patch("/api/profile", headers=patient_headers, json={"avatar": None})

    assert removed.status_code == 200
    assert removed.json()["avatar"] is None


def test_a_profile_without_a_photo_has_a_null_avatar(client, patient_headers):
    assert client.get("/api/profile", headers=patient_headers).json()["avatar"] is None


def test_updating_other_fields_keeps_the_photo(client, patient_headers):
    photo = _avatar("image/png", b"\x89PNG\r\n\x1a\n" + b"\x02" * 40)
    client.patch("/api/profile", headers=patient_headers, json={"avatar": photo})

    body = client.patch("/api/profile", headers=patient_headers, json={"phone": "3168765432"}).json()

    assert body["avatar"] == photo


@pytest.mark.parametrize(
    "value",
    [
        "https://example.com/foto.jpg",
        "data:text/html;base64,PGgxPmhvbGE8L2gxPg==",
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "data:image/jpeg;base64,no es base64!!",
        "data:image/jpeg;base64," + base64.b64encode(b"<script>x</script>").decode(),
    ],
)
def test_a_bad_photo_is_rejected_and_changes_nothing(client, patient_headers, db, value):
    before = client.get("/api/profile", headers=patient_headers).json()

    response = client.patch("/api/profile", headers=patient_headers, json={"avatar": value})

    assert response.status_code == 422
    assert client.get("/api/profile", headers=patient_headers).json() == before


def test_an_oversized_photo_is_rejected(client, patient_headers):
    huge = _avatar(payload=b"\xff\xd8\xff\xe0" + b"\x00" * 400_000)
    assert client.patch("/api/profile", headers=patient_headers, json={"avatar": huge}).status_code == 422


def test_the_audit_names_the_photo_field_but_never_its_content(client, patient_headers, db):
    photo = _avatar()
    client.patch("/api/profile", headers=patient_headers, json={"avatar": photo})

    details = db.execute("select details::text from audit_logs where action = 'profile.updated'").fetchone()[0]

    assert "avatar" in details
    assert photo.split(",")[1] not in details


def test_deactivation_removes_the_photo(client, admin_headers, patient_headers, patient_id, db):
    client.patch("/api/profile", headers=patient_headers, json={"avatar": _avatar()})

    assert client.post(f"/api/accounts/{patient_id}/deactivate", headers=admin_headers).status_code == 204

    assert db.execute("select avatar from patient_profiles where user_id = %s", (patient_id,)).fetchone()[0] is None
