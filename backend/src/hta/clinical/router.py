"""@requirement RF-19

Endpoints HTTP del núcleo clínico: directorio de pacientes, consulta de
lecturas con su ventana domiciliaria, síntomas, las dos rutas de alta y la
gestión humana de las alertas.

Las rutas de lectura exigen una sesión de paciente, médico o cuidador; el
administrador recibe 403. El identificador de paciente que viaja en la petición
y en la respuesta es el de ``users``; el de ``patient_profiles`` no sale del
servidor. La conexión la entrega ``auth.deps.get_conn`` y la comparten la
dependencia de autorización y el endpoint, que la confirma dentro del servicio
antes de responder.

La consulta de lecturas y síntomas no exige consentimiento: es la historia
clínica que el médico debe poder leer. El resumen de la ventana sí lo exige,
porque es análisis, y responde 403 con el mismo mensaje que las rutas de alta.
Las rutas de alertas no crean alertas ni las cierran por su cuenta: solo listan,
leen y registran una transición firmada por una persona. El listado y la consulta
aceptan a los tres roles clínicos; las tres transiciones exigen además el rol de
médico, porque mover una alerta es el acto clínico que la cierra.
"""

from __future__ import annotations

# Las rutas de alta siguen declarando RF-05, el listado de síntomas declara
# RF-21 y el bloque de alertas declara RF-16. La primera línea del docstring
# declara el directorio y la consulta de lecturas, que son lo que agrega esta
# tarea.
# @requirement RF-05
# @requirement RF-21
# @requirement RF-16

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from psycopg import AsyncConnection
from pydantic import BaseModel, ConfigDict

from hta.auth.deps import CurrentUser, get_conn, require_role
from hta.clinical import access, alerts, patients, readings, symptoms, validation

router = APIRouter(prefix="/api", tags=["clinical"])

# Roles que pueden consultar datos clínicos. El administrador queda fuera y
# recibe el 403 de ``require_role`` antes de llegar al servicio.
CLINICAL_ROLES = ("patient", "physician", "caregiver")

# Página por omisión y máximo de los listados, los mismos del contrato. El
# máximo evita que una petición se lleve la tabla entera.
DEFAULT_LIMIT = 50
MAX_LIMIT = 200

# Valores de los tipos enumerados ``alert_status`` y ``alert_severity``. La
# ruta los valida y un valor fuera de ellos responde 422 sin llegar al
# servicio de alertas.
AlertStatus = Literal["open", "acknowledged", "validated", "dismissed"]
AlertSeverity = Literal["low", "medium", "high", "critical"]


class SymptomRequest(BaseModel):
    """Texto libre y estado de ánimo que acompañan a una lectura.

    Los dos campos son opcionales, pero al menos uno debe traer texto: un
    objeto vacío no es un síntoma. La regla la aplica el servicio, que es quien
    también atiende el alta de un síntoma suelto.
    """

    model_config = ConfigDict(extra="forbid")

    free_text: str | None = None
    mood: str | None = None


class ReadingRequest(BaseModel):
    """Datos de una lectura manual de presión arterial.

    ``patient_id`` es opcional y, cuando llega, es el identificador de la cuenta
    del paciente: solo se admite el propio. ``measured_at`` es opcional y sin
    ella se registra el instante actual; con valor debe ser ISO 8601 con
    desplazamiento horario y no puede estar en el futuro.
    """

    model_config = ConfigDict(extra="forbid")

    systolic: int
    diastolic: int
    heart_rate: int | None = None
    measured_at: datetime | None = None
    patient_id: UUID | None = None
    symptom: SymptomRequest | None = None


class ReadingResponse(BaseModel):
    """Lectura guardada o listada, con el identificador de cuenta como paciente.

    ``patient_id`` es el de ``users`` y no el del perfil: es el único
    identificador de paciente que el contrato publica. ``validation_status``
    informa si la cifra es plausible sin que eso cambie el código de estado.
    """

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    patient_id: UUID
    systolic: int
    diastolic: int
    heart_rate: int | None
    source: str
    measured_at: datetime
    validation_status: str


