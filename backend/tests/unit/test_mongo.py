"""Pruebas unitarias de las colecciones del flujo crudo y de su comprobación al arrancar.

Ninguna prueba de este módulo abre una conexión a MongoDB: ``ensure_collections``
recibe una base falsa que mantiene el estado de colecciones e índices y registra
las mutaciones, y el arranque se prueba con esa misma base o con un fallo
simulado. Así se comprueban el conjunto exacto de operaciones y la idempotencia
sin depender de un MongoDB vivo.
"""

from __future__ import annotations

import logging

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from hta.app import create_app
from hta.db.mongo import ensure_collections

COLLECTIONS = ("raw_readings", "wearable_events")
INDEXES = {
    "patient_time": [("patient_id", 1), ("measured_at", 1)],
    "device_time": [("device_id", 1), ("measured_at", 1)],
}

# Las operaciones se aplican en el orden de las colecciones y, dentro de cada
# una, de los índices, igual que en db/mongo/init.js.
OPERATIONS_ON_EMPTY_DATABASE = [
    "create_collection:raw_readings",
    "create_index:raw_readings.patient_time",
    "create_index:raw_readings.device_time",
    "create_collection:wearable_events",
    "create_index:wearable_events.patient_time",
    "create_index:wearable_events.device_time",
]

INDEX_CREATIONS = [
    ("raw_readings", INDEXES["patient_time"], {"name": "patient_time"}),
    ("raw_readings", INDEXES["device_time"], {"name": "device_time"}),
    ("wearable_events", INDEXES["patient_time"], {"name": "patient_time"}),
    ("wearable_events", INDEXES["device_time"], {"name": "device_time"}),
]


class FakeCollection:
    """Colección falsa que guarda sus índices y anota los que se crean."""

    def __init__(self, database: FakeDatabase, name: str) -> None:
        self._database = database
        self.name = name
        # MongoDB crea este índice al crear la colección; no lo pide este código.
        self._indexes: dict[str, list[tuple[str, int]]] = {"_id_": [("_id", 1)]}

    def index_information(self) -> dict[str, list[tuple[str, int]]]:
        """Devuelve los índices existentes, como la colección real."""
        return {name: list(keys) for name, keys in self._indexes.items()}

    def create_index(self, keys: list[tuple[str, int]], name: str) -> None:
        """Registra el índice creado y sus opciones, que solo son el nombre."""
        stored = list(keys)
        self._indexes[name] = stored
        self._database.created_indexes.append((self.name, stored, {"name": name}))


class FakeDatabase:
    """Base falsa que registra las colecciones e índices efectivamente creados."""

    def __init__(self) -> None:
        self._collections: dict[str, FakeCollection] = {}
        self.created_collections: list[str] = []
        self.created_indexes: list[tuple[str, list[tuple[str, int]], dict[str, str]]] = []

    def list_collection_names(self) -> list[str]:
        """Nombres de las colecciones que ya existen."""
        return list(self._collections)

    def create_collection(self, name: str) -> FakeCollection:
        """Crea una colección y anota la operación."""
        self.created_collections.append(name)
        collection = FakeCollection(self, name)
        self._collections[name] = collection
        return collection

    def __getitem__(self, name: str) -> FakeCollection:
        """Devuelve una colección existente, como la base real."""
        return self._collections[name]

    def reset_log(self) -> None:
        """Olvida las mutaciones registradas sin cambiar el estado de la base."""
        self.created_collections.clear()
        self.created_indexes.clear()

    def given(self, name: str, *index_names: str) -> None:
        """Deja una colección ya existente y olvida las mutaciones de la siembra.

        Simula la base que dejó ``db/mongo/init.js`` en un volumen inicializado:
        la prueba debe observar solo lo que hace ``ensure_collections`` sobre
        ese estado previo, no la siembra.
        """
        collection = self.create_collection(name)
        for index_name in index_names:
            collection.create_index(INDEXES[index_name], name=index_name)
        self.reset_log()


