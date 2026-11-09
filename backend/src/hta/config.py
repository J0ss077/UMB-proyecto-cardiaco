"""Configuración del backend leída de variables de entorno con prefijo HTA_."""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# El placeholder que publica .env.example: cualquiera lo conoce, así que no puede
# firmar tokens verificables.
_PLACEHOLDER_SECRET = "cambiar-en-produccion"
# PyJWT recomienda 32 bytes como mínimo para HMAC-SHA256.
_MIN_SECRET_BYTES = 32
_GENERATE_HINT = (
    'genera uno con python3 -c "import secrets; print(secrets.token_urlsafe(48))"'
)


class Settings(BaseSettings):
    """Parámetros de ejecución del servicio."""

    model_config = SettingsConfigDict(env_prefix="HTA_")

    database_url: str
    mongo_url: str
    jwt_secret: str
    # Clave compartida que presentan los dispositivos en ``X-Device-Key``.
    # Vacía deja la ingesta cerrada con 503: una instalación sin clave no debe
    # aceptar escrituras anónimas.
    device_key: str = ""
    access_ttl_seconds: int = 900
    # 604800 segundos son siete días: la vida del token de refresco.
    refresh_ttl_seconds: int = 604800
    environment: str = "local"
    # Orígenes que el navegador puede llamar, separados por comas. Vacío deja
    # los puertos de desarrollo de la interfaz web que fija ``api.cors``.
    allowed_origins: str = ""
    # Dirección interna de la interfaz web, solo para la página de estado.
    web_url: str = ""

    @field_validator("jwt_secret")
    @classmethod
    def _reject_unusable_secret(cls, value: str) -> str:
        """Rechaza la clave HS256 de ejemplo o una demasiado corta.

        Un secreto público o de pocos bytes permite falsificar tokens de
        acceso, así que el servicio se niega a arrancar antes que emitirlos.
        """
        if value == _PLACEHOLDER_SECRET:
            raise ValueError(
                f"HTA_JWT_SECRET conserva el valor de ejemplo y no sirve para firmar; "
                f"{_GENERATE_HINT}"
            )
        if len(value.encode("utf-8")) < _MIN_SECRET_BYTES:
            raise ValueError(
                f"HTA_JWT_SECRET debe medir al menos {_MIN_SECRET_BYTES} bytes; "
                f"{_GENERATE_HINT}"
            )
        return value
