"""@requirement RF-15

Coherencia de los cuatro umbrales de una métrica.

La base no impone el orden entre ``low_threshold``, ``high_threshold``,
``critical_low`` y ``critical_high``. Esta función es esa validación: una banda
invertida no se guarda, porque dejaría de indicar desde dónde hasta dónde va
el aviso. Un valor fuera del intervalo de la métrica tampoco se guarda.
"""

from __future__ import annotations

import math

# Intervalo en el que un administrador puede situar cada métrica. Es más amplio
# que la plausibilidad de una lectura, porque el umbral es la frontera y no la
# medición. Las cifras son mmHg para la presión.
_BOUNDS: dict[str, tuple[float, float]] = {
    "systolic": (40, 260),
    "diastolic": (20, 180),
}
_DEFAULT_BOUNDS = (0, 500)

_NAMES = {
    "low": "El aviso desde",
    "high": "El aviso hasta",
    "critical_low": "El crítico desde",
    "critical_high": "El crítico hasta",
}


def threshold_problem(
    metric: str,
    low: float | None,
    high: float | None,
    critical_low: float | None,
    critical_high: float | None,
) -> str | None:
    """Devuelve el motivo por el que la banda no se puede guardar, o ``None``."""
    values = {
        "low": low,
        "high": high,
        "critical_low": critical_low,
        "critical_high": critical_high,
    }
    floor, ceiling = _BOUNDS.get(metric, _DEFAULT_BOUNDS)
    for key, value in values.items():
        if value is None:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return f"{_NAMES[key]} tiene que ser un número."
        if value < floor or value > ceiling:
            return f"{_NAMES[key]} tiene que estar entre {floor:g} y {ceiling:g}."

    if low is not None and high is not None and low >= high:
        return "El aviso desde tiene que ser menor que el aviso hasta."
    if critical_low is not None and critical_high is not None and critical_low >= critical_high:
        return "El crítico desde tiene que ser menor que el crítico hasta."
    if critical_low is not None and low is not None and critical_low >= low:
        return "El crítico desde tiene que ser menor que el aviso desde."
    if critical_high is not None and high is not None and critical_high <= high:
        return "El crítico hasta tiene que ser mayor que el aviso hasta."
    if critical_low is not None and high is not None and critical_low >= high:
        return "El crítico desde tiene que ser menor que el aviso hasta."
    if critical_high is not None and low is not None and critical_high <= low:
        return "El crítico hasta tiene que ser mayor que el aviso desde."
    return None
