"""@requirement RF-02
@requirement RF-15
@requirement RF-27

Operación de la plataforma para el administrador: vínculos, umbrales y auditoría.

Ninguna consulta de este módulo devuelve lecturas, síntomas ni el cuerpo de una
alerta. El detalle de un evento clínico se omite a propósito. Las mutaciones
confirman su transacción antes de responder, igual que el servicio de cuentas.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection
from psycopg.types.json import Json

from hta.adminconsole.thresholds import threshold_problem
from hta.audit import record

_NOT_FOUND = "La cuenta no existe"
_LINK_NOT_FOUND = "El vínculo no existe"
_CONFIG_NOT_FOUND = "La configuración no existe"
_INACTIVE = "La cuenta está desactivada"
_NO_PROFILE = "La cuenta no tiene perfil de paciente"
_PATIENT_ROLE = "La cuenta del paciente no tiene rol de paciente"
_PHYSICIAN_ROLE = "La cuenta del médico no tiene rol de médico"
_CAREGIVER_ROLE = "La cuenta del cuidador no tiene rol de cuidador"
_PHYSICIAN_EXISTS = "Ese médico ya está asignado a este paciente"
_CAREGIVER_EXISTS = "Ese cuidador ya está autorizado para este paciente"
_UNKNOWN_SCOPE = "Alcance desconocido"
_UNKNOWN_RECIPIENT = "Destinatario desconocido"
_UNKNOWN_TOPIC = "Tipo de actividad desconocido"

# El primer tramo de ``action``, antes del punto, es el tipo que filtra la
# auditoría. La lista es cerrada para no aceptar un patrón arbitrario.
AUDIT_TOPICS = frozenset(
    {
        "auth",
        "accounts",
        "profile",
        "staff",
        "links",
        "consent",
        "reading",
        "symptom",
        "alert",
        "consultation",
        "alert_config",
    }
)

SCOPES = frozenset({"minimal", "readings"})
RECIPIENTS = frozenset({"patient", "caregiver", "physician"})

# El administrador consulta el rastro, pero no el contenido clínico que una
# acción pudo haber anotado. Estas acciones no entregan ``details``.
_WITHHELD_PREFIXES = ("reading.", "symptom.", "alert.", "consultation.", "ingest.")


@dataclass(frozen=True)
class PhysicianLink:
    patient_user_id: UUID
    patient_name: str
    physician_user_id: UUID
    physician_name: str
    assigned_at: datetime


@dataclass(frozen=True)
class CaregiverLink:
    id: UUID
    patient_user_id: UUID
    patient_name: str
    caregiver_user_id: UUID
    caregiver_name: str
    authorized_scope: str
    created_at: datetime


@dataclass(frozen=True)
class AlertConfigRow:
    id: UUID
    patient_user_id: UUID | None
    patient_name: str | None
    metric: str
    low_threshold: float | None
    high_threshold: float | None
    critical_low: float | None
    critical_high: float | None
    recipients: list[str]


@dataclass(frozen=True)
class AuditEvent:
    id: UUID
    actor_user_id: UUID | None
    actor_name: str | None
    action: str
    entity: str | None
    entity_id: UUID | None
    ip: str | None
    occurred_at: datetime
    details: dict[str, Any] | None
    details_withheld: bool


def _number(value: Decimal | int | float | None) -> float | None:
    return None if value is None else float(value)


def _withheld(action: str) -> bool:
    return action.startswith(_WITHHELD_PREFIXES)


async def _user(conn: AsyncConnection, user_id: UUID) -> tuple[str, bool]:
    row = await (
        await conn.execute("select role, active from users where id = %s", (user_id,))
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return row[0], row[1]


async def _require_active(conn: AsyncConnection, user_id: UUID, role: str, wrong_role: str) -> None:
    actual, active = await _user(conn, user_id)
    if actual != role:
        raise HTTPException(status_code=422, detail=wrong_role)
    if not active:
        raise HTTPException(status_code=409, detail=_INACTIVE)


async def _profile_id(conn: AsyncConnection, user_id: UUID) -> UUID:
    row = await (
        await conn.execute("select id from patient_profiles where user_id = %s", (user_id,))
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=422, detail=_NO_PROFILE)
    return row[0]


async def list_links(conn: AsyncConnection) -> tuple[list[PhysicianLink], list[CaregiverLink]]:
    """Devuelve médicos asignados y cuidadores autorizados, sin cifras clínicas."""
    physician_rows = await (
        await conn.execute(
            "select pu.id, pu.full_name, du.id, du.full_name, pp.assigned_at "
            "from patient_physician pp "
            "join patient_profiles p on p.id = pp.patient_id "
            "join users pu on pu.id = p.user_id "
            "join users du on du.id = pp.physician_id "
            "order by pu.full_name, du.full_name"
        )
    ).fetchall()
    caregiver_rows = await (
        await conn.execute(
            "select l.id, pu.id, pu.full_name, cu.id, cu.full_name, "
            "l.authorized_scope, l.created_at "
            "from caregiver_links l "
            "join patient_profiles p on p.id = l.patient_id "
            "join users pu on pu.id = p.user_id "
            "join users cu on cu.id = l.caregiver_id "
            "order by pu.full_name, cu.full_name"
        )
    ).fetchall()
    physicians = [
        PhysicianLink(
            patient_user_id=row[0],
            patient_name=row[1],
            physician_user_id=row[2],
            physician_name=row[3],
            assigned_at=row[4],
        )
        for row in physician_rows
    ]
    caregivers = [
        CaregiverLink(
            id=row[0],
            patient_user_id=row[1],
            patient_name=row[2],
            caregiver_user_id=row[3],
            caregiver_name=row[4],
            authorized_scope=row[5],
            created_at=row[6],
        )
        for row in caregiver_rows
    ]
    return physicians, caregivers


async def assign_physician(
    conn: AsyncConnection,
    actor: UUID,
    patient_user_id: UUID,
    physician_user_id: UUID,
) -> None:
    """Asigna un médico activo a un paciente que tiene perfil."""
    await _require_active(conn, patient_user_id, "patient", _PATIENT_ROLE)
    await _require_active(conn, physician_user_id, "physician", _PHYSICIAN_ROLE)
    profile_id = await _profile_id(conn, patient_user_id)
    existing = await (
        await conn.execute(
            "select 1 from patient_physician where patient_id = %s and physician_id = %s",
            (profile_id, physician_user_id),
        )
    ).fetchone()
    if existing is not None:
        raise HTTPException(status_code=409, detail=_PHYSICIAN_EXISTS)
    await conn.execute(
        "insert into patient_physician (patient_id, physician_id) values (%s, %s)",
        (profile_id, physician_user_id),
    )
    await record(
        conn,
        actor,
        "links.physician_assigned",
        entity="patient_physician",
        entity_id=physician_user_id,
        details={"patient_user_id": str(patient_user_id)},
    )
    await conn.commit()


async def remove_physician(
    conn: AsyncConnection,
    actor: UUID,
    patient_user_id: UUID,
    physician_user_id: UUID,
) -> None:
    """Quita la asignación de un médico. No borra historial clínico."""
    profile_id = await _profile_id(conn, patient_user_id)
    removed = await conn.execute(
        "delete from patient_physician where patient_id = %s and physician_id = %s",
        (profile_id, physician_user_id),
    )
    if removed.rowcount == 0:
        raise HTTPException(status_code=404, detail=_LINK_NOT_FOUND)
    await record(
        conn,
        actor,
        "links.physician_removed",
        entity="patient_physician",
        entity_id=physician_user_id,
        details={"patient_user_id": str(patient_user_id)},
    )
    await conn.commit()


async def authorize_caregiver(
    conn: AsyncConnection,
    actor: UUID,
    patient_user_id: UUID,
    caregiver_user_id: UUID,
    authorized_scope: str,
) -> UUID:
    """Autoriza a un cuidador con alcance ``minimal`` o ``readings``."""
    if authorized_scope not in SCOPES:
        raise HTTPException(status_code=422, detail=_UNKNOWN_SCOPE)
    await _require_active(conn, patient_user_id, "patient", _PATIENT_ROLE)
    await _require_active(conn, caregiver_user_id, "caregiver", _CAREGIVER_ROLE)
    profile_id = await _profile_id(conn, patient_user_id)
    existing = await (
        await conn.execute(
            "select 1 from caregiver_links where patient_id = %s and caregiver_id = %s",
            (profile_id, caregiver_user_id),
        )
    ).fetchone()
    if existing is not None:
        raise HTTPException(status_code=409, detail=_CAREGIVER_EXISTS)
    link_id = (
        await (
            await conn.execute(
                "insert into caregiver_links (patient_id, caregiver_id, authorized_scope) "
                "values (%s, %s, %s) returning id",
                (profile_id, caregiver_user_id, authorized_scope),
            )
        ).fetchone()
    )[0]
    await record(
        conn,
        actor,
        "links.caregiver_authorized",
        entity="caregiver_links",
        entity_id=link_id,
        details={"patient_user_id": str(patient_user_id), "authorized_scope": authorized_scope},
    )
    await conn.commit()
    return link_id


async def update_caregiver_scope(
    conn: AsyncConnection,
    actor: UUID,
    link_id: UUID,
    authorized_scope: str,
) -> None:
    """Cambia el alcance de un vínculo de cuidador que ya existe."""
    if authorized_scope not in SCOPES:
        raise HTTPException(status_code=422, detail=_UNKNOWN_SCOPE)
    updated = await conn.execute(
        "update caregiver_links set authorized_scope = %s where id = %s",
        (authorized_scope, link_id),
    )
    if updated.rowcount == 0:
        raise HTTPException(status_code=404, detail=_LINK_NOT_FOUND)
    await record(
        conn,
        actor,
        "links.caregiver_scope_changed",
        entity="caregiver_links",
        entity_id=link_id,
        details={"authorized_scope": authorized_scope},
    )
    await conn.commit()


async def revoke_caregiver(conn: AsyncConnection, actor: UUID, link_id: UUID) -> None:
    """Elimina la autorización del cuidador. El historial del paciente sigue."""
    removed = await conn.execute("delete from caregiver_links where id = %s", (link_id,))
    if removed.rowcount == 0:
        raise HTTPException(status_code=404, detail=_LINK_NOT_FOUND)
    await record(
        conn,
        actor,
        "links.caregiver_revoked",
        entity="caregiver_links",
        entity_id=link_id,
    )
    await conn.commit()


async def list_alert_config(conn: AsyncConnection) -> list[AlertConfigRow]:
    """Lista los umbrales. Los números no se editan por esta vía."""
    rows = await (
        await conn.execute(
            "select c.id, u.id, u.full_name, c.metric, c.low_threshold, "
            "c.high_threshold, c.critical_low, c.critical_high, c.recipients "
            "from alert_config c "
            "left join patient_profiles p on p.id = c.patient_id "
            "left join users u on u.id = p.user_id "
            "order by c.metric, u.full_name nulls first"
        )
    ).fetchall()
    return [
        AlertConfigRow(
            id=row[0],
            patient_user_id=row[1],
            patient_name=row[2],
            metric=row[3],
            low_threshold=_number(row[4]),
            high_threshold=_number(row[5]),
            critical_low=_number(row[6]),
            critical_high=_number(row[7]),
            recipients=list(row[8] or []),
        )
        for row in rows
    ]


def normalize_recipients(recipients: list[str]) -> list[str]:
    """Acepta solo paciente, cuidador y médico, sin repetidos."""
    seen: list[str] = []
    for recipient in recipients:
        if recipient not in RECIPIENTS:
            raise HTTPException(status_code=422, detail=_UNKNOWN_RECIPIENT)
        if recipient not in seen:
            seen.append(recipient)
    return seen


async def update_recipients(
    conn: AsyncConnection,
    actor: UUID,
    config_id: UUID,
    recipients: list[str],
) -> None:
    """Sustituye los destinatarios de una fila. Los umbrales no cambian."""
    cleaned = normalize_recipients(recipients)
    updated = await conn.execute(
        "update alert_config set recipients = %s where id = %s",
        (Json(cleaned), config_id),
    )
    if updated.rowcount == 0:
        raise HTTPException(status_code=404, detail=_CONFIG_NOT_FOUND)
    await record(
        conn,
        actor,
        "alert_config.recipients_updated",
        entity="alert_config",
        entity_id=config_id,
        details={"recipients": cleaned},
    )
    await conn.commit()


def _bounds(value: Decimal | int | float | None) -> float | None:
    return None if value is None else float(value)


async def update_thresholds(
    conn: AsyncConnection,
    actor: UUID,
    config_id: UUID,
    low: float | None,
    high: float | None,
    critical_low: float | None,
    critical_high: float | None,
) -> None:
    """Sustituye la banda de una métrica. Un nulo deja esa orilla sin aviso."""
    current = await (
        await conn.execute(
            "select metric, low_threshold, high_threshold, critical_low, critical_high "
            "from alert_config where id = %s",
            (config_id,),
        )
    ).fetchone()
    if current is None:
        raise HTTPException(status_code=404, detail=_CONFIG_NOT_FOUND)
    problem = threshold_problem(current[0], low, high, critical_low, critical_high)
    if problem is not None:
        raise HTTPException(status_code=422, detail=problem)
    await conn.execute(
        "update alert_config set low_threshold = %s, high_threshold = %s, "
        "critical_low = %s, critical_high = %s where id = %s",
        (low, high, critical_low, critical_high, config_id),
    )
    await record(
        conn,
        actor,
        "alert_config.thresholds_updated",
        entity="alert_config",
        entity_id=config_id,
        details={
            "previous": {
                "low_threshold": _bounds(current[1]),
                "high_threshold": _bounds(current[2]),
                "critical_low": _bounds(current[3]),
                "critical_high": _bounds(current[4]),
            },
            "new": {
                "low_threshold": low,
                "high_threshold": high,
                "critical_low": critical_low,
                "critical_high": critical_high,
            },
        },
    )
    await conn.commit()


async def list_audit(
    conn: AsyncConnection,
    action: str | None,
    topic: str | None,
    since: datetime | None,
    until: datetime | None,
    limit: int,
    offset: int,
) -> tuple[list[AuditEvent], int]:
    """Devuelve una página del rastro, del más reciente al más antiguo."""
    filters = ["true"]
    params: list[Any] = []
    if topic:
        if topic not in AUDIT_TOPICS:
            raise HTTPException(status_code=422, detail=_UNKNOWN_TOPIC)
        filters.append("split_part(a.action, '.', 1) = %s")
        params.append(topic)
    if action:
        filters.append("a.action = %s")
        params.append(action)
    if since is not None:
        filters.append("a.occurred_at >= %s")
        params.append(since)
    if until is not None:
        filters.append("a.occurred_at <= %s")
        params.append(until)
    where = " and ".join(filters)
    total = (
        await (
            await conn.execute(f"select count(*) from audit_logs a where {where}", params)
        ).fetchone()
    )[0]
    rows = await (
        await conn.execute(
            "select a.id, a.actor_user_id, u.full_name, a.action, a.entity, "
            "a.entity_id, a.ip, a.occurred_at, a.details "
            f"from audit_logs a left join users u on u.id = a.actor_user_id "
            f"where {where} order by a.occurred_at desc limit %s offset %s",
            [*params, limit, offset],
        )
    ).fetchall()
    events = []
    for row in rows:
        withheld = _withheld(row[3])
        events.append(
            AuditEvent(
                id=row[0],
                actor_user_id=row[1],
                actor_name=row[2],
                action=row[3],
                entity=row[4],
                entity_id=row[5],
                ip=row[6],
                occurred_at=row[7],
                details=None if withheld else row[8],
                details_withheld=withheld,
            )
        )
    return events, total
