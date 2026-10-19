"""@requirement RF-01

Endpoints HTTP de la sesión: inicio, rotación del refresco y cierre.

Cada endpoint abre una conexión del grupo compartido y llama al servicio
correspondiente; el servicio decide el error y escribe la auditoría.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from hta.auth import service
from hta.auth.service import TokenPair
from hta.db.pool import get_pool

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Credenciales que envía el cliente al iniciar sesión."""

    email: str
    password: str


class RefreshRequest(BaseModel):
    """Token de refresco que el cliente presenta para rotarlo o revocarlo."""

    refresh_token: str


def _client_ip(request: Request) -> str | None:
    """Devuelve la IP del cliente, o ``None`` si la petición no la expone."""
    return request.client.host if request.client is not None else None


@router.post("/login", response_model=TokenPair)
async def login(body: LoginRequest, request: Request) -> TokenPair:
    """Inicia la sesión y entrega el par de tokens con el rol de la cuenta."""
    async with get_pool().connection() as conn:
        return await service.login(conn, body.email, body.password, _client_ip(request))


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, request: Request) -> TokenPair:
    """Rota el refresco y entrega un par nuevo, invalidando el presentado."""
    async with get_pool().connection() as conn:
        return await service.refresh(conn, body.refresh_token, _client_ip(request))


@router.post("/logout", status_code=204)
async def logout(body: RefreshRequest) -> None:
    """Cierra la sesión revocando el token de refresco recibido."""
    async with get_pool().connection() as conn:
        await service.logout(conn, body.refresh_token)
