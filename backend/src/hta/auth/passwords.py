"""@requirement RF-01

Almacenamiento y verificación de contraseñas con scrypt.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

_ALGORITHM = "scrypt"
# Coste recomendado por la documentación de hashlib: 2**14 exige 16 MiB de memoria.
_N = 2**14
_R = 8
_P = 1
_SALT_BYTES = 16
_DKLEN = 32


def hash_password(password: str) -> str:
    """Devuelve una derivación irreversible de la contraseña con una sal nueva.

    El formato almacenado es ``scrypt$n$r$p$salt_hex$hash_hex``: guarda los
    parámetros junto al resultado para poder subir el coste más adelante sin
    invalidar las contraseñas ya registradas.
    """
    salt = secrets.token_bytes(_SALT_BYTES)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_N,
        r=_R,
        p=_P,
        dklen=_DKLEN,
    )
    return f"{_ALGORITHM}${_N}${_R}${_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """Comprueba una contraseña contra el valor almacenado, sin filtrar el motivo."""
    try:
        algorithm, n, r, p, salt_hex, hash_hex = encoded.split("$")
        if algorithm != _ALGORITHM:
            return False
        expected = bytes.fromhex(hash_hex)
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(derived, expected)
