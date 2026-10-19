"""Fábrica de la aplicación FastAPI."""

from fastapi import FastAPI

from hta.api.health import router as health_router
from hta.config import Settings


def create_app() -> FastAPI:
    """Construye la aplicación sin abrir conexiones.

    La configuración se lee del entorno, pero ninguna dependencia se conecta
    aquí: cada comprobación de salud ocurre dentro de la petición que la pide.
    """
    settings = Settings()
    app = FastAPI(title="Plataforma HTA", version="0.1.0")
    app.state.settings = settings
    app.include_router(health_router)
    return app
