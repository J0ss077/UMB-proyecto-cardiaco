"""Pruebas de las colecciones del flujo crudo en MongoDB.

El flujo crudo es de solo anexado y se consulta por paciente, por dispositivo
y por marca de tiempo; la lectura validada se promueve después al registro
relacional. Estas pruebas comprueban que las colecciones existen y que cada
una tiene los dos índices que el manual exige.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration

COLLECTIONS = ("raw_readings", "wearable_events")


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
