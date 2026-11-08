"""@requirement RF-03

Servicio de consentimiento informado: aceptación versionada, revocación y
consulta de la aceptación vigente.

El historial es append-only: aceptar inserta una fila nueva y revocar solo
escribe ``revoked_at``. Ninguna operación borra ni reescribe una aceptación
anterior, de modo que la historia del consentimiento se puede reconstruir. La
consulta que usan los endpoints de monitoreo responde verdadero únicamente si
existe una aceptación sin revocar de la versión requerida.

La versión y la referencia del documento las fija este módulo: el cliente no las
envía, de modo que una aceptación no puede referirse a una versión o a un
documento que la plataforma no emitió.

Las dos mutaciones confirman su transacción antes de responder, igual que el
servicio de cuentas: la conexión se cierra después de enviar la respuesta y sin
la confirmación el cliente podría no ver su propio cambio todavía.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection

from hta.audit import record
from hta.auth.deps import FORBIDDEN

# Versión del documento de consentimiento que exige este incremento. La
# consulta de vigencia, el alta de la aceptación y la compuerta de las rutas
# clínicas preguntan por esta misma versión: una aceptación de otra versión no
# habilita el monitoreo.
CURRENT_VERSION = 1

# Referencia del documento que la plataforma publica para esa versión. La
# escribe el servidor y el cliente no la envía: una aceptación no puede
# referirse a un documento que la plataforma nunca emitió.
CONSENT_CONTENT_REF = "consentimiento-informado-v1"


async def _account_id(conn: AsyncConnection, patient_id: UUID) -> UUID:
    """Devuelve la cuenta dueña del perfil y rechaza con 403 si ya no existe.

    Supone que quien firma la operación es el dueño del perfil: el router
    resuelve el perfil a partir de la cuenta autenticada y los endpoints de
    consentimiento solo admiten el rol de paciente. El día que alguien distinto
    del paciente pueda aceptar o revocar en su nombre, esa suposición deja de
    valer y la firma tendrá que recibir el actor en lugar de deducirlo del
    perfil.

    Un perfil que desaparece entre la resolución del router y esta consulta se
    rechaza con el mismo 403 que un paciente sin perfil, no con un 500.
    """
    row = await (
        await conn.execute(
            "select user_id from patient_profiles where id = %s",
            (patient_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return row[0]


async def accept(
    conn: AsyncConnection,
    patient_id: UUID,
) -> UUID:
    """Registra una aceptación nueva y devuelve su identificador.

    La versión y la referencia del documento las fija el servidor con
    ``CURRENT_VERSION`` y ``CONSENT_CONTENT_REF``; el cliente no las envía, de
    modo que no puede registrar la aceptación de una versión o de un documento
    que la plataforma nunca emitió.

    Siempre inserta una fila, aunque ya exista una aceptación de la misma
    versión: la tabla guarda cada aceptación como un hecho propio y una segunda
    aceptación del mismo documento es un segundo hecho, no una corrección del
    primero. La transacción se confirma antes de responder y la auditoría
    guarda la versión aceptada y la cuenta que la firmó.
    """
    consent_id = (
        await (
            await conn.execute(
                "insert into consents (patient_id, version, content_ref) "
                "values (%s, %s, %s) returning id",
                (patient_id, CURRENT_VERSION, CONSENT_CONTENT_REF),
            )
        ).fetchone()
    )[0]
    await record(
        conn,
        await _account_id(conn, patient_id),
        "consent.accepted",
        entity="consents",
        entity_id=consent_id,
        details={"version": CURRENT_VERSION},
    )
    await conn.commit()
    return consent_id


async def revoke(conn: AsyncConnection, patient_id: UUID) -> None:
    """Marca ``revoked_at`` en todas las aceptaciones vigentes del paciente.

    Se revocan todas y no solo la más reciente: una aceptación anterior que
    quedara sin revocar seguiría haciendo que la consulta de vigencia
    respondiera verdadero para su versión, y el bloqueo del monitoreo fallaría
    abierto. Cuando no hay nada vigente la operación no escribe auditoría y no
    falla: revocar dos veces es el mismo estado final que revocar una.

    Cada aceptación revocada deja su propio evento ``consent.revoked`` con el
    identificador de la fila y su versión, de modo que el rastro no dependa de
    cuál de las filas revocadas se mire.
    """
    rows = await (
        await conn.execute(
            "update consents set revoked_at = now() "
            "where patient_id = %s and revoked_at is null "
            "returning id, version",
            (patient_id,),
        )
    ).fetchall()
    if not rows:
        return

    actor = await _account_id(conn, patient_id)
    for consent_id, version in rows:
        await record(
            conn,
            actor,
            "consent.revoked",
            entity="consents",
            entity_id=consent_id,
            details={"version": version},
        )
    await conn.commit()


async def is_active(conn: AsyncConnection, patient_id: UUID, version: int) -> bool:
    """Indica si hay una aceptación sin revocar de esa versión exacta.

    Es la pregunta que deben hacer los endpoints de monitoreo antes de procesar
    un dato clínico: una aceptación de otra versión no habilita la versión
    requerida, y una aceptación revocada no habilita nada.
    """
    row = await (
        await conn.execute(
            "select exists ("
            "  select 1 from consents"
            "  where patient_id = %s and version = %s and revoked_at is null"
            ")",
            (patient_id, version),
        )
    ).fetchone()
    return row[0]
