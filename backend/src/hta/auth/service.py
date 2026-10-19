"""@requirement RF-01

Servicio de sesión: inicio, rotación del refresco y cierre.

Las tres operaciones comparten la misma regla: el evento de auditoría se
escribe en la transacción de la operación, y el token de refresco solo se
entrega en claro al cliente; en la base vive únicamente su huella SHA-256.
"""

from __future__ import annotations

import hashlib
from typing import NoReturn
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.audit import record
from hta.auth.passwords import verify_password
from hta.auth.tokens import issue_access, new_refresh_token
from hta.config import Settings

_LOGIN_FAILED = "Credenciales inválidas"
_REFRESH_FAILED = "Sesión inválida o expirada"

# Derivación de una contraseña que no pertenece a ninguna cuenta. Un correo
# desconocido se verifica contra ella para que el intento cueste el mismo
# scrypt que una contraseña equivocada: el tiempo de respuesta no debe delatar
# si la cuenta existe.
_DUMMY_PASSWORD_HASH = (
    "scrypt$16384$8$1$715a805ad05f1f19abd8b62594ddd471$"
    "dc554d90350a60b1ce714b3c42758333d185004bf1ff38c3bcfc7fad90f2b59f"
)


class TokenPair(BaseModel):
    """Par de tokens de la sesión y el rol de la cuenta autenticada.

    Es el cuerpo de respuesta del inicio y de la rotación. ``refresh_token``
    solo se entrega aquí: no se puede reconstruir a partir de su huella.
    """

    model_config = ConfigDict(frozen=True)

    access_token: str
    refresh_token: str
    role: str


