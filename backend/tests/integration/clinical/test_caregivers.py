"""@requirement RF-02
@requirement RNF-09

Autorización de cuidadores por el médico vinculado y transparencia para el paciente.

La matriz completa: el médico vinculado crea, cambia el alcance y revoca; un
médico sin vínculo recibe 403 en las cuatro rutas; el paciente lee la lista y
recibe 403 en las tres mutaciones; un cuidador no lee la lista de otro paciente;
el administrador recibe 403 en las mutaciones y conserva la lectura del
directorio. También se fijan el duplicado, el correo desconocido, el alcance
inválido, la auditoría y el cese inmediato del acceso al revocar.
"""

import pytest

pytestmark = pytest.mark.integration

CAREGIVERS = "/api/patients/{patient_id}/caregivers"
LINK = "/api/patients/{patient_id}/caregivers/{link_id}"


def _create(client, headers, patient_id, email, scope="readings"):
    """Pide al médico vinculado que autorice un cuidador y devuelve la respuesta."""
    return client.post(
        CAREGIVERS.format(patient_id=patient_id),
        json={"caregiver_email": email, "authorized_scope": scope},
        headers=headers,
    )


def test_linked_physician_creates_changes_scope_and_revokes(
    client, db, physician_headers, consented_patient_id, caregiver_target
):
    """El médico tratante es el autor de las tres mutaciones y queda auditado."""
    created = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email
    )
    assert created.status_code == 201
    body = created.json()
    assert set(body) == {
        "id",
        "caregiver_user_id",
        "caregiver_name",
        "caregiver_email",
        "authorized_scope",
        "created_at",
    }
    assert body["caregiver_user_id"] == str(caregiver_target.id)
    assert body["caregiver_email"] == caregiver_target.email
    assert body["authorized_scope"] == "readings"
    link_id = body["id"]

    listed = client.get(
        CAREGIVERS.format(patient_id=consented_patient_id), headers=physician_headers
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == link_id

    changed = client.patch(
        LINK.format(patient_id=consented_patient_id, link_id=link_id),
        json={"authorized_scope": "minimal"},
        headers=physician_headers,
    )
    assert changed.status_code == 204
    listed = client.get(
        CAREGIVERS.format(patient_id=consented_patient_id), headers=physician_headers
    ).json()
    assert listed["items"][0]["authorized_scope"] == "minimal"

    revoked = client.delete(
        LINK.format(patient_id=consented_patient_id, link_id=link_id),
        headers=physician_headers,
    )
    assert revoked.status_code == 204
    listed = client.get(
        CAREGIVERS.format(patient_id=consented_patient_id), headers=physician_headers
    ).json()
    assert listed == {"items": [], "total": 0}

    events = db.execute(
        "select action, actor_user_id, entity_id, details from audit_logs "
        "where entity = 'caregiver_links' order by occurred_at, action"
    ).fetchall()
    assert [row[0] for row in events] == [
        "caregiver.linked",
        "caregiver.scope_changed",
        "caregiver.unlinked",
    ]
    assert all(row[1] is not None for row in events)
    assert all(row[2] is not None for row in events)
    linked, changed_event, unlinked = (row[3] for row in events)
    assert linked["patient_user_id"] == str(consented_patient_id)
    assert linked["caregiver_user_id"] == str(caregiver_target.id)
    assert linked["authorized_scope"] == "readings"
    assert changed_event["previous_scope"] == "readings"
    assert changed_event["authorized_scope"] == "minimal"
    assert unlinked["authorized_scope"] == "minimal"


def test_patient_sees_the_access_list_and_cannot_revoke(
    client, db, physician_headers, consented_patient_headers, consented_patient_id, caregiver_target
):
    """El paciente ve quién tiene acceso, pero las tres mutaciones le dan 403."""
    created = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email, "minimal"
    )
    assert created.status_code == 201
    link_id = created.json()["id"]

    listed = client.get(
        CAREGIVERS.format(patient_id=consented_patient_id),
        headers=consented_patient_headers,
    )
    assert listed.status_code == 200
    item = listed.json()["items"][0]
    assert item["caregiver_name"] == "Cuidador Destino"
    assert item["caregiver_email"] == caregiver_target.email
    assert item["authorized_scope"] == "minimal"

    assert (
        _create(
            client,
            consented_patient_headers,
            consented_patient_id,
            caregiver_target.email,
        ).status_code
        == 403
    )
    assert (
        client.patch(
            LINK.format(patient_id=consented_patient_id, link_id=link_id),
            json={"authorized_scope": "readings"},
            headers=consented_patient_headers,
        ).status_code
        == 403
    )
    assert (
        client.delete(
            LINK.format(patient_id=consented_patient_id, link_id=link_id),
            headers=consented_patient_headers,
        ).status_code
        == 403
    )

    still_there = db.execute(
        "select authorized_scope from caregiver_links where id = %s", (link_id,)
    ).fetchone()
    assert still_there == ("minimal",)


def test_unlinked_physician_gets_403_on_every_route(
    client, db, physician_headers, other_physician_headers, consented_patient_id, caregiver_target
):
    """Un médico que no lleva al paciente no puede ver ni mover sus cuidadores."""
    link_id = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email
    ).json()["id"]

    assert (
        client.get(
            CAREGIVERS.format(patient_id=consented_patient_id),
            headers=other_physician_headers,
        ).status_code
        == 403
    )
    assert (
        _create(
            client,
            other_physician_headers,
            consented_patient_id,
            caregiver_target.email,
            "minimal",
        ).status_code
        == 403
    )
    assert (
        client.patch(
            LINK.format(patient_id=consented_patient_id, link_id=link_id),
            json={"authorized_scope": "minimal"},
            headers=other_physician_headers,
        ).status_code
        == 403
    )
    assert (
        client.delete(
            LINK.format(patient_id=consented_patient_id, link_id=link_id),
            headers=other_physician_headers,
        ).status_code
        == 403
    )
    assert db.execute(
        "select authorized_scope from caregiver_links where id = %s", (link_id,)
    ).fetchone() == ("readings",)


