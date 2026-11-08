"""@requirement RF-21

Pruebas unitarias de la regla que decide si un síntoma trae contenido.

Un objeto vacío, o con solo espacios, no es un síntoma: el alta responde 422
antes de escribir nada. Basta con uno de los dos campos para que el registro
tenga sentido.
"""

import pytest

from hta.clinical.symptoms import has_content


@pytest.mark.parametrize(
    ("free_text", "mood"),
    [
        ("dolor de cabeza", None),
        (None, "ansioso"),
        ("mareo", "bien"),
        ("dolor", ""),
    ],
    ids=["solo-texto", "solo-animo", "ambos", "animo-vacio"],
)
def test_a_symptom_with_some_content_is_accepted(free_text, mood):
    """Al menos uno de los dos campos con texto hace que el síntoma exista."""
    assert has_content(free_text, mood) is True


@pytest.mark.parametrize(
    ("free_text", "mood"),
    [
        (None, None),
        ("", ""),
        ("   ", "\t"),
        ("", None),
    ],
    ids=["objeto-vacio", "cadenas-vacias", "solo-espacios", "un-campo-vacio"],
)
def test_an_empty_symptom_has_no_content(free_text, mood):
    """Sin texto en ninguno de los dos campos no hay síntoma que registrar."""
    assert has_content(free_text, mood) is False
