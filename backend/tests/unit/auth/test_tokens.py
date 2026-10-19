"""Pruebas de los tokens de acceso y de refresco."""

import hashlib
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest

from hta.auth.tokens import (
    InvalidToken,
    decode_access,
    issue_access,
    new_refresh_token,
)

TEST_SECRET = "secreto-de-prueba-para-tokens-del-backend"
OTHER_TEST_SECRET = "otro-secreto-de-prueba-para-tokens-del-backend"


@pytest.fixture(autouse=True)
def _environment(monkeypatch):
    """Fija el entorno que ``Settings`` exige para emitir y verificar tokens."""
    monkeypatch.setenv("HTA_DATABASE_URL", "postgresql://usuario:clave@127.0.0.1:5432/hta")
    monkeypatch.setenv("HTA_MONGO_URL", "mongodb://127.0.0.1:27017")
    monkeypatch.setenv("HTA_JWT_SECRET", TEST_SECRET)


def test_access_token_roundtrip():
    """Un token recién emitido devuelve el usuario y el rol que llevaba dentro."""
    user_id = uuid4()
    token = issue_access(user_id, "physician")
    claims = decode_access(token)
    assert claims.user_id == user_id
    assert claims.role == "physician"


def test_expired_token_is_rejected():
    """Un token con vencimiento en el pasado se rechaza en lugar de ceder claims."""
    token = issue_access(uuid4(), "patient", ttl_seconds=-1)
    with pytest.raises(InvalidToken):
        decode_access(token)


def test_token_signed_with_another_secret_is_rejected():
    """Sin el secreto del servicio no se puede fabricar un token con otro rol."""
    now = datetime.now(timezone.utc)
    forged = jwt.encode(
        {
            "sub": str(uuid4()),
            "role": "admin",
            "iat": now,
            "exp": now + timedelta(minutes=15),
        },
        OTHER_TEST_SECRET,
        algorithm="HS256",
    )
    with pytest.raises(InvalidToken):
        decode_access(forged)


def test_refresh_token_returns_raw_value_and_sha256_digest():
    """El refresco entrega un valor aleatorio y solo su huella SHA-256 se guarda."""
    raw, digest = new_refresh_token()
    other_raw, other_digest = new_refresh_token()
    assert raw != other_raw
    assert digest != raw
    assert digest == hashlib.sha256(raw.encode("utf-8")).hexdigest()
    assert digest != other_digest
