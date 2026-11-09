"""@requirement RF-01

Endpoints HTTP del perfil del personal (médico, cuidador y administrador).

No reciben un identificador: el perfil es siempre el de la sesión.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.auth.deps import SESSION_RESPONSES, CurrentUser, get_conn, require_role
from hta.staffprofile import service
from hta.staffprofile.schemas import StaffProfileUpdate

router = APIRouter(prefix="/api/staff/profile", tags=["staff-profile"], responses=SESSION_RESPONSES)


class StaffProfileOut(BaseModel):
    """Perfil del personal. ``user_id`` es el de la cuenta."""

    model_config = ConfigDict(frozen=True)

    user_id: UUID
    email: str
    full_name: str
    role: str
    phone: str | None
    avatar: str | None
    license_number: str | None
    specialty: str | None


@router.get("", response_model=StaffProfileOut)
async def read_profile(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("physician", "caregiver", "admin"))],
) -> StaffProfileOut:
    """Devuelve el perfil de la cuenta del personal que firma la petición."""
    return StaffProfileOut(**(await service.read(conn, user.user_id)).__dict__)


@router.patch("", response_model=StaffProfileOut)
async def update_profile(
    body: StaffProfileUpdate,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("physician", "caregiver", "admin"))],
) -> StaffProfileOut:
    """Actualiza el nombre, el teléfono y la foto; el médico, también su registro y su especialidad.

    La actualización es parcial; un valor vacío o ``null`` borra el dato
    opcional. El registro profesional y la especialidad de otro rol se
    rechazan con 422, igual que el correo, el rol y el estado.
    """
    return StaffProfileOut(**(await service.update(conn, user.user_id, body.changes())).__dict__)
