"""@requirement RF-19

Directorio de pacientes visibles para la cuenta autenticada.

Es la primera consulta que hace el tablero del médico o del cuidador: qué
pacientes puede ver la sesión. El paciente se ve solo a sí mismo; el médico ve
los vinculados en ``patient_physician``; el cuidador ve los que lo autorizaron
en ``caregiver_links`` con alcance ``readings``, nunca los de alcance
``minimal``. El administrador no ve datos clínicos y recibe 403.

La consulta se pagina como el resto del contrato: ``total`` cuenta todas las
filas que pasan el filtro de la cuenta y la página se recorta en la base. La
respuesta publica el identificador de ``users``, nunca el de
``patient_profiles``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.auth.deps import FORBIDDEN, CurrentUser
from hta.clinical.access import READINGS_SCOPE

# Filtro por rol sobre ``patient_profiles p`` y el ``users u`` que lo acompaña.
# Se expresa con ``exists`` para que un paciente con varios vínculos no se
# duplique en la página ni en el total.
_PATIENT_FILTER = "p.user_id = %s"
_PHYSICIAN_FILTER = (
    "exists (select 1 from patient_physician pp "
    "where pp.patient_id = p.id and pp.physician_id = %s)"
)
_CAREGIVER_FILTER = (
    "exists (select 1 from caregiver_links cl "
    "where cl.patient_id = p.id and cl.caregiver_id = %s "
    "and cl.authorized_scope = %s)"
)


@dataclass(frozen=True)
class PatientSummary:
    """Paciente que la cuenta puede ver, con su identificador de cuenta."""

    user_id: UUID
    full_name: str
    birth_date: date | None


def _filter(user: CurrentUser) -> tuple[str, tuple[object, ...]]:
    """Devuelve la condición de alcance y sus parámetros, o rechaza con 403."""
    if user.role == "patient":
        return _PATIENT_FILTER, (user.user_id,)
    if user.role == "physician":
        return _PHYSICIAN_FILTER, (user.user_id,)
    if user.role == "caregiver":
        return _CAREGIVER_FILTER, (user.user_id, READINGS_SCOPE)
    raise HTTPException(status_code=403, detail=FORBIDDEN)


async def visible(
    conn: AsyncConnection,
    user: CurrentUser,
    limit: int,
    offset: int,
) -> tuple[list[PatientSummary], int]:
    """Devuelve una página del directorio y el total de pacientes visibles.

    El total se cuenta sobre el mismo filtro que la página, antes de recortar.
    El orden es por nombre y, como desempate, por identificador de cuenta, para
    que dos páginas consecutivas no repitan ni salten filas. Un paciente sin
    perfil no tiene nada que ver en el directorio y recibe el mismo 403 que un
    rol sin acceso: es una inconsistencia que no se anuncia distinto.
    """
    condition, params = _filter(user)
    total = await (
        await conn.execute(
            "select count(*) from patient_profiles p "
            f"where {condition}",
            params,
        )
    ).fetchone()
    if total[0] == 0 and user.role == "patient":
        # El paciente con perfil aparece siempre como su propia fila; un total
        # vacío significa que la cuenta no tiene perfil.
        raise HTTPException(status_code=403, detail=FORBIDDEN)

    rows = await (
        await conn.execute(
            "select u.id, u.full_name, p.birth_date "
            "from patient_profiles p join users u on u.id = p.user_id "
            f"where {condition} "
            "order by u.full_name, u.id limit %s offset %s",
            (*params, limit, offset),
        )
    ).fetchall()
    items = [
        PatientSummary(user_id=row[0], full_name=row[1], birth_date=row[2])
        for row in rows
    ]
    return items, total[0]
