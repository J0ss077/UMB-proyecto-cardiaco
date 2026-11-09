"""@requirement RF-01

Endpoints HTTP del perfil del paciente.

Las dos rutas exigen una sesión con rol de paciente y resuelven el perfil desde
la cuenta autenticada. No reciben un identificador de paciente: el cliente no
tiene cómo pedir el perfil de otra persona.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.auth.deps import SESSION_RESPONSES, CurrentUser, get_conn, require_role
from hta.profile import service
from hta.profile.schemas import ProfileUpdate

router = APIRouter(
    prefix="/api/profile",
    tags=["profile"],
    responses=SESSION_RESPONSES,
)


class ProfileOut(BaseModel):
    """Perfil del paciente. ``user_id`` es el de la cuenta, no el del perfil."""

    model_config = ConfigDict(frozen=True)

    user_id: UUID
    email: str
    full_name: str
    birth_date: date | None
    sex: str | None
    document_number: str | None
    phone: str | None
    diagnosis_date: date | None
    trusted_contact_phone: str | None
    trusted_contact_email: str | None
    avatar: str | None


@router.get("", response_model=ProfileOut)
async def read_profile(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> ProfileOut:
    """Devuelve el perfil del paciente que firma la petición."""
    profile = await service.read(conn, user.user_id)
    return ProfileOut(**profile.__dict__)


@router.patch("", response_model=ProfileOut)
async def update_profile(
    body: ProfileUpdate,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> ProfileOut:
    """Actualiza el nombre, el teléfono, el contacto de confianza y la foto.

    La actualización es parcial: solo cambian los campos enviados, y un valor
    vacío o ``null`` borra el dato opcional; con la foto, quita la foto y
    el perfil vuelve a mostrar las iniciales. El correo, la fecha de nacimiento,
    el sexo, el documento y la fecha de diagnóstico no se pueden cambiar desde
    aquí y se rechazan con 422.
    """
    profile = await service.update(conn, user.user_id, body.changes())
    return ProfileOut(**profile.__dict__)
