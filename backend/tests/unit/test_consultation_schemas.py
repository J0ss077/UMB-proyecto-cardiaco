"""@requirement RF-24

Pruebas unitarias de los cuerpos de la consulta rápida: sin base de datos.
"""

import pytest
from pydantic import ValidationError

from hta.consultations.schemas import (
    MEDICATIONS_MAX,
    MESSAGE_MAX,
    ONSETS,
    REASONS,
    CheckupRequest,
    ConsultationRequest,
    MeetRequest,
)

pytestmark = pytest.mark.unit


def body(**overrides):
    return {"message": "Tengo mareos", "reason": "dizziness_headache", "onset": "since_yesterday", **overrides}


def test_trims_the_message():
    assert ConsultationRequest.model_validate(body(message="  Tengo mareos  ")).message == "Tengo mareos"


@pytest.mark.parametrize("value", ["", "   ", None])
def test_rejects_an_empty_message(value):
    with pytest.raises(ValidationError):
        ConsultationRequest.model_validate(body(message=value))


def test_rejects_a_message_over_the_limit_and_accepts_the_limit():
    assert ConsultationRequest.model_validate(body(message="a" * MESSAGE_MAX)).message == "a" * MESSAGE_MAX
    with pytest.raises(ValidationError):
        ConsultationRequest.model_validate(body(message="a" * (MESSAGE_MAX + 1)))


def test_the_reason_and_the_onset_are_required_and_come_from_fixed_lists():
    for reason in REASONS:
        assert ConsultationRequest.model_validate(body(reason=reason)).reason == reason
    for onset in ONSETS:
        assert ConsultationRequest.model_validate(body(onset=onset)).onset == onset
    for missing in ("reason", "onset"):
        data = body()
        del data[missing]
        with pytest.raises(ValidationError):
            ConsultationRequest.model_validate(data)
    for field, value in (("reason", "otra_cosa"), ("onset", "ayer"), ("reason", ""), ("onset", None)):
        with pytest.raises(ValidationError):
            ConsultationRequest.model_validate(body(**{field: value}))


def test_medications_are_optional_trimmed_and_limited():
    assert ConsultationRequest.model_validate(body()).medications is None
    assert ConsultationRequest.model_validate(body(medications="  losartán  ")).medications == "losartán"
    assert ConsultationRequest.model_validate(body(medications="   ")).medications is None
    assert ConsultationRequest.model_validate(body(medications=None)).medications is None
    with pytest.raises(ValidationError):
        ConsultationRequest.model_validate(body(medications="a" * (MEDICATIONS_MAX + 1)))


def test_wants_meet_and_share_phone_default_to_false_and_must_be_booleans():
    request = ConsultationRequest.model_validate(body())
    assert request.wants_meet is False
    assert request.share_phone is False
    assert ConsultationRequest.model_validate(body(wants_meet=True, share_phone=True)).wants_meet is True
    for field in ("wants_meet", "share_phone"):
        with pytest.raises(ValidationError):
            ConsultationRequest.model_validate(body(**{field: "sí"}))


def test_the_physician_is_optional_and_must_be_an_id():
    assert ConsultationRequest.model_validate(body()).physician_id is None
    assert str(ConsultationRequest.model_validate(body(physician_id="1106cf54-2606-47f6-a368-cb15e834ca56")).physician_id) == "1106cf54-2606-47f6-a368-cb15e834ca56"
    with pytest.raises(ValidationError):
        ConsultationRequest.model_validate(body(physician_id="no-es-un-id"))


def test_rejects_fields_the_patient_does_not_choose():
    for field in ("patient_id", "status", "response", "reading_id", "contact_phone", "urgent"):
        with pytest.raises(ValidationError):
            ConsultationRequest.model_validate(body(**{field: "x"}))


def _checkup(**overrides):
    body = {
        "response": "Continúe",
        "checkup_general": "Estable",
        "checkup_pressure": "150/95",
        "checkup_symptoms": "Mareo",
        "checkup_conduct": "Registro diario",
    }
    body.update(overrides)
    return body


def test_the_response_is_trimmed_and_required():
    assert CheckupRequest.model_validate(_checkup(response="  Continúe  ")).response == "Continúe"
    for value in ("", "  ", None):
        with pytest.raises(ValidationError):
            CheckupRequest.model_validate(_checkup(response=value))
    with pytest.raises(ValidationError):
        CheckupRequest.model_validate(_checkup(response="a" * (MESSAGE_MAX + 1)))


def test_the_meet_link_and_the_checkup_are_written_by_hand():
    assert MeetRequest.model_validate({"meet_url": "  https://meet.google.com/abc-defg-hij  "}).meet_url == "https://meet.google.com/abc-defg-hij"
    saved = CheckupRequest.model_validate(_checkup(checkup_general="  Estable  "))
    assert saved.checkup_general == "Estable"
    for url in ("https://example.com/abc", "http://meet.google.com/abc", "https://meet.google.com", "https://meet.google.com/"):
        with pytest.raises(ValidationError):
            MeetRequest.model_validate({"meet_url": url})
    with pytest.raises(ValidationError):
        CheckupRequest.model_validate(_checkup(checkup_pressure="  "))
    with pytest.raises(ValidationError):
        CheckupRequest.model_validate(_checkup(meet_url="https://meet.google.com/abc-defg-hij"))