def test_caregiver_cannot_read_another_patients_link_list(
    client, caregiver_headers, other_caregiver_headers, consented_patient_id
):
    """Ni el cuidador autorizado ni el de otro paciente leen la lista de vínculos."""
    for headers in (caregiver_headers, other_caregiver_headers):
        response = client.get(
            CAREGIVERS.format(patient_id=consented_patient_id), headers=headers
        )
        assert response.status_code == 403


def test_admin_gets_403_on_mutations_and_200_on_the_oversight_list(
    client, physician_headers, admin_headers, consented_patient_id, caregiver_target
):
    """El administrador solo lee el directorio; no crea, cambia ni revoca."""
    link_id = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email
    ).json()["id"]

    assert (
        _create(
            client, admin_headers, consented_patient_id, caregiver_target.email, "minimal"
        ).status_code
        == 403
    )
    assert (
        client.patch(
            LINK.format(patient_id=consented_patient_id, link_id=link_id),
            json={"authorized_scope": "minimal"},
            headers=admin_headers,
        ).status_code
        == 403
    )
    assert (
        client.delete(
            LINK.format(patient_id=consented_patient_id, link_id=link_id),
            headers=admin_headers,
        ).status_code
        == 403
    )

    listed = client.get("/api/admin/links", headers=admin_headers)
    assert listed.status_code == 200
    caregiver = next(
        item for item in listed.json()["caregivers"] if item["id"] == link_id
    )
    assert set(caregiver) == {
        "id",
        "patient_user_id",
        "patient_name",
        "caregiver_user_id",
        "caregiver_name",
        "authorized_scope",
        "created_at",
    }
    assert "systolic" not in caregiver


def test_a_duplicate_link_is_409(
    client, physician_headers, consented_patient_id, caregiver_target
):
    """El mismo cuidador no se autoriza dos veces para el mismo paciente."""
    assert (
        _create(client, physician_headers, consented_patient_id, caregiver_target.email).status_code
        == 201
    )
    duplicate = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Ese cuidador ya está autorizado para este paciente"


def test_unknown_email_is_404_and_wrong_role_is_422(
    client, db, physician_headers, consented_patient_id
):
    """El correo desconocido responde 404 y una cuenta sin rol de cuidador 422."""
    unknown = _create(
        client, physician_headers, consented_patient_id, "nadie@hta.demo"
    )
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == "La cuenta no existe"

    db.execute(
        "insert into users (email, password_hash, role, full_name) "
        "values ('sin-rol@hta.demo', 'huella', 'patient', 'Sin Rol')"
    )
    wrong_role = _create(
        client, physician_headers, consented_patient_id, "sin-rol@hta.demo"
    )
    assert wrong_role.status_code == 422
    assert wrong_role.json()["detail"] == "La cuenta del cuidador no tiene rol de cuidador"


def test_inactive_caregiver_is_409(
    client, db, physician_headers, consented_patient_id, caregiver_target
):
    """Una cuenta de cuidador desactivada no se puede autorizar."""
    db.execute("update users set active = false where id = %s", (caregiver_target.id,))
    response = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "La cuenta está desactivada"


def test_scope_outside_the_two_values_is_422(
    client, db, physician_headers, consented_patient_id, caregiver_target
):
    """Un alcance que no es ``minimal`` o ``readings`` responde 422."""
    rejected = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email, "full"
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "Alcance desconocido"
    assert db.execute("select count(*) from caregiver_links").fetchone()[0] == 0

    link_id = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email
    ).json()["id"]
    rejected = client.patch(
        LINK.format(patient_id=consented_patient_id, link_id=link_id),
        json={"authorized_scope": "full"},
        headers=physician_headers,
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "Alcance desconocido"
    assert (
        db.execute(
            "select authorized_scope from caregiver_links where id = %s", (link_id,)
        ).fetchone()
        == ("readings",)
    )


def test_revocation_stops_access_immediately(
    client,
    physician_headers,
    caregiver_target_headers,
    consented_patient_id,
    caregiver_target,
):
    """Al borrar la fila, el cuidador deja de leer las lecturas del paciente."""
    readings = f"/api/readings?patient_id={consented_patient_id}"
    assert client.get(readings, headers=caregiver_target_headers).status_code == 403

    link_id = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email
    ).json()["id"]
    assert client.get(readings, headers=caregiver_target_headers).status_code == 200

    assert (
        client.delete(
            LINK.format(patient_id=consented_patient_id, link_id=link_id),
            headers=physician_headers,
        ).status_code
        == 204
    )
    assert client.get(readings, headers=caregiver_target_headers).status_code == 403


def test_admin_audit_filters_the_caregiver_events(
    client, physician_headers, admin_headers, consented_patient_id, caregiver_target
):
    """El rastro de la autorización queda bajo el tipo ``caregiver``."""
    link_id = _create(
        client, physician_headers, consented_patient_id, caregiver_target.email
    ).json()["id"]
    client.delete(
        LINK.format(patient_id=consented_patient_id, link_id=link_id),
        headers=physician_headers,
    )

    page = client.get("/api/admin/audit?topic=caregiver", headers=admin_headers)
    assert page.status_code == 200
    actions = {item["action"] for item in page.json()["items"]}
    assert actions == {"caregiver.linked", "caregiver.unlinked"}
