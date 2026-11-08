"""@requirement none

Datos de demostración para recorrer la aplicación con las cuatro cuentas.

La siembra es infraestructura, no una funcionalidad: crea las siete cuentas de
demostración, los cuatro perfiles de paciente y los datos clínicos que cada
escenario necesita. No escribe auditoría, porque el rastro de auditoría cuenta
lo que hicieron las personas y una siembra no es una persona.

Los datos son deterministas por día: la rejilla de lecturas se ancla en la
medianoche UTC del día actual, con dos mediciones diarias a las 07:00 y a las
20:00 durante los últimos diez días. La más reciente queda en el día anterior,
de modo que ninguna lectura cae en el futuro. El síntoma del escenario crítico
se ancla a las 21:30 del día anterior, después de la última lectura. Los
valores y las horas se repiten en cualquier máquina que ejecute la siembra el
mismo día; los identificadores y las sales de las contraseñas son aleatorios
por diseño.

La siembra es idempotente por correo y también para las filas que cuelgan de
cada cuenta: si un paciente ya tiene alguna lectura, no se le añade ninguna
serie, y si un síntoma, una alerta, una aceptación, un vínculo o un
recordatorio ya existe, no se vuelve a insertar. Lo mismo vale para los dos
umbrales globales de ``alert_config``. No confirma la transacción; la conexión
de la prueba y la del punto de entrada están en autocommit.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID

import psycopg
from psycopg import Connection
from psycopg.types.json import Jsonb

from hta.accounts.service import normalize_email
from hta.auth.passwords import hash_password

# Contraseña común de las siete cuentas de demostración.
DEMO_PASSWORD = "Demo2026!"

# Rangos fisiológicos plausibles del manual, en mmHg. No son umbrales clínicos:
# una lectura fuera de ellos se conserva con ``out_of_range`` en lugar de
# descartarse, y una lectura elevada pero plausible queda ``valid``.
_PLAUSIBLE_SYSTOLIC = (80, 200)
_PLAUSIBLE_DIASTOLIC = (40, 130)

_CURRENT_CONSENT_VERSION = 1
_CONSENT_CONTENT_REF = "consentimiento-informado-v1"

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
    ),
    "patient_alert": _Profile(
        birth_date=date(1962, 7, 22),
        sex="femenino",
        diagnosis_date=date(2018, 2, 20),
        height_cm=158,
        weight_kg=71,
    ),
    "patient_revoked": _Profile(
        birth_date=date(1970, 11, 5),
        sex="masculino",
        diagnosis_date=date(2020, 9, 3),
        height_cm=175,
        weight_kg=83,
    ),
    "patient_caregiver": _Profile(
        birth_date=date(1955, 1, 30),
        sex="femenino",
        diagnosis_date=date(2012, 4, 18),
        height_cm=162,
        weight_kg=69,
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


def _validation_status(systolic: int, diastolic: int) -> str:
    """Marca solo los valores fuera del rango fisiológico plausible.

    El estado existe para conservar una lectura atípica, no para clasificar la
    presión elevada: una lectura de 138/88 es plausible y queda ``valid``. Los
    rangos son los del manual, sistólica de 80 a 200 mmHg y diastólica de 40 a
    130 mmHg, ambos inclusive.
    """
    if not _PLAUSIBLE_SYSTOLIC[0] <= systolic <= _PLAUSIBLE_SYSTOLIC[1]:
        return "out_of_range"
    if not _PLAUSIBLE_DIASTOLIC[0] <= diastolic <= _PLAUSIBLE_DIASTOLIC[1]:
        return "out_of_range"
    return "valid"


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
    if row is not None:
        return row[0]
    return conn.execute("select id from users where email = %s", (email,)).fetchone()[0]


def _ensure_profile(conn: Connection, user_id: UUID, profile: _Profile) -> UUID:
    """Devuelve el perfil de la cuenta o lo crea si todavía no existe."""
    row = conn.execute(
        "select id from patient_profiles where user_id = %s",
        (user_id,),
    ).fetchone()
    if row is not None:
        return row[0]

    return conn.execute(
        "insert into patient_profiles "
        "(user_id, birth_date, sex, diagnosis_date, height_cm, weight_kg) "
        "values (%s, %s, %s, %s, %s, %s) returning id",
        (
            user_id,
            profile.birth_date,
            profile.sex,
            profile.diagnosis_date,
            profile.height_cm,
            profile.weight_kg,
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
            (patient_id, _CURRENT_CONSENT_VERSION),
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
        (patient_id, _CURRENT_CONSENT_VERSION),
    ).fetchone()
    if row is not None:
        return

    conn.execute(
        "insert into consents "
        "(patient_id, version, accepted_at, content_ref, revoked_at) "
        "values (%s, %s, %s, %s, %s)",
        (
            patient_id,
            _CURRENT_CONSENT_VERSION,
            accepted_at,
            _CONSENT_CONTENT_REF,
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
                _validation_status(systolic, diastolic),
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


def _seed_caregiver_link(
    conn: Connection,
    patient_id: UUID,
    caregiver_id: UUID,
    anchor: datetime,
) -> None:
    """Autoriza al cuidador a leer las lecturas del paciente que lo autorizó."""
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
    duplica cuentas, lecturas, síntomas, alertas, consentimientos, vínculos ni
    recordatorios, ni añade un segundo par de umbrales globales. No escribe
    auditoría y no confirma la transacción.
    """
    anchor = _day_anchor(conn)
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

    _seed_alert(conn, profile_ids["patient_alert"], anchor)
    _seed_symptom(conn, profile_ids["patient_alert"], anchor)
    _seed_caregiver_link(
        conn,
        profile_ids["patient_caregiver"],
        ids["caregiver"],
        anchor,
    )
    for account_key, reminders in _REMINDERS.items():
        _seed_reminders(conn, profile_ids[account_key], reminders)

    return ids


def main() -> int:
    """Siembra los datos con la URL de PostgreSQL que describe el entorno.

    El punto de entrada solo necesita ``HTA_DATABASE_URL``: no exige la URL de
    Mongo ni la clave JWT, que esta operación no usa. Esa es también la variable
    que define el contenedor del backend.
    """
    database_url = os.environ.get("HTA_DATABASE_URL")
    if not database_url:
        raise SystemExit(
            "Falta HTA_DATABASE_URL: define la conexión a PostgreSQL para sembrar."
        )
    with psycopg.connect(database_url, autocommit=True) as connection:
        ids = seed(connection)
    print(f"Datos de demostración sembrados: {len(ids)} cuentas.")
    for account in _ACCOUNTS:
        print(f"  {account.email} ({account.role})")
    print(f"Contraseña común de las cuentas: {DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
