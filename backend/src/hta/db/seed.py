"""@requirement none

Datos de demostración para recorrer la aplicación con las cuatro cuentas.

La siembra es infraestructura, no una funcionalidad: crea las siete cuentas de
demostración, los cuatro perfiles de paciente y los datos clínicos que cada
escenario necesita. No escribe auditoría de las personas: la única fila es el
motivo del descarte de una alerta de demostración, porque esa pantalla lo lee
de la auditoría y no de la alerta.

Los datos son deterministas por día: la rejilla de lecturas se ancla en la
medianoche UTC del día actual, con dos mediciones diarias a las 07:00 y a las
20:00 durante los últimos diez días. La más reciente queda en el día anterior,
de modo que ninguna lectura cae en el futuro. El síntoma del escenario crítico
se ancla a las 21:30 del día anterior, después de la última lectura. Las
consultas se miden en horas hacia atrás desde el instante de la siembra, no con
horas fijas del día, para que ninguna quede fechada en el futuro cuando la
siembra corre de madrugada. Los valores y las distancias se repiten en cualquier
máquina que ejecute la siembra; los identificadores y las sales de las
contraseñas son aleatorios por diseño.

Un perfil de demostración que ya existía antes de la migración de contacto
recibe sus cuatro columnas de contacto solo si están nulas: la siembra nunca
pisa un valor que una persona haya editado. Una columna nula de una de estas
siete cuentas se repone aunque alguien la haya vaciado a propósito: la siembra
solo corre sobre las cuentas de demostración y su trabajo es dejar el escenario
completo. No hay una columna que distinga «nunca se fijó» de «se vació», y
añadirla exigiría una migración que este alcance no justifica; por eso el
relleno es deliberado y está documentado aquí.

La siembra es idempotente por correo y también para las filas que cuelgan de
cada cuenta: si un paciente ya tiene alguna lectura, no se le añade ninguna
serie, y si un síntoma, una alerta, una consulta, un medicamento, un reporte,
una aceptación, un vínculo o un recordatorio ya existe, no se vuelve a insertar.
Lo mismo vale para los dos umbrales globales de ``alert_config``. ``--reset``
borra antes los datos clínicos de estas siete cuentas y deja las cuentas, los
perfiles, los consentimientos y los vínculos. No confirma la transacción; la
conexión de la prueba y la del punto de entrada están en autocommit.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID

import psycopg
from psycopg import Connection
from psycopg.types.json import Jsonb

from hta.accounts.service import normalize_email
from hta.auth.passwords import hash_password
from hta.clinical.validation import plausibility
from hta.consent.service import CONSENT_CONTENT_REF, CURRENT_VERSION

# Contraseña común de las siete cuentas de demostración.
DEMO_PASSWORD = "Demo2026!"

# Umbrales globales de la propuesta documentada en
# docs/research/2026-10-18-umbrales-clinicos-hta.md, Tabla 9. Para las métricas
# de lectura única el umbral superior es 140/90 mmHg y el crítico 180/120; el
# 130/80 de la sección 7.2 es el umbral de "posible hipertensión" del nivel
# `medium`, no el superior de una lectura. La banda inferior queda nula porque
# la Tabla 9 solo propone 90/60 como convención no verificada en las guías y no
# debe presentarse como un umbral documentado. Los destinatarios son el rol
# médico. Nada de esto cuenta como evidencia clínica hasta la firma de un
# clínico.
_ALERT_CONFIG: tuple[tuple[str, int, int], ...] = (
    ("systolic", 140, 180),
    ("diastolic", 90, 120),
)


@dataclass(frozen=True)
class _Account:
    """Una cuenta de demostración y el papel con el que se recorre la aplicación."""

    key: str
    email: str
    role: str
    full_name: str


@dataclass(frozen=True)
class _Profile:
    """Datos del perfil clínico que acompañan a una cuenta de paciente."""

    birth_date: date
    sex: str
    diagnosis_date: date
    height_cm: int
    weight_kg: int
    document_number: str
    phone: str
    trusted_contact_phone: str
    trusted_contact_email: str


@dataclass(frozen=True)
class _ConsentPlan:
    """Días transcurridos desde la aceptación y, si aplica, desde la revocación."""

    accepted_days_ago: int
    revoked_days_ago: int | None


@dataclass(frozen=True)
class _Reminder:
    """Un recordatorio del plan de medicación o de medición."""

    kind: str
    schedule: str


_ACCOUNTS: tuple[_Account, ...] = (
    _Account(
        "admin",
        "admin@hta.demo",
        "admin",
        "Sandra Milena Rojas Cárdenas",
    ),
    _Account(
        "physician",
        "medico@hta.demo",
        "physician",
        "Julián Andrés Morales Vega",
    ),
    _Account(
        "caregiver",
        "cuidador@hta.demo",
        "caregiver",
        "Marta Lucía Gómez Torres",
    ),
    _Account(
        "patient_out_of_range",
        "paciente1@hta.demo",
        "patient",
        "Carlos Alberto Pérez Ruiz",
    ),
    _Account(
        "patient_alert",
        "paciente2@hta.demo",
        "patient",
        "María Fernanda López Díaz",
    ),
    _Account(
        "patient_revoked",
        "paciente3@hta.demo",
        "patient",
        "Jorge Enrique Ramírez Salas",
    ),
    _Account(
        "patient_caregiver",
        "paciente4@hta.demo",
        "patient",
        "Ana María Torres Gil",
    ),
)

_PROFILES: dict[str, _Profile] = {
    "patient_out_of_range": _Profile(
        birth_date=date(1958, 3, 14),
        sex="masculino",
        diagnosis_date=date(2015, 6, 10),
        height_cm=170,
        weight_kg=78,
        document_number="10.000.001",
        phone="+57 300 000 0001",
        trusted_contact_phone="+57 310 000 0001",
        trusted_contact_email="contacto1@example.com",
    ),
    "patient_alert": _Profile(
        birth_date=date(1962, 7, 22),
        sex="femenino",
        diagnosis_date=date(2018, 2, 20),
        height_cm=158,
        weight_kg=71,
        document_number="10.000.002",
        phone="+57 300 000 0002",
        trusted_contact_phone="+57 310 000 0002",
        trusted_contact_email="contacto2@example.com",
    ),
    "patient_revoked": _Profile(
        birth_date=date(1970, 11, 5),
        sex="masculino",
        diagnosis_date=date(2020, 9, 3),
        height_cm=175,
        weight_kg=83,
        document_number="10.000.003",
        phone="+57 300 000 0003",
        trusted_contact_phone="+57 310 000 0003",
        trusted_contact_email="contacto3@example.com",
    ),
    "patient_caregiver": _Profile(
        birth_date=date(1955, 1, 30),
        sex="femenino",
        diagnosis_date=date(2012, 4, 18),
        height_cm=162,
        weight_kg=69,
        document_number="10.000.004",
        phone="+57 300 000 0004",
        trusted_contact_phone="+57 310 000 0004",
        trusted_contact_email="contacto4@example.com",
    ),
}

_CONSENTS: dict[str, _ConsentPlan] = {
    "patient_out_of_range": _ConsentPlan(accepted_days_ago=45, revoked_days_ago=None),
    "patient_alert": _ConsentPlan(accepted_days_ago=30, revoked_days_ago=None),
    # La revocación queda después de la última lectura (ayer a las 20:00) y
    # antes de hoy: el historial se conserva y no hay datos clínicos posteriores
    # a la retirada del consentimiento.
    "patient_revoked": _ConsentPlan(accepted_days_ago=60, revoked_days_ago=1),
    "patient_caregiver": _ConsentPlan(accepted_days_ago=21, revoked_days_ago=None),
}

# Rejilla común: del día 10 al día 1, dos lecturas por día. Los índices pares
# son de dispositivo y los impares manuales.
_READING_GRID: tuple[tuple[int, int], ...] = tuple(
    (days_ago, hour) for days_ago in range(10, 0, -1) for hour in (7, 20)
)

# Valores en el mismo orden que la rejilla. El escenario 1 mezcla lecturas por
# encima del umbral de referencia con lecturas normales y una fisiológicamente
# implausible (78/46) que se conserva como fuera de rango; el escenario 2 guarda
# dos mediciones en el rango de 180/120 mmHg; los escenarios 3 y 4 mantienen una
# serie ordinaria.
_READING_VALUES: dict[str, tuple[tuple[int, int], ...]] = {
    "patient_out_of_range": (
        (148, 96),
        (152, 98),
        (146, 94),
        (150, 96),
        (156, 100),
        (144, 92),
        (158, 102),
        (162, 104),
        (124, 78),
        (128, 80),
        (120, 76),
        (126, 80),
        (132, 84),
        (78, 46),
        (142, 92),
        (118, 74),
        (150, 96),
        (122, 78),
        (146, 94),
        (154, 100),
    ),
    "patient_alert": (
        (130, 82),
        (126, 80),
        (128, 80),
        (132, 84),
        (124, 78),
        (130, 82),
        (134, 84),
        (128, 80),
        (126, 80),
        (132, 84),
        (130, 82),
        (124, 78),
        (128, 80),
        (134, 84),
        (126, 80),
        (130, 82),
        (132, 84),
        (128, 80),
        (186, 122),
        (184, 120),
    ),
    "patient_revoked": (
        (122, 78),
        (126, 80),
        (124, 80),
        (120, 76),
        (128, 82),
        (124, 80),
        (126, 80),
        (130, 82),
        (122, 78),
        (128, 82),
        (124, 80),
        (126, 80),
        (130, 82),
        (124, 78),
        (126, 80),
        (128, 82),
        (122, 78),
        (124, 80),
        (126, 80),
        (128, 82),
    ),
    "patient_caregiver": (
        (132, 84),
        (128, 82),
        (126, 80),
        (130, 82),
        (134, 84),
        (128, 80),
        (130, 82),
        (132, 84),
        (128, 80),
        (126, 78),
        (132, 84),
        (130, 82),
        (126, 80),
        (128, 82),
        (134, 84),
        (130, 82),
        (128, 80),
        (132, 84),
        (126, 80),
        (130, 82),
    ),
}

# Desfase con el que se deriva la frecuencia cardiaca de cada paciente. La
# fórmula mantiene todas las lecturas entre 58 y 93 lpm.
_HEART_RATE_OFFSETS: dict[str, int] = {
    "patient_out_of_range": 0,
    "patient_alert": 5,
    "patient_revoked": 11,
    "patient_caregiver": 17,
}

_DEVICE_SUFFIXES: dict[str, str] = {
    "patient_out_of_range": "p1",
    "patient_alert": "p2",
    "patient_revoked": "p3",
    "patient_caregiver": "p4",
}

_REMINDERS: dict[str, tuple[_Reminder, ...]] = {
    "patient_out_of_range": (_Reminder("medication", "08:00 y 20:00"),),
    "patient_alert": (
        _Reminder("medication", "07:30 y 19:30"),
        _Reminder("measurement", "20:00"),
    ),
    "patient_caregiver": (_Reminder("medication", "09:00"),),
}

_ALERT_TYPE = "crisis_hipertensiva"
_ALERT_NOTE = (
    "Lecturas domiciliarias de 186/122 mmHg y 184/120 mmHg; "
    "pendiente de revisión médica."
)

# El escenario crítico conserva un síntoma del día de la alerta. El texto y el
# estado de ánimo son fijos; la marca se deriva del mismo anclaje diario de la
# rejilla para que una base recién sembrada ya tenga una fila que mostrar.
_SYMPTOM_TEXT = "mareo y dolor de cabeza desde la tarde"
_SYMPTOM_MOOD = "ansioso"

# Síntomas de los otros pacientes con consentimiento vigente. El del escenario
# crítico sigue siendo el de arriba y no se repite aquí.
_EXTRA_SYMPTOMS: dict[str, tuple[str, str, int, int]] = {
    "patient_out_of_range": ("cansancio al subir escaleras", "cansado", 4, 21),
    "patient_caregiver": ("dormí mal anoche", "inquieto", 2, 22),
}


def _heart_rate(index: int, offset: int) -> int:
    """Frecuencia cardiaca determinista entre 58 y 93 lpm."""
    return 58 + (index * 7 + offset) % 36


def _day_anchor(conn: Connection) -> datetime:
    """Medianoche UTC del día actual, referencia de toda la rejilla.

    Se fija en UTC y no en la zona horaria de la sesión para que la rejilla no
    cambie de una máquina a otra por la configuración del servidor.
    """
    return conn.execute(
        "select date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'"
    ).fetchone()[0]


def _now(conn: Connection) -> datetime:
    """Instante de la siembra según PostgreSQL, referencia de lo que se fecha.

    Se toma de la base y no del reloj del proceso para que la comparación con
    ``now()`` de las pruebas y de las columnas sea la misma.
    """
    return conn.execute("select now()").fetchone()[0]


# Datos de contacto y profesionales del personal de demostración. Se escriben solo al
# crear la cuenta: lo que la persona edite después en su perfil no se pisa al resembrar.
_STAFF_CONTACT: dict[str, tuple[str, str | None, str | None]] = {
    "admin": ("+57 300 000 0100", None, None),
    "physician": ("+57 300 000 0200", "RM-10020", "Medicina interna"),
    "caregiver": ("+57 300 000 0300", None, None),
}


def _ensure_account(conn: Connection, account: _Account) -> UUID:
    """Devuelve la cuenta existente o crea la que falta, con su correo normalizado."""
    email = normalize_email(account.email)
    row = conn.execute("select id from users where email = %s", (email,)).fetchone()
    if row is not None:
        return row[0]

    row = conn.execute(
        "insert into users (email, password_hash, role, full_name) "
        "values (%s, %s, %s::user_role, %s) "
        "on conflict (email) do nothing "
        "returning id",
        (email, hash_password(DEMO_PASSWORD), account.role, account.full_name),
    ).fetchone()
    if row is None:
        return conn.execute("select id from users where email = %s", (email,)).fetchone()[0]
    contact = _STAFF_CONTACT.get(account.key)
    if contact is not None:
        conn.execute(
            "update users set phone = %s, license_number = %s, specialty = %s where id = %s",
            (*contact, row[0]),
        )
    return row[0]


def _ensure_profile(conn: Connection, user_id: UUID, profile: _Profile) -> UUID:
    """Devuelve el perfil de la cuenta o lo crea si todavía no existe.

    Un perfil que ya existía antes de la migración ``0002`` puede tener las
    cuatro columnas de contacto nulas. Se rellenan solo cuando están nulas:
    ``coalesce`` conserva lo que la persona haya editado y no pisa nunca un
    valor. Las demás columnas del perfil no se tocan.

    Si una cuenta de demostración tiene una columna nula porque alguien la
    vació, ``coalesce`` también la repone. Es correcto en este contexto y no en
    uno real: la siembra solo toca las siete cuentas ficticias, cuyo propósito
    es reponer el escenario de demostración, y no distingue «nunca se fijó» de
    «se vació» porque el perfil no guarda esa historia. El porqué está en el
    docstring del módulo.
    """
    row = conn.execute(
        "select id from patient_profiles where user_id = %s",
        (user_id,),
    ).fetchone()
    if row is not None:
        conn.execute(
            "update patient_profiles set "
            "document_number = coalesce(document_number, %s), "
            "phone = coalesce(phone, %s), "
            "trusted_contact_phone = coalesce(trusted_contact_phone, %s), "
            "trusted_contact_email = coalesce(trusted_contact_email, %s) "
            "where id = %s",
            (
                profile.document_number,
                profile.phone,
                profile.trusted_contact_phone,
                profile.trusted_contact_email,
                row[0],
            ),
        )
        return row[0]

    return conn.execute(
        "insert into patient_profiles "
        "(user_id, birth_date, sex, diagnosis_date, height_cm, weight_kg, "
        "document_number, phone, trusted_contact_phone, trusted_contact_email) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id",
        (
            user_id,
            profile.birth_date,
            profile.sex,
            profile.diagnosis_date,
            profile.height_cm,
            profile.weight_kg,
            profile.document_number,
            profile.phone,
            profile.trusted_contact_phone,
            profile.trusted_contact_email,
        ),
    ).fetchone()[0]


def _ensure_physician_link(
    conn: Connection,
    patient_id: UUID,
    physician_id: UUID,
    anchor: datetime,
) -> None:
    """Asigna el médico al paciente; la llave primaria evita duplicados."""
    conn.execute(
        "insert into patient_physician (patient_id, physician_id, assigned_at) "
        "values (%s, %s, %s) on conflict do nothing",
        (patient_id, physician_id, anchor - timedelta(days=90) + timedelta(hours=8)),
    )


def _seed_consent(
    conn: Connection,
    patient_id: UUID,
    plan: _ConsentPlan,
    anchor: datetime,
) -> None:
    """Registra la aceptación del escenario o deja el consentimiento revocado.

    El escenario revocado conserva la fila y solo escribe ``revoked_at``: el
    historial de consentimiento no se borra nunca. Si ya existe una aceptación
    vigente, se revoca en lugar de ignorarla, de modo que el escenario siga
    siendo verdadero aunque la fila haya llegado de otro camino. La revocación
    nunca precede a la aceptación que cierra: si la fila existente se aceptó
    después del instante previsto, se retrasa un segundo respecto de su
    aceptación.
    """
    accepted_at = anchor - timedelta(days=plan.accepted_days_ago) + timedelta(hours=9)
    revoked_at = None
    if plan.revoked_days_ago is not None:
        # Las 21:00 quedan después de la última lectura de la rejilla (20:00)
        # del mismo día, de modo que la revocación cierra la puerta sin dejar
        # lecturas posteriores a ella.
        revoked_at = anchor - timedelta(days=plan.revoked_days_ago) + timedelta(hours=21)
        vigentes = conn.execute(
            "select id, accepted_at from consents "
            "where patient_id = %s and version = %s and revoked_at is null",
            (patient_id, CURRENT_VERSION),
        ).fetchall()
        if vigentes:
            for consent_id, existing_accepted_at in vigentes:
                revocation = max(
                    revoked_at,
                    existing_accepted_at + timedelta(seconds=1),
                )
                conn.execute(
                    "update consents set revoked_at = %s where id = %s",
                    (revocation, consent_id),
                )
            return

    row = conn.execute(
        "select 1 from consents where patient_id = %s and version = %s",
        (patient_id, CURRENT_VERSION),
    ).fetchone()
    if row is not None:
        return

    conn.execute(
        "insert into consents "
        "(patient_id, version, accepted_at, content_ref, revoked_at) "
        "values (%s, %s, %s, %s, %s)",
        (
            patient_id,
            CURRENT_VERSION,
            accepted_at,
            CONSENT_CONTENT_REF,
            revoked_at,
        ),
    )


def _seed_readings(
    conn: Connection,
    account_key: str,
    patient_id: UUID,
    anchor: datetime,
) -> None:
    """Inserta la serie completa solo si el paciente no tiene ninguna lectura.

    La guarda es por paciente y no por fecha: una serie ya sembrada no se mueve
    ni se duplica aunque la siembra se ejecute otro día. Si el paciente ya tiene
    una lectura, la serie entera se deja como está.
    """
    existing = conn.execute(
        "select 1 from readings where patient_id = %s limit 1",
        (patient_id,),
    ).fetchone()
    if existing is not None:
        return

    values = _READING_VALUES[account_key]
    offset = _HEART_RATE_OFFSETS[account_key]
    device_id = f"demo-bp-{_DEVICE_SUFFIXES[account_key]}"

    for index, ((days_ago, hour), (systolic, diastolic)) in enumerate(
        zip(_READING_GRID, values, strict=True)
    ):
        measured_at = anchor - timedelta(days=days_ago) + timedelta(hours=hour)
        source = "device" if index % 2 == 0 else "manual"
        conn.execute(
            "insert into readings "
            "(patient_id, systolic, diastolic, heart_rate, source, device_id, "
            " measured_at, validation_status) "
            "values (%s, %s, %s, %s, %s::reading_source, %s, %s, %s::validation_status)",
            (
                patient_id,
                systolic,
                diastolic,
                _heart_rate(index, offset),
                source,
                device_id if source == "device" else None,
                measured_at,
                plausibility(systolic, diastolic),
            ),
        )


def _seed_alert(
    conn: Connection,
    patient_id: UUID,
    anchor: datetime,
) -> None:
    """Deja la alerta abierta del escenario crítico, una sola vez."""
    row = conn.execute(
        "select 1 from alerts where patient_id = %s and type = %s",
        (patient_id, _ALERT_TYPE),
    ).fetchone()
    if row is not None:
        return

    conn.execute(
        "insert into alerts "
        "(patient_id, type, severity, status, note, created_at) "
        "values (%s, %s, 'critical', 'open', %s, %s)",
        (
            patient_id,
            _ALERT_TYPE,
            _ALERT_NOTE,
            anchor - timedelta(days=1) + timedelta(hours=21),
        ),
    )


def _seed_symptom(
    conn: Connection,
    patient_id: UUID,
    anchor: datetime,
) -> None:
    """Deja el síntoma del escenario crítico, una sola vez.

    La guarda es por paciente, como la de las lecturas: si el paciente ya tiene
    algún síntoma, la siembra no añade otro. La marca se deriva del anclaje
    diario, así que no cambia entre dos ejecuciones del mismo día ni deja de
    ser reproducible en otra máquina.
    """
    row = conn.execute(
        "select 1 from symptoms_mood where patient_id = %s limit 1",
        (patient_id,),
    ).fetchone()
    if row is not None:
        return

    conn.execute(
        "insert into symptoms_mood (patient_id, free_text, mood, recorded_at) "
        "values (%s, %s, %s, %s)",
        (
            patient_id,
            _SYMPTOM_TEXT,
            _SYMPTOM_MOOD,
            anchor - timedelta(days=1) + timedelta(hours=21, minutes=30),
        ),
    )


@dataclass(frozen=True)
class _Consultation:
    """Una consulta de demostración. Los textos no son consejo clínico.

    ``hours_ago`` se mide desde el instante de la siembra y no desde una hora
    fija del día: así ninguna consulta queda fechada en el futuro cuando la
    siembra corre antes de esa hora.
    """

    hours_ago: int
    message: str
    reason: str
    onset: str
    wants_meet: bool
    status: str
    medications: str | None = None
    response: str | None = None
    meet_url: str | None = None
    checkup_general: str | None = None
    checkup_pressure: str | None = None
    checkup_symptoms: str | None = None
    checkup_conduct: str | None = None
    share_phone: bool = False


_CONSULTATIONS: dict[str, tuple[_Consultation, ...]] = {
    "patient_alert": (
        _Consultation(
            hours_ago=72,
            message="Tengo dolor de cabeza desde ayer",
            reason="dizziness_headache",
            onset="since_yesterday",
            medications="Losartán 50 mg",
            wants_meet=True,
            status="completed",
            response="Gracias por avisar. Registra tus lecturas de hoy y mañana.",
            meet_url="https://meet.google.com/hta-demo-cabeza",
            checkup_general="Estable en este momento, sin dolor de pecho ni falta de aire.",
            checkup_pressure="Revisé 186/122 y 184/120 de ayer. Siguen por encima de lo habitual en casa.",
            checkup_symptoms="Mareo y dolor de cabeza desde la tarde, según lo que contó.",
            checkup_conduct="Seguir el registro de mañana y tarde. Si vuelve el dolor de pecho, la falta de aire o la confusión, llamar al 123 o al 911.",
            share_phone=True,
        ),
        _Consultation(
            hours_ago=6,
            message="Tengo mareos desde ayer con presión 150/95",
            reason="high_pressure",
            onset="since_yesterday",
            wants_meet=True,
            status="pending",
            meet_url="https://meet.google.com/hta-demo-mareos",
        ),
        _Consultation(
            hours_ago=2,
            message="Desde esta mañana siento la cabeza pesada",
            reason="dizziness_headache",
            onset="today",
            wants_meet=True,
            status="in_review",
        ),
    ),
    "patient_out_of_range": (
        _Consultation(
            hours_ago=48,
            message="Varias tomas me salieron altas y una no la entendí",
            reason="high_pressure",
            onset="few_days",
            wants_meet=False,
            status="completed",
            response="La toma de 78/46 quedó fuera de rango y no entra en el resumen. Sigue registrando mañana y tarde.",
            checkup_general="Sin dolor de pecho. La serie de casa mezcla tomas altas con otras normales.",
            checkup_pressure="Revisé las tomas altas de la semana y la de 78/46, que no es usable.",
            checkup_symptoms="No refirió dolor ni falta de aire.",
            checkup_conduct="Repetir la toma si sale un valor raro. Esto no es un diagnóstico.",
        ),
    ),
    "patient_caregiver": (
        _Consultation(
            hours_ago=24,
            message="Quisiera saber cómo va la presión de esta semana",
            reason="other",
            onset="few_days",
            wants_meet=False,
            status="in_review",
        ),
    ),
}


def _seed_consultations(
    conn: Connection,
    patient_id: UUID,
    physician_id: UUID,
    plans: tuple[_Consultation, ...],
    now: datetime,
    phone: str | None,
) -> None:
    """Deja las consultas del paciente si todavía no tiene ninguna.

    Cubre revisión, reunión pendiente y cierre con el formato escrito a mano.
    La guarda es por paciente. Los textos son de demostración. Cada consulta se
    fecha ``hours_ago`` horas antes de ``now``, de modo que la siembra nunca
    escribe ``created_at`` en el futuro, a cualquier hora del día.
    """
    row = conn.execute(
        "select 1 from teleconsultations where patient_id = %s limit 1",
        (patient_id,),
    ).fetchone()
    if row is not None:
        return
    for plan in plans:
        created = now - timedelta(hours=plan.hours_ago)
        reading = conn.execute(
            "select id from readings where patient_id = %s and validation_status = 'valid' "
            "and measured_at <= %s order by measured_at desc limit 1",
            (patient_id, created),
        ).fetchone()
        conn.execute(
            "insert into teleconsultations "
            "(patient_id, physician_id, mode, status, message, response, created_at, responded_at, "
            " reading_id, reason, onset, medications, wants_meet, contact_phone, meet_url, "
            " checkup_general, checkup_pressure, checkup_symptoms, checkup_conduct) "
            "values (%s, %s, 'async', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                patient_id,
                physician_id,
                plan.status,
                plan.message,
                plan.response,
                created,
                created + timedelta(hours=2) if plan.status == "completed" else None,
                None if reading is None else reading[0],
                plan.reason,
                plan.onset,
                plan.medications,
                plan.wants_meet,
                phone if plan.share_phone else None,
                plan.meet_url,
                plan.checkup_general,
                plan.checkup_pressure,
                plan.checkup_symptoms,
                plan.checkup_conduct,
            ),
        )


def _seed_extra_symptoms(conn: Connection, patient_id: UUID, anchor: datetime, plan: tuple[str, str, int, int]) -> None:
    """Añade un síntoma si el paciente todavía no tiene ninguno."""
    row = conn.execute(
        "select 1 from symptoms_mood where patient_id = %s limit 1",
        (patient_id,),
    ).fetchone()
    if row is not None:
        return
    text, mood, days_ago, hour = plan
    conn.execute(
        "insert into symptoms_mood (patient_id, free_text, mood, recorded_at) values (%s, %s, %s, %s)",
        (patient_id, text, mood, anchor - timedelta(days=days_ago) + timedelta(hours=hour)),
    )


@dataclass(frozen=True)
class _Medication:
    name: str
    dose: str
    unit: str
    frequency: str
    start_date: date


_MEDICATIONS: dict[str, tuple[_Medication, ...]] = {
    "patient_alert": (_Medication("Losartán", "50", "mg", "cada 24 horas", date(2018, 2, 20)),),
    "patient_out_of_range": (
        _Medication("Losartán", "50", "mg", "cada 12 horas", date(2016, 1, 10)),
        _Medication("Hidroclorotiazida", "25", "mg", "cada 24 horas", date(2019, 5, 2)),
    ),
    "patient_caregiver": (_Medication("Enalapril", "10", "mg", "cada 24 horas", date(2014, 8, 1)),),
    "patient_revoked": (_Medication("Amlodipino", "5", "mg", "cada 24 horas", date(2020, 9, 3)),),
}


def _seed_medications(conn: Connection, patient_id: UUID, plans: tuple[_Medication, ...]) -> list[UUID]:
    """Inserta la medicación del paciente si todavía no tiene ninguna."""
    row = conn.execute("select id from medications where patient_id = %s", (patient_id,)).fetchall()
    if row:
        return [item[0] for item in row]
    ids: list[UUID] = []
    for plan in plans:
        created = conn.execute(
            "insert into medications (patient_id, name, dose, unit, frequency, start_date) "
            "values (%s, %s, %s, %s, %s, %s) returning id",
            (patient_id, plan.name, plan.dose, plan.unit, plan.frequency, plan.start_date),
        ).fetchone()
        ids.append(created[0])
    return ids


def _seed_adherence(conn: Connection, patient_id: UUID, medication_ids: list[UUID], anchor: datetime) -> None:
    """Deja tomas de los últimos tres días, una de ellas sin confirmar."""
    if not medication_ids:
        return
    row = conn.execute(
        "select 1 from adherence_events where patient_id = %s limit 1",
        (patient_id,),
    ).fetchone()
    if row is not None:
        return
    for index, medication_id in enumerate(medication_ids):
        for days_ago in (1, 2, 3):
            conn.execute(
                "insert into adherence_events (patient_id, medication_id, taken_at, confirmed) "
                "values (%s, %s, %s, %s)",
                (
                    patient_id,
                    medication_id,
                    anchor - timedelta(days=days_ago) + timedelta(hours=8),
                    not (index == 0 and days_ago == 1),
                ),
            )


def _seed_report(conn: Connection, patient_id: UUID, account_key: str, anchor: datetime) -> None:
    """Deja un reporte de la semana anterior si el paciente no tiene ninguno."""
    row = conn.execute("select 1 from reports where patient_id = %s limit 1", (patient_id,)).fetchone()
    if row is not None:
        return
    period_end = (anchor - timedelta(days=1)).date()
    conn.execute(
        "insert into reports (patient_id, period_start, period_end, generated_at, content_ref) "
        "values (%s, %s, %s, %s, %s)",
        (
            patient_id,
            period_end - timedelta(days=6),
            period_end,
            anchor - timedelta(hours=2),
            f"demo://seguimiento/{account_key}",
        ),
    )


def _seed_other_alerts(conn: Connection, profile_ids: dict[str, UUID], physician_id: UUID, anchor: datetime) -> None:
    """Cubre los otros estados de una alerta sin tocar la crítica abierta.

    El descarte guarda el motivo en la auditoría porque esa pantalla lo lee de ahí.
    """
    carlos = profile_ids["patient_out_of_range"]
    if conn.execute("select 1 from alerts where patient_id = %s and type = 'presion_alta'", (carlos,)).fetchone() is None:
        conn.execute(
            "insert into alerts (patient_id, type, severity, status, note, created_at) "
            "values (%s, 'presion_alta', 'high', 'acknowledged', %s, %s)",
            (carlos, "Tomas de la semana por encima de 140/90. El médico ya la recibió.", anchor - timedelta(days=4) + timedelta(hours=21)),
        )
    if conn.execute("select 1 from alerts where patient_id = %s and type = 'lectura_aislada'", (carlos,)).fetchone() is None:
        alert_id = conn.execute(
            "insert into alerts (patient_id, type, severity, status, note, created_at) "
            "values (%s, 'lectura_aislada', 'medium', 'dismissed', %s, %s) returning id",
            (carlos, "Una toma alta que no se repitió al día siguiente.", anchor - timedelta(days=6) + timedelta(hours=21)),
        ).fetchone()[0]
        conn.execute(
            "insert into audit_logs (actor_user_id, action, entity, entity_id, occurred_at, details) "
            "values (%s, 'alert.dismissed', 'alerts', %s, %s, %s)",
            (
                physician_id,
                alert_id,
                anchor - timedelta(days=5) + timedelta(hours=10),
                Jsonb({"note": "Lectura aislada, no se repitió."}),
            ),
        )
    ana = profile_ids["patient_caregiver"]
    if conn.execute("select 1 from alerts where patient_id = %s and type = 'presion_alta'", (ana,)).fetchone() is None:
        conn.execute(
            "insert into alerts (patient_id, type, severity, status, note, created_at, validated_by, validated_at) "
            "values (%s, 'presion_alta', 'high', 'validated', %s, %s, %s, %s)",
            (
                ana,
                "La serie de la semana quedó revisada.",
                anchor - timedelta(days=5) + timedelta(hours=20),
                physician_id,
                anchor - timedelta(days=4) + timedelta(hours=11),
            ),
        )


def _seed_caregiver_link(
    conn: Connection,
    patient_id: UUID,
    caregiver_id: UUID,
    anchor: datetime,
) -> None:
    """Vincula al cuidador con alcance de lecturas; el médico tratante autoriza.

    La siembra no firma la autorización: solo materializa el vínculo que el
    escenario de demostración necesita. Quien autoriza, cambia el alcance y
    revoca es el médico vinculado al paciente, como decide el ADR 0012.
    """
    row = conn.execute(
        "select 1 from caregiver_links where patient_id = %s and caregiver_id = %s",
        (patient_id, caregiver_id),
    ).fetchone()
    if row is not None:
        return

    conn.execute(
        "insert into caregiver_links "
        "(patient_id, caregiver_id, authorized_scope, created_at) "
        "values (%s, %s, 'readings', %s)",
        (patient_id, caregiver_id, anchor - timedelta(days=10) + timedelta(hours=10)),
    )


def _seed_reminders(
    conn: Connection,
    patient_id: UUID,
    reminders: tuple[_Reminder, ...],
) -> None:
    """Inserta los recordatorios del paciente que todavía no existan."""
    for reminder in reminders:
        row = conn.execute(
            "select 1 from reminders "
            "where patient_id = %s and kind = %s::reminder_kind and schedule = %s",
            (patient_id, reminder.kind, reminder.schedule),
        ).fetchone()
        if row is not None:
            continue

        conn.execute(
            "insert into reminders (patient_id, kind, schedule) "
            "values (%s, %s::reminder_kind, %s)",
            (patient_id, reminder.kind, reminder.schedule),
        )


def _seed_alert_config(conn: Connection) -> None:
    """Siembra una sola vez los umbrales globales de la propuesta documentada.

    ``patient_id`` nulo los convierte en la configuración por omisión. Si ya
    existe una fila global para la métrica no se inserta otra, de modo que una
    segunda siembra no añade un segundo par. La banda inferior se deja nula:
    la Tabla 9 solo propone 90/60 como convención no verificada y el proyecto
    no debe presentar como documentado un valor que el propio documento marca
    como no verificado.
    """
    for metric, high_threshold, critical_high in _ALERT_CONFIG:
        row = conn.execute(
            "select 1 from alert_config where patient_id is null and metric = %s",
            (metric,),
        ).fetchone()
        if row is not None:
            continue

        conn.execute(
            "insert into alert_config "
            "(patient_id, metric, low_threshold, high_threshold, "
            " critical_low, critical_high, recipients) "
            "values (NULL, %s, NULL, %s, NULL, %s, %s)",
            (metric, high_threshold, critical_high, Jsonb(["physician"])),
        )


def seed(conn: Connection) -> dict[str, UUID]:
    """Siembra las siete cuentas de demostración y devuelve sus identificadores.

    Es idempotente por correo y por fila relacionada: volver a ejecutarla no
    duplica cuentas, lecturas, síntomas, alertas, consultas, medicamentos,
    reportes, consentimientos, vínculos ni recordatorios, ni añade un segundo
    par de umbrales globales. No confirma la transacción.
    """
    anchor = _day_anchor(conn)
    now = _now(conn)
    ids: dict[str, UUID] = {}

    for account in _ACCOUNTS:
        ids[account.key] = _ensure_account(conn, account)

    _seed_alert_config(conn)

    profile_ids: dict[str, UUID] = {}
    for account in _ACCOUNTS:
        profile = _PROFILES.get(account.key)
        if profile is None:
            continue
        profile_id = _ensure_profile(conn, ids[account.key], profile)
        profile_ids[account.key] = profile_id
        _ensure_physician_link(conn, profile_id, ids["physician"], anchor)
        _seed_consent(conn, profile_id, _CONSENTS[account.key], anchor)
        _seed_readings(conn, account.key, profile_id, anchor)
        plans = _CONSULTATIONS.get(account.key)
        if plans is not None:
            _seed_consultations(
                conn,
                profile_id,
                ids["physician"],
                plans,
                now,
                profile.phone,
            )
        medications = _MEDICATIONS.get(account.key)
        if medications is not None:
            medication_ids = _seed_medications(conn, profile_id, medications)
            # El escenario revocado conserva el medicamento anterior, sin tomas
            # ni reporte posteriores a la revocación.
            if account.key != "patient_revoked":
                _seed_adherence(conn, profile_id, medication_ids, anchor)
        if account.key != "patient_revoked":
            _seed_report(conn, profile_id, account.key, anchor)
        extra = _EXTRA_SYMPTOMS.get(account.key)
        if extra is not None:
            _seed_extra_symptoms(conn, profile_id, anchor, extra)

    _seed_alert(conn, profile_ids["patient_alert"], anchor)
    _seed_symptom(conn, profile_ids["patient_alert"], anchor)
    _seed_other_alerts(conn, profile_ids, ids["physician"], anchor)
    _seed_caregiver_link(
        conn,
        profile_ids["patient_caregiver"],
        ids["caregiver"],
        anchor,
    )
    for account_key, reminders in _REMINDERS.items():
        _seed_reminders(conn, profile_ids[account_key], reminders)

    return ids


_CLINICAL_TABLES = (
    "adherence_events",
    "teleconsultations",
    "alerts",
    "symptoms_mood",
    "reports",
    "readings",
    "medications",
)


def reset_demo_clinical(conn: Connection) -> None:
    """Borra los datos clínicos de las siete cuentas y deja las cuentas.

    No toca usuarios, perfiles, consentimientos, vínculos, recordatorios,
    umbrales ni sesiones. Sirve para volver a sembrar un recorrido que ya
    tenía filas, porque la siembra no pisa lo que ya existe.
    """
    emails = [account.email for account in _ACCOUNTS]
    patients = (
        "select p.id from patient_profiles p "
        "join users u on u.id = p.user_id where u.email = any(%s)"
    )
    conn.execute(
        "delete from audit_logs where entity = 'alerts' and entity_id in "
        f"(select id from alerts where patient_id in ({patients}))",
        (emails,),
    )
    for table in _CLINICAL_TABLES:
        conn.execute(
            f"delete from {table} where patient_id in ({patients})",
            (emails,),
        )


def main() -> int:
    """Siembra los datos con la URL de PostgreSQL que describe el entorno.

    El punto de entrada solo necesita ``HTA_DATABASE_URL``: no exige la URL de
    Mongo ni la clave JWT, que esta operación no usa. Esa es también la variable
    que define el contenedor del backend. ``--reset`` borra antes los datos
    clínicos de estas cuentas.
    """
    database_url = os.environ.get("HTA_DATABASE_URL")
    if not database_url:
        raise SystemExit(
            "Falta HTA_DATABASE_URL: define la conexión a PostgreSQL para sembrar."
        )
    with psycopg.connect(database_url, autocommit=True) as connection:
        if "--reset" in sys.argv:
            reset_demo_clinical(connection)
        ids = seed(connection)
    print(f"Datos de demostración sembrados: {len(ids)} cuentas.")
    for account in _ACCOUNTS:
        print(f"  {account.email} ({account.role})")
    print(f"Contraseña común de las cuentas: {DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
