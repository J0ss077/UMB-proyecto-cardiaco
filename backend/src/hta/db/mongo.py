"""Acceso a las colecciones del flujo crudo de dispositivos en MongoDB."""

from __future__ import annotations

from pymongo import MongoClient
from pymongo.database import Database

from hta.config import Settings

_client: MongoClient | None = None

# Colecciones del flujo crudo: solo anexado de lecturas y eventos de dispositivos.
_COLLECTIONS = ("raw_readings", "wearable_events")

# Índices y opciones idénticos a db/mongo/init.js: la consulta siempre ordena por
# tiempo, sea por paciente o por dispositivo. La dirección es ascendente y la
# única opción es el nombre.
_INDEXES = (
    ("patient_time", (("patient_id", 1), ("measured_at", 1))),
    ("device_time", (("device_id", 1), ("measured_at", 1))),
)


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


def ensure_collections(db: Database) -> list[str]:
    """Crea las colecciones y los índices del flujo crudo que falten.

    La imagen oficial de MongoDB solo ejecuta ``db/mongo/init.js`` cuando el
    volumen de datos está vacío. En una máquina con el volumen ya creado ese
    código no corre, de modo que esta función comprueba el esquema en cada
    arranque. Crea ``raw_readings`` y ``wearable_events`` si no existen y, en
    ambas, los índices ``patient_time`` y ``device_time`` con las mismas
    opciones que el script de inicialización.

    Es idempotente: la segunda ejecución no falla y no aplica nada, porque cada
    operación se decide consultando el estado actual. Devuelve la lista de
    operaciones efectivamente aplicadas, en el orden en que se aplicaron; la
    lista queda vacía cuando el esquema ya estaba completo.
    """
    applied: list[str] = []
    existing = set(db.list_collection_names())

    for name in _COLLECTIONS:
        if name not in existing:
            db.create_collection(name)
            applied.append(f"create_collection:{name}")

        collection = db[name]
        index_names = set(collection.index_information())
        for index_name, keys in _INDEXES:
            if index_name in index_names:
                continue
            collection.create_index(list(keys), name=index_name)
            applied.append(f"create_index:{name}.{index_name}")

    return applied
