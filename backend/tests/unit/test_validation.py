"""@requirement RF-08

Pruebas unitarias de la plausibilidad fisiológica y del resumen de la ventana.

La regla no conoce umbrales clínicos: solo descarta lo que el cuerpo no puede
producir. Una lectura alta pero posible, como 150/95, sigue siendo válida y se
conserva; la clasificación clínica llega con la configuración de alertas. El
resumen de la ventana descarta el primer día, cuenta solo las lecturas válidas
y exige ocho en dos fechas para publicar medias.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from hta.clinical.validation import (
    WindowReading,
    plausibility,
    summarize_window,
)

START = datetime(2026, 11, 1, tzinfo=timezone.utc)
END = datetime(2026, 11, 8, tzinfo=timezone.utc)


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


def _reading(day: date, systolic: int, diastolic: int, status: str = "valid"):
    """Construye una lectura de la ventana en la fecha indicada."""
    return WindowReading(
        day=day,
        systolic=systolic,
        diastolic=diastolic,
        validation_status=status,
    )


def test_window_discards_the_earliest_day():
    """La fecha más antigua no cuenta aunque traiga más lecturas que las demás."""
    readings = [_reading(date(2026, 1, 1), 120, 80) for _ in range(8)] + [
        _reading(date(2026, 1, 2), 120, 80)
    ]
    summary = summarize_window(readings, START, END)
    assert summary.valid_count == 1
    assert summary.days_with_readings == 1
    assert summary.sufficient is False
    assert summary.mean_systolic is None
    assert summary.mean_diastolic is None


def test_window_needs_eight_valid_readings():
    """Siete lecturas válidas no alcanzan; ocho en dos fechas sí."""
    seven = [
        *[_reading(date(2026, 1, 2), 120, 80) for _ in range(4)],
        *[_reading(date(2026, 1, 3), 120, 80) for _ in range(3)],
        *[_reading(date(2026, 1, 1), 120, 80) for _ in range(5)],
    ]
    assert summarize_window(seven, START, END).sufficient is False

    eight = [
        *[_reading(date(2026, 1, 2), 120, 80) for _ in range(4)],
        *[_reading(date(2026, 1, 3), 120, 80) for _ in range(4)],
        _reading(date(2026, 1, 1), 120, 80),
    ]
    assert summarize_window(eight, START, END).sufficient is True


def test_window_needs_two_dates_after_discarding_the_first():
    """Muchas lecturas en el mismo día no sustituyen una segunda fecha."""
    readings = [_reading(date(2026, 1, 2), 120, 80) for _ in range(10)]
    summary = summarize_window(readings, START, END)
    assert summary.valid_count == 10
    assert summary.days_with_readings == 1
    assert summary.sufficient is False


def test_window_groups_by_date_before_discarding():
    """El primer día se decide con todas las lecturas, no solo con las válidas."""
    readings = [
        _reading(date(2026, 1, 1), 300, 200, "out_of_range"),
        *[_reading(date(2026, 1, 2), 120, 80) for _ in range(8)],
    ]
    summary = summarize_window(readings, START, END)
    assert summary.valid_count == 8
    assert summary.days_with_readings == 1
    assert summary.sufficient is False


def test_window_mean_rounds_half_up_to_one_decimal():
    """La media se publica con un decimal y el medio se redondea al alza."""
    readings = [
        _reading(date(2026, 1, 2), 120, 80),
        _reading(date(2026, 1, 2), 120, 80),
        _reading(date(2026, 1, 2), 120, 80),
        _reading(date(2026, 1, 2), 121, 80),
        _reading(date(2026, 1, 3), 120, 80),
        _reading(date(2026, 1, 3), 120, 80),
        _reading(date(2026, 1, 3), 120, 80),
        _reading(date(2026, 1, 3), 121, 80),
        _reading(date(2026, 1, 1), 120, 80),
    ]
    summary = summarize_window(readings, START, END)
    assert summary.mean_systolic == Decimal("120.3")
    assert summary.mean_diastolic == Decimal("80.0")
    assert summary.window_start == START
    assert summary.window_end == END
