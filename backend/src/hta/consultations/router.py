"""@requirement RF-24

Endpoints HTTP de la consulta rápida.

El paciente crea y lista las propias; el médico lista las que le llegan y las
responde. El cuidador y el administrador reciben 403.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.auth.deps import SESSION_RESPONSES, CurrentUser, get_conn, require_role
from hta.consultations import service
from hta.consultations.schemas import CheckupRequest, ConsultationRequest, MeetRequest

router = APIRouter(prefix="/api/consultations", tags=["consultations"], responses=SESSION_RESPONSES)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class ReadingOut(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    systolic: int
    diastolic: int
    measured_at: datetime


class ConsultationOut(BaseModel):
    """Consulta con los identificadores de cuenta, nunca los del perfil."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    patient_id: UUID
    patient_name: str
    physician_id: UUID
    physician_name: str
    message: str | None
    response: str | None
    status: str
    created_at: datetime
    responded_at: datetime | None
    reason: str | None
    onset: str | None
    medications: str | None
    urgent: bool
    wants_meet: bool
    contact_phone: str | None
    meet_url: str | None
    checkup_general: str | None
    checkup_pressure: str | None
    checkup_symptoms: str | None
    checkup_conduct: str | None
    reading: ReadingOut | None


class RecipientOut(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    full_name: str


class Recipients(BaseModel):
    model_config = ConfigDict(frozen=True)

    items: list[RecipientOut]
    total: int


class PaginatedConsultations(BaseModel):
    model_config = ConfigDict(frozen=True)

    items: list[ConsultationOut]
    total: int


@router.post("", status_code=201, response_model=ConsultationOut)
async def create_consultation(
    body: ConsultationRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> ConsultationOut:
    """Envía una consulta a un médico vinculado, con la última lectura válida.

    Exige consentimiento informado vigente. ``physician_id`` es opcional y debe
    ser uno de los médicos vinculados; sin él va al más antiguo y, sin médicos,
    responde 409. ``share_phone`` copia el teléfono del perfil a la consulta.
    """
    return ConsultationOut.model_validate(await service.create(conn, user, body))


@router.get("/recipients", response_model=Recipients)
async def list_recipients(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> Recipients:
    """Médicos vinculados al paciente, entre los que puede elegir el destinatario."""
    found = await service.list_recipients(conn, user)
    return Recipients(items=[RecipientOut.model_validate(item) for item in found], total=len(found))


@router.get("", response_model=PaginatedConsultations)
async def list_consultations(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient", "physician"))],
    patient_id: UUID | None = None,
    status: Annotated[Literal["in_review", "pending", "completed"] | None, Query()] = None,
    limit: Annotated[int, Query(ge=0, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedConsultations:
    """Lista las consultas de la cuenta, de la más reciente a la más vieja.

    No exige consentimiento: es parte de la historia que el paciente y su
    médico deben poder leer.
    """
    page, total = await service.list_for(conn, user, patient_id, status, limit, offset)
    return PaginatedConsultations(items=[ConsultationOut.model_validate(item) for item in page], total=total)


@router.post("/{consultation_id}/meet", response_model=ConsultationOut)
async def send_meet_link(
    consultation_id: UUID,
    body: MeetRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("physician"))],
) -> ConsultationOut:
    """Envía el enlace de Meet y deja la consulta pendiente de la reunión."""
    return ConsultationOut.model_validate(await service.send_meet(conn, user, consultation_id, body))


@router.post("/{consultation_id}/complete", response_model=ConsultationOut)
async def complete_consultation(
    consultation_id: UUID,
    body: CheckupRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("physician"))],
) -> ConsultationOut:
    """Cierra la consulta con el formato y el comentario escritos por el médico."""
    return ConsultationOut.model_validate(await service.complete(conn, user, consultation_id, body))
