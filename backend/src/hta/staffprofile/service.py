"""@requirement RF-01

Lectura y actualización del perfil del personal autenticado.

El perfil se resuelve desde la cuenta de la sesión. Todo vive en ``users``: no
hay tabla nueva. La auditoría nombra los campos y nunca los valores.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.auth.deps import FORBIDDEN

_PHYSICIAN_ONLY = ("license_number", "specialty")
_COLUMNS = ("full_name", "phone", "avatar", "license_number", "specialty")
_PHYSICIAN_ONLY_DETAIL = "El registro profesional y la especialidad son solo de médicos"


@dataclass(frozen=True)
class StaffProfile:
    """Perfil que ve el personal."""

    user_id: UUID
    email: str
    full_name: str
    role: str
    phone: str | None
    avatar: str | None
    license_number: str | None
    specialty: str | None


async def read(conn: AsyncConnection, user_id: UUID) -> StaffProfile:
    """Devuelve el perfil de la cuenta o rechaza con 403 si no es del personal."""
    row = await (
        await conn.execute(
            "select id, email, full_name, role::text, phone, avatar, license_number, specialty "
            "from users where id = %s and role in ('physician', 'caregiver', 'admin')",
            (user_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return StaffProfile(*row)


async def update(conn: AsyncConnection, user_id: UUID, changes: dict[str, Any]) -> StaffProfile:
    """Aplica los cambios recibidos y devuelve el perfil resultante."""
    current = await read(conn, user_id)
    if current.role != "physician" and any(name in changes for name in _PHYSICIAN_ONLY):
        raise HTTPException(status_code=422, detail=_PHYSICIAN_ONLY_DETAIL)

    await conn.execute("select 1 from users where id = %s for update", (user_id,))
    columns = [name for name in _COLUMNS if name in changes]
    assignments = ", ".join(f"{name} = %s" for name in columns)
    await conn.execute(
        f"update users set {assignments}, updated_at = now() where id = %s",
        (*(changes[name] for name in columns), user_id),
    )
    await record(
        conn,
        user_id,
        "staff.profile_updated",
        entity="users",
        entity_id=user_id,
        details={"fields": sorted(changes)},
    )
    await conn.commit()
    return await read(conn, user_id)
