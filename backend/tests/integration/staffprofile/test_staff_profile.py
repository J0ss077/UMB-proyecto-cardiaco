"""@requirement RF-01

Pruebas de integración del perfil del personal: el médico, el cuidador y el
administrador leen y actualizan su nombre, su teléfono y su foto; el médico
también su registro profesional y su especialidad. Todo lo que identifica a la
persona se vacía al desactivar la cuenta.
"""

import base64

import pytest

pytestmark = pytest.mark.integration

KEYS = {"user_id", "email", "full_name", "role", "phone", "avatar", "license_number", "specialty"}
JPEG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x01" * 64).decode()


@pytest.fixture(params=["physician_headers", "caregiver_headers", "admin_headers"])
def staff_headers(request):
    return request.getfixturevalue(request.param)


def test_every_staff_role_reads_the_own_profile(client, staff_headers):
    response = client.get("/api/staff/profile", headers=staff_headers)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == KEYS
    assert body["role"] in {"physician", "caregiver", "admin"}
    assert body["phone"] is None and body["avatar"] is None
    assert body["license_number"] is None and body["specialty"] is None


def test_the_profile_is_the_session_s_own(client, physician_headers, physician_id):
    body = client.get("/api/staff/profile", headers=physician_headers).json()
    assert body["user_id"] == str(physician_id)
    assert body["email"] == "medico-consulta@hta.demo"
    assert body["full_name"] == "Médico de prueba"
    assert body["role"] == "physician"


def test_it_needs_a_session_and_is_not_for_patients(client, patient_headers):
    assert client.get("/api/staff/profile").status_code == 401
    assert client.patch("/api/staff/profile", json={"phone": "3168765432"}).status_code == 401
    assert client.get("/api/staff/profile", headers=patient_headers).status_code == 403
    assert client.patch("/api/staff/profile", headers=patient_headers, json={"phone": "3168765432"}).status_code == 403


def test_updates_the_name_and_the_phone_of_any_staff_role(client, staff_headers, db):
    response = client.patch(
        "/api/staff/profile",
        headers=staff_headers,
        json={"full_name": "  Nombre Nuevo  ", "phone": "+57 301 000 0100"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Nombre Nuevo"
    assert body["phone"] == "+57 301 000 0100"
    assert client.get("/api/staff/profile", headers=staff_headers).json() == body
    assert db.execute("select count(*) from users where full_name = 'Nombre Nuevo'").fetchone()[0] == 1


def test_only_the_physician_has_a_license_and_a_specialty(client, physician_headers):
    body = client.patch(
        "/api/staff/profile",
        headers=physician_headers,
        json={"license_number": "RM-100200", "specialty": "  Medicina interna  "},
    ).json()

    assert body["license_number"] == "RM-100200"
    assert body["specialty"] == "Medicina interna"


@pytest.mark.parametrize("fixture", ["caregiver_headers", "admin_headers"])
@pytest.mark.parametrize("payload", [{"license_number": "RM-100200"}, {"specialty": "Cardiología"}])
def test_other_roles_cannot_set_professional_data_and_nothing_changes(request, client, fixture, payload):
    headers = request.getfixturevalue(fixture)
    before = client.get("/api/staff/profile", headers=headers).json()

    response = client.patch("/api/staff/profile", headers=headers, json={"phone": "3168765432", **payload})

    assert response.status_code == 422
    assert "médicos" in response.json()["detail"]
    assert client.get("/api/staff/profile", headers=headers).json() == before


def test_null_clears_an_optional_field(client, physician_headers):
    client.patch("/api/staff/profile", headers=physician_headers, json={"phone": "3168765432", "specialty": "Cardiología"})

    body = client.patch("/api/staff/profile", headers=physician_headers, json={"phone": None, "specialty": ""}).json()

    assert body["phone"] is None and body["specialty"] is None


def test_a_partial_update_keeps_the_rest(client, physician_headers):
    client.patch("/api/staff/profile", headers=physician_headers, json={"phone": "3168765432", "specialty": "Cardiología"})

    body = client.patch("/api/staff/profile", headers=physician_headers, json={"specialty": "Nefrología"}).json()

    assert body["phone"] == "3168765432"
    assert body["specialty"] == "Nefrología"


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"full_name": "   "},
        {"full_name": None},
        {"phone": "abc"},
        {"license_number": "<script>"},
        {"specialty": "x" * 101},
        {"email": "otro@hta.demo"},
        {"role": "admin"},
        {"active": False},
        {"document_number": "123"},
    ],
)
def test_invalid_or_forbidden_updates_are_rejected_and_change_nothing(client, physician_headers, db, payload):
    before = client.get("/api/staff/profile", headers=physician_headers).json()
    audits = db.execute("select count(*) from audit_logs where action = 'staff.profile_updated'").fetchone()[0]

    response = client.patch("/api/staff/profile", headers=physician_headers, json=payload)

    assert response.status_code == 422
    assert client.get("/api/staff/profile", headers=physician_headers).json() == before
    assert db.execute("select count(*) from audit_logs where action = 'staff.profile_updated'").fetchone()[0] == audits


def test_sets_and_removes_a_photo(client, staff_headers):
    assert client.patch("/api/staff/profile", headers=staff_headers, json={"avatar": JPEG}).json()["avatar"] == JPEG
    assert client.get("/api/staff/profile", headers=staff_headers).json()["avatar"] == JPEG

    assert client.patch("/api/staff/profile", headers=staff_headers, json={"avatar": None}).json()["avatar"] is None


@pytest.mark.parametrize("value", ["https://example.com/foto.jpg", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:image/jpeg;base64,no es base64"])
def test_a_bad_photo_is_rejected(client, physician_headers, value):
    assert client.patch("/api/staff/profile", headers=physician_headers, json={"avatar": value}).status_code == 422


def test_the_audit_names_the_fields_and_never_the_values(client, physician_headers, physician_id, db):
    client.patch(
        "/api/staff/profile",
        headers=physician_headers,
        json={"phone": "3168765432", "license_number": "RM-100200", "avatar": JPEG},
    )

    row = db.execute(
        "select actor_user_id, entity, entity_id, details::text from audit_logs where action = 'staff.profile_updated'"
    ).fetchone()

    assert row[0] == physician_id and row[1] == "users" and row[2] == physician_id
    assert "phone" in row[3] and "license_number" in row[3] and "avatar" in row[3]
    assert "3168765432" not in row[3] and "RM-100200" not in row[3] and JPEG.split(",")[1] not in row[3]


def test_deactivation_clears_everything_that_identifies_the_person(client, admin_headers, physician_headers, physician_id, db):
    client.patch(
        "/api/staff/profile",
        headers=physician_headers,
        json={"phone": "3168765432", "license_number": "RM-100200", "specialty": "Cardiología", "avatar": JPEG},
    )

    assert client.post(f"/api/accounts/{physician_id}/deactivate", headers=admin_headers).status_code == 204

    row = db.execute("select phone, license_number, specialty, avatar from users where id = %s", (physician_id,)).fetchone()
    assert row == (None, None, None, None)


def test_the_new_columns_are_nullable_text_on_users_inside_the_sixteen_tables(db):
    columns = dict(
        db.execute(
            "select column_name, data_type from information_schema.columns "
            "where table_name = 'users' and column_name in ('phone', 'avatar', 'license_number', 'specialty')"
        ).fetchall()
    )
    assert columns == {"phone": "text", "avatar": "text", "license_number": "text", "specialty": "text"}
    assert db.execute(
        "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' "
        "and table_name <> 'schema_migrations'"
    ).fetchone()[0] == 16
