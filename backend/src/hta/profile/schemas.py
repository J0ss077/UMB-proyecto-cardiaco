"""@requirement RF-01

Cuerpo de la actualización del perfil y sus reglas de forma.

El paciente cambia su nombre, su teléfono y su contacto de confianza. Todo lo
demás que muestra el perfil, como el correo, la fecha de nacimiento, el sexo, el
documento y la fecha de diagnóstico, se rechaza con 422: el correo identifica la
sesión y los otros los fija quien registra la historia clínica.

La actualización es parcial. ``model_fields_set`` distingue el campo ausente, que
no se toca, del campo enviado con ``null`` o vacío, que borra el valor. El
nombre es obligatorio en la cuenta y por eso no admite ``null``. El formato se
valida aquí y no en la base de datos, igual que los rangos fisiológicos.
"""

from __future__ import annotations

import base64
import binascii
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

NAME_MAX = 200
EMAIL_MAX = 254

# Teléfono internacional o local: un más o un paréntesis inicial opcional, dígitos, y espacios,
# paréntesis o guiones entre ellos. Entre 7 y 20 caracteres en total.
_PHONE = re.compile(r"^[+(]?[0-9][0-9 ()\-]{5,18}[0-9]$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_EMPTY_UPDATE = "Indica al menos un campo para actualizar"

# La foto llega ya recortada y reducida por el cliente, como URL de datos. El
# tope cubre una imagen cuadrada de unos 400 píxeles con holgura y evita que el
# perfil cargue con un archivo que no es un avatar.
AVATAR_MAX_CHARS = 150_000
_AVATAR = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$")
_MAGIC = {
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/webp": lambda data: data[:4] == b"RIFF" and data[8:12] == b"WEBP",
}


class ProfileUpdate(BaseModel):
    """Campos que el paciente puede cambiar en su perfil."""

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = None
    phone: str | None = None
    trusted_contact_phone: str | None = None
    trusted_contact_email: str | None = None
    avatar: str | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> ProfileUpdate:
        if not self.model_fields_set:
            raise ValueError(_EMPTY_UPDATE)
        return self

    @field_validator("full_name")
    @classmethod
    def _name(cls, value: str | None) -> str:
        return parse_name(value)

    @field_validator("phone", "trusted_contact_phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return parse_phone(value)

    @field_validator("trusted_contact_email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        text = _blank_to_none(value)
        if text is None:
            return None
        text = text.lower()
        if len(text) > EMAIL_MAX or not _EMAIL.match(text):
            raise ValueError("El correo no tiene un formato válido")
        return text

    @field_validator("avatar")
    @classmethod
    def _avatar(cls, value: str | None) -> str | None:
        return parse_avatar(value)

    def changes(self) -> dict[str, Any]:
        """Devuelve solo los campos que llegaron en la petición."""
        return {name: getattr(self, name) for name in self.model_fields_set}


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def parse_name(value: str | None) -> str:
    """Nombre obligatorio, recortado y de hasta ``NAME_MAX`` caracteres."""
    if value is None or not value.strip():
        raise ValueError("El nombre no puede quedar vacío")
    text = value.strip()
    if len(text) > NAME_MAX:
        raise ValueError(f"El nombre admite hasta {NAME_MAX} caracteres")
    return text


def parse_phone(value: str | None) -> str | None:
    """Teléfono opcional; vacío o ``null`` lo borra."""
    text = _blank_to_none(value)
    if text is not None and not _PHONE.match(text):
        raise ValueError("El teléfono no tiene un formato válido")
    return text


def parse_avatar(value: str | None) -> str | None:
    """Foto opcional como URL de datos; valida tipo, contenido y tamaño."""
    text = _blank_to_none(value)
    if text is None:
        return None
    if len(text) > AVATAR_MAX_CHARS:
        raise ValueError("La foto es demasiado grande")
    match = _AVATAR.match(text)
    if match is None:
        raise ValueError("La foto debe ser una imagen JPEG, PNG o WebP")
    mime, payload = match.groups()
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("La foto no es una imagen válida") from None
    if not _MAGIC[mime](data):
        raise ValueError("El contenido de la foto no coincide con su tipo")
    return text
