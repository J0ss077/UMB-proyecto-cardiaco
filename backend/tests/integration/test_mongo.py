"""Pruebas de las colecciones del flujo crudo en MongoDB.

El flujo crudo es de solo anexado y se consulta por paciente, por dispositivo
y por marca de tiempo; la lectura validada se promueve después al registro
relacional. Estas pruebas comprueban que las colecciones existen y que cada
una tiene los dos índices que el manual exige. También comprueban la función
que crea ese esquema al arrancar, sobre una base desechable: la base ``hta``
no se toca y se borra al terminar cada prueba.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from pymongo.database import Database

from hta.db.mongo import ensure_collections

pytestmark = pytest.mark.integration

COLLECTIONS = ("raw_readings", "wearable_events")

SCRATCH_DATABASE = "hta_task6b_scratch"

# Orden y etiquetas de las operaciones que aplica la primera ejecución sobre
# una base vacía: una colección y sus dos índices, y lo mismo para la segunda.
EXPECTED_APPLIED = [
    "create_collection:raw_readings",
    "create_index:raw_readings.patient_time",
    "create_index:raw_readings.device_time",
    "create_collection:wearable_events",
    "create_index:wearable_events.patient_time",
    "create_index:wearable_events.device_time",
]

INDEX_FIELDS = {
    "patient_time": [("patient_id", 1), ("measured_at", 1)],
    "device_time": [("device_id", 1), ("measured_at", 1)],
}


@pytest.fixture
def scratch_db(mongo_db: Database) -> Iterator[Database]:
    """Base vacía y desechable en el MongoDB de la pila.

    Se borra antes y después de cada prueba para que la primera ejecución de
    ``ensure_collections`` encuentre siempre una base sin colecciones y para
    no dejar rastro en el servidor compartido.
    """
    client = mongo_db.client
    client.drop_database(SCRATCH_DATABASE)
    try:
        yield client[SCRATCH_DATABASE]
    finally:
        client.drop_database(SCRATCH_DATABASE)


def test_raw_readings_indexes_exist(mongo_db):
    names = {index["name"] for index in mongo_db.raw_readings.list_indexes()}
    assert "patient_time" in names
    assert "device_time" in names


def test_collections_exist(mongo_db):
    created = set(mongo_db.list_collection_names())
    assert set(COLLECTIONS) <= created


@pytest.mark.parametrize("collection_name", COLLECTIONS)
def test_collections_have_both_expected_indexes(mongo_db, collection_name):
    collection = mongo_db[collection_name]
    names = {index["name"] for index in collection.list_indexes()}
    assert "patient_time" in names
    assert "device_time" in names
    keys = collection.index_information()
    assert [field for field, _direction in keys["patient_time"]["key"]] == [
        "patient_id",
        "measured_at",
    ]
    assert [field for field, _direction in keys["device_time"]["key"]] == [
        "device_id",
        "measured_at",
    ]


def test_ensure_collections_creates_the_schema_on_an_empty_database(scratch_db):
    """Sobre una base vacía crea las dos colecciones y los cuatro índices."""
    applied = ensure_collections(scratch_db)

    assert applied == EXPECTED_APPLIED
    assert set(scratch_db.list_collection_names()) == set(COLLECTIONS)

    for name in COLLECTIONS:
        information = scratch_db[name].index_information()
        for index_name, fields in INDEX_FIELDS.items():
            assert information[index_name]["key"] == fields
            # ``index_information`` devuelve solo la clave y la versión que
            # añade el servidor: las mismas opciones que db/mongo/init.js,
            # sin unique, sparse ni ninguna otra.
            assert set(information[index_name]) == {"key", "v"}


def test_ensure_collections_is_idempotent_against_the_live_database(scratch_db):
    """La segunda ejecución devuelve una lista vacía y deja el esquema igual."""
    ensure_collections(scratch_db)
    before = {name: scratch_db[name].index_information() for name in COLLECTIONS}

    assert ensure_collections(scratch_db) == []

    after = {name: scratch_db[name].index_information() for name in COLLECTIONS}
    assert after == before
