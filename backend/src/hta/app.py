"""Fábrica de la aplicación FastAPI."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pymongo.errors import PyMongoError

from hta.api.health import router as health_router
from hta.config import Settings
from hta.db.mongo import ensure_collections, get_database

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Comprueba el esquema de MongoDB al arrancar sin impedir el servicio.

    La imagen oficial de MongoDB solo ejecuta ``db/mongo/init.js`` cuando el
    volumen de datos está vacío. Esta comprobación cubre el volumen que ya
    existía: crea las colecciones y los índices del flujo crudo que falten.

    Un fallo de MongoDB no tumba el arranque. Se registra como advertencia y la
    aplicación sigue sirviendo, de modo que ``/api/health`` pueda informar la
    dependencia caída en lugar de que el proceso muera sin explicación. Se
    capturan las mismas clases de error que la comprobación de salud: una URL
    vacía o malformada lanza ``PyMongoError`` y un puerto inválido ``ValueError``.
    """
    try:
        applied = ensure_collections(get_database())
    except (PyMongoError, ValueError) as error:
        logger.warning(
            "La comprobación de las colecciones de MongoDB falló al arrancar: %s",
            error,
        )
    else:
        if applied:
            logger.info(
                "Colecciones de MongoDB actualizadas al arrancar: %s",
                ", ".join(applied),
            )
    yield


def create_app() -> FastAPI:
    """Construye la aplicación sin abrir conexiones.

    La configuración se lee del entorno, pero ninguna dependencia se conecta
    aquí: cada comprobación de salud ocurre dentro de la petición que la pide y
    la comprobación de las colecciones de MongoDB ocurre en el arranque.
    """
    settings = Settings()
    app = FastAPI(title="Plataforma HTA", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.include_router(health_router)
    return app
