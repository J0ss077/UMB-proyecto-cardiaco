"""@requirement RF-01

Cuerpo de la actualización del perfil del personal.

El médico, el cuidador y el administrador cambian su nombre, su teléfono y su
foto con las mismas reglas del paciente. El registro profesional y la
especialidad solo los fija el médico; el servicio rechaza con 422 que otro rol
los envíe. El correo, el rol y el estado de la cuenta no se cambian aquí.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from hta.profile.schemas import parse_avatar, parse_name, parse_phone

SPECIALTY_MAX = 100

# Letras, dígitos y separadores habituales de un registro: de 3 a 30 caracteres
# que empiezan y terminan en letra o dígito.
_LICENSE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ./\-]{1,28}[A-Za-z0-9]$")
_EMPTY_UPDATE = "Indica al menos un campo para actualizar"


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


class StaffProfileUpdate(BaseModel):
    """Campos que el personal puede cambiar en su perfil."""

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = None
    phone: str | None = None
    avatar: str | None = None
    license_number: str | None = None
    specialty: str | None = None

    @model_validator(mode="after")
    def _at_least_one_field(self) -> StaffProfileUpdate:
        if not self.model_fields_set:
            raise ValueError(_EMPTY_UPDATE)
        return self

    @field_validator("full_name")
    @classmethod
    def _name(cls, value: str | None) -> str:
        return parse_name(value)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return parse_phone(value)

    @field_validator("avatar")
    @classmethod
    def _avatar(cls, value: str | None) -> str | None:
        return parse_avatar(value)

    @field_validator("license_number")
    @classmethod
    def _license(cls, value: str | None) -> str | None:
        text = _blank_to_none(value)
        if text is not None and not _LICENSE.match(text):
            raise ValueError("El registro profesional no tiene un formato válido")
        return text

    @field_validator("specialty")
    @classmethod
    def _specialty(cls, value: str | None) -> str | None:
        text = _blank_to_none(value)
        if text is None:
            return None
        if len(text) > SPECIALTY_MAX:
            raise ValueError(f"La especialidad admite hasta {SPECIALTY_MAX} caracteres")
        if any(ch in text for ch in "\n\r\t<>"):
            raise ValueError("La especialidad no es válida")
        return text

    def changes(self) -> dict[str, Any]:
        """Devuelve solo los campos que llegaron en la petición."""
        return {name: getattr(self, name) for name in self.model_fields_set}
