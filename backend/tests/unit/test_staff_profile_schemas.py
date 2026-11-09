"""@requirement RF-01

Pruebas unitarias del cuerpo de actualización del perfil del personal: sin base
de datos. Las reglas del nombre, el teléfono y la foto son las del paciente.
"""

import base64

import pytest
from pydantic import ValidationError

from hta.staffprofile.schemas import SPECIALTY_MAX, StaffProfileUpdate

pytestmark = pytest.mark.unit

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32


def test_accepts_a_partial_update_and_remembers_which_fields_came():
    update = StaffProfileUpdate.model_validate({"phone": "+57 301 000 0100"})
    assert update.phone == "+57 301 000 0100"
    assert update.changes() == {"phone": "+57 301 000 0100"}


def test_trims_the_name_and_rejects_a_blank_or_null_one():
    assert StaffProfileUpdate.model_validate({"full_name": "  Julián Morales  "}).full_name == "Julián Morales"
    for value in ("", "   ", None):
        with pytest.raises(ValidationError):
            StaffProfileUpdate.model_validate({"full_name": value})
    with pytest.raises(ValidationError):
        StaffProfileUpdate.model_validate({"full_name": "a" * 201})


@pytest.mark.parametrize("value", ["abc", "12", "+", "316-8765-<script>"])
def test_rejects_malformed_phones(value):
    with pytest.raises(ValidationError):
        StaffProfileUpdate.model_validate({"phone": value})


@pytest.mark.parametrize("field", ["phone", "avatar", "license_number", "specialty"])
@pytest.mark.parametrize("value", [None, "", "   "])
def test_blank_optional_fields_clear_the_value(field, value):
    update = StaffProfileUpdate.model_validate({field: value})
    assert getattr(update, field) is None
    assert field in update.changes()


@pytest.mark.parametrize("value", ["RM-100200", "TP 12345", "12345678", "MP/123.45"])
def test_accepts_common_license_shapes(value):
    assert StaffProfileUpdate.model_validate({"license_number": value}).license_number == value


@pytest.mark.parametrize("value", ["a", "ab", "<script>", "RM_100", "x" * 31, "-12345", "12345-"])
def test_rejects_malformed_licenses(value):
    with pytest.raises(ValidationError):
        StaffProfileUpdate.model_validate({"license_number": value})


def test_trims_the_specialty_and_limits_it():
    assert StaffProfileUpdate.model_validate({"specialty": "  Medicina interna  "}).specialty == "Medicina interna"
    assert StaffProfileUpdate.model_validate({"specialty": "a" * SPECIALTY_MAX}).specialty == "a" * SPECIALTY_MAX
    with pytest.raises(ValidationError):
        StaffProfileUpdate.model_validate({"specialty": "a" * (SPECIALTY_MAX + 1)})
    with pytest.raises(ValidationError):
        StaffProfileUpdate.model_validate({"specialty": "Cardiología\n<script>"})


def test_uses_the_same_photo_rules_as_the_patient():
    ok = "data:image/jpeg;base64," + base64.b64encode(JPEG).decode()
    assert StaffProfileUpdate.model_validate({"avatar": ok}).avatar == ok
    for bad in (
        "https://example.com/x.jpg",
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "data:image/jpeg;base64," + base64.b64encode(b"<script>x</script>").decode(),
        "data:image/jpeg;base64," + base64.b64encode(JPEG + b"\x00" * 200_000).decode(),
    ):
        with pytest.raises(ValidationError):
            StaffProfileUpdate.model_validate({"avatar": bad})


@pytest.mark.parametrize("field", ["email", "role", "active", "user_id", "document_number", "trusted_contact_phone"])
def test_rejects_fields_that_cannot_be_changed_here(field):
    with pytest.raises(ValidationError):
        StaffProfileUpdate.model_validate({"phone": "3168765432", field: "x"})


def test_rejects_an_empty_update():
    with pytest.raises(ValidationError):
        StaffProfileUpdate.model_validate({})
