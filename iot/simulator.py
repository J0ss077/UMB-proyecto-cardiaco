"""@requirement RF-04

Simulador de un dispositivo de presión arterial.

Herramienta de demostración, no un dispositivo real: no implementa
emparejamiento ni reintentos con memoria. Envía una lectura por segundo durante
los minutos indicados al contrato de ingesta. La clave y el paciente salen de
los argumentos o del entorno:

    HTA_DEVICE_KEY=... python iot/simulator.py --patient-id <uuid> --minutes 1
"""

from __future__ import annotations

import argparse
import json
import os
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

DEFAULT_BASE_URL = "http://localhost:8000"


def _parse(argv: list[str] | None) -> argparse.Namespace:
    """Lee los argumentos; el entorno completa lo que no se indica."""
    parser = argparse.ArgumentParser(
        description="Envía lecturas simuladas a la ingesta."
    )
    parser.add_argument(
        "--base-url",
        default=(
            os.environ.get("HTA_API_BASE_URL")
            or os.environ.get("API_BASE_URL")
            or DEFAULT_BASE_URL
        ),
        help="URL base de la API.",
    )
    parser.add_argument(
        "--device-key",
        default=os.environ.get("HTA_DEVICE_KEY", ""),
        help="Clave compartida que espera el servidor en X-Device-Key.",
    )
    parser.add_argument(
        "--patient-id",
        default=os.environ.get("HTA_PATIENT_ID", ""),
        help="Identificador de la cuenta del paciente.",
    )
    parser.add_argument("--device-id", default="sim-1")
    parser.add_argument(
        "--minutes",
        type=float,
        default=1.0,
        help="Minutos de simulación, con una lectura por segundo.",
    )
    return parser.parse_args(argv)


def _send(url: str, key: str, reading: dict[str, object]) -> tuple[int, dict]:
    """Publica una lectura y devuelve su estado y su cuerpo."""
    request = urllib.request.Request(
        url,
        data=json.dumps(reading).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Device-Key": key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.status, json.loads(response.read())


def main(argv: list[str] | None = None) -> int:
    """Envía las lecturas y devuelve 0 si todas fueron aceptadas."""
    args = _parse(argv)
    if not args.device_key or not args.patient_id:
        print("Faltan --device-key/HTA_DEVICE_KEY o --patient-id/HTA_PATIENT_ID.")
        return 2
    url = args.base_url.rstrip("/") + "/api/ingest/readings"
    total = max(1, round(args.minutes * 60))
    for number in range(1, total + 1):
        reading = {
            "device_id": args.device_id,
            "patient_id": args.patient_id,
            "systolic": random.randint(112, 138),
            "diastolic": random.randint(72, 90),
            "heart_rate": random.randint(58, 82),
            "measured_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            status, body = _send(url, args.device_key, reading)
        except urllib.error.HTTPError as error:
            print(f"{number}/{total}: rechazo {error.code} {error.read()!r}")
            return 1
        except (urllib.error.URLError, TimeoutError) as error:
            print(f"{number}/{total}: error de red: {error}")
            return 1
        print(f"{number}/{total}: {status} lectura {body.get('id', 'sin id')}")
        if number < total:
            time.sleep(1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
