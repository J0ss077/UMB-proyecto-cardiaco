"""@requirement RF-19

Directorio de pacientes visibles para la cuenta autenticada.

Es la primera consulta que hace el tablero del médico o del cuidador: qué
pacientes puede ver la sesión. La resolución de alcance no se reimplementa aquí:
la decide ``clinical.access.visible_patient_profiles``, la misma función que
usan los listados de lecturas, síntomas y alertas. Así el directorio no puede
discrepar mañana de las demás rutas clínicas.

La consulta se pagina como el resto del contrato: ``total`` cuenta todas las
filas que pasan el filtro de la cuenta y la página se recorta en la base. La
respuesta publica el identificador de ``users``, nunca el de
``patient_profiles``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from psycopg import AsyncConnection

from hta.auth.deps import CurrentUser
from hta.clinical import access


@dataclass(frozen=True)
class PatientSummary:
    """Paciente que la cuenta puede ver, con su identificador de cuenta."""

    user_id: UUID
    full_name: str
    birth_date: date | None


async def visible(
    conn: AsyncConnection,
    user: CurrentUser,
    limit: int,
    offset: int,
) -> tuple[list[PatientSummary], int]:
    """Devuelve una página del directorio y el total de pacientes visibles.

    El conjunto de perfiles lo entrega ``access.visible_patient_profiles``: el
    paciente obtiene el propio, el médico todos los vinculados y el cuidador los
    autorizados con alcance ``readings``. El administrador y una cuenta de
    paciente sin perfil reciben el 403 del resolutor. El total se cuenta sobre
    ese mismo conjunto, antes de recortar, y el orden es por nombre y, como
    desempate, por identificador de cuenta, para que dos páginas consecutivas no
    repitan ni salten filas.
    """
    profile_ids = await access.visible_patient_profiles(conn, user)
    total = await (
        await conn.execute(
            "select count(*) from patient_profiles p where p.id = any(%s)",
            (profile_ids,),
        )
    ).fetchone()
    rows = await (
        await conn.execute(
            "select u.id, u.full_name, p.birth_date "
            "from patient_profiles p join users u on u.id = p.user_id "
            "where p.id = any(%s) "
            "order by u.full_name, u.id limit %s offset %s",
            (profile_ids, limit, offset),
        )
    ).fetchall()
    items = [
        PatientSummary(user_id=row[0], full_name=row[1], birth_date=row[2])
        for row in rows
    ]
    return items, total[0]
