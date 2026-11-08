"""@requirement RNF-09

Resolución de alcance y compuerta de las rutas clínicas.

Una sola función decide sobre qué perfil de paciente puede actuar la cuenta
autenticada y otra comprueba que ese perfil tenga consentimiento vigente antes
de procesar un dato clínico. La firma recibe el identificador público, el de
``users``, y devuelve el identificador interno de ``patient_profiles``, que no
sale en ninguna respuesta.

La resolución cubre las tres cuentas que ven datos clínicos: el paciente sobre
sí mismo, el médico sobre los pacientes vinculados en ``patient_physician`` y
el cuidador sobre los que lo autorizaron en ``caregiver_links`` con alcance
``readings``. El administrador no ve datos clínicos y cualquier otro caso
responde 403 con el mismo mensaje, para que el cliente no pueda distinguir
"no es tuyo" de "no existe". Un médico o un cuidador que no indican paciente no
tienen uno sobre el que resolver y también reciben 403.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.auth.deps import FORBIDDEN, CurrentUser
from hta.consent.service import CURRENT_VERSION, is_active

# Mensaje del rechazo por consentimiento. Nombra la causa para que el cliente
# sepa qué falta y no lo confunda con un problema de rol.
CONSENT_REQUIRED = "No hay consentimiento informado vigente"

# Único alcance de ``caregiver_links`` que abre datos clínicos. El alcance
# ``minimal`` autoriza acompañamiento, no lectura.
READINGS_SCOPE = "readings"

# Roles que pueden consultar datos clínicos. El administrador queda fuera.
READ_ROLES = frozenset({"patient", "physician", "caregiver"})


async def _patient_profile(
    conn: AsyncConnection,
    user_id: UUID,
) -> UUID | None:
    """Devuelve el perfil de la cuenta, o ``None`` si la cuenta no tiene uno."""
    row = await (
        await conn.execute(
            "select id from patient_profiles where user_id = %s",
            (user_id,),
        )
    ).fetchone()
    return None if row is None else row[0]


async def patient_profile_id(
    conn: AsyncConnection,
    user: CurrentUser,
    patient_id: UUID | None = None,
) -> UUID:
    """Devuelve el perfil de paciente que la cuenta puede consultar.

    ``patient_id`` es el identificador de la cuenta del paciente, no el del
    perfil. El paciente solo puede resolver el propio y cualquier otro valor
    recibe 403; sin identificador resuelve el suyo. El médico y el cuidador
    deben indicar uno y solo lo obtienen si el vínculo correspondiente existe:
    una fila de ``patient_physician`` o una de ``caregiver_links`` con alcance
    ``readings``. Un vínculo de cuidador con alcance ``minimal`` no alcanza.
    El administrador y los roles desconocidos reciben 403. Una cuenta de
    paciente sin perfil también recibe 403 y no 500: no hay a quién asociar la
    operación.

    La escritura clínica sigue exigiendo el rol de paciente en el router, así
    que extender esta resolución al médico y al cuidador no abre las rutas de
    alta.
    """
    if user.role not in READ_ROLES:
        raise HTTPException(status_code=403, detail=FORBIDDEN)

    if user.role == "patient":
        if patient_id is not None and patient_id != user.user_id:
            raise HTTPException(status_code=403, detail=FORBIDDEN)
        profile = await _patient_profile(conn, user.user_id)
        if profile is None:
            raise HTTPException(status_code=403, detail=FORBIDDEN)
        return profile

    if patient_id is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    profile = await _patient_profile(conn, patient_id)
    if profile is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)

    if user.role == "physician":
        link = await (
            await conn.execute(
                "select 1 from patient_physician "
                "where patient_id = %s and physician_id = %s",
                (profile, user.user_id),
            )
        ).fetchone()
    else:
        link = await (
            await conn.execute(
                "select 1 from caregiver_links "
                "where patient_id = %s and caregiver_id = %s "
                "and authorized_scope = %s",
                (profile, user.user_id, READINGS_SCOPE),
            )
        ).fetchone()
    if link is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return profile


async def require_consent(conn: AsyncConnection, profile_id: UUID) -> None:
    """Rechaza con 403 la escritura clínica sin consentimiento vigente.

    Pregunta por la versión vigente del documento en ``consent.service`` y no
    por una copia local del número. No escribe nada: la compuerta se consulta
    antes de cualquier ``insert`` y un rechazo no deja auditoría, porque la
    operación no llegó a existir.
    """
    if not await is_active(conn, profile_id, CURRENT_VERSION):
        raise HTTPException(status_code=403, detail=CONSENT_REQUIRED)
