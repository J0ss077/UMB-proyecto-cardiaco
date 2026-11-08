"""@requirement RF-08

Pruebas unitarias de la plausibilidad fisiológica de una lectura.

La regla no conoce umbrales clínicos: solo descarta lo que el cuerpo no puede
producir. Una lectura alta pero posible, como 150/95, sigue siendo válida y se
conserva; la clasificación clínica llega con la configuración de alertas.
"""

import pytest

from hta.clinical.validation import plausibility


@pytest.mark.parametrize(
    ("systolic", "diastolic"),
    [
        (120, 80),
        (80, 40),
        (200, 130),
        (150, 95),
        (139, 89),
    ],
    ids=["normal", "limite-inferior", "limite-superior", "alta-pero-posible", "cercana"],
)
def test_plausible_reading_is_valid(systolic, diastolic):
    """Una lectura dentro de los dos rangos y con sistólica mayor es válida."""
    assert plausibility(systolic, diastolic) == "valid"


@pytest.mark.parametrize(
    ("systolic", "diastolic"),
    [
        (79, 50),
        (201, 90),
        (120, 39),
        (120, 131),
        (120, 120),
        (80, 120),
    ],
    ids=[
        "sistolica-baja",
        "sistolica-alta",
        "diastolica-baja",
        "diastolica-alta",
        "sistolica-igual",
        "sistolica-menor",
    ],
)
def test_impossible_reading_is_out_of_range(systolic, diastolic):
    """Cada rango y la relación entre las dos cifras marcan la lectura."""
    assert plausibility(systolic, diastolic) == "out_of_range"
