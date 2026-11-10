"""Comprobación de salud del servicio y de sus dependencias."""

import logging
from datetime import datetime, timezone

import psycopg
from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from hta.api import status_page

logger = logging.getLogger(__name__)

router = APIRouter()


def _wants_html(request: Request) -> bool:
    """Un navegador pide HTML de forma explícita; curl, urllib y la web no."""
    format_ = request.query_params.get("format")
    if format_ is not None:
        return format_ == "html"
    return "text/html" in request.headers.get("accept", "")


class HealthResponse(BaseModel):
    """Estado del servicio y de cada dependencia, con los nombres del contrato."""

    status: str
    database: str
    mongo: str


def _check_postgres(database_url: str) -> str:
    """Devuelve "ok" si PostgreSQL responde a una consulta trivial, o "fail" si no."""
    try:
        with psycopg.connect(database_url, connect_timeout=2) as connection:
            connection.execute("SELECT 1")
        return "ok"
    except psycopg.Error as error:
        logger.warning("La comprobación de PostgreSQL falló: %s", error)
        return "fail"


def _check_mongo(mongo_url: str) -> str:
    """Devuelve "ok" si MongoDB responde a un ping, o "fail" si no.

    El cliente se construye dentro del ``try``: una URL vacía lanza
    ``ConfigurationError``, una malformada ``InvalidURI`` y un puerto inválido
    ``ValueError``. Las dos primeras heredan de ``PyMongoError``; la tercera se
    captura aparte para que el handler nunca propague la excepción.
    """
    client: MongoClient | None = None
    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=1500)
        client.admin.command("ping")
        return "ok"
    except (PyMongoError, ValueError) as error:
        logger.warning("La comprobación de MongoDB falló: %s", error)
        return "fail"
    finally:
        if client is not None:
            client.close()


@router.get("/api/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse | Response:
    """Informa el estado de cada dependencia sin lanzar excepción.

    Responde 200 aunque una dependencia falle: el cuerpo distingue la
    dependencia degradada y el campo ``status`` queda en ``degraded``. Si el
    cliente es un navegador (``Accept: text/html``) o pide ``?format=html``,
    recibe una página que solo dice si cada componente responde; el contrato
    JSON no cambia para los demás clientes.
    """
    settings = request.app.state.settings
    if _wants_html(request):
        return _html_page(request)
    database = _check_postgres(settings.database_url)
    mongo = _check_mongo(settings.mongo_url)
    status = "ok" if database == "ok" and mongo == "ok" else "degraded"
    return HealthResponse(status=status, database=database, mongo=mongo)


def _html_page(request: Request) -> HTMLResponse:
    settings = request.app.state.settings
    components = [
        status_page.check_api(),
        status_page.check_postgres(settings.database_url),
        status_page.check_mongo(settings.mongo_url),
        status_page.check_web(settings.web_url),
    ]
    overall = "ok" if all(item.state == "ok" for item in components) else "degraded"
    page = status_page.render(components, overall, datetime.now(timezone.utc))
    return HTMLResponse(page, headers={"Cache-Control": "no-store"})
