"""@requirement RF-03

Endpoints HTTP del consentimiento informado del paciente.

Las cuatro rutas exigen una sesión con rol de paciente. El perfil se resuelve
desde la cuenta autenticada y no desde la ruta: nadie puede aceptar ni revocar
en nombre de otro paciente, y una cuenta sin perfil se rechaza con 403 porque
no habría a quién asociar la aceptación. La conexión la entrega ``auth.deps`` y
la comparten la dependencia de autorización y el endpoint.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict, model_validator

from hta.auth.deps import (
    FORBIDDEN,
    SESSION_RESPONSES,
    CurrentUser,
    get_conn,
    require_role,
)
from hta.consent import service

# Las cuatro rutas exigen una sesión de paciente: el contrato declara el 401 y
# el 403 que produce la compuerta en todas ellas.
router = APIRouter(
    prefix="/api/consent",
    tags=["consent"],
    responses=SESSION_RESPONSES,
)


# Mensaje del rechazo de un cuerpo en el alta de consentimiento. Nombra el
# cambio para que un cliente del contrato anterior sepa por qué su petición ya
# no se acepta y no crea que eligió la versión.
_BODY_NOT_ACCEPTED = (
    "POST /api/consent ya no recibe version ni content_ref: "
    "la versión vigente y el documento los fija el servidor"
)


class AcceptRequest(BaseModel):
    """Cuerpo vacío del alta de consentimiento.

    El contrato anterior enviaba ``version`` y ``content_ref``; ahora los fija
    el servidor. El modelo no declara campos y cierra el paso a los
    desconocidos, igual que el registro público, para que un cliente viejo
    reciba 422 en la primera llamada en lugar de un 201 que ignora su cuerpo.
    """

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _reject_a_body(cls, data: object) -> object:
        """Rechaza cualquier cuerpo con contenido y deja pasar el objeto vacío."""
        if data not in (None, {}):
            raise ValueError(_BODY_NOT_ACCEPTED)
        return data


class AcceptedConsent(BaseModel):
    """Identificador de la aceptación recién registrada."""

    model_config = ConfigDict(frozen=True)

    id: UUID


class ConsentStatus(BaseModel):
    """Estado del consentimiento para la versión que consulta el cliente.

    ``requires_acceptance_of_version`` es ``None`` cuando el consentimiento
    está vigente y, cuando no lo está, la versión cuya aceptación falta. Así el
    cliente no tiene que comparar versiones por su cuenta para saber qué
    documento debe presentar.
    """

    model_config = ConfigDict(frozen=True)

    active: bool
    requires_acceptance_of_version: int | None


class ConsentDocument(BaseModel):
    """Documento vigente que el paciente debe leer antes de aceptar.

    ``text`` es el contenido publicado por la plataforma para ``version``. El
    cliente no lo redacta ni lo elige: lo pide a esta ruta y lo muestra tal
    cual, de modo que lo que se registra al aceptar y lo que el paciente leyó
    son el mismo documento.
    """

    model_config = ConfigDict(frozen=True)

    version: int
    content_ref: str
    text: str


async def _profile_id(conn: AsyncConnection, user_id: UUID) -> UUID:
    """Devuelve el perfil de paciente de la cuenta o rechaza con 403.

    Un paciente sin perfil es un registro inconsistente: no hay a quién
    asociar la aceptación ni contra qué consultar el historial. Se rechaza en
    lugar de crear un perfil desde aquí, porque esta ruta no registra cuentas.
    """
    row = await (
        await conn.execute(
            "select id from patient_profiles where user_id = %s",
            (user_id,),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=403, detail=FORBIDDEN)
    return row[0]


@router.get("/document", response_model=ConsentDocument)
async def read_document(
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> ConsentDocument:
    """Devuelve el documento vigente que el paciente debe leer antes de aceptar.

    Exige sesión de paciente: la compuerta que lo muestra aparece después del
    inicio de sesión y el documento no necesita ser público para leerse antes de
    aceptar. Publicarlo sin sesión abriría el texto a cualquiera sin una razón
    de producto; si algún día se necesita, se decidirá y se comentará aquí.

    La versión y la referencia son las mismas constantes que registra la
    aceptación, y el texto sale del archivo que vive dentro del paquete. Así el
    paciente lee exactamente el documento al que su aceptación se refiere.
    """
    return ConsentDocument(
        version=service.CURRENT_VERSION,
        content_ref=service.CONSENT_CONTENT_REF,
        text=service.document_text(),
    )


@router.get("", response_model=ConsentStatus)
async def read_status(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
    required_version: int = service.CURRENT_VERSION,
) -> ConsentStatus:
    """Informa si el paciente tiene consentimiento vigente para una versión."""
    profile_id = await _profile_id(conn, user.user_id)
    active = await service.is_active(conn, profile_id, required_version)
    return ConsentStatus(
        active=active,
        requires_acceptance_of_version=None if active else required_version,
    )


@router.post("", status_code=201, response_model=AcceptedConsent)
async def accept(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
    body: AcceptRequest | None = None,
) -> AcceptedConsent:
    """Registra una aceptación nueva del documento firmada por el paciente.

    La petición no lleva cuerpo: la versión y la referencia del documento las
    fija el servidor con la versión vigente y el contenido que la plataforma
    publica. Así el paciente no puede aceptar una versión o un documento que la
    plataforma nunca emitió. Un cuerpo con los campos del contrato anterior se
    rechaza con 422 para que el cliente viejo no crea que eligió la versión.
    """
    profile_id = await _profile_id(conn, user.user_id)
    consent_id = await service.accept(conn, profile_id)
    return AcceptedConsent(id=consent_id)


@router.post("/revoke", status_code=204)
async def revoke(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> None:
    """Revoca las aceptaciones vigentes del paciente y conserva el historial."""
    profile_id = await _profile_id(conn, user.user_id)
    await service.revoke(conn, profile_id)
