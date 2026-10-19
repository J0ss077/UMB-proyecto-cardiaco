"""Pruebas de la configuración del backend."""

import pytest
from pydantic import ValidationError

from hta.config import Settings

VALID_SECRET = "clave-de-prueba-para-configuracion-con-32-bytes-o-mas"
PLACEHOLDER_SECRET = "cambiar-en-produccion"


def _settings(monkeypatch, jwt_secret: str) -> Settings:
    """Construye la configuración con las tres variables que exige."""
    monkeypatch.setenv("HTA_DATABASE_URL", "postgresql://u:p@h:5432/d")
    monkeypatch.setenv("HTA_MONGO_URL", "mongodb://h:27017")
    monkeypatch.setenv("HTA_JWT_SECRET", jwt_secret)
    return Settings()


def test_settings_reads_environment(monkeypatch):
    settings = _settings(monkeypatch, VALID_SECRET)
    assert settings.database_url == "postgresql://u:p@h:5432/d"
    assert settings.access_ttl_seconds == 900
    assert settings.jwt_secret == VALID_SECRET


def test_short_jwt_secret_is_rejected(monkeypatch):
    """Una clave HS256 por debajo de 32 bytes no puede firmar de forma segura."""
    with pytest.raises(ValidationError, match="al menos 32 bytes"):
        _settings(monkeypatch, "secreto")


def test_placeholder_jwt_secret_is_rejected(monkeypatch):
    """El valor de ejemplo de .env.example es público y no sirve como clave."""
    with pytest.raises(ValidationError, match="valor de ejemplo"):
        _settings(monkeypatch, PLACEHOLDER_SECRET)
