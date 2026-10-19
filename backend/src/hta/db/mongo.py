"""Acceso a las colecciones del flujo crudo de dispositivos en MongoDB."""

from __future__ import annotations

from pymongo import MongoClient
from pymongo.database import Database

from hta.config import Settings

_client: MongoClient | None = None


def get_database() -> Database:
    """Devuelve la base del flujo crudo y construye el cliente en la primera llamada.

    El cliente se crea perezoso: importar este módulo, o construir la
    aplicación, no abre conexiones ni exige que MongoDB esté disponible. La
    base se toma de la ruta de ``mongo_url``, la misma que usa el compose.
    """
    global _client
    if _client is None:
        _client = MongoClient(Settings().mongo_url)
    return _client.get_default_database()
