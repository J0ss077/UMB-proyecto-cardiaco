"""@requirement RF-05

Alta manual de lecturas de presión arterial.

La lectura se guarda siempre que el paciente tenga consentimiento vigente: un
valor imposible no se descarta, se conserva con ``validation_status`` en
``out_of_range``. La lectura, su síntoma si viene y las dos filas de auditoría
se escriben en la misma transacción y se confirman una sola vez antes de
responder, para que el cliente vea el alta completa en cuanto llega el 201.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.clinical import symptoms
from hta.clinical.access import require_consent
from hta.clinical.validation import plausibility

# Mensajes del rechazo de una marca de tiempo inválida. La medición se puede
# registrar tarde, incluso de días anteriores, pero no antes de existir ni sin
# desplazamiento horario.
_NAIVE_MEASURED_AT = "La fecha de la medición debe incluir el desplazamiento horario"
_FUTURE_MEASURED_AT = "La fecha de la medición no puede estar en el futuro"


def measured_at_utc(measured_at: datetime | None) -> datetime:
    """Devuelve la marca de la medición en UTC, con ahora por omisión.

    Sin valor se toma el instante actual. Un valor sin zona horaria es ambiguo
    y se rechaza con 422; uno con desplazamiento se convierte a UTC. Una marca
    futura también se rechaza con 422, porque una medición que todavía no
    ocurrió no es un registro, y aceptarla abriría la puerta a datos inventados.
    El pasado no tiene límite: registrar una lectura de ayer es legítimo.
    """
    if measured_at is None:
        return datetime.now(timezone.utc)
    if measured_at.tzinfo is None:
        raise HTTPException(status_code=422, detail=_NAIVE_MEASURED_AT)
    normalized = measured_at.astimezone(timezone.utc)
    if normalized > datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail=_FUTURE_MEASURED_AT)
    return normalized


async def create(
    conn: AsyncConnection,
    profile_id: UUID,
    actor_id: UUID,
    systolic: int,
    diastolic: int,
    heart_rate: int | None,
    measured_at: datetime | None,
    symptom: symptoms.SymptomInput | None,
) -> UUID:
    """Guarda una lectura manual y devuelve su identificador.

    Comprueba el consentimiento vigente antes de insertar, clasifica la lectura
    con ``validation.plausibility`` y la escribe con ``source='manual'``. Si
    llega un síntoma, lo inserta y lo audita con su propio identificador. La
    lectura y las dos auditorías se confirman en un único ``commit`` al final:
    un fallo a mitad de camino revierte todo y no deja una lectura sin su
    síntoma ni una auditoría sin el hecho que la produjo.
    """
    await require_consent(conn, profile_id)
    measured = measured_at_utc(measured_at)
    status = plausibility(systolic, diastolic)

    reading_id = (
        await (
            await conn.execute(
                "insert into readings "
                "(patient_id, systolic, diastolic, heart_rate, source, "
                "measured_at, validation_status) "
                "values (%s, %s, %s, %s, 'manual', %s, %s) returning id",
                (profile_id, systolic, diastolic, heart_rate, measured, status),
            )
        ).fetchone()
    )[0]
    await record(
        conn,
        actor_id,
        "reading.created",
        entity="readings",
        entity_id=reading_id,
    )

    if symptom is not None:
        await symptoms.create(
            conn,
            profile_id,
            actor_id,
            symptom.free_text,
            symptom.mood,
        )

    await conn.commit()
    return reading_id
