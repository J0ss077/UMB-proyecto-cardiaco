"""@requirement RF-02

Pruebas unitarias del cuerpo de la solicitud de cambio de contraseña.
"""

import pytest
from pydantic import ValidationError

from hta.passwordchange.schemas import NEW_PASSWORD_MAX, NEW_PASSWORD_MIN, PasswordChangeRequest

pytestmark = pytest.mark.unit


def test_accepts_a_current_and_a_new_password():
    body = PasswordChangeRequest(current_password="actual-1", new_password="nueva-clave-9")
    assert body.new_password == "nueva-clave-9"


@pytest.mark.parametrize("new", ["", "corta", "x" * (NEW_PASSWORD_MIN - 1), "x" * (NEW_PASSWORD_MAX + 1)])
def test_rejects_a_new_password_out_of_length(new):
    with pytest.raises(ValidationError):
        PasswordChangeRequest(current_password="actual-1", new_password=new)


def test_rejects_a_new_password_equal_to_the_current_one():
    with pytest.raises(ValidationError):
        PasswordChangeRequest(current_password="misma-clave-1", new_password="misma-clave-1")


def test_rejects_a_blank_current_password_and_unknown_fields():
    with pytest.raises(ValidationError):
        PasswordChangeRequest(current_password="", new_password="nueva-clave-9")
    with pytest.raises(ValidationError):
        PasswordChangeRequest.model_validate({"current_password": "a", "new_password": "nueva-clave-9", "role": "admin"})


def test_does_not_strip_the_password():
    assert PasswordChangeRequest(current_password="a", new_password="  espacios 1  ").new_password == "  espacios 1  "
