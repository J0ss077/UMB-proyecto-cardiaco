"""@requirement RF-01

Escritura de los eventos auditables de la plataforma.

El registro guarda quién hizo qué, sobre qué entidad, desde qué IP y con qué
detalle. Un evento fallido no tiene actor demostrado, así que acepta un actor
nulo y conserva el detalle para reconstruir el intento.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.types.json import Json


async def record(
    conn: AsyncConnection,
    actor_user_id: UUID | None,
    action: str,
    entity: str | None = None,
    entity_id: UUID | None = None,
    ip: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Inserta un evento en ``audit_logs`` dentro de la transacción del llamador.

    ``details`` se adapta a JSONB con ``Json``: el esquema no fija los campos de
    cada acción y el detalle puede crecer sin una migración. No se confirma
    aquí: el llamador decide cuándo cerrar la transacción, y un fallo posterior
    no debe dejar el evento escrito a medias.
    """
    await conn.execute(
        "insert into audit_logs (actor_user_id, action, entity, entity_id, ip, details) "
        "values (%s, %s, %s, %s, %s, %s)",
        (
            actor_user_id,
            action,
            entity,
            entity_id,
            ip,
            Json(details) if details is not None else None,
        ),
    )
