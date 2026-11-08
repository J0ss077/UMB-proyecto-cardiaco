"""@requirement RF-19

Alta manual, consulta paginada y resumen de la ventana domiciliaria de las
lecturas de presión arterial.

La lectura se guarda siempre que el paciente tenga consentimiento vigente: un
valor imposible no se descarta, se conserva con ``validation_status`` en
``out_of_range``. La lectura, su síntoma si viene y las dos filas de auditoría
se escriben en la misma transacción y se confirman una sola vez antes de
responder, para que el cliente vea el alta completa en cuanto llega el 201.

La consulta devuelve la historia clínica con el identificador de la cuenta del
paciente y no exige consentimiento: el médico debe poder leer el registro. El
resumen de la ventana sí es análisis y su compuerta se consulta en la ruta.
"""

from __future__ import annotations

# El alta manual sigue declarando el requerimiento que ya cubría este módulo;
# la primera línea del docstring declara la consulta y el resumen que agrega
# esta tarea.
# @requirement RF-05

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.clinical import symptoms
from hta.clinical.access import require_consent
from hta.clinical.validation import (
    WINDOW_DAYS,
    WindowReading,
    WindowSummary,
    plausibility,
    summarize_window,
)

# Mensajes del rechazo de una marca de tiempo inválida. La medición se puede
# registrar tarde, incluso de días anteriores, pero no antes de existir ni sin
# desplazamiento horario.
_NAIVE_MEASURED_AT = "La fecha de la medición debe incluir el desplazamiento horario"
_FUTURE_MEASURED_AT = "La fecha de la medición no puede estar en el futuro"


@dataclass(frozen=True)
class Reading:
    """Lectura publicada en un listado, con el identificador de la cuenta."""

    id: UUID
    patient_id: UUID
    systolic: int
    diastolic: int
    heart_rate: int | None
    source: str
    measured_at: datetime
    validation_status: str


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


def filter_utc(value: datetime | None, parameter: str) -> datetime | None:
    """Normaliza a UTC un límite opcional del filtro de lecturas.

    Sin valor no hay límite. Una marca sin zona horaria es ambigua y se rechaza
    con 422, igual que en el alta; con desplazamiento se convierte a UTC. El
    filtro no limita el futuro: pedir un intervalo futuro solo devuelve vacío.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        raise HTTPException(
            status_code=422,
            detail=f"El límite '{parameter}' debe incluir el desplazamiento horario",
        )
    return value.astimezone(timezone.utc)


async def list_for(
    conn: AsyncConnection,
    profile_id: UUID,
    since: datetime | None,
    until: datetime | None,
    limit: int,
    offset: int,
) -> tuple[list[Reading], int]:
    """Devuelve una página de las lecturas del perfil y el total filtrado.

    ``since`` y ``until`` son inclusivos y llegan ya en UTC. El total cuenta
    todas las filas del perfil dentro del intervalo, antes de recortar la
    página. El orden es por ``measured_at`` descendente y, como desempate, por
    identificador, para que dos páginas consecutivas sean estables.
    """
    condition = "r.patient_id = %s"
    params: list[Any] = [profile_id]
    if since is not None:
        condition += " and r.measured_at >= %s"
        params.append(since)
    if until is not None:
        condition += " and r.measured_at <= %s"
        params.append(until)

    total = await (
        await conn.execute(
            "select count(*) from readings r "
            f"where {condition}",
            params,
        )
    ).fetchone()
    rows = await (
        await conn.execute(
            "select r.id, p.user_id, r.systolic, r.diastolic, r.heart_rate, "
            "r.source, r.measured_at, r.validation_status "
            "from readings r join patient_profiles p on p.id = r.patient_id "
            f"where {condition} "
            "order by r.measured_at desc, r.id desc limit %s offset %s",
            (*params, limit, offset),
        )
    ).fetchall()
    items = [Reading(*row) for row in rows]
    return items, total[0]


async def window_summary(
    conn: AsyncConnection,
    profile_id: UUID,
) -> WindowSummary:
    """Resume las lecturas del perfil dentro de la ventana de siete días.

    Toma una sola vez el instante final para que el intervalo publicado y el
    filtrado sean el mismo. Agrupa por fecha UTC, acota ambas orillas del
    intervalo y delega la regla en ``validation.summarize_window``, que descarta
    el primer día y decide la suficiencia. La compuerta de consentimiento no se
    consulta aquí: es una decisión de la ruta, porque el registro en bruto se
    lee sin ella y el resumen no.
    """
    window_end = datetime.now(timezone.utc)
    window_start = window_end - timedelta(days=WINDOW_DAYS)
    rows = await (
        await conn.execute(
            "select (r.measured_at at time zone 'utc')::date, r.systolic, "
            "r.diastolic, r.validation_status "
            "from readings r "
            "where r.patient_id = %s "
            "and r.measured_at >= %s and r.measured_at <= %s",
            (profile_id, window_start, window_end),
        )
    ).fetchall()
    window = [
        WindowReading(
            day=row[0],
            systolic=row[1],
            diastolic=row[2],
            validation_status=row[3],
        )
        for row in rows
    ]
    return summarize_window(window, window_start, window_end)


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