def _client(monkeypatch: pytest.MonkeyPatch, mongo_url: str) -> TestClient:
    """Construye un cliente con ambas dependencias apuntando a un puerto cerrado."""
    monkeypatch.setenv("HTA_DATABASE_URL", "postgresql://usuario:clave@127.0.0.1:1/hta")
    monkeypatch.setenv("HTA_MONGO_URL", mongo_url)
    monkeypatch.setenv("HTA_JWT_SECRET", "secreto-de-prueba-para-las-pruebas-unitarias")
    return TestClient(create_app())


def test_ensure_collections_creates_every_missing_piece():
    """Una base vacía recibe las dos colecciones y sus cuatro índices."""
    database = FakeDatabase()

    applied = ensure_collections(database)

    assert applied == OPERATIONS_ON_EMPTY_DATABASE
    assert database.created_collections == list(COLLECTIONS)
    assert database.created_indexes == INDEX_CREATIONS


def test_ensure_collections_applies_nothing_on_second_run():
    """La segunda ejecución devuelve una lista vacía y no muta la base."""
    database = FakeDatabase()
    ensure_collections(database)
    database.reset_log()

    assert ensure_collections(database) == []
    assert database.created_collections == []
    assert database.created_indexes == []


def test_ensure_collections_creates_only_the_missing_indexes():
    """Con las colecciones y la mayoría de los índices, crea solo lo que falta."""
    database = FakeDatabase()
    database.given("raw_readings", "patient_time", "device_time")
    database.given("wearable_events", "patient_time")

    applied = ensure_collections(database)

    assert applied == ["create_index:wearable_events.device_time"]
    assert database.created_collections == []
    assert database.created_indexes == [
        ("wearable_events", INDEXES["device_time"], {"name": "device_time"})
    ]


def test_ensure_collections_does_not_recreate_existing_collections():
    """Una colección que ya existe recibe sus índices sin volver a crearse."""
    database = FakeDatabase()
    database.given("raw_readings")

    applied = ensure_collections(database)

    assert database.created_collections == ["wearable_events"]
    assert applied.count("create_collection:raw_readings") == 0
    assert applied.count("create_index:raw_readings.patient_time") == 1
    assert applied.count("create_index:raw_readings.device_time") == 1


def test_create_app_does_not_connect_when_constructed(monkeypatch):
    """Construir la fábrica no abre conexiones: la comprobación vive en el arranque."""

    def fail() -> None:
        pytest.fail("create_app no debe consultar MongoDB al construirse")

    monkeypatch.setattr("hta.app.get_database", fail)
    monkeypatch.setenv("HTA_DATABASE_URL", "postgresql://usuario:clave@127.0.0.1:1/hta")
    monkeypatch.setenv("HTA_MONGO_URL", "mongodb://127.0.0.1:1/hta")
    monkeypatch.setenv("HTA_JWT_SECRET", "secreto-de-prueba-para-las-pruebas-unitarias")

    create_app()


def test_lifespan_checks_collections_on_startup(monkeypatch):
    """El arranque de la aplicación aplica la comprobación de colecciones."""
    database = FakeDatabase()
    monkeypatch.setattr("hta.app.get_database", lambda: database)

    with _client(monkeypatch, "mongodb://127.0.0.1:1/hta"):
        pass

    assert database.created_collections == list(COLLECTIONS)
    assert len(database.created_indexes) == 4


def test_lifespan_keeps_serving_when_mongo_is_unreachable(monkeypatch, caplog):
    """Un fallo de MongoDB al arrancar se registra y la aplicación sigue sirviendo."""

    def unreachable() -> None:
        raise ServerSelectionTimeoutError("MongoDB no respondió")

    monkeypatch.setattr("hta.app.get_database", unreachable)

    with caplog.at_level(logging.WARNING, logger="hta.app"):
        with _client(monkeypatch, "mongodb://127.0.0.1:1/hta") as client:
            response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["mongo"] == "fail"
    startup_warnings = [
        record
        for record in caplog.records
        if record.name == "hta.app" and "al arrancar" in record.getMessage()
    ]
    assert startup_warnings
