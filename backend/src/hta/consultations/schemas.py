"""@requirement RF-24

Cuerpos de la consulta rápida y de la respuesta del médico.

El paciente solo escribe el mensaje: el médico destinatario, el estado y la
lectura que viaja con la solicitud los fija el servidor, y cualquier otro campo
se rechaza con 422. El paciente dice si quiere Meet. El médico manda el enlace
aparte y cierra después con el formato y el comentario.
"""

from __future__ import annotations

from typing import Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StrictBool, field_validator

MESSAGE_MAX = 2000
MEDICATIONS_MAX = 500

# Listas fijas: el cliente muestra las etiquetas en español y el servidor guarda
# estos códigos, para que el médico reciba datos comparables y no texto suelto.
REASONS = ("high_pressure", "dizziness_headache", "chest_pain_or_breathing", "medication", "other")
ONSETS = ("today", "since_yesterday", "few_days", "over_a_week")

Reason = Literal["high_pressure", "dizziness_headache", "chest_pain_or_breathing", "medication", "other"]
Onset = Literal["today", "since_yesterday", "few_days", "over_a_week"]


def _clean(value: str | None, what: str) -> str:
    if value is None or not value.strip():
        raise ValueError(f"{what} no puede quedar vacío")
    text = value.strip()
    if len(text) > MESSAGE_MAX:
        raise ValueError(f"{what} admite hasta {MESSAGE_MAX} caracteres")
    return text


class ConsultationRequest(BaseModel):
    """Mensaje que el paciente le envía a su médico."""

    model_config = ConfigDict(extra="forbid")

    message: str
    reason: Reason
    onset: Onset
    medications: str | None = None
    # Pide una reunión. Sin esta marca, la consulta se cierra solo con comentarios.
    wants_meet: StrictBool = False
    # Copia el teléfono del perfil a la consulta; el paciente nunca envía el número.
    share_phone: StrictBool = False
    # Médico destinatario, uno de los vinculados; sin él, el que lleva más tiempo.
    physician_id: UUID | None = None

    @field_validator("message", mode="before")
    @classmethod
    def _message(cls, value: str | None) -> str:
        return _clean(value, "El mensaje")

    @field_validator("medications", mode="before")
    @classmethod
    def _medications(cls, value: str | None) -> str | None:
        if value is None or not isinstance(value, str) or not value.strip():
            return None
        text = value.strip()
        if len(text) > MEDICATIONS_MAX:
            raise ValueError(f"Los medicamentos admiten hasta {MEDICATIONS_MAX} caracteres")
        return text


class MeetRequest(BaseModel):
    """Enlace de Meet que el médico envía cuando el paciente lo pidió."""

    model_config = ConfigDict(extra="forbid")

    meet_url: str

    @field_validator("meet_url", mode="before")
    @classmethod
    def _meet(cls, value: str | None) -> str:
        text = _clean(value, "El enlace de Meet")
        parsed = urlparse(text)
        if parsed.scheme != "https" or parsed.hostname != "meet.google.com" or not parsed.path.strip("/"):
            raise ValueError("El enlace tiene que ser de Meet")
        return text


class CheckupRequest(BaseModel):
    """Formato y comentario con los que el médico cierra la consulta."""

    model_config = ConfigDict(extra="forbid")

    response: str
    checkup_general: str
    checkup_pressure: str
    checkup_symptoms: str
    checkup_conduct: str

    @field_validator("response", mode="before")
    @classmethod
    def _response(cls, value: str | None) -> str:
        return _clean(value, "La respuesta")

    @field_validator("checkup_general", "checkup_pressure", "checkup_symptoms", "checkup_conduct", mode="before")
    @classmethod
    def _checkup(cls, value: str | None, info) -> str:
        labels = {
            "checkup_general": "Cómo está",
            "checkup_pressure": "La presión",
            "checkup_symptoms": "Los síntomas",
            "checkup_conduct": "La conducta",
        }
        return _clean(value, labels[info.field_name])
