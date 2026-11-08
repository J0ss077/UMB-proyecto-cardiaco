"""@requirement RNF-09

Resolución de alcance y compuerta de las rutas clínicas.

Una sola función decide sobre qué perfil de paciente puede actuar la cuenta
autenticada y otra comprueba que ese perfil tenga consentimiento vigente antes
de procesar un dato clínico. La firma recibe el identificador público, el de
``users``, y devuelve el identificador interno de ``patient_profiles``, que no
sale en ninguna respuesta.
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


async def patient_profile_id(
    conn: AsyncConnection,
    user: CurrentUser,
    patient_id: UUID | None = None,
) -> UUID:
    """Devuelve el perfil de paciente sobre el que puede actuar la cuenta.

    En este incremento solo el paciente actúa sobre su propio perfil: el
    identificador opcional que llega del cliente es el de la cuenta del
    paciente, no el del perfil, y cualquier valor distinto del propio se rechaza
    con 403. Una cuenta sin perfil también se rechaza con 403 y no con 500: no
    hay a quién asociar la lectura. La comprobación de rol ocurre antes, en el
    router, con ``require_role``.
    """
    row = await (
        await conn.execute(
            "select id from patient_profiles where user_id = %s",
            (user.user_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    if patient_id is not None and patient_id != user.user_id:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return row[0]


async def require_consent(conn: AsyncConnection, profile_id: UUID) -> None:
    """Rechaza con 403 la escritura clínica sin consentimiento vigente.

    Pregunta por la versión vigente del documento en ``consent.service`` y no
    por una copia local del número. No escribe nada: la compuerta se consulta
    antes de cualquier ``insert`` y un rechazo no deja auditoría, porque la
    operación no llegó a existir.
    """
    if not await is_active(conn, profile_id, CURRENT_VERSION):
        raise HTTPException(status_code=403, detail=CONSENT_REQUIRED)
