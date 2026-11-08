"""@requirement RF-02

Endpoints HTTP de cuentas: registro público, cambio de rol, desactivación y
listado administrativo.

El registro es la única ruta abierta: las demás exigen una sesión con rol de
administrador. La conexión la resuelve ``auth.deps.get_conn`` y la comparten la
dependencia de autorización y el endpoint.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict, Field

from hta.accounts import service
from hta.auth.deps import CurrentUser, get_conn, require_role

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

# Página por omisión del listado, máximo que acepta una petición y mínimo de
# ambos parámetros. El máximo evita que una petición se lleve la tabla entera.
DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class RegisterRequest(BaseModel):
    """Datos del registro público de un paciente.

    El modelo no declara ``role`` y rechaza los campos desconocidos: un cliente
    no puede elegir el rol de la cuenta que crea. El rol lo fija el servicio.
    """

    model_config = ConfigDict(extra="forbid")

    email: str
    password: str = Field(min_length=1)
    full_name: str
    birth_date: date


class RegisteredAccount(BaseModel):
    """Identificador de la cuenta recién creada."""

    model_config = ConfigDict(frozen=True)

    id: UUID


class RoleRequest(BaseModel):
    """Rol nuevo que se aplica a una cuenta."""

    role: str


class AccountSummary(BaseModel):
    """Datos de una cuenta que ve quien administra el sistema."""

    model_config = ConfigDict(frozen=True)

    id: UUID
    email: str
    full_name: str
    role: str
    active: bool


class PaginatedAccounts(BaseModel):
    """Envoltura de los listados: la página de cuentas y el total de filas.

    Es la forma que el contrato fija para todo listado: ``items`` lleva los
    elementos y ``total`` las filas que existen, para que el cliente sepa
    cuántas páginas faltan sin pedir una de más.
    """

    model_config = ConfigDict(frozen=True)

    items: list[AccountSummary]
    total: int


@router.post("/register", status_code=201, response_model=RegisteredAccount)
async def register(
    body: RegisterRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
) -> RegisteredAccount:
    """Crea una cuenta de paciente y su perfil a partir del cuerpo recibido."""
    user_id = await service.register_patient(
        conn,
        body.email,
        body.password,
        body.full_name,
        body.birth_date,
    )
    return RegisteredAccount(id=user_id)


@router.patch("/{user_id}/role", status_code=204)
async def change_role(
    user_id: UUID,
    body: RoleRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> None:
    """Cambia el rol de la cuenta indicada; solo un administrador puede hacerlo."""
    await service.set_role(conn, actor.user_id, user_id, body.role)


@router.post("/{user_id}/deactivate", status_code=204)
async def deactivate(
    user_id: UUID,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    actor: Annotated[CurrentUser, Depends(require_role("admin"))],
) -> None:
    """Seudonimiza la cuenta indicada sin borrar su historial clínico."""
    await service.deactivate(conn, actor.user_id, user_id)


@router.get("", response_model=PaginatedAccounts)
async def list_accounts(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    _admin: Annotated[CurrentUser, Depends(require_role("admin"))],
    limit: Annotated[int, Query(ge=0, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedAccounts:
    """Lista las cuentas ordenadas por correo; solo para administradores.

    Devuelve una página de la envoltura del contrato. ``total`` cuenta todas las
    filas de ``users`` antes de recortar la página, de modo que el cliente sepa
    cuántas faltan; ``limit`` y ``offset`` se aplican en la consulta y no en
    memoria.
    """
    (total,) = await (
        await conn.execute("select count(*) from users")
    ).fetchone()
    rows = await (
        await conn.execute(
            "select id, email, full_name, role, active from users "
            "order by email limit %s offset %s",
            (limit, offset),
        )
    ).fetchall()
    items = [
        AccountSummary(
            id=row[0],
            email=row[1],
            full_name=row[2],
            role=row[3],
            active=row[4],
        )
        for row in rows
    ]
    return PaginatedAccounts(items=items, total=total)
