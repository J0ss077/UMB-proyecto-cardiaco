"""@requirement RF-05

Endpoints HTTP del alta clínica: una lectura manual con su síntoma opcional y
un síntoma suelto.

Las dos rutas exigen una sesión con rol de paciente. El identificador de
paciente que viaja en la petición y en la respuesta es el de ``users``; el de
``patient_profiles`` no sale del servidor. La conexión la entrega
``auth.deps.get_conn`` y la comparten la dependencia de autorización y el
endpoint, que la confirma dentro del servicio antes de responder.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.auth.deps import CurrentUser, get_conn, require_role
from hta.clinical import access, readings, symptoms, validation

router = APIRouter(prefix="/api", tags=["clinical"])


class SymptomRequest(BaseModel):
    """Texto libre y estado de ánimo que acompañan a una lectura.

    Los dos campos son opcionales, pero al menos uno debe traer texto: un
    objeto vacío no es un síntoma. La regla la aplica el servicio, que es quien
    también atiende el alta de un síntoma suelto.
    """

    model_config = ConfigDict(extra="forbid")

    free_text: str | None = None
    mood: str | None = None


class ReadingRequest(BaseModel):
    """Datos de una lectura manual de presión arterial.

    ``patient_id`` es opcional y, cuando llega, es el identificador de la cuenta
    del paciente: solo se admite el propio. ``measured_at`` es opcional y sin
    ella se registra el instante actual; con valor debe ser ISO 8601 con
    desplazamiento horario y no puede estar en el futuro.
    """

    model_config = ConfigDict(extra="forbid")

    systolic: int
    diastolic: int
    heart_rate: int | None = None
    measured_at: datetime | None = None
    patient_id: UUID | None = None
    symptom: SymptomRequest | None = None


class ReadingResponse(BaseModel):
    """Lectura recién guardada, con el identificador de cuenta como paciente.

    ``patient_id`` es el de ``users`` y no el del perfil: es el único
    identificador de paciente que el contrato publica. ``validation_status``
    informa si la cifra es plausible sin que eso cambie el código de estado.
    """

    model_config = ConfigDict(frozen=True)

    id: UUID
    patient_id: UUID
    systolic: int
    diastolic: int
    heart_rate: int | None
    source: str
    measured_at: datetime
    validation_status: str


class CreatedSymptom(BaseModel):
    """Identificador del síntoma recién registrado."""

    model_config = ConfigDict(frozen=True)

    id: UUID


@router.post("/readings", status_code=201, response_model=ReadingResponse)
async def create_reading(
    body: ReadingRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> ReadingResponse:
    """Registra una lectura manual y, si viene, su síntoma en la misma operación.

    El perfil se resuelve desde la cuenta autenticada; el servicio comprueba el
    consentimiento antes de insertar. La marca normalizada se calcula también
    aquí para devolverla en la respuesta: es la misma función pura que usa el
    servicio, que vuelve a comprobarla antes de insertar. El estado de
    validación de la respuesta sale del mismo validador que clasificó la fila.
    """
    profile_id = await access.patient_profile_id(conn, user, body.patient_id)
    measured_at = readings.measured_at_utc(body.measured_at)
    symptom = (
        symptoms.SymptomInput(
            free_text=body.symptom.free_text,
            mood=body.symptom.mood,
        )
        if body.symptom is not None
        else None
    )
    reading_id = await readings.create(
        conn,
        profile_id,
        user.user_id,
        body.systolic,
        body.diastolic,
        body.heart_rate,
        measured_at,
        symptom,
    )
    return ReadingResponse(
        id=reading_id,
        patient_id=user.user_id,
        systolic=body.systolic,
        diastolic=body.diastolic,
        heart_rate=body.heart_rate,
        source="manual",
        measured_at=measured_at,
        validation_status=validation.plausibility(body.systolic, body.diastolic),
    )


@router.post("/symptoms", status_code=201, response_model=CreatedSymptom)
async def create_symptom(
    body: SymptomRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> CreatedSymptom:
    """Registra un síntoma suelto del paciente con consentimiento vigente.

    Es el alta que no viene acompañada de una lectura. El perfil se resuelve
    desde la cuenta autenticada y el servicio comprueba el consentimiento,
    inserta el síntoma, audita el hecho y confirma antes de responder.
    """
    profile_id = await access.patient_profile_id(conn, user)
    symptom_id = await symptoms.register(
        conn,
        profile_id,
        user.user_id,
        body.free_text,
        body.mood,
    )
    return CreatedSymptom(id=symptom_id)
