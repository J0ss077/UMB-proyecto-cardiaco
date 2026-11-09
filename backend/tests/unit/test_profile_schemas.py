"""@requirement RF-01

Pruebas unitarias del cuerpo de actualización del perfil: sin base de datos.
Fijan las reglas de forma antes de que el servicio toque una fila.
"""

import pytest
from pydantic import ValidationError

import base64

from hta.profile.schemas import AVATAR_MAX_CHARS, ProfileUpdate

pytestmark = pytest.mark.unit


def test_accepts_a_partial_update_and_remembers_which_fields_came():
    update = ProfileUpdate.model_validate({"phone": "+57 316 8765 432"})
    assert update.phone == "+57 316 8765 432"
    assert update.model_fields_set == {"phone"}


def test_trims_the_name():
    assert ProfileUpdate.model_validate({"full_name": "  Ana Rojas  "}).full_name == "Ana Rojas"


@pytest.mark.parametrize("value", ["", "   ", None])
def test_rejects_a_blank_or_null_name(value):
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({"full_name": value})


def test_rejects_a_name_that_is_too_long():
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({"full_name": "a" * 201})


@pytest.mark.parametrize("field", ["phone", "trusted_contact_phone"])
@pytest.mark.parametrize("value", ["+57 316 8765 432", "3168765432", "(601) 555-0100"])
def test_accepts_common_phone_shapes(field, value):
    assert getattr(ProfileUpdate.model_validate({field: value}), field) == value


@pytest.mark.parametrize("field", ["phone", "trusted_contact_phone"])
@pytest.mark.parametrize("value", ["abc", "12", "+", "123 456 7890 1234 5678 90", "316-8765-<script>"])
def test_rejects_malformed_phones(field, value):
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({field: value})


@pytest.mark.parametrize("field", ["phone", "trusted_contact_phone", "trusted_contact_email"])
@pytest.mark.parametrize("value", [None, "", "   "])
def test_blank_optional_fields_clear_the_value(field, value):
    update = ProfileUpdate.model_validate({field: value})
    assert getattr(update, field) is None
    assert field in update.model_fields_set


def test_normalizes_the_trusted_email():
    update = ProfileUpdate.model_validate({"trusted_contact_email": "  Madre@Correo.COM "})
    assert update.trusted_contact_email == "madre@correo.com"


@pytest.mark.parametrize("value", ["sin-arroba", "a@b", "a b@c.com", "@c.com", "a@@c.com"])
def test_rejects_a_malformed_trusted_email(value):
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({"trusted_contact_email": value})


@pytest.mark.parametrize("field", ["email", "birth_date", "sex", "document_number", "diagnosis_date", "role", "patient_id", "photo"])
def test_rejects_fields_the_patient_cannot_change(field):
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({"phone": "3168765432", field: "x"})


def test_rejects_an_empty_update():
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({})


def _data_url(mime: str, payload: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(payload).decode()}"


JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 32


@pytest.mark.parametrize(
    "mime,payload", [("image/jpeg", JPEG), ("image/png", PNG), ("image/webp", WEBP)]
)
def test_accepts_a_small_image_data_url(mime, payload):
    value = _data_url(mime, payload)
    assert ProfileUpdate.model_validate({"avatar": value}).avatar == value


@pytest.mark.parametrize("value", [None, "", "   "])
def test_a_blank_avatar_removes_the_photo(value):
    update = ProfileUpdate.model_validate({"avatar": value})
    assert update.avatar is None
    assert "avatar" in update.model_fields_set


@pytest.mark.parametrize(
    "value",
    [
        "https://example.com/foto.jpg",
        "data:text/html;base64,PGgxPmhvbGE8L2gxPg==",
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
        "data:image/jpeg;base64,esto no es base64!!",
        "data:image/jpeg;utf8,hola",
    ],
)
def test_rejects_anything_that_is_not_an_embedded_jpeg_png_or_webp(value):
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({"avatar": value})


def test_rejects_a_declared_type_that_does_not_match_the_bytes():
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({"avatar": _data_url("image/jpeg", b"<script>alert(1)</script>")})
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({"avatar": _data_url("image/png", JPEG)})


def test_rejects_an_image_that_is_too_large():
    big = _data_url("image/jpeg", JPEG + b"\x00" * AVATAR_MAX_CHARS)
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate({"avatar": big})
