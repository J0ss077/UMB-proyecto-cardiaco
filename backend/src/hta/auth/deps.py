"""@requirement RF-01

Dependencias de autorización de la API: conexión, identidad y rol.

La identidad de cada petición se resuelve contra la base y no solo contra el
token: el rol y el estado de la cuenta se leen de ``users``. Así un cambio de
rol o una desactivación surten efecto en la petición siguiente, sin esperar a
que venza el token de acceso que ya estaba emitido.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException
from psycopg import AsyncConnection

from hta.auth.tokens import InvalidToken, decode_access
from hta.db.pool import get_pool

_INVALID_SESSION = "Sesión inválida o expirada"
_FORBIDDEN = "Permiso denegado"


@dataclass(frozen=True)
class CurrentUser:
    """Cuenta que firma la petición, con el rol que tiene ahora en la base."""

    user_id: UUID
    role: str


async def get_conn() -> AsyncIterator[AsyncConnection]:
    """Entrega una conexión del grupo compartido y la cierra al terminar.

    FastAPI memoriza el resultado por petición, así que la dependencia de
    autorización y el endpoint reciben la misma conexión y comparten la
    transacción; el grupo la confirma si la petición acaba bien.
    """
    async with get_pool().connection() as conn:
        yield conn


def _bearer_token(authorization: str | None) -> str | None:
    """Extrae el token del encabezado, o ``None`` si no tiene la forma esperada.

    El esquema se compara sin distinguir mayúsculas, como pide la RFC 6750, y
    se exige un valor no vacío después del espacio.
    """
    if authorization is None:
        return None
    scheme, _, credentials = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = credentials.strip()
    return token or None


async def current_user(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """Devuelve la cuenta de la petición o rechaza con 401.

    Sirve como dependencia de FastAPI y también se puede invocar directamente
    pasando la conexión y el encabezado. La falta del encabezado, un esquema
    distinto de Bearer, un token inválido o vencido, una cuenta desconocida y
    una cuenta inactiva producen el mismo rechazo: el cliente no debe poder
    distinguir cuál de los casos ocurrió.
    """
    token = _bearer_token(authorization)
    if token is None:
        raise HTTPException(status_code=401, detail=_INVALID_SESSION)

    try:
        claims = decode_access(token)
    except InvalidToken:
        raise HTTPException(status_code=401, detail=_INVALID_SESSION) from None

    row = await (
        await conn.execute(
            "select role, active from users where id = %s",
            (claims.user_id,),
        )
    ).fetchone()
    if row is None or not row[1]:
        raise HTTPException(status_code=401, detail=_INVALID_SESSION)

    return CurrentUser(user_id=claims.user_id, role=row[0])


def require_role(*roles: str) -> Callable[..., Awaitable[CurrentUser]]:
    """Construye una dependencia que exige uno de los roles indicados.

    La cuenta se resuelve primero con ``current_user`` y solo después se
    compara el rol, de modo que una cuenta desactivada responde 401 aunque su
    token de acceso siguiera vigente. Un rol distinto responde 403.
    """

    async def dependency(
        user: Annotated[CurrentUser, Depends(current_user)],
    ) -> CurrentUser:
        """Devuelve la cuenta si su rol está permitido y rechaza con 403 si no."""
        if user.role not in roles:
            raise HTTPException(status_code=403, detail=_FORBIDDEN)
        return user

    return dependency
