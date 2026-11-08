"""@requirement RF-16

Listado, consulta y transiciones humanas de las alertas clínicas.

Una alerta nace de una regla de umbrales que no vive en este módulo: aquí no se
crea ninguna alerta, porque el alta pertenece al motor de alertas de un
incremento posterior. Este módulo solo lee las que existen y permite que una
persona las recorra. La máquina de estados es la única autoridad sobre una
transición: de ``open`` se pasa a ``acknowledged``, ``validated`` o
``dismissed``; de ``acknowledged`` a ``validated`` o ``dismissed``; los estados
finales no admiten ninguna otra. El software nunca cierra una alerta por su
cuenta: cada cambio de estado lo firma una cuenta autenticada y queda en la
auditoría.

El alcance es el mismo de las lecturas y se resuelve con el resolutor único de
``clinical.access``: el paciente ve las propias, el médico las de sus pacientes
vinculados, el cuidador las de los autorizados con alcance ``readings`` y el
administrador ninguna. Una alerta se lee con ``for update`` antes de
transicionar, de modo que dos personas que actúan a la vez no ganan las dos.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.auth.deps import CurrentUser
from hta.clinical import access

# Mensaje del rechazo por una alerta inexistente. Es un 404 y no un 403 porque
# el identificador no corresponde a ninguna fila, no a una fuera de alcance.
NOT_FOUND = "La alerta no existe"

# Mensaje del descarte sin motivo. Sin nota no hay forma de reconstruir por qué
# se descartó una alerta, así que la operación se rechaza con 422.
NOTE_REQUIRED = "El descarte de la alerta necesita una nota"

# Estados destino de cada acción publicada y acción de auditoría asociada.
ACTION_TARGET = {
    "acknowledge": "acknowledged",
    "validate": "validated",
    "dismiss": "dismissed",
}
_AUDIT_ACTION = {
    "acknowledge": "alert.acknowledged",
    "validate": "alert.validated",
    "dismiss": "alert.dismissed",
}

# Transiciones permitidas. Los estados finales no aparecen en el mapa: una
# alerta validada o descartada no vuelve a moverse. El software no tiene otra
# vía para cerrar una alerta que una de estas transiciones firmadas.
ALLOWED_TRANSITIONS = {
    "open": frozenset({"acknowledged", "validated", "dismissed"}),
    "acknowledged": frozenset({"validated", "dismissed"}),
    "validated": frozenset(),
    "dismissed": frozenset(),
}

# Mensaje del 409. Nombra el estado actual, que es lo que el cliente necesita
# para refrescar la pantalla sin adivinar qué hizo otra persona.
_TRANSITION_REJECTED = (
    "La alerta está en estado '{current}' y no puede pasar al estado '{target}'"
)


@dataclass(frozen=True)
class Alert:
    """Alerta publicada en un listado o en una consulta individual.

    ``patient_id`` es el identificador de la cuenta del paciente, nunca el de
    ``patient_profiles``: el perfil no sale del servidor. ``validated_by`` es
    la cuenta que validó y queda nula mientras la alerta no esté validada.
    """

    id: UUID
    patient_id: UUID
    type: str
    severity: str
    status: str
    note: str | None
    created_at: datetime
    validated_by: UUID | None
    validated_at: datetime | None


_SELECT = (
    "select a.id, p.user_id, a.type, a.severity, a.status, a.note, "
    "a.created_at, a.validated_by, a.validated_at "
    "from alerts a join patient_profiles p on p.id = a.patient_id "
)


async def _fetch(
    conn: AsyncConnection,
    alert_id: UUID,
    *,
    lock: bool,
) -> Alert | None:
    """Devuelve la alerta con el identificador de cuenta de su paciente.

    Con ``lock`` la fila se lee con ``for update`` y queda bloqueada hasta el
    final de la transacción: dos transiciones simultáneas sobre la misma
    alerta se serializan y solo la primera encuentra el estado que esperaba.
    """
    query = f"{_SELECT}where a.id = %s"
    if lock:
        query += " for update of a"
    row = await (await conn.execute(query, (alert_id,))).fetchone()
    return None if row is None else Alert(*row)


async def _page(
    conn: AsyncConnection,
    profile_id: UUID,
    status: str | None,
    severity: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Alert], int]:
    """Devuelve una página de alertas del perfil y el total filtrado."""
    condition = "a.patient_id = %s"
    params: list[Any] = [profile_id]
    if status is not None:
        condition += " and a.status = %s"
        params.append(status)
    if severity is not None:
        condition += " and a.severity = %s"
        params.append(severity)

    total = await (
        await conn.execute(
            "select count(*) from alerts a "
            f"where {condition}",
            params,
        )
    ).fetchone()
    rows = await (
        await conn.execute(
            f"{_SELECT}where {condition} "
            "order by a.created_at desc, a.id desc limit %s offset %s",
            (*params, limit, offset),
        )
    ).fetchall()
    return [Alert(*row) for row in rows], total[0]


async def list_for(
    conn: AsyncConnection,
    user: CurrentUser,
    patient_id: UUID | None,
    status: str | None,
    severity: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Alert], int]:
    """Devuelve una página de las alertas visibles para la cuenta.

    ``patient_id`` es el identificador de la cuenta del paciente, no el del
    perfil. Sin él, el paciente resuelve el propio; el médico y el cuidador
    deben indicarlo y reciben 403 si falta. El resolutor de ``access`` decide
    el alcance con la misma matriz de las lecturas y no se replica aquí.

    ``status`` y ``severity`` llegan ya validados contra los tipos enumerados
    por la ruta: un valor fuera de ellos responde 422 antes de llegar al
    servicio. ``total`` cuenta todas las alertas del filtro, antes de recortar
    la página; el orden es por ``created_at`` descendente y, como desempate,
    por identificador, para que dos páginas consecutivas sean estables.
    """
    profile_id = await access.patient_profile_id(conn, user, patient_id)
    return await _page(conn, profile_id, status, severity, limit, offset)


async def get_for(
    conn: AsyncConnection,
    alert_id: UUID,
    user: CurrentUser,
) -> Alert:
    """Devuelve una alerta que la cuenta puede ver.

    Una alerta inexistente responde 404. Una alerta de un paciente fuera del
    alcance de la cuenta responde 403 con ``Permiso denegado``, el mismo
    mensaje de cualquier otro rechazo de alcance.
    """
    alert = await _fetch(conn, alert_id, lock=False)
    if alert is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    await access.patient_profile_id(conn, user, alert.patient_id)
    return alert


async def transition(
    conn: AsyncConnection,
    alert_id: UUID,
    actor: CurrentUser,
    action: str,
    note: str | None,
) -> None:
    """Mueve una alerta a su estado siguiente y confirma antes de responder.

    ``action`` vale ``acknowledge``, ``validate`` o ``dismiss``. La fila se lee
    con ``for update``, se comprueba que el actor tenga acceso a su paciente con
    el resolutor único y se consulta la máquina de estados. Cualquier
    transición fuera del mapa responde 409 con un mensaje que nombra el estado
    actual. ``validate`` escribe ``validated_by`` y ``validated_at``; ``dismiss``
    exige una nota no vacía y la guarda; ``acknowledge`` solo cambia el estado.
    El actor queda en la auditoría con el identificador de la alerta y la nota,
    si la hay, en el detalle. El ``commit`` deja el hecho visible para la
    siguiente petición.
    """
    target = ACTION_TARGET.get(action)
    if target is None:
        raise ValueError(f"Acción de alerta desconocida: {action}")

    alert = await _fetch(conn, alert_id, lock=True)
    if alert is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    await access.patient_profile_id(conn, actor, alert.patient_id)

    if target not in ALLOWED_TRANSITIONS.get(alert.status, frozenset()):
        raise HTTPException(
            status_code=409,
            detail=_TRANSITION_REJECTED.format(
                current=alert.status,
                target=target,
            ),
        )

    normalized = (note or "").strip()
    if action == "dismiss" and not normalized:
        raise HTTPException(status_code=422, detail=NOTE_REQUIRED)

    if action == "validate":
        await conn.execute(
            "update alerts set status = %s, validated_by = %s, "
            "validated_at = now() where id = %s",
            (target, actor.user_id, alert_id),
        )
    elif action == "dismiss":
        await conn.execute(
            "update alerts set status = %s, note = %s where id = %s",
            (target, normalized, alert_id),
        )
    else:
        await conn.execute(
            "update alerts set status = %s where id = %s",
            (target, alert_id),
        )

    await record(
        conn,
        actor.user_id,
        _AUDIT_ACTION[action],
        entity="alerts",
        entity_id=alert_id,
        details={"note": normalized} if normalized else None,
    )
    await conn.commit()