class CreatedSymptom(BaseModel):
    """Identificador del síntoma recién registrado."""

    model_config = ConfigDict(frozen=True)

    id: UUID


class PatientSummaryResponse(BaseModel):
    """Paciente del directorio, con el identificador de su cuenta."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    user_id: UUID
    full_name: str
    birth_date: date | None


class SymptomResponse(BaseModel):
    """Síntoma listado, con el identificador de cuenta como paciente."""

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    patient_id: UUID
    free_text: str | None
    mood: str | None
    recorded_at: datetime


class PaginatedPatients(BaseModel):
    """Página del directorio y total de pacientes visibles para la cuenta."""

    model_config = ConfigDict(frozen=True)

    items: list[PatientSummaryResponse]
    total: int


class PaginatedReadings(BaseModel):
    """Página de lecturas y total de filas filtradas."""

    model_config = ConfigDict(frozen=True)

    items: list[ReadingResponse]
    total: int


class PaginatedSymptoms(BaseModel):
    """Página de síntomas y total de filas del paciente."""

    model_config = ConfigDict(frozen=True)

    items: list[SymptomResponse]
    total: int


class AlertResponse(BaseModel):
    """Alerta listada o consultada, con el identificador de cuenta del paciente.

    ``patient_id`` es el de ``users`` y no el del perfil. ``validated_by`` y
    ``validated_at`` solo tienen valor cuando la alerta está validada y
    ``note`` guarda el motivo del descarte.
    """

    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    patient_id: UUID
    type: str
    severity: str
    status: str
    note: str | None
    created_at: datetime
    validated_by: UUID | None
    validated_at: datetime | None


class AlertTransitionRequest(BaseModel):
    """Nota opcional de una transición de alerta.

    ``validate`` y ``acknowledge`` la aceptan para dejarla en la auditoría;
    ``dismiss`` la exige y la guarda en la alerta. La regla del descarte la
    aplica el servicio, que responde 422 si falta o está en blanco.
    """

    model_config = ConfigDict(extra="forbid")

    note: str | None = None


class PaginatedAlerts(BaseModel):
    """Página de alertas y total de filas filtradas."""

    model_config = ConfigDict(frozen=True)

    items: list[AlertResponse]
    total: int


class WindowSummaryResponse(BaseModel):
    """Resumen de la ventana domiciliaria de siete días.

    ``window_start`` y ``window_end`` permiten rotular la pantalla sin que el
    cliente reconstruya el intervalo. ``mean_systolic`` y ``mean_diastolic``
    viajan como números con un decimal y son ``null`` cuando el resumen no es
    suficiente: un promedio de dos lecturas no se muestra.
    """

    model_config = ConfigDict(frozen=True)

    window_start: datetime
    window_end: datetime
    sufficient: bool
    valid_count: int
    days_with_readings: int
    mean_systolic: float | None
    mean_diastolic: float | None


@router.post("/readings", status_code=201, response_model=ReadingResponse)
async def create_reading(
    body: ReadingRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> ReadingResponse:
    """Registra una lectura manual y, si viene, su síntoma en la misma operación.

    El perfil se resuelve desde la cuenta autenticada; el servicio comprueba el
    consentimiento antes de insertar. La marca normalizada se calcula también
    aquí para devolverla en la respuesta: es la misma función pura que usa el
    servicio, que vuelve a comprobarla antes de insertar. El estado de
    validación de la respuesta sale del mismo validador que clasificó la fila.
    """
    profile_id = await access.patient_profile_id(conn, user, body.patient_id)
    measured_at = readings.measured_at_utc(body.measured_at)
    symptom = (
        symptoms.SymptomInput(
            free_text=body.symptom.free_text,
            mood=body.symptom.mood,
        )
        if body.symptom is not None
        else None
    )
    reading_id = await readings.create(
        conn,
        profile_id,
        user.user_id,
        body.systolic,
        body.diastolic,
        body.heart_rate,
        measured_at,
        symptom,
    )
    return ReadingResponse(
        id=reading_id,
        patient_id=user.user_id,
        systolic=body.systolic,
        diastolic=body.diastolic,
        heart_rate=body.heart_rate,
        source="manual",
        measured_at=measured_at,
        validation_status=validation.plausibility(body.systolic, body.diastolic),
    )


@router.post("/symptoms", status_code=201, response_model=CreatedSymptom)
async def create_symptom(
    body: SymptomRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("patient"))],
) -> CreatedSymptom:
    """Registra un síntoma suelto del paciente con consentimiento vigente.

    Es el alta que no viene acompañada de una lectura. El perfil se resuelve
    desde la cuenta autenticada y el servicio comprueba el consentimiento,
    inserta el síntoma, audita el hecho y confirma antes de responder.
    """
    profile_id = await access.patient_profile_id(conn, user)
    symptom_id = await symptoms.register(
        conn,
        profile_id,
        user.user_id,
        body.free_text,
        body.mood,
    )
    return CreatedSymptom(id=symptom_id)


@router.get("/patients", response_model=PaginatedPatients)
async def list_patients(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role(*CLINICAL_ROLES))],
    limit: Annotated[int, Query(ge=0, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedPatients:
    """Lista los pacientes que la cuenta puede ver, en una página.

    El paciente se ve a sí mismo; el médico, los vinculados; el cuidador, los
    autorizados con alcance ``readings``. El administrador recibe 403. La
    página se recorta en la base y ``total`` cuenta las filas visibles, no las
    de la página.
    """
    page, total = await patients.visible(conn, user, limit, offset)
    return PaginatedPatients(
        items=[PatientSummaryResponse.model_validate(item) for item in page],
        total=total,
    )


@router.get("/readings", response_model=PaginatedReadings)
async def list_readings(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role(*CLINICAL_ROLES))],
    patient_id: UUID | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: Annotated[int, Query(ge=0, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedReadings:
    """Lista las lecturas del paciente visible, de la más reciente a la más vieja.

    Sin ``patient_id`` el paciente ve sus propias lecturas; el médico y el
    cuidador deben indicar uno y la resolución comprueba el vínculo. ``since``
    y ``until`` son opcionales, inclusivos y deben ser ISO 8601 con
    desplazamiento horario. No se exige consentimiento: es la historia clínica.
    """
    profile_id = await access.patient_profile_id(conn, user, patient_id)
    page, total = await readings.list_for(
        conn,
        profile_id,
        readings.filter_utc(since, "since"),
        readings.filter_utc(until, "until"),
        limit,
        offset,
    )
    return PaginatedReadings(
        items=[ReadingResponse.model_validate(item) for item in page],
        total=total,
    )


@router.get("/readings/summary", response_model=WindowSummaryResponse)
async def home_window_summary(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role(*CLINICAL_ROLES))],
    patient_id: UUID | None = None,
) -> WindowSummaryResponse:
    """Resume la ventana domiciliaria de siete días del paciente visible.

    Exige consentimiento informado vigente del paciente: el resumen es análisis
    de datos clínicos y sin la aceptación responde 403 con
    ``No hay consentimiento informado vigente``. Descarta el primer día de la
    ventana y solo es suficiente con ocho lecturas válidas en dos fechas.
    """
    profile_id = await access.patient_profile_id(conn, user, patient_id)
    await access.require_consent(conn, profile_id)
    summary = await readings.window_summary(conn, profile_id)
    return WindowSummaryResponse(
        window_start=summary.window_start,
        window_end=summary.window_end,
        sufficient=summary.sufficient,
        valid_count=summary.valid_count,
        days_with_readings=summary.days_with_readings,
        mean_systolic=summary.mean_systolic,
        mean_diastolic=summary.mean_diastolic,
    )


@router.get("/symptoms", response_model=PaginatedSymptoms)
async def list_symptoms(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role(*CLINICAL_ROLES))],
    patient_id: UUID | None = None,
    limit: Annotated[int, Query(ge=0, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedSymptoms:
    """Lista los síntomas del paciente visible, del más reciente al más viejo.

    Sigue la misma resolución de alcance y la misma paginación que las
    lecturas: el paciente ve los propios y el médico o el cuidador autorizado
    los del paciente que indican. No se exige consentimiento porque es historia
    clínica, no análisis.
    """
    profile_id = await access.patient_profile_id(conn, user, patient_id)
    page, total = await symptoms.list_for(conn, profile_id, limit, offset)
    return PaginatedSymptoms(
        items=[SymptomResponse.model_validate(item) for item in page],
        total=total,
    )


@router.get("/alerts", response_model=PaginatedAlerts)
async def list_alerts(
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role(*CLINICAL_ROLES))],
    patient_id: UUID | None = None,
    status: Annotated[AlertStatus | None, Query()] = None,
    severity: Annotated[AlertSeverity | None, Query()] = None,
    limit: Annotated[int, Query(ge=0, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedAlerts:
    """Lista las alertas del paciente visible, de la más reciente a la más vieja.

    Sigue la misma resolución de alcance que las lecturas: sin ``patient_id``
    el paciente ve las propias y el médico o el cuidador deben indicarlo y
    comprobar su vínculo. ``status`` y ``severity`` son opcionales y un valor
    fuera de los tipos enumerados responde 422. El administrador recibe 403.
    """
    page, total = await alerts.list_for(
        conn,
        user,
        patient_id,
        status,
        severity,
        limit,
        offset,
    )
    return PaginatedAlerts(
        items=[AlertResponse.model_validate(item) for item in page],
        total=total,
    )


@router.get("/alerts/{alert_id}", response_model=AlertResponse)
async def read_alert(
    alert_id: UUID,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role(*CLINICAL_ROLES))],
) -> AlertResponse:
    """Devuelve una alerta visible para la cuenta.

    Responde 404 si el identificador no corresponde a ninguna alerta y 403 con
    ``Permiso denegado`` si la alerta es de un paciente fuera del alcance. Ese
    403 es el mismo de cualquier otra negativa de alcance y no revela a quién
    pertenece la alerta.
    """
    alert = await alerts.get_for(conn, alert_id, user)
    return AlertResponse.model_validate(alert)


@router.post("/alerts/{alert_id}/acknowledge", status_code=204)
async def acknowledge_alert(
    alert_id: UUID,
    body: AlertTransitionRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("physician"))],
) -> None:
    """Acusa recibo de una alerta abierta.

    Exige el rol de médico antes de leer el estado. Solo cambia el estado a
    ``acknowledged``. La transición se rechaza con 409 si la alerta ya no está
    abierta y queda auditada con el actor.
    """
    await alerts.transition(conn, alert_id, user, "acknowledge", body.note)


@router.post("/alerts/{alert_id}/validate", status_code=204)
async def validate_alert(
    alert_id: UUID,
    body: AlertTransitionRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("physician"))],
) -> None:
    """Valida una alerta abierta o reconocida.

    Exige el rol de médico antes de leer el estado. Escribe ``validated_by`` y
    ``validated_at`` con la persona que valida. La nota opcional viaja a la
    auditoría. Responde 409 si el estado actual no admite la transición.
    """
    await alerts.transition(conn, alert_id, user, "validate", body.note)


@router.post("/alerts/{alert_id}/dismiss", status_code=204)
async def dismiss_alert(
    alert_id: UUID,
    body: AlertTransitionRequest,
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    user: Annotated[CurrentUser, Depends(require_role("physician"))],
) -> None:
    """Descarta una alerta abierta o reconocida con un motivo obligatorio.

    Exige el rol de médico antes de leer el estado. Sin nota, o con una nota en
    blanco, responde 422 y no cambia la alerta. El motivo se guarda en la
    alerta y en la auditoría.
    """
    await alerts.transition(conn, alert_id, user, "dismiss", body.note)
