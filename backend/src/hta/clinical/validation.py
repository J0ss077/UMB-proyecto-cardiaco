"""@requirement RF-08

Plausibilidad fisiológica de una lectura de presión arterial y resumen de la
ventana domiciliaria.

La plausibilidad no es una clasificación clínica: descarta lo que el cuerpo no
puede producir y conserva todo lo demás. Los umbrales clínicos viven en
``alert_config`` y se aplican en una tarea posterior; una lectura alta pero
posible, como 150/95, es válida y no se marca.

El resumen de la ventana es la única parte del módulo que agrega: recibe las
lecturas de los últimos siete días ya agrupadas por fecha UTC, descarta el
primer día completo y exige un mínimo de lecturas válidas en un mínimo de
fechas. Es una función pura para que la regla se pueda probar sin base de
datos; el módulo ``readings`` la alimenta con la consulta.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

# Rangos plausibles de una lectura en reposo, en mmHg. Son los que publica el
# requerimiento: por fuera de ellos la cifra no es una medición humana y se
# conserva marcada, nunca se descarta.
SYSTOLIC_MIN = 80
SYSTOLIC_MAX = 200
DIASTOLIC_MIN = 40
DIASTOLIC_MAX = 130

VALID = "valid"
OUT_OF_RANGE = "out_of_range"

# Regla de la ventana domiciliaria. La longitud es la de la ventana; el mínimo
# de lecturas y el de fechas deciden si el resumen es suficiente.
WINDOW_DAYS = 7
MIN_VALID_READINGS = 8
MIN_DAYS_WITH_READINGS = 2

# Las medias se publican con un decimal. El redondeo es explícito para que no
# dependa de la configuración del contexto decimal del proceso.
_MEAN_QUANTUM = Decimal("0.1")


@dataclass(frozen=True)
class WindowReading:
    """Lectura de la ventana ya reducida a lo que el resumen necesita."""

    day: date
    systolic: int
    diastolic: int
    validation_status: str


@dataclass(frozen=True)
class WindowSummary:
    """Resultado del resumen, con las dos fechas que lo enmarcan.

    ``valid_count`` y ``days_with_readings`` se calculan después de descartar
    el primer día y solo sobre las lecturas ``valid``. Las medias son ``None``
    cuando el resumen no es suficiente: un promedio de dos lecturas no es un
    dato que se pueda mostrar.
    """

    window_start: datetime
    window_end: datetime
    sufficient: bool
    valid_count: int
    days_with_readings: int
    mean_systolic: Decimal | None
    mean_diastolic: Decimal | None


def plausibility(systolic: int, diastolic: int) -> str:
    """Clasifica una lectura como ``valid`` o ``out_of_range``.

    Una lectura es imposible si la sistólica queda fuera de 80 a 200 mmHg, la
    diastólica fuera de 40 a 130 mmHg, o la sistólica no es estrictamente mayor
    que la diastólica. Los extremos son inclusivos: 200/130 es fisiológicamente
    posible y se conserva como válida.
    """
    if not SYSTOLIC_MIN <= systolic <= SYSTOLIC_MAX:
        return OUT_OF_RANGE
    if not DIASTOLIC_MIN <= diastolic <= DIASTOLIC_MAX:
        return OUT_OF_RANGE
    if systolic <= diastolic:
        return OUT_OF_RANGE
    return VALID


def _mean(values: list[int]) -> Decimal:
    """Devuelve la media con un decimal, redondeada al alza en el medio."""
    total = sum(Decimal(value) for value in values)
    return (total / Decimal(len(values))).quantize(
        _MEAN_QUANTUM,
        rounding=ROUND_HALF_UP,
    )


def summarize_window(
    readings: list[WindowReading],
    window_start: datetime,
    window_end: datetime,
) -> WindowSummary:
    """Resume las lecturas de la ventana domiciliaria de siete días.

    Las lecturas llegan ya acotadas al intervalo y con su fecha UTC. Si hay dos
    o más fechas distintas se descarta completa la más antigua: el primer día
    suele estar incompleto y no representa la rutina del paciente. De lo que
    queda se cuentan solo las lecturas ``valid``. El resumen es suficiente con
    al menos ocho lecturas válidas repartidas en al menos dos fechas; con menos,
    las medias quedan en ``None`` para que el cliente no las muestre.
    """
    days = {reading.day for reading in readings}
    discarded = min(days) if len(days) >= MIN_DAYS_WITH_READINGS else None
    kept = [reading for reading in readings if reading.day != discarded]
    valid = [
        reading for reading in kept if reading.validation_status == VALID
    ]
    valid_days = {reading.day for reading in valid}
    sufficient = (
        len(valid) >= MIN_VALID_READINGS
        and len(valid_days) >= MIN_DAYS_WITH_READINGS
    )
    if sufficient:
        mean_systolic = _mean([reading.systolic for reading in valid])
        mean_diastolic = _mean([reading.diastolic for reading in valid])
    else:
        mean_systolic = None
        mean_diastolic = None
    return WindowSummary(
        window_start=window_start,
        window_end=window_end,
        sufficient=sufficient,
        valid_count=len(valid),
        days_with_readings=len(valid_days),
        mean_systolic=mean_systolic,
        mean_diastolic=mean_diastolic,
    )

