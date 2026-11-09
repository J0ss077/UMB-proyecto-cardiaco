"""@requirement RF-02

Cuerpo de la solicitud de cambio de contraseña.

La contraseña no se recorta: los espacios son parte de ella. La actual se pide
siempre para que una sesión abierta y desatendida no baste para cambiarla.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

NEW_PASSWORD_MIN = 8
NEW_PASSWORD_MAX = 128


class PasswordChangeRequest(BaseModel):
    """Contraseña actual y contraseña nueva."""

    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=NEW_PASSWORD_MAX)
    new_password: str = Field(min_length=NEW_PASSWORD_MIN, max_length=NEW_PASSWORD_MAX)

    @model_validator(mode="after")
    def _different(self) -> PasswordChangeRequest:
        if self.new_password == self.current_password:
            raise ValueError("La contraseña nueva debe ser distinta de la actual")
        return self
