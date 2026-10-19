"""Configuración del backend leída de variables de entorno con prefijo HTA_."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Parámetros de ejecución del servicio."""

    model_config = SettingsConfigDict(env_prefix="HTA_")

    database_url: str
    mongo_url: str
    jwt_secret: str
    access_ttl_seconds: int = 900
    refresh_ttl_seconds: int = 604800
    environment: str = "local"
