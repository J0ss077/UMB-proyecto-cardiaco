"""@requirement RF-02

Solicitud, aprobación y rechazo del cambio de contraseña del personal.

El médico y el cuidador piden el cambio y un administrador lo decide; el
administrador cambia la suya sin aprobación. Nunca se guarda ni se audita una
contraseña en claro: la solicitud guarda solo el hash. Al aprobar o cambiar se
revocan los refrescos de la cuenta, para que ninguna sesión previa sobreviva.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.auth.passwords import hash_password, verify_password

_WRONG_CURRENT = "La contraseña actual no es correcta"
_NO_REQUEST = "No hay una solicitud de cambio de contraseña para esa cuenta"


@dataclass(frozen=True)
class Status:
    status: str
    requested_at: datetime | None


@dataclass(frozen=True)
class PendingRequest:
    user_id: UUID
    email: str
    full_name: str
    role: str
    requested_at: datetime


async def status_of(conn: AsyncConnection, user_id: UUID) -> Status:
    row = await (
        await conn.execute(
            "select password_change_requested_at from users "
            "where id = %s and pending_password_hash is not null",
            (user_id,),
        )
    ).fetchone()
    return Status("pending", row[0]) if row else Status("none", None)


async def _revoke_sessions(conn: AsyncConnection, user_id: UUID) -> None:
    await conn.execute(
        "update refresh_tokens set revoked_at = now() where user_id = %s and revoked_at is null",
        (user_id,),
    )


async def request_change(
    conn: AsyncConnection, user_id: UUID, role: str, current: str, new: str
) -> Status:
    """Verifica la contraseña actual y deja la solicitud, o la aplica si es administrador."""
    row = await (
        await conn.execute("select password_hash from users where id = %s for update", (user_id,))
    ).fetchone()
    if row is None or not verify_password(current, row[0]):
        raise HTTPException(status_code=400, detail=_WRONG_CURRENT)

    new_hash = hash_password(new)
    if role == "admin":
        await conn.execute(
            "update users set password_hash = %s, pending_password_hash = null, "
            "password_change_requested_at = null, updated_at = now() where id = %s",
            (new_hash, user_id),
        )
        await _revoke_sessions(conn, user_id)
        await record(conn, user_id, "password.changed", entity="users", entity_id=user_id)
        await conn.commit()
        return Status("changed", None)

    await conn.execute(
        "update users set pending_password_hash = %s, password_change_requested_at = now(), "
        "updated_at = now() where id = %s",
        (new_hash, user_id),
    )
    await record(conn, user_id, "password.change_requested", entity="users", entity_id=user_id)
    await conn.commit()
    return await status_of(conn, user_id)


async def cancel(conn: AsyncConnection, user_id: UUID) -> None:
    """Retira la solicitud propia; sin solicitud no hace nada."""
    result = await conn.execute(
        "update users set pending_password_hash = null, password_change_requested_at = null "
        "where id = %s and pending_password_hash is not null",
        (user_id,),
    )
    if result.rowcount:
        await record(conn, user_id, "password.change_cancelled", entity="users", entity_id=user_id)
    await conn.commit()


async def list_pending(conn: AsyncConnection) -> list[PendingRequest]:
    rows = await (
        await conn.execute(
            "select id, email, full_name, role::text, password_change_requested_at from users "
            "where pending_password_hash is not null and active "
            "order by password_change_requested_at, id"
        )
    ).fetchall()
    return [PendingRequest(*row) for row in rows]


async def decide(conn: AsyncConnection, actor: UUID, user_id: UUID, approve: bool) -> None:
    """Aprueba o rechaza la solicitud de otra cuenta; 404 si no hay solicitud."""
    row = await (
        await conn.execute(
            "select pending_password_hash from users "
            "where id = %s and pending_password_hash is not null and active for update",
            (user_id,),
        )
    ).fetchone()
    if row is None or user_id == actor:
        raise HTTPException(status_code=404, detail=_NO_REQUEST)

    if approve:
        await conn.execute(
            "update users set password_hash = pending_password_hash, pending_password_hash = null, "
            "password_change_requested_at = null, updated_at = now() where id = %s",
            (user_id,),
        )
        await _revoke_sessions(conn, user_id)
    else:
        await conn.execute(
            "update users set pending_password_hash = null, password_change_requested_at = null "
            "where id = %s",
            (user_id,),
        )
    await record(
        conn,
        actor,
        "password.change_approved" if approve else "password.change_rejected",
        entity="users",
        entity_id=user_id,
    )
    await conn.commit()
