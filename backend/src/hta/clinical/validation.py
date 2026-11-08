"""@requirement RF-08

Plausibilidad fisiológica de una lectura de presión arterial.

No es una clasificación clínica: descarta lo que el cuerpo no puede producir y
conserva todo lo demás. Los umbrales clínicos viven en ``alert_config`` y se
aplican en una tarea posterior; una lectura alta pero posible, como 150/95, es
válida y no se marca.
"""

from __future__ import annotations

# Rangos plausibles de una lectura en reposo, en mmHg. Son los que publica el
# requerimiento: por fuera de ellos la cifra no es una medición humana y se
# conserva marcada, nunca se descarta.
SYSTOLIC_MIN = 80
SYSTOLIC_MAX = 200
DIASTOLIC_MIN = 40
DIASTOLIC_MAX = 130

VALID = "valid"
OUT_OF_RANGE = "out_of_range"


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
