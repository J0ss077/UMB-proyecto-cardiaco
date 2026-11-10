"""@requirement RF-02
@requirement RNF-09

Autorización de cuidadores por parte del médico vinculado al paciente.

El médico tratante es quien autoriza, cambia el alcance y revoca un vínculo de
cuidador, y es quien decide si el alcance es ``minimal`` o ``readings``. El
paciente puede ver quién tiene acceso a su historia y con qué alcance, pero no
puede crear, cambiar ni revocar el vínculo: una revocación por conveniencia o
por conflicto podría dejar sin atención una condición que lo necesita. El
administrador conserva la lectura del directorio para supervisión y perdió toda
mutación sobre estos vínculos.

Cada alta, cambio de alcance y revocación se audita con el actor, el vínculo y el
alcance, y la transacción se confirma antes de responder. El identificador de
paciente que viaja en la ruta y en la auditoría es el de ``users``; el de
``patient_profiles`` no sale del servidor.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.accounts.service import normalize_email
from hta.audit import record

# Los dos alcances que ya usan el esquema y el contrato. ``readings`` abre los
# datos clínicos; ``minimal`` solo acompaña.
SCOPES = frozenset({"minimal", "readings"})

_UNKNOWN_SCOPE = "Alcance desconocido"
_NOT_FOUND = "La cuenta no existe"
_INACTIVE = "La cuenta está desactivada"
_CAREGIVER_ROLE = "La cuenta del cuidador no tiene rol de cuidador"
_CAREGIVER_EXISTS = "Ese cuidador ya está autorizado para este paciente"
_LINK_NOT_FOUND = "El vínculo no existe"


@dataclass(frozen=True)
class CaregiverLink:
    """Vínculo de cuidador con los datos que la pantalla necesita mostrar."""

    id: UUID
    caregiver_user_id: UUID
    caregiver_name: str
    caregiver_email: str
    authorized_scope: str
    created_at: datetime


def _require_scope(authorized_scope: str) -> None:
    """Rechaza con 422 un alcance fuera de ``minimal`` y ``readings``."""
    if authorized_scope not in SCOPES:
        raise HTTPException(status_code=422, detail=_UNKNOWN_SCOPE)


async def _caregiver(conn: AsyncConnection, caregiver_email: str) -> tuple[UUID, str, str]:
    """Resuelve la cuenta destino y comprueba que sea un cuidador activo.

    Un correo desconocido responde 404, como las demás búsquedas de cuenta de la
    API. Una cuenta con otro rol responde 422 y una cuenta desactivada 409: son
    problemas distintos y el cliente puede nombrarlos por separado.
    """
    row = await (
        await conn.execute(
            "select id, full_name, email, role, active from users where email = %s",
            (normalize_email(caregiver_email),),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if row[3] != "caregiver":
        raise HTTPException(status_code=422, detail=_CAREGIVER_ROLE)
    if not row[4]:
        raise HTTPException(status_code=409, detail=_INACTIVE)
    return row[0], row[1], row[2]


async def list_for(conn: AsyncConnection, patient_profile_id: UUID) -> list[CaregiverLink]:
    """Devuelve los cuidadores autorizados del paciente, sin datos clínicos.

    El paciente y su médico tratante ven la misma lista. No incluye lecturas,
    síntomas ni cifras: nombre, correo, alcance y fecha de la autorización.
    """
    rows = await (
        await conn.execute(
            "select l.id, u.id, u.full_name, u.email, l.authorized_scope, l.created_at "
            "from caregiver_links l "
            "join users u on u.id = l.caregiver_id "
            "where l.patient_id = %s "
            "order by l.created_at, u.full_name",
            (patient_profile_id,),
        )
    ).fetchall()
    return [CaregiverLink(*row) for row in rows]


async def authorize(
    conn: AsyncConnection,
    actor: UUID,
    patient_profile_id: UUID,
    patient_user_id: UUID,
    caregiver_email: str,
    authorized_scope: str,
) -> CaregiverLink:
    """Crea el vínculo que el médico autoriza y lo deja auditado."""
    _require_scope(authorized_scope)
    caregiver_id, caregiver_name, caregiver_email = await _caregiver(conn, caregiver_email)
    existing = await (
        await conn.execute(
            "select 1 from caregiver_links where patient_id = %s and caregiver_id = %s",
            (patient_profile_id, caregiver_id),
        )
    ).fetchone()
    if existing is not None:
        raise HTTPException(status_code=409, detail=_CAREGIVER_EXISTS)
    row = await (
        await conn.execute(
            "insert into caregiver_links (patient_id, caregiver_id, authorized_scope) "
            "values (%s, %s, %s) returning id, created_at",
            (patient_profile_id, caregiver_id, authorized_scope),
        )
    ).fetchone()
    link = CaregiverLink(
        id=row[0],
        caregiver_user_id=caregiver_id,
        caregiver_name=caregiver_name,
        caregiver_email=caregiver_email,
        authorized_scope=authorized_scope,
        created_at=row[1],
    )
    await record(
        conn,
        actor,
        "caregiver.linked",
        entity="caregiver_links",
        entity_id=link.id,
        details={
            "patient_user_id": str(patient_user_id),
            "caregiver_user_id": str(caregiver_id),
            "authorized_scope": authorized_scope,
        },
    )
    await conn.commit()
    return link


async def change_scope(
    conn: AsyncConnection,
    actor: UUID,
    patient_profile_id: UUID,
    patient_user_id: UUID,
    link_id: UUID,
    authorized_scope: str,
) -> None:
    """Cambia el alcance de un vínculo del paciente y lo audita."""
    _require_scope(authorized_scope)
    row = await (
        await conn.execute(
            "select caregiver_id, authorized_scope from caregiver_links "
            "where id = %s and patient_id = %s",
            (link_id, patient_profile_id),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=_LINK_NOT_FOUND)
    await conn.execute(
        "update caregiver_links set authorized_scope = %s where id = %s",
        (authorized_scope, link_id),
    )
    await record(
        conn,
        actor,
        "caregiver.scope_changed",
        entity="caregiver_links",
        entity_id=link_id,
        details={
            "patient_user_id": str(patient_user_id),
            "caregiver_user_id": str(row[0]),
            "previous_scope": row[1],
            "authorized_scope": authorized_scope,
        },
    )
    await conn.commit()


async def revoke(
    conn: AsyncConnection,
    actor: UUID,
    patient_profile_id: UUID,
    patient_user_id: UUID,
    link_id: UUID,
) -> None:
    """Borra el vínculo del paciente y lo audita. El acceso cesa al borrar."""
    row = await (
        await conn.execute(
            "select caregiver_id, authorized_scope from caregiver_links "
            "where id = %s and patient_id = %s",
            (link_id, patient_profile_id),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=_LINK_NOT_FOUND)
    await conn.execute("delete from caregiver_links where id = %s", (link_id,))
    await record(
        conn,
        actor,
        "caregiver.unlinked",
        entity="caregiver_links",
        entity_id=link_id,
        details={
            "patient_user_id": str(patient_user_id),
            "caregiver_user_id": str(row[0]),
            "authorized_scope": row[1],
        },
    )
    await conn.commit()
