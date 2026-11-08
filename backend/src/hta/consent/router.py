"""@requirement RF-03

Endpoints HTTP del consentimiento informado del paciente.

Las tres rutas exigen una sesión con rol de paciente. El perfil se resuelve
desde la cuenta autenticada y no desde la ruta: nadie puede aceptar ni revocar
en nombre de otro paciente, y una cuenta sin perfil se rechaza con 403 porque
no habría a quién asociar la aceptación. La conexión la entrega ``auth.deps`` y
la comparten la dependencia de autorización y el endpoint.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.auth.deps import FORBIDDEN, CurrentUser, get_conn, require_role
from hta.consent import service

router = APIRouter(prefix="/api/consent", tags=["consent"])


class AcceptRequest(BaseModel):
    """Versión y referencia del documento que el paciente acepta."""

    version: int
    content_ref: str


class AcceptedConsent(BaseModel):
    """Identificador de la aceptación recién registrada."""

    model_config = ConfigDict(frozen=True)

    id: UUID


class ConsentStatus(BaseModel):
    """Estado del consentimiento para la versión que consulta el cliente.

    ``requires_acceptance_of_version`` es ``None`` cuando el consentimiento
    está vigente y, cuando no lo está, la versión cuya aceptación falta. Así el
    cliente no tiene que comparar versiones por su cuenta para saber qué
    documento debe presentar.
    """

    model_config = ConfigDict(frozen=True)

    active: bool
    requires_acceptance_of_version: int | None


async def _profile_id(conn: AsyncConnection, user_id: UUID) -> UUID:
    """Devuelve el perfil de paciente de la cuenta o rechaza con 403.

    Un paciente sin perfil es un registro inconsistente: no hay a quién
    asociar la aceptación ni contra qué consultar el historial. Se rechaza en
    lugar de crear un perfil desde aquí, porque esta ruta no registra cuentas.
    """
    row = await (
        await conn.execute(
            "select id from patient_profiles where user_id = %s",
            (user_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return row[0]


@router.get("", response_model=ConsentStatus)
async def read_status(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
    required_version: int = service.CURRENT_VERSION,
) -> ConsentStatus:
    """Informa si el paciente tiene consentimiento vigente para una versión."""
    profile_id = await _profile_id(conn, user.user_id)
    active = await service.is_active(conn, profile_id, required_version)
    return ConsentStatus(
        active=active,
        requires_acceptance_of_version=None if active else required_version,
    )


@router.post("", status_code=201, response_model=AcceptedConsent)
async def accept(
    body: AcceptRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> AcceptedConsent:
    """Registra una aceptación nueva del documento firmada por el paciente."""
    profile_id = await _profile_id(conn, user.user_id)
    consent_id = await service.accept(conn, profile_id, body.version, body.content_ref)
    return AcceptedConsent(id=consent_id)


@router.post("/revoke", status_code=204)
async def revoke(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> None:
    """Revoca las aceptaciones vigentes del paciente y conserva el historial."""
    profile_id = await _profile_id(conn, user.user_id)
    await service.revoke(conn, profile_id)
