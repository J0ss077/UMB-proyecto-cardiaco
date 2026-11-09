"""@requirement RF-24

Alta, consulta y respuesta de las consultas rápidas.

El paciente escribe y el médico vinculado responde. Escribir como paciente es
un dato clínico nuevo y exige consentimiento vigente; leer el historial no, igual
que las lecturas y los síntomas (ADR 0003). La respuesta del médico no se
condiciona al consentimiento: es continuidad de la atención de una consulta que
el paciente ya envió, como las transiciones de las alertas.

La consulta va dirigida al médico que lleva más tiempo vinculado al paciente.
Lleva la última lectura válida del paciente en el momento del envío, para que el
médico vea el dato que motivó el mensaje. La auditoría nombra el evento y la
consulta, nunca el texto.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.auth.deps import FORBIDDEN, CurrentUser
from hta.clinical.access import patient_profile_id, require_consent
from hta.consultations.schemas import CheckupRequest, ConsultationRequest, MeetRequest

NOT_FOUND = "La consulta no existe"
NO_PHYSICIAN = "Aún no tienes un médico asignado"
ALREADY_COMPLETED = "La consulta ya fue completada"
MEET_FIRST = "Primero envía el enlace de Meet"
MEET_ALREADY = "El enlace de Meet ya fue enviado"
COMMENTS_ONLY = "Esta consulta es solo de comentarios"

NO_PHONE = "Agrega tu teléfono en tu perfil para compartirlo"

Status = Literal["in_review", "pending", "completed"]

_COLUMNS = (
    "t.id, pu.id, pu.full_name, t.physician_id, du.full_name, t.message, t.response, "
    "t.status, t.created_at, t.responded_at, t.reason, t.onset, t.medications, t.urgent, "
    "t.wants_meet, t.contact_phone, t.meet_url, t.checkup_general, t.checkup_pressure, "
    "t.checkup_symptoms, t.checkup_conduct, r.systolic, r.diastolic, r.measured_at"
)
_FROM = (
    "from teleconsultations t "
    "join patient_profiles pp on pp.id = t.patient_id "
    "join users pu on pu.id = pp.user_id "
    "join users du on du.id = t.physician_id "
    "left join readings r on r.id = t.reading_id "
)


@dataclass(frozen=True)
class ReadingRef:
    systolic: int
    diastolic: int
    measured_at: datetime


@dataclass(frozen=True)
class Consultation:
    id: UUID
    patient_id: UUID
    patient_name: str
    physician_id: UUID
    physician_name: str
    message: str | None
    response: str | None
    status: str
    created_at: datetime
    responded_at: datetime | None
    reason: str | None
    onset: str | None
    medications: str | None
    urgent: bool
    wants_meet: bool
    contact_phone: str | None
    meet_url: str | None
    checkup_general: str | None
    checkup_pressure: str | None
    checkup_symptoms: str | None
    checkup_conduct: str | None
    reading: ReadingRef | None


@dataclass(frozen=True)
class Recipient:
    id: UUID
    full_name: str


def _from_row(row: tuple) -> Consultation:
    reading = None if row[21] is None else ReadingRef(row[21], row[22], row[23])
    return Consultation(*row[:21], reading=reading)


async def _get(conn: AsyncConnection, consultation_id: UUID) -> Consultation:
    row = await (
        await conn.execute(f"select {_COLUMNS} {_FROM} where t.id = %s", (consultation_id,))
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return _from_row(row)


async def list_recipients(conn: AsyncConnection, user: CurrentUser) -> list[Recipient]:
    """Médicos a los que el paciente puede escribirle, del más antiguo al más reciente."""
    profile = await patient_profile_id(conn, user)
    rows = await (
        await conn.execute(
            "select u.id, u.full_name from patient_physician pp join users u on u.id = pp.physician_id "
            "where pp.patient_id = %s and u.active order by pp.assigned_at, u.id",
            (profile,),
        )
    ).fetchall()
    return [Recipient(id=row[0], full_name=row[1]) for row in rows]


async def create(conn: AsyncConnection, user: CurrentUser, request: ConsultationRequest) -> Consultation:
    """Registra la consulta del paciente y la dirige al médico elegido.

    Sin médico elegido va al que lleva más tiempo vinculado. El elegido debe estar
    vinculado al paciente: cualquier otra cuenta responde 403 con el mismo mensaje
    que un paciente fuera de alcance. Compartir el teléfono copia el del perfil.
    """
    profile = await patient_profile_id(conn, user)
    await require_consent(conn, profile)

    if request.physician_id is not None:
        linked = await (
            await conn.execute(
                "select physician_id from patient_physician where patient_id = %s and physician_id = %s",
                (profile, request.physician_id),
            )
        ).fetchone()
        if linked is None:
            raise HTTPException(status_code=403, detail=FORBIDDEN)
        physician_id = linked[0]
    else:
        first = await (
            await conn.execute(
                "select physician_id from patient_physician where patient_id = %s "
                "order by assigned_at, physician_id limit 1",
                (profile,),
            )
        ).fetchone()
        if first is None:
            raise HTTPException(status_code=409, detail=NO_PHYSICIAN)
        physician_id = first[0]

    contact_phone = None
    if request.share_phone:
        phone = await (
            await conn.execute("select phone from patient_profiles where id = %s", (profile,))
        ).fetchone()
        if phone is None or not phone[0]:
            raise HTTPException(status_code=409, detail=NO_PHONE)
        contact_phone = phone[0]

    reading = await (
        await conn.execute(
            "select id from readings where patient_id = %s and validation_status = 'valid' "
            "order by measured_at desc limit 1",
            (profile,),
        )
    ).fetchone()

    consultation_id = (
        await (
            await conn.execute(
                "insert into teleconsultations "
                "(patient_id, physician_id, mode, status, message, reading_id, reason, onset, medications, urgent, wants_meet, contact_phone) "
                "values (%s, %s, 'async', 'in_review', %s, %s, %s, %s, %s, false, %s, %s) returning id",
                (
                    profile,
                    physician_id,
                    request.message,
                    None if reading is None else reading[0],
                    request.reason,
                    request.onset,
                    request.medications,
                    request.wants_meet,
                    contact_phone,
                ),
            )
        ).fetchone()
    )[0]
    await record(conn, user.user_id, "consultation.created", entity="teleconsultations", entity_id=consultation_id)
    await conn.commit()
    return await _get(conn, consultation_id)


async def list_for(
    conn: AsyncConnection,
    user: CurrentUser,
    patient_id: UUID | None,
    status: Status | None,
    limit: int,
    offset: int,
) -> tuple[list[Consultation], int]:
    """Lista las consultas de la cuenta, de la más reciente a la más vieja.

    El paciente ve las propias; el médico, las dirigidas a él. Cualquier otro
    rol, o un paciente que pide las de otra persona, recibe 403.
    """
    where: list[str] = []
    params: list[object] = []
    if user.role == "patient":
        profile = await patient_profile_id(conn, user, patient_id)
        where.append("t.patient_id = %s")
        params.append(profile)
    elif user.role == "physician":
        where.append("t.physician_id = %s")
        params.append(user.user_id)
        if patient_id is not None:
            where.append("pu.id = %s")
            params.append(patient_id)
    else:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    if status is not None:
        where.append("t.status = %s")
        params.append(status)

    clause = " and ".join(where)
    total = (
        await (await conn.execute(f"select count(*) {_FROM} where {clause}", params)).fetchone()
    )[0]
    rows = await (
        await conn.execute(
            f"select {_COLUMNS} {_FROM} where {clause} "
            "order by t.created_at desc, t.id limit %s offset %s",
            (*params, limit, offset),
        )
    ).fetchall()
    return [_from_row(row) for row in rows], total


async def _lock(conn: AsyncConnection, user: CurrentUser, consultation_id: UUID) -> tuple[str, bool]:
    row = await (
        await conn.execute(
            "select physician_id, status, wants_meet from teleconsultations where id = %s for update",
            (consultation_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    if row[0] != user.user_id:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return row[1], row[2]


async def send_meet(conn: AsyncConnection, user: CurrentUser, consultation_id: UUID, body: MeetRequest) -> Consultation:
    """Envía el enlace cuando el paciente pidió Meet y deja la consulta pendiente."""
    status, wants_meet = await _lock(conn, user, consultation_id)
    if status == "completed":
        raise HTTPException(status_code=409, detail=ALREADY_COMPLETED)
    if not wants_meet:
        raise HTTPException(status_code=409, detail=COMMENTS_ONLY)
    if status != "in_review":
        raise HTTPException(status_code=409, detail=MEET_ALREADY)

    await conn.execute(
        "update teleconsultations set meet_url = %s, status = 'pending' where id = %s",
        (body.meet_url, consultation_id),
    )
    await record(conn, user.user_id, "consultation.meet_sent", entity="teleconsultations", entity_id=consultation_id)
    await conn.commit()
    return await _get(conn, consultation_id)


async def complete(conn: AsyncConnection, user: CurrentUser, consultation_id: UUID, body: CheckupRequest) -> Consultation:
    """Cierra la consulta con el formato y el comentario escritos por el médico.

    Si el paciente pidió Meet, el enlace ya tiene que estar enviado. Si pidió solo
    comentarios, se cierra desde la revisión.
    """
    status, wants_meet = await _lock(conn, user, consultation_id)
    if status == "completed":
        raise HTTPException(status_code=409, detail=ALREADY_COMPLETED)
    if wants_meet and status != "pending":
        raise HTTPException(status_code=409, detail=MEET_FIRST)
    if not wants_meet and status != "in_review":
        raise HTTPException(status_code=409, detail=ALREADY_COMPLETED)

    await conn.execute(
        "update teleconsultations set response = %s, checkup_general = %s, checkup_pressure = %s, "
        "checkup_symptoms = %s, checkup_conduct = %s, status = 'completed', responded_at = now() "
        "where id = %s",
        (
            body.response,
            body.checkup_general,
            body.checkup_pressure,
            body.checkup_symptoms,
            body.checkup_conduct,
            consultation_id,
        ),
    )
    await record(conn, user.user_id, "consultation.completed", entity="teleconsultations", entity_id=consultation_id)
    await conn.commit()
    return await _get(conn, consultation_id)
