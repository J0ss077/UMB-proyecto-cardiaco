"""Pruebas de la configuración del backend."""

from hta.config import Settings


def test_settings_reads_environment(monkeypatch):
    monkeypatch.setenv("HTA_DATABASE_URL", "postgresql://u:p@h:5432/d")
    monkeypatch.setenv("HTA_MONGO_URL", "mongodb://h:27017")
    monkeypatch.setenv("HTA_JWT_SECRET", "secret")
    settings = Settings()
    assert settings.database_url == "postgresql://u:p@h:5432/d"
    assert settings.access_ttl_seconds == 900
