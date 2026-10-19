"""Pruebas del almacenamiento de contraseñas con scrypt."""

from hta.auth.passwords import hash_password, verify_password


def test_hash_is_not_the_password():
    """El valor almacenado no contiene la contraseña y solo ella lo verifica."""
    encoded = hash_password("correct horse")
    assert "correct horse" not in encoded
    assert verify_password("correct horse", encoded) is True
    assert verify_password("wrong", encoded) is False


def test_two_hashes_of_same_password_differ():
    """Cada hash usa una sal nueva, así que dos hashes del mismo texto difieren."""
    assert hash_password("x") != hash_password("x")
