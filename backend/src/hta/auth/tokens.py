"""Emisión y verificación de tokens de acceso y de refresco."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt

from hta.config import Settings

_ALGORITHM = "HS256"
_REFRESH_BYTES = 32


class InvalidToken(Exception):
    """El token de acceso no tiene una firma válida o ya expiró."""


@dataclass(frozen=True)
class AccessClaims:
    """Identidad mínima que viaja dentro de un token de acceso."""

    user_id: UUID
    role: str


def issue_access(user_id: UUID, role: str, ttl_seconds: int | None = None) -> str:
    """Emite un JWT HS256 firmado con el secreto del servicio.

    ``ttl_seconds`` permite acortar la vida del token en las pruebas; cuando se
    omite, se usa la vida configurada en ``Settings``.
    """
    settings = Settings()
    lifespan = settings.access_ttl_seconds if ttl_seconds is None else ttl_seconds
    issued_at = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": issued_at,
        "exp": issued_at + timedelta(seconds=lifespan),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def decode_access(token: str) -> AccessClaims:
    """Devuelve los claims del token o lanza ``InvalidToken``.

    La firma y la expiración se verifican antes de leer el contenido: un token
    manipulado o vencido nunca entrega claims.
    """
    settings = Settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[_ALGORITHM])
        user_id = UUID(payload["sub"])
        role = payload["role"]
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError, AttributeError) as error:
        raise InvalidToken("El token de acceso no es válido o expiró") from error
    if not isinstance(role, str):
        raise InvalidToken("El token de acceso no es válido o expiró")
    return AccessClaims(user_id=user_id, role=role)


def new_refresh_token() -> tuple[str, str]:
    """Genera un token de refresco y su huella SHA-256 en hexadecimal.

    Solo la huella se guarda: el valor crudo se entrega una vez y no se puede
    reconstruir a partir de lo almacenado.
    """
    token = secrets.token_urlsafe(_REFRESH_BYTES)
    return token, hashlib.sha256(token.encode("utf-8")).hexdigest()
