"""@requirement RF-04

Endpoint de ingesta de lecturas desde dispositivos.

La ruta no usa sesión ni rol: el dispositivo presenta la clave compartida en
``X-Device-Key`` y la comparación se hace con ``secrets.compare_digest``. Si la
clave no está configurada, la ruta responde 503 y no escribe: un despliegue sin
clave no debe aceptar escrituras anónimas. La compuerta es una dependencia de
FastAPI para que el 401 o el 503 salgan antes de validar el cuerpo: un
dispositivo sin clave no necesita un cuerpo correcto para saber que no puede
escribir.

La respuesta es la misma lectura que publica el alta manual, con
``source='device'``. Un reintento de la misma pareja ``device_id`` y
``measured_at`` responde 200 con el mismo cuerpo en lugar de 201.
"""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from psycopg import AsyncConnection

from hta.auth.deps import get_conn
from hta.clinical.router import ReadingResponse
from hta.config import Settings
from hta.ingest import service

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# Nombre del encabezado que presenta el dispositivo. La dependencia lo lee del
# objeto de la petición y el contrato lo publica como parámetro obligatorio.
DEVICE_KEY_HEADER = "X-Device-Key"

# Parámetro del contrato generado. No se declara como argumento ``Header`` de
# la dependencia porque uno obligatorio haría que la cabecera ausente respondiera
# 422 antes de que la compuerta pudiera responder 401.
DEVICE_KEY_PARAMETER = {
    "name": DEVICE_KEY_HEADER,
    "in": "header",
    "required": True,
    "description": "Clave compartida configurada en HTA_DEVICE_KEY.",
    "schema": {"type": "string"},
}

_NOT_CONFIGURED = "La ingesta de dispositivos no está configurada"
_INVALID_KEY = "Clave de dispositivo inválida"


def check_device_key(expected: str, provided: str | None) -> None:
    """Autoriza la clave del dispositivo contra la configurada.

    Sin clave configurada la ruta queda cerrada con 503: no se distingue una
    instalación que olvidó la variable de una que quiso apagar la ingesta, y en
    los dos casos aceptar escrituras sería peor. Con clave configurada, una
    cabecera ausente o distinta responde 401. La comparación se hace con
    ``compare_digest`` sobre bytes para no filtrar el prefijo correcto por el
    tiempo de respuesta y para admitir claves con caracteres no ASCII.
    """
    if not expected:
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    if provided is None or not secrets.compare_digest(
        provided.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail=_INVALID_KEY)


async def require_device_key(request: Request) -> None:
    """Dependencia que aplica la compuerta de la clave compartida.

    La configuración se lee de ``app.state``, donde la fábrica de la aplicación
    ya guardó la instancia que se validó al arrancar. La dependencia no
    devuelve nada: la ruta solo necesita que no lance el rechazo. La cabecera se
    lee del objeto de la petición para que una ausencia llegue a ``check_device_key``
    y responda 401, no 422.
    """
    settings: Settings = request.app.state.settings
    check_device_key(
        settings.device_key,
        request.headers.get(DEVICE_KEY_HEADER),
    )


@router.post(
    "/readings",
    status_code=201,
    response_model=ReadingResponse,
    responses={
        200: {
            "model": ReadingResponse,
            "description": "Reintento de una lectura ya guardada",
        }
    },
    openapi_extra={"parameters": [DEVICE_KEY_PARAMETER]},
)
async def ingest_reading(
    body: service.IngestPayload,
    response: Response,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    _: Annotated[None, Depends(require_device_key)],
) -> ReadingResponse:
    """Guarda la lectura de un dispositivo en los dos almacenes.

    El servicio resuelve al paciente, exige consentimiento vigente y escribe
    primero el documento crudo y después la lectura con ``source='device'``. Si
    la pareja de deduplicación ya existía, el estado de la respuesta pasa a 200
    y el cuerpo es la lectura original: las dos respuestas son idénticas y el
    cliente puede reintentar sin miedo a duplicar una medición.
    """
    outcome = await service.ingest(conn, body)
    if not outcome.created:
        response.status_code = 200
    return ReadingResponse.model_validate(outcome.reading)