def _hash_refresh_token(raw_token: str) -> str:
    """Devuelve la huella con la que se busca el refresco presentado."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def _issue_refresh_token(
    conn: AsyncConnection,
    user_id: UUID,
    ttl_seconds: int,
) -> str:
    """Guarda la huella de un refresco nuevo y devuelve el valor en claro.

    Es el único lugar que inserta en ``refresh_tokens``: la base recibe solo el
    SHA-256 y el valor crudo únicamente viaja en la respuesta.
    """
    raw_token, token_hash = new_refresh_token()
    await conn.execute(
        "insert into refresh_tokens (user_id, token_hash, expires_at) "
        "values (%s, %s, now() + make_interval(secs => %s))",
        (user_id, token_hash, ttl_seconds),
    )
    return raw_token


async def _reject_login(conn: AsyncConnection, email: str, ip: str | None) -> NoReturn:
    """Audita un intento fallido y rechaza con el mensaje genérico.

    El evento se confirma antes de lanzar: el grupo de conexiones revierte la
    transacción cuando la petición termina con excepción, y el rastro del
    intento fallido tiene que sobrevivir al rechazo.
    """
    await record(
        conn,
        None,
        "auth.login_failed",
        entity="users",
        ip=ip,
        details={"email": email},
    )
    await conn.commit()
    raise HTTPException(status_code=401, detail=_LOGIN_FAILED)


async def _reject_refresh(
    conn: AsyncConnection,
    token_id: UUID,
    user_id: UUID,
    ip: str | None,
) -> NoReturn:
    """Revoca los refrescos de la cuenta tras detectar reutilización y rechaza.

    El token reutilizado delata que el valor pudo filtrarse: se revocan todos
    los refrescos vigentes de la cuenta para que ni el dueño ni quien lo repite
    conserven una sesión con él. La revocación y el evento se confirman antes
    del 401 porque el cierre del grupo revertiría la transacción.
    """
    await conn.execute(
        "update refresh_tokens set revoked_at = now() "
        "where user_id = %s and revoked_at is null",
        (user_id,),
    )
    await record(
        conn,
        user_id,
        "auth.refresh_reuse",
        entity="refresh_tokens",
        entity_id=token_id,
        ip=ip,
    )
    await conn.commit()
    raise HTTPException(status_code=401, detail=_REFRESH_FAILED)


async def login(
    conn: AsyncConnection,
    email: str,
    password: str,
    ip: str | None,
) -> TokenPair:
    """Inicia la sesión y entrega el par de tokens, o rechaza sin distinguir.

    Un correo desconocido y una contraseña equivocada producen la misma
    respuesta y el mismo coste de verificación. La cuenta inactiva se rechaza
    con ese mismo error en lugar de anunciar que existe. Todo intento fallido
    queda auditado con actor nulo porque no hay identidad demostrada.
    """
    row = await (
        await conn.execute(
            "select id, password_hash, role, active from users where email = %s",
            (email,),
        )
    ).fetchone()
    if row is None:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        await _reject_login(conn, email, ip)

    user_id, password_hash, role, active = row
    if not verify_password(password, password_hash) or not active:
        await _reject_login(conn, email, ip)

    raw_token = await _issue_refresh_token(
        conn,
        user_id,
        Settings().refresh_ttl_seconds,
    )
    await record(conn, user_id, "auth.login", entity="users", entity_id=user_id, ip=ip)
    return TokenPair(
        access_token=issue_access(user_id, role),
        refresh_token=raw_token,
        role=role,
    )


async def refresh(
    conn: AsyncConnection,
    raw_token: str,
    ip: str | None,
) -> TokenPair:
    """Rota el token de refresco y entrega un par nuevo.

    La rotación revoca el token usado en la misma transacción que inserta el
    nuevo, así que no existe un instante con dos refrescos válidos para una
    sesión. Un token ya revocado es reutilización y se trata como una posible
    filtración; un token vencido, desconocido o de una cuenta inactiva solo se
    rechaza.
    """
    settings = Settings()
    row = await (
        await conn.execute(
            "select rt.id, rt.user_id, rt.revoked_at is not null as revoked, "
            "rt.expires_at <= now() as expired, u.role, u.active "
            "from refresh_tokens rt join users u on u.id = rt.user_id "
            "where rt.token_hash = %s",
            (_hash_refresh_token(raw_token),),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail=_REFRESH_FAILED)

    token_id, user_id, revoked, expired, role, active = row
    if revoked:
        await _reject_refresh(conn, token_id, user_id, ip)
    if expired or not active:
        raise HTTPException(status_code=401, detail=_REFRESH_FAILED)

    # La revocación es condicional y devuelve la fila: si otra petición revocó
    # el token entre la lectura y este punto, no se emite un segundo refresco y
    # el caso se trata como reutilización.
    claimed = await (
        await conn.execute(
            "update refresh_tokens set revoked_at = now() "
            "where id = %s and revoked_at is null "
            "returning id",
            (token_id,),
        )
    ).fetchone()
    if claimed is None:
        await _reject_refresh(conn, token_id, user_id, ip)

    raw_new = await _issue_refresh_token(conn, user_id, settings.refresh_ttl_seconds)
    await record(
        conn,
        user_id,
        "auth.refresh",
        entity="refresh_tokens",
        entity_id=token_id,
        ip=ip,
    )
    return TokenPair(
        access_token=issue_access(user_id, role),
        refresh_token=raw_new,
        role=role,
    )


async def logout(conn: AsyncConnection, raw_token: str) -> None:
    """Revoca el token de refresco recibido y audita el cierre de la sesión.

    Es idempotente: un token desconocido o ya revocado no produce error ni un
    segundo evento, de modo que reintentar el cierre no cambia el resultado.
    """
    row = await (
        await conn.execute(
            "update refresh_tokens set revoked_at = now() "
            "where token_hash = %s and revoked_at is null "
            "returning id, user_id",
            (_hash_refresh_token(raw_token),),
        )
    ).fetchone()
    if row is None:
        return

    token_id, user_id = row
    await record(conn, user_id, "auth.logout", entity="refresh_tokens", entity_id=token_id)
