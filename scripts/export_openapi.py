"""@requirement none

Escribe el contrato HTTP de la API en ``docs/api/openapi.json``.

El archivo se versiona y la interfaz web lo usa como referencia: es el acuerdo
entre el backend y el cliente, y se regenera con ``make contract``. Nunca se
edita a mano.

Para que la generación no dependa de la pila ni de ``.env``, el script asigna su
propio entorno mínimo antes de construir la aplicación: una URL de PostgreSQL,
una de MongoDB y un secreto de firma de más de 32 bytes. Asignar y no completar
con ``setdefault`` es deliberado: el contrato no debe cambiar según el entorno de
quien lo genera, y una terminal que exportó ``.env`` trae el secreto de ejemplo
que la configuración rechaza, de modo que respetarlo haría fallar la generación.
Construir la aplicación no abre conexiones, así que esos valores solo tienen que
ser válidos, no alcanzables. La serialización fija el orden de las claves y el
salto de línea final para que dos ejecuciones produzcan los mismos bytes.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

# El script vive en scripts/ y el contrato en docs/api/.
ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "docs" / "api" / "openapi.json"

# Entorno mínimo de la configuración. La aplicación no se conecta al construirla
# y estos valores solo pasan la validación.
_PLACEHOLDER_ENVIRONMENT = {
    "HTA_DATABASE_URL": "postgresql://contrato:contrato@localhost:5432/contrato",
    "HTA_MONGO_URL": "mongodb://localhost:27017/contrato",
    "HTA_JWT_SECRET": "secreto-de-generacion-del-contrato-con-mas-de-32-bytes",
}


def _prepare_environment() -> None:
    """Asigna las variables que ``Settings`` exige, sin mirar el entorno externo."""
    for name, value in _PLACEHOLDER_ENVIRONMENT.items():
        os.environ[name] = value


def generate_contract() -> dict[str, Any]:
    """Construye la aplicación con el entorno mínimo y devuelve su OpenAPI."""
    _prepare_environment()
    # La importación ocurre después de preparar el entorno: ``hta.app`` construye
    # ``Settings`` al crear la aplicación y fallaría sin las tres variables.
    from hta.app import create_app

    return create_app().openapi()


def main(argv: list[str] | None = None) -> int:
    """Escribe el contrato en ``docs/api/openapi.json`` y anuncia la ruta."""
    parser = argparse.ArgumentParser(
        description="Genera docs/api/openapi.json a partir de la aplicación."
    )
    parser.parse_args(argv)
    contract = generate_contract()
    CONTRACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONTRACT_PATH.write_text(
        json.dumps(contract, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Contrato escrito en {CONTRACT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
