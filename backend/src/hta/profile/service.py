"""@requirement RF-01

Lectura y actualización del perfil del paciente autenticado.

El perfil se resuelve desde la cuenta de la sesión y nunca desde un parámetro de
la ruta: nadie puede leer ni cambiar el de otro paciente. La actualización
escribe el nombre en ``users`` y el resto en ``patient_profiles`` dentro de una
sola transacción, y audita qué campos cambiaron sin guardar sus valores, porque
son datos personales que la desactivación de la cuenta debe poder olvidar.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.auth.deps import FORBIDDEN

# Columnas de ``patient_profiles`` que el paciente puede cambiar. El nombre vive
# en ``users`` y se trata aparte.
_PROFILE_COLUMNS = ("phone", "trusted_contact_phone", "trusted_contact_email", "avatar")


@dataclass(frozen=True)
class Profile:
    """Perfil que ve el paciente, con el identificador de la cuenta."""

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


async def read(conn: AsyncConnection, user_id: UUID) -> Profile:
    """Devuelve el perfil de la cuenta o rechaza con 403 si no tiene uno.

    Una cuenta de paciente sin perfil es un registro inconsistente: se rechaza
    con el mismo 403 que las demás rutas del paciente en lugar de crear uno.
    """
    row = await (
        await conn.execute(
            "select u.id, u.email, u.full_name, p.birth_date, p.sex, "
            "p.document_number, p.phone, p.diagnosis_date, "
            "p.trusted_contact_phone, p.trusted_contact_email, p.avatar "
            "from users u join patient_profiles p on p.user_id = u.id "
            "where u.id = %s",
            (user_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return Profile(*row)


async def update(conn: AsyncConnection, user_id: UUID, changes: dict[str, Any]) -> Profile:
    """Aplica los cambios recibidos y devuelve el perfil resultante.

    ``changes`` trae solo los campos enviados; un valor ``None`` borra el dato.
    La fila del perfil se bloquea mientras se escribe, para que dos
    actualizaciones simultáneas no se pisen a medias. La auditoría nombra los
    campos, nunca los valores.
    """
    await read(conn, user_id)
    await conn.execute("select 1 from patient_profiles where user_id = %s for update", (user_id,))

    if "full_name" in changes:
        await conn.execute(
            "update users set full_name = %s, updated_at = now() where id = %s",
            (changes["full_name"], user_id),
        )
    columns = [name for name in _PROFILE_COLUMNS if name in changes]
    if columns:
        assignments = ", ".join(f"{name} = %s" for name in columns)
        await conn.execute(
            f"update patient_profiles set {assignments} where user_id = %s",
            (*(changes[name] for name in columns), user_id),
        )
    await record(
        conn,
        user_id,
        "profile.updated",
        entity="users",
        entity_id=user_id,
        details={"fields": sorted(changes)},
    )
    await conn.commit()
    return await read(conn, user_id)
