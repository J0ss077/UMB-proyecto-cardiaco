"""Pruebas del almacenamiento de contraseñas con scrypt."""

import re

from hta.auth.passwords import hash_password, verify_password

# Fija el contrato almacenado: algoritmo, coste, sal de 16 bytes y derivación de 32.
_STORED_FORMAT = re.compile(r"^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$")


def test_hash_is_not_the_password():
    """El valor almacenado no contiene la contraseña y solo ella lo verifica."""
    encoded = hash_password("correct horse")
    assert "correct horse" not in encoded
    assert verify_password("correct horse", encoded) is True
    assert verify_password("wrong", encoded) is False


def test_two_hashes_of_same_password_differ():
    """Cada hash usa una sal nueva, así que dos hashes del mismo texto difieren."""
    assert hash_password("x") != hash_password("x")


def test_stored_value_pins_the_kdf_parameters():
    """Una regresión a menos coste o a una derivación truncada rompe esta prueba."""
    encoded = hash_password("correct horse")
    assert _STORED_FORMAT.match(encoded), encoded
    _, n, r, p, _, _ = encoded.split("$")
    assert (int(n), int(r), int(p)) == (16384, 8, 1)
