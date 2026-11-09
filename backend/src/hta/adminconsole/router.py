"""@requirement RF-02
@requirement RF-15
@requirement RF-27

Rutas de administración: vínculos, destinatarios de alerta y consulta del rastro.

Todas exigen rol ``admin``. No publican lecturas ni síntomas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.adminconsole import service
from hta.auth.deps import SESSION_RESPONSES, CurrentUser, get_conn, require_role
from hta.clinical.readings import filter_utc

router = APIRouter(prefix="/api/admin", tags=["admin"], responses=SESSION_RESPONSES)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class PhysicianAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_user_id: UUID
    physician_user_id: UUID


class CaregiverAuthorization(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_user_id: UUID
    caregiver_user_id: UUID
    authorized_scope: str


class ScopeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    authorized_scope: str


class RecipientsUpdate(BaseModel):
    """Solo los destinatarios. Un umbral en el cuerpo se rechaza."""

    model_config = ConfigDict(extra="forbid")

    recipients: list[str]


class ThresholdUpdate(BaseModel):
    """La banda completa. Un nulo deja esa orilla sin aviso."""

    model_config = ConfigDict(extra="forbid")

    low_threshold: float | None
    high_threshold: float | None
    critical_low: float | None
    critical_high: float | None


class CreatedLink(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID


class PhysicianLinkResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    patient_user_id: UUID
    patient_name: str
    physician_user_id: UUID
    physician_name: str
    assigned_at: datetime


class CaregiverLinkResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    patient_user_id: UUID
    patient_name: str
    caregiver_user_id: UUID
    caregiver_name: str
    authorized_scope: str
    created_at: datetime


class LinkDirectory(BaseModel):
    model_config = ConfigDict(frozen=True)

    physicians: list[PhysicianLinkResponse]
    caregivers: list[CaregiverLinkResponse]


class AlertConfigResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    patient_user_id: UUID | None
    patient_name: str | None
    metric: str
    low_threshold: float | None
    high_threshold: float | None
    critical_low: float | None
    critical_high: float | None
    recipients: list[str]


class AlertConfigPage(BaseModel):
    model_config = ConfigDict(frozen=True)

    items: list[AlertConfigResponse]
    total: int


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    actor_user_id: UUID | None
    actor_name: str | None
    action: str
    entity: str | None
    entity_id: UUID | None
    ip: str | None
    occurred_at: datetime
    details: dict[str, Any] | None
    details_withheld: bool


class AuditPage(BaseModel):
    model_config = ConfigDict(frozen=True)

    items: list[AuditEventResponse]
    total: int


@router.get("/links", response_model=LinkDirectory)
async def list_links(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    _admin: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> LinkDirectory:
    """Lista asignaciones de médicos y autorizaciones de cuidadores."""
    physicians, caregivers = await service.list_links(conn)
    return LinkDirectory(
        physicians=[PhysicianLinkResponse.model_validate(item, from_attributes=True) for item in physicians],
        caregivers=[CaregiverLinkResponse.model_validate(item, from_attributes=True) for item in caregivers],
    )


@router.post("/physicians", status_code=204)
async def assign_physician(
    body: PhysicianAssignment,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> None:
    """Asigna un médico tratante a un paciente."""
    await service.assign_physician(conn, actor.user_id, body.patient_user_id, body.physician_user_id)


@router.delete("/physicians/{patient_user_id}/{physician_user_id}", status_code=204)
async def remove_physician(
    patient_user_id: UUID,
    physician_user_id: UUID,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> None:
    """Quita la asignación de un médico. El historial clínico permanece."""
    await service.remove_physician(conn, actor.user_id, patient_user_id, physician_user_id)


@router.post("/caregivers", status_code=201, response_model=CreatedLink)
async def authorize_caregiver(
    body: CaregiverAuthorization,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> CreatedLink:
    """Autoriza a un cuidador con alcance ``minimal`` o ``readings``."""
    link_id = await service.authorize_caregiver(
        conn,
        actor.user_id,
        body.patient_user_id,
        body.caregiver_user_id,
        body.authorized_scope,
    )
    return CreatedLink(id=link_id)


@router.patch("/caregivers/{link_id}", status_code=204)
async def update_caregiver_scope(
    link_id: UUID,
    body: ScopeUpdate,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> None:
    """Cambia el alcance de un cuidador ya autorizado."""
    await service.update_caregiver_scope(conn, actor.user_id, link_id, body.authorized_scope)


@router.delete("/caregivers/{link_id}", status_code=204)
async def revoke_caregiver(
    link_id: UUID,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> None:
    """Revoca la autorización del cuidador."""
    await service.revoke_caregiver(conn, actor.user_id, link_id)


@router.get("/alert-config", response_model=AlertConfigPage)
async def list_alert_config(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    _admin: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> AlertConfigPage:
    """Devuelve los umbrales y sus destinatarios."""
    rows = await service.list_alert_config(conn)
    items = [AlertConfigResponse.model_validate(row, from_attributes=True) for row in rows]
    return AlertConfigPage(items=items, total=len(items))


@router.patch("/alert-config/{config_id}/recipients", status_code=204)
async def update_recipients(
    config_id: UUID,
    body: RecipientsUpdate,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> None:
    """Cambia quién recibe la alerta. Los números del umbral no se tocan."""
    await service.update_recipients(conn, actor.user_id, config_id, body.recipients)


@router.patch("/alert-config/{config_id}", status_code=204)
async def update_thresholds(
    config_id: UUID,
    body: ThresholdUpdate,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> None:
    """Cambia desde dónde y hasta dónde va el aviso de una métrica."""
    await service.update_thresholds(
        conn,
        actor.user_id,
        config_id,
        body.low_threshold,
        body.high_threshold,
        body.critical_low,
        body.critical_high,
    )


@router.get("/audit", response_model=AuditPage)
async def list_audit(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    _admin: Annotated[CurrentUser, Depends(require_role("admin"))],
    action: Annotated[str | None, Query(min_length=1)] = None,
    topic: Annotated[str | None, Query(min_length=1)] = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: Annotated[int, Query(ge=0, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditPage:
    """Lista el rastro. El detalle de un evento clínico no sale en la respuesta."""
    events, total = await service.list_audit(
        conn,
        action,
        topic,
        filter_utc(since, "since"),
        filter_utc(until, "until"),
        limit,
        offset,
    )
    return AuditPage(
        items=[AuditEventResponse.model_validate(event, from_attributes=True) for event in events],
        total=total,
    )
