"""@requirement RF-21

Registro y consulta de síntomas y estado de ánimo del paciente.

Un síntoma es un texto, un estado de ánimo o ambos; un objeto vacío no se
acepta. La fila cuelga del perfil y no de la lectura: ``symptoms_mood`` no
declara llave foránea hacia ``readings`` y este módulo no inventa esa relación.
La inserción y su auditoría viven en la transacción del llamador; el alta de
lectura las confirma junto con la lectura, y el alta suelta confirma al final.

La consulta devuelve la página de síntomas del perfil con el identificador de
la cuenta y sin exigir consentimiento: es parte de la historia clínica que el
médico debe poder leer.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.clinical.access import require_consent

# Mensaje del rechazo por un síntoma sin contenido. El cliente que envía un
# objeto vacío recibe 422 y no se escribe ninguna fila.
EMPTY_SYMPTOM = "El síntoma necesita un texto o un estado de ánimo"


@dataclass(frozen=True)
class SymptomInput:
    """Contenido de un síntoma que acompaña a una lectura.

    Es la forma que el router entrega al servicio: los dos campos son
    opcionales y la regla de contenido decide si el objeto representa un
    síntoma.
    """

    free_text: str | None = None
    mood: str | None = None


@dataclass(frozen=True)
class Symptom:
    """Síntoma publicado en un listado, con el identificador de la cuenta."""

    id: UUID
    patient_id: UUID
    free_text: str | None
    mood: str | None
    recorded_at: datetime


def has_content(free_text: str | None, mood: str | None) -> bool:
    """Indica si al menos uno de los dos campos trae texto visible.

    Los espacios no cuentan: un objeto con cadenas vacías o solo con espacios
    es tan vacío como ``{}`` y no representa un síntoma.
    """
    return bool((free_text or "").strip()) or bool((mood or "").strip())


def _normalized(value: str | None) -> str | None:
    """Quita los espacios de los extremos y convierte el vacío en ``None``."""
    return (value or "").strip() or None


async def create(
    conn: AsyncConnection,
    profile_id: UUID,
    actor_id: UUID,
    free_text: str | None,
    mood: str | None,
) -> UUID:
    """Inserta el síntoma y su auditoría sin confirmar la transacción.

    La confirman quienes la llaman, para que el alta de lectura escriba la
    lectura, el síntoma y las dos filas de auditoría en una sola transacción.
    Un síntoma sin contenido se rechaza con 422 antes de tocar la base.
    """
    if not has_content(free_text, mood):
        raise HTTPException(status_code=422, detail=EMPTY_SYMPTOM)

    symptom_id = (
        await (
            await conn.execute(
                "insert into symptoms_mood (patient_id, free_text, mood) "
                "values (%s, %s, %s) returning id",
                (profile_id, _normalized(free_text), _normalized(mood)),
            )
        ).fetchone()
    )[0]
    await record(
        conn,
        actor_id,
        "symptom.created",
        entity="symptoms_mood",
        entity_id=symptom_id,
    )
    return symptom_id


async def register(
    conn: AsyncConnection,
    profile_id: UUID,
    actor_id: UUID,
    free_text: str | None,
    mood: str | None,
) -> UUID:
    """Registra un síntoma suelto y confirma la transacción antes de responder.

    Es el camino del endpoint ``POST /api/symptoms``: comprueba el
    consentimiento vigente, inserta el síntoma con su auditoría y confirma una
    sola vez. La conexión se cierra después de enviar la respuesta, así que sin
    esta confirmación el cliente podría no ver su propio registro.
    """
    await require_consent(conn, profile_id)
    symptom_id = await create(conn, profile_id, actor_id, free_text, mood)
    await conn.commit()
    return symptom_id


async def list_for(
    conn: AsyncConnection,
    profile_id: UUID,
    limit: int,
    offset: int,
) -> tuple[list[Symptom], int]:
    """Devuelve una página de los síntomas del perfil y el total.

    El total cuenta todas las filas del perfil antes de recortar la página. El
    orden es por ``recorded_at`` descendente y, como desempate, por
    identificador, para que dos páginas consecutivas sean estables.
    """
    total = await (
        await conn.execute(
            "select count(*) from symptoms_mood where patient_id = %s",
            (profile_id,),
        )
    ).fetchone()
    rows = await (
        await conn.execute(
            "select s.id, p.user_id, s.free_text, s.mood, s.recorded_at "
            "from symptoms_mood s "
            "join patient_profiles p on p.id = s.patient_id "
            "where s.patient_id = %s "
            "order by s.recorded_at desc, s.id desc limit %s offset %s",
            (profile_id, limit, offset),
        )
    ).fetchall()
    items = [Symptom(*row) for row in rows]
    return items, total[0]
