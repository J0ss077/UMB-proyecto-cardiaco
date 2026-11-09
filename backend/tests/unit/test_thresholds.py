"""@requirement RF-15

La banda de un umbral se rechaza cuando está invertida o fuera del intervalo
de la métrica. Un hueco, un valor nulo, se acepta: esa orilla no dispara aviso.
"""

import pytest

from hta.adminconsole.thresholds import threshold_problem


def test_a_coherent_band_is_accepted():
    assert threshold_problem("systolic", 90, 140, 80, 180) is None
    assert threshold_problem("diastolic", None, 90, None, 120) is None
    assert threshold_problem("systolic", None, None, None, None) is None


@pytest.mark.parametrize(
    ("low", "high", "critical_low", "critical_high", "fragment"),
    [
        (150, 140, None, None, "aviso desde tiene que ser menor que el aviso hasta"),
        (None, None, 180, 80, "crítico desde tiene que ser menor que el crítico hasta"),
        (90, 140, 90, 180, "crítico desde tiene que ser menor que el aviso desde"),
        (90, 140, 80, 140, "crítico hasta tiene que ser mayor que el aviso hasta"),
        (None, 140, 140, None, "crítico desde tiene que ser menor que el aviso hasta"),
        (90, None, None, 90, "crítico hasta tiene que ser mayor que el aviso desde"),
        (30, 140, None, None, "aviso desde tiene que estar entre 40 y 260"),
        (None, 300, None, None, "aviso hasta tiene que estar entre 40 y 260"),
    ],
)
def test_an_incoherent_band_explains_why(low, high, critical_low, critical_high, fragment):
    message = threshold_problem("systolic", low, high, critical_low, critical_high)
    assert message is not None
    assert fragment in message
