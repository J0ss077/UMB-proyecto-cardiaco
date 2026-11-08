"""@requirement RF-04

Ingesta de lecturas enviadas por un dispositivo.

El dispositivo se autentica con una clave compartida, no con una sesión; la
compuerta de esa clave vive en el router y esta capa supone que ya se superó.
La lectura se guarda primero en bruto en ``raw_readings`` y después en
``readings`` con ``source='device'``: el flujo crudo conserva lo que el
dispositivo envió aunque la escritura relacional falle, porque perder el mensaje
original es peor que dejar un documento huérfano.

La deduplicación usa la pareja ``device_id`` y ``measured_at``. El documento
crudo se inserta con ``$setOnInsert``, de modo que un reintento no reescribe la
primera recepción, y la lectura relacional solo se inserta si no existe ya una
de dispositivo con esa pareja. La comprobación vive en la aplicación porque la
tabla no tiene una restricción única sobre la pareja.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from psycopg import AsyncConnection

from hta.audit import record
from hta.clinical.access import require_consent
from hta.clinical.readings import Reading, measured_at_utc
from hta.clinical.validation import plausibility
from hta.db.mongo import get_database

# Mensaje del rechazo cuando el paciente del cuerpo no tiene cuenta. Responde
# 422 y no 404 porque lo que no se puede procesar es el cuerpo de la petición,
# no una ruta inexistente.
UNKNOWN_PATIENT = "El paciente indicado no existe"

# Acción de auditoría del alta. El reintento no la repite: no crea un hecho
# nuevo y el documento crudo tampoco se reescribe.
AUDIT_ACTION = "reading.ingested"


class IngestPayload(BaseModel):
    """Cuerpo que envía un dispositivo de presión arterial.

    ``patient_id`` es el identificador de la cuenta del paciente, el mismo que
    publica el resto de la API; el de ``patient_profiles`` no sale del
    servidor. ``measured_at`` es opcional, pero sin él cada reintento recibe
    una marca distinta y no se puede reconocer como repetido. Un campo que el
    contrato no define responde 422: el cuerpo se conserva tal cual, sin
    adivinar extensiones.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    device_id: str = Field(min_length=1)
    patient_id: UUID
    systolic: int
    diastolic: int
    heart_rate: int | None = None
    measured_at: datetime | None = None


@dataclass(frozen=True)
class IngestOutcome:
    """Lectura guardada y si esta petición la creó.

    ``created`` es falso cuando la pareja de deduplicación ya existía: la ruta
    responde 200 y devuelve la lectura original, no la del reintento, para que
    las dos respuestas sean idénticas.
    """

    reading: Reading
    created: bool


async def _profile_id(conn: AsyncConnection, patient_id: UUID) -> UUID:
    """Resuelve la cuenta del paciente a su perfil, o rechaza con 422.

    El dispositivo no tiene un alcance que resolver: nombra al paciente en el
    cuerpo. Una cuenta inexistente, o una que no es de paciente, no tiene perfil
    y recibe el mismo 422.
    """
    row = await (
        await conn.execute(
            "select id from patient_profiles where user_id = %s",
            (patient_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=422, detail=UNKNOWN_PATIENT)
    return row[0]


async def _stored_reading(conn: AsyncConnection, reading_id: UUID) -> Reading:
    """Devuelve la lectura guardada con el identificador de cuenta del paciente."""
    row = await (
        await conn.execute(
            "select r.id, p.user_id, r.systolic, r.diastolic, r.heart_rate, "
            "r.source, r.measured_at, r.validation_status "
            "from readings r join patient_profiles p on p.id = r.patient_id "
            "where r.id = %s",
            (reading_id,),
        )
    ).fetchone()
    return Reading(*row)


async def _existing_reading_id(
    conn: AsyncConnection,
    device_id: str,
    measured_at: datetime,
) -> UUID | None:
    """Devuelve la lectura de dispositivo de esa pareja, si ya existe.

    La consulta no filtra por paciente: la pareja ``device_id`` y
    ``measured_at`` es la clave de deduplicación del contrato. Se limita a una
    fila porque una base anterior a esta regla podría tener más de una.
    """
    row = await (
        await conn.execute(
            "select id from readings "
            "where source = 'device' and device_id = %s and measured_at = %s "
            "limit 1",
            (device_id, measured_at),
        )
    ).fetchone()
    return None if row is None else row[0]


def _store_raw(payload: IngestPayload, measured_at: datetime) -> None:
    """Inserta el mensaje recibido en ``raw_readings`` sin reescribirlo.

    La marca de recepción es del servidor y por eso no viene en el cuerpo. El
    ``$setOnInsert`` deja intacto el primer documento si el dispositivo
    reintenta: el flujo crudo conserva lo que llegó la primera vez. La marca de
    la medición se guarda normalizada a UTC porque es la que usa el índice
    ``device_time`` y la pareja de deduplicación.
    """
    get_database()["raw_readings"].update_one(
        {"device_id": payload.device_id, "measured_at": measured_at},
        {
            "$setOnInsert": {
                "patient_id": str(payload.patient_id),
                "device_id": payload.device_id,
                "systolic": payload.systolic,
                "diastolic": payload.diastolic,
                "heart_rate": payload.heart_rate,
                "measured_at": measured_at,
                "received_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )


async def ingest(conn: AsyncConnection, payload: IngestPayload) -> IngestOutcome:
    """Guarda la lectura de un dispositivo y dice si esta petición la creó.

    El orden es deliberado: se resuelve el paciente y se comprueba el
    consentimiento antes de escribir nada, después se guarda el documento crudo
    y solo entonces la lectura relacional. Una lectura fuera de rango no se
    descarta: se guarda con el estado que devuelve ``plausibility``. Si la
    escritura en PostgreSQL falla, el documento crudo permanece; la transacción
    se confirma una sola vez, cuando la lectura y su auditoría ya están
    escritas.
    """
    profile_id = await _profile_id(conn, payload.patient_id)
    await require_consent(conn, profile_id)
    measured_at = measured_at_utc(payload.measured_at)
    status = plausibility(payload.systolic, payload.diastolic)

    _store_raw(payload, measured_at)

    existing = await _existing_reading_id(conn, payload.device_id, measured_at)
    if existing is not None:
        return IngestOutcome(await _stored_reading(conn, existing), created=False)

    reading_id = (
        await (
            await conn.execute(
                "insert into readings "
                "(patient_id, systolic, diastolic, heart_rate, source, "
                "device_id, measured_at, validation_status) "
                "values (%s, %s, %s, %s, 'device', %s, %s, %s) returning id",
                (
                    profile_id,
                    payload.systolic,
                    payload.diastolic,
                    payload.heart_rate,
                    payload.device_id,
                    measured_at,
                    status,
                ),
            )
        ).fetchone()
    )[0]
    await record(
        conn,
        None,
        AUDIT_ACTION,
        entity="readings",
        entity_id=reading_id,
        details={"device_id": payload.device_id, "source": "device"},
    )
    await conn.commit()
    return IngestOutcome(await _stored_reading(conn, reading_id), created=True)
