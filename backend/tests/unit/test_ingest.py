"""@requirement RF-04

Pruebas unitarias de la compuerta de la clave de dispositivo.

Llaman directamente a la función que decide el rechazo, sin levantar la
aplicación ni tocar bases de datos: la diferencia entre 401 y 503 es una regla
de la ruta y no necesita la pila para comprobarse.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from hta.ingest.router import check_device_key

pytestmark = pytest.mark.unit


def test_unconfigured_key_closes_the_route():
    """Sin clave configurada la ruta responde 503 en lugar de quedar abierta."""
    with pytest.raises(HTTPException) as error:
        check_device_key("", "cualquier-clave")
    assert error.value.status_code == 503


def test_missing_key_is_rejected():
    """Con clave configurada, una petición sin cabecera responde 401."""
    with pytest.raises(HTTPException) as error:
        check_device_key("clave-de-prueba", None)
    assert error.value.status_code == 401


def test_wrong_key_is_rejected():
    """Una clave distinta responde 401."""
    with pytest.raises(HTTPException) as error:
        check_device_key("clave-de-prueba", "clave-equivocada")
    assert error.value.status_code == 401


def test_matching_key_is_accepted():
    """La clave configurada no lanza rechazo."""
    assert check_device_key("clave-de-prueba", "clave-de-prueba") is None
