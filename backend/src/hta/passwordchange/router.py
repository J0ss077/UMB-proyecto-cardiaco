"""@requirement RF-02

Rutas del cambio de contraseña del personal.

``/api/account/password-change`` es de quien firma la petición (médico,
cuidador o administrador); ``/api/admin/password-requests`` es solo del
administrador, que decide las solicitudes de las demás cuentas.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.auth.deps import SESSION_RESPONSES, CurrentUser, get_conn, require_role
from hta.passwordchange import service
from hta.passwordchange.schemas import PasswordChangeRequest

router = APIRouter(prefix="/api/account/password-change", tags=["password-change"], responses=SESSION_RESPONSES)
admin_router = APIRouter(prefix="/api/admin/password-requests", tags=["admin"], responses=SESSION_RESPONSES)

_STAFF = require_role("physician", "caregiver", "admin")
_ADMIN = require_role("admin")


class StatusOut(BaseModel):
    """``none``, ``pending`` o ``changed`` (el administrador cambia la suya al momento)."""

    model_config = ConfigDict(frozen=True)

    status: str
    requested_at: datetime | None


class PendingOut(BaseModel):
    model_config = ConfigDict(frozen=True)

    user_id: UUID
    email: str
    full_name: str
    role: str
    requested_at: datetime


class PendingPage(BaseModel):
    items: list[PendingOut]


@router.get("", response_model=StatusOut)
async def read_status(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(_STAFF)],
) -> StatusOut:
    """Estado de la solicitud propia."""
    return StatusOut(**(await service.status_of(conn, user.user_id)).__dict__)


@router.post(
    "",
    response_model=StatusOut,
    status_code=202,
    responses={
        200: {
            "model": StatusOut,
            "description": (
                "El administrador cambia su contraseña al momento y recibe "
                "``changed``."
            ),
        },
        202: {
            "model": StatusOut,
            "description": (
                "El médico y el cuidador quedan en ``pending`` hasta que un "
                "administrador apruebe el cambio."
            ),
        },
    },
)
async def request_change(
    body: PasswordChangeRequest,
    response: Response,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(_STAFF)],
) -> StatusOut:
    """Pide cambiar la contraseña. Responde 202 con ``pending`` hasta que un administrador la apruebe.

    El administrador cambia la suya al momento y recibe 200 con ``changed``; se
    cierran sus sesiones. La contraseña actual incorrecta responde 400.
    """
    result = await service.request_change(
        conn, user.user_id, user.role, body.current_password, body.new_password
    )
    if result.status == "changed":
        response.status_code = 200
    return StatusOut(**result.__dict__)


@router.delete("", status_code=204)
async def cancel_request(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(_STAFF)],
) -> Response:
    """Retira la solicitud propia pendiente."""
    await service.cancel(conn, user.user_id)
    return Response(status_code=204)


@admin_router.get("", response_model=PendingPage)
async def list_requests(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    _: Annotated[CurrentUser, Depends(_ADMIN)],
) -> PendingPage:
    """Solicitudes pendientes, de la más antigua a la más reciente. Nunca incluye contraseñas."""
    return PendingPage(items=[PendingOut(**p.__dict__) for p in await service.list_pending(conn)])


@admin_router.post("/{user_id}/approve", status_code=204)
async def approve(
    user_id: UUID,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    admin: Annotated[CurrentUser, Depends(_ADMIN)],
) -> Response:
    """Aprueba: la contraseña pedida pasa a ser la vigente y se cierran las sesiones de la cuenta."""
    await service.decide(conn, admin.user_id, user_id, approve=True)
    return Response(status_code=204)


@admin_router.post("/{user_id}/reject", status_code=204)
async def reject(
    user_id: UUID,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    admin: Annotated[CurrentUser, Depends(_ADMIN)],
) -> Response:
    """Rechaza: la contraseña vigente no cambia y la solicitud se descarta."""
    await service.decide(conn, admin.user_id, user_id, approve=False)
    return Response(status_code=204)
