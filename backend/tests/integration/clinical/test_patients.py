"""@requirement RF-19

Pruebas de integración del directorio de pacientes.

Cubren quién ve a quién: un paciente se ve solo a sí mismo, un médico ve solo
los pacientes vinculados en ``patient_physician``, un cuidador ve solo los que
autorizó con alcance ``readings``, el cuidador con alcance ``minimal`` recibe
una lista vacía y el administrador no ve datos clínicos. La paginación usa el
mismo sobre que el resto del contrato y ``total`` cuenta las filas filtradas,
no las de la página. Ninguna respuesta publica el identificador del perfil.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def test_physician_sees_only_linked_patients(
    client,
    physician_headers,
    patient_id,
    consented_patient_id,
    other_patient_id,
):
    body = client.get("/api/patients", headers=physician_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == str(consented_patient_id)


def test_patient_directory_is_paginated(client, physician_headers):
    first = client.get(
        "/api/patients?limit=1&offset=0", headers=physician_headers
    ).json()
    beyond = client.get(
        "/api/patients?limit=1&offset=50", headers=physician_headers
    ).json()
    assert first["total"] == 1
    assert len(first["items"]) == 1
    assert beyond["items"] == []
    assert beyond["total"] == 1


def test_patient_directory_total_counts_beyond_the_page(
    client,
    db,
    physician_id,
    physician_headers,
    consented_patient_id,
    other_patient_id,
):
    db.execute(
        "insert into patient_physician (patient_id, physician_id) "
        "select id, %s from patient_profiles where user_id = %s",
        (physician_id, other_patient_id),
    )
    first = client.get(
        "/api/patients?limit=1&offset=0", headers=physician_headers
    ).json()
    second = client.get(
        "/api/patients?limit=1&offset=1", headers=physician_headers
    ).json()
    assert first["total"] == 2
    assert len(first["items"]) == 1
    assert len(second["items"]) == 1
    assert first["items"][0]["user_id"] != second["items"][0]["user_id"]
    assert second["total"] == 2


def test_patient_directory_lists_only_themselves(
    client, patient_headers, patient_id, other_patient_id
):
    body = client.get("/api/patients", headers=patient_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == str(patient_id)


def test_caregiver_directory_lists_the_linked_patient(
    client, caregiver_headers, consented_patient_id
):
    body = client.get("/api/patients", headers=caregiver_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == str(consented_patient_id)


def test_caregiver_with_minimal_scope_lists_no_patients(
    client, caregiver_minimal_headers
):
    body = client.get("/api/patients", headers=caregiver_minimal_headers).json()
    assert body == {"items": [], "total": 0}


def test_caregiver_of_another_patient_lists_only_their_patient(
    client,
    caregiver_headers,
    other_caregiver_headers,
    other_patient_id,
    consented_patient_id,
):
    """El otro cuidador no ve al paciente aunque ese paciente tenga cuidador.

    El paciente con consentimiento también tiene un vínculo con alcance
    ``readings``, el de ``caregiver_headers``. Si el filtro del directorio
    olvidara comparar el identificador del cuidador, este listado devolvería dos
    pacientes y el total dejaría de ser uno.
    """
    body = client.get("/api/patients", headers=other_caregiver_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == str(other_patient_id)


def test_admin_cannot_list_patients(client, admin_headers):
    response = client.get("/api/patients", headers=admin_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Permiso denegado"


def test_patient_directory_does_not_expose_the_profile_id(
    client, db, physician_headers, consented_patient_id
):
    profile_id = db.execute(
        "select id from patient_profiles where user_id = %s",
        (consented_patient_id,),
    ).fetchone()[0]
    response = client.get("/api/patients", headers=physician_headers)
    assert str(profile_id) not in response.text
    assert set(response.json()["items"][0]) == {"user_id", "full_name", "birth_date"}
