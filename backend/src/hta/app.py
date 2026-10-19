"""Fábrica de la aplicación FastAPI."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pymongo.errors import PyMongoError

from hta.accounts.router import router as accounts_router
from hta.api.health import router as health_router
from hta.auth.router import router as auth_router
from hta.config import Settings
from hta.db.mongo import ensure_collections, get_database
from hta.db.pool import close_pool, get_pool

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Abre las dependencias al arrancar y las cierra al apagar.

    El grupo de conexiones a PostgreSQL se abre aquí porque el módulo que lo
    construye delega en el ciclo de vida el momento de abrirlo: así las
    sesiones reutilizan conexiones en lugar de pagar un apretón de manos por
    cada inicio. Al apagar se cierra y se olvida, para que otro arranque del
    mismo proceso construya uno nuevo: un grupo cerrado no se reabre.

    La comprobación del esquema de MongoDB no impide el arranque. La imagen
    oficial solo ejecuta ``db/mongo/init.js`` cuando el volumen de datos está
    vacío, y esta comprobación cubre el volumen que ya existía. Un fallo de
    MongoDB se registra como advertencia y la aplicación sigue sirviendo, de
    modo que ``/api/health`` pueda informar la dependencia caída en lugar de
    que el proceso muera sin explicación. Se capturan las mismas clases de
    error que la comprobación de salud: una URL vacía o malformada lanza
    ``PyMongoError`` y un puerto inválido ``ValueError``.
    """
    pool = get_pool()
    await pool.open()
    try:
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
    finally:
        await close_pool()


def create_app() -> FastAPI:
    """Construye la aplicación sin abrir conexiones.

    La configuración se lee del entorno, pero ninguna dependencia se conecta
    aquí: el grupo de PostgreSQL se abre en el arranque y cada comprobación de
    salud ocurre dentro de la petición que la pide.
    """
    settings = Settings()
    app = FastAPI(title="Plataforma HTA", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(accounts_router)
    return app
