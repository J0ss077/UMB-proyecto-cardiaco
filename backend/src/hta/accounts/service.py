"""@requirement RF-02

Servicio de cuentas: registro público de pacientes, cambio de rol y
desactivación con seudonimización.

La desactivación no borra nada clínico: la fila de ``users`` conserva su
identificador, el perfil y las lecturas siguen colgando de él, y solo se
sustituyen los datos que identifican a la persona. Los refrescos vigentes se
revocan para que la cuenta no pueda renovar su sesión.

Las tres mutaciones confirman su transacción antes de responder. La conexión
la entrega una dependencia que la cierra después de enviar la respuesta, así
que sin estas confirmaciones el cliente podría leer su propio cambio antes de
que estuviera escrito; confirmar aquí hace que el efecto sea visible en cuanto
llega el código de estado.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection
from psycopg.errors import UniqueViolation

from hta.audit import record
from hta.auth.passwords import hash_password

_DUPLICATE_EMAIL = "El correo ya está registrado"
_UNKNOWN_ROLE = "Rol desconocido"
_ACCOUNT_NOT_FOUND = "La cuenta no existe"
_SELF_DEACTIVATION = "No puedes desactivar tu propia cuenta"

# Valores de la seudonimización: la cuenta desactivada deja de identificar a la
# persona y no puede volver a iniciar sesión aunque alguien conozca la cuenta.
_PSEUDONYM_NAME = "Cuenta desactivada"
_PSEUDONYM_PASSWORD = "!"


def _normalize_email(email: str) -> str:
    """Quita los espacios de los extremos y pasa el correo a minúsculas.

    La unicidad de ``users.email`` distingue mayúsculas, así que normalizar
    antes de insertar es lo que hace que el mismo correo escrito de otra forma
    choque contra la misma fila y se rechace como duplicado.
    """
    return email.strip().lower()


async def _ensure_known_role(conn: AsyncConnection, role: str) -> None:
    """Rechaza con 422 el rol que no pertenece al enum ``user_role``.

    Los valores permitidos se leen de la base y no de una lista copiada en el
    código: el enum es la autoridad y una migración futura no deja este
    servicio desactualizado.
    """
    row = await (
        await conn.execute(
            "select exists ("
            "  select 1 from unnest(enum_range(null::user_role)) as allowed(value)"
            "  where allowed.value::text = %s"
            ")",
            (role,),
        )
    ).fetchone()
    if not row[0]:
        raise HTTPException(status_code=422, detail=_UNKNOWN_ROLE)


async def register_patient(
    conn: AsyncConnection,
    email: str,
    password: str,
    full_name: str,
    birth_date: date,
) -> UUID:
    """Crea una cuenta de paciente con su perfil y devuelve su identificador.

    El rol no se recibe: toda cuenta creada por esta vía es ``patient``. La
    cuenta y el perfil se insertan en la misma transacción, de modo que no
    queda una cuenta sin perfil si algo falla.

    La unicidad del correo la decide solo la restricción única de
    ``users.email``: no hay una comprobación previa que abra una ventana entre
    la consulta y el insert. El correo se normaliza antes de insertarlo, así
    que el mismo correo escrito con otras mayúsculas o con espacios choca
    contra la misma fila. El choque se traduce en un 409 con un mensaje
    genérico que no revela los datos de la cuenta existente, y no se ejecuta
    nada más en esa transacción: el grupo de conexiones la revierte al ver la
    excepción.
    """
    normalized_email = _normalize_email(email)
    try:
        user_id = (
            await (
                await conn.execute(
                    "insert into users (email, password_hash, role, full_name) "
                    "values (%s, %s, 'patient', %s) returning id",
                    (normalized_email, hash_password(password), full_name),
                )
            ).fetchone()
        )[0]
    except UniqueViolation:
        raise HTTPException(status_code=409, detail=_DUPLICATE_EMAIL) from None
    await conn.execute(
        "insert into patient_profiles (user_id, birth_date) values (%s, %s)",
        (user_id, birth_date),
    )
    await record(
        conn,
        user_id,
        "accounts.register",
        entity="users",
        entity_id=user_id,
    )
    await conn.commit()
    return user_id


async def set_role(
    conn: AsyncConnection,
    actor: UUID,
    user_id: UUID,
    role: str,
) -> None:
    """Cambia el rol de una cuenta y audita el valor anterior y el nuevo.

    El rol se valida contra el enum de la base antes de tocar la fila. La fila
    se bloquea durante el cambio para que el rol anterior que queda en la
    auditoría sea el que realmente se reemplazó.
    """
    await _ensure_known_role(conn, role)
    row = await (
        await conn.execute(
            "select role from users where id = %s for update",
            (user_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=_ACCOUNT_NOT_FOUND)

    previous = row[0]
    await conn.execute(
        "update users set role = %s, updated_at = now() where id = %s",
        (role, user_id),
    )
    await record(
        conn,
        actor,
        "accounts.role_changed",
        entity="users",
        entity_id=user_id,
        details={"previous": previous, "new": role},
    )
    await conn.commit()


async def deactivate(conn: AsyncConnection, actor: UUID, user_id: UUID) -> None:
    """Seudonimiza una cuenta y revoca sus refrescos, conservando su historial.

    Una cuenta no puede desactivarse a sí misma: la plataforma se quedaría sin
    la persona que administra el sistema. El correo se sustituye por uno
    derivado del identificador, el nombre por una etiqueta fija, la contraseña
    deja de ser verificable y la cuenta queda inactiva; las lecturas, alertas y
    demás filas clínicas siguen apuntando al mismo perfil. La auditoría no
    guarda la identidad anterior, que es justo lo que se quiere olvidar.
    """
    if actor == user_id:
        raise HTTPException(status_code=409, detail=_SELF_DEACTIVATION)

    row = await (
        await conn.execute(
            "select 1 from users where id = %s for update",
            (user_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=_ACCOUNT_NOT_FOUND)

    await conn.execute(
        "update users set "
        "email = 'deactivated+' || id::text, "
        "full_name = %s, "
        "password_hash = %s, "
        "active = false, "
        "updated_at = now() "
        "where id = %s",
        (_PSEUDONYM_NAME, _PSEUDONYM_PASSWORD, user_id),
    )
    await conn.execute(
        "update refresh_tokens set revoked_at = now() "
        "where user_id = %s and revoked_at is null",
        (user_id,),
    )
    await record(
        conn,
        actor,
        "accounts.deactivated",
        entity="users",
        entity_id=user_id,
    )
    await conn.commit()
