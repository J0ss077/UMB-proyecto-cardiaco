"""Fixtures compartidas por las pruebas de integración.

Las pruebas corren desde el host contra la pila levantada con `make up`: la API
en http://localhost:8000 y PostgreSQL en el puerto publicado del compose. La URL
de la API se puede cambiar con `API_BASE_URL`, por ejemplo para probar un
backend levantado en el host. Las credenciales se leen de `.env`, el mismo
archivo que lee la pila, para no duplicar secretos en el código de las pruebas.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import UUID

import httpx
import psycopg
import pytest
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

from hta.auth.passwords import hash_password
from hta.consent.service import CURRENT_VERSION

BASE_URL = "http://localhost:8000"
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"
WAIT_SECONDS = 30.0
WAIT_INTERVAL = 1.0

# Solo el registro de migraciones se conserva: las demás tablas son estado
# mutable de las pruebas y se vacían entre una prueba y la siguiente.
PRESERVED_TABLES = frozenset({"schema_migrations"})


def _load_env_file(path: Path) -> dict[str, str]:
    """Lee un .env sencillo (CLAVE=valor) sin depender de python-dotenv."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _setting(name: str, default: str | None = None) -> str:
    """Toma el valor del entorno o de .env; falla con un mensaje claro."""
    value = os.environ.get(name)
    if value is None:
        value = _load_env_file(ENV_FILE).get(name, default)
    if value is None:
        raise RuntimeError(
            f"Falta {name}: defínelo en .env antes de correr las pruebas de integración."
        )
    return value


def _postgres_conninfo() -> str:
    """Construye la cadena de conexión a PostgreSQL del compose."""
    return psycopg.conninfo.make_conninfo(
        host=_setting("POSTGRES_HOST", "localhost"),
        port=_setting("POSTGRES_PORT", "5432"),
        user=_setting("POSTGRES_USER"),
        password=_setting("POSTGRES_PASSWORD"),
        dbname=_setting("POSTGRES_DB"),
    )


@pytest.fixture(scope="session")
def client() -> Iterator[httpx.Client]:
    """Cliente HTTP contra el backend de la pila, tras esperar a que responda."""
    base_url = _setting("API_BASE_URL", BASE_URL)
    last_error: Exception | None = None
    deadline = time.monotonic() + WAIT_SECONDS
    with httpx.Client(base_url=base_url, timeout=10.0) as http:
        while time.monotonic() < deadline:
            try:
                if http.get("/api/health").status_code == 200:
                    break
            except httpx.HTTPError as error:
                last_error = error
            time.sleep(WAIT_INTERVAL)
        else:
            pytest.fail(
                f"El backend no respondió en {base_url} tras {WAIT_SECONDS:.0f} segundos. "
                "Levanta la pila con 'make up' antes de correr las pruebas de integración. "
                f"Último error: {last_error}"
            )
        yield http


@pytest.fixture(scope="session")
def db() -> Iterator[psycopg.Connection]:
    """Conexión a PostgreSQL de la pila, tras esperar a que acepte conexiones."""
    conninfo = _postgres_conninfo()
    last_error: Exception | None = None
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        try:
            connection = psycopg.connect(conninfo, autocommit=True)
            break
        except psycopg.OperationalError as error:
            last_error = error
            time.sleep(WAIT_INTERVAL)
    else:
        pytest.fail(
            "PostgreSQL no aceptó conexiones tras "
            f"{WAIT_SECONDS:.0f} segundos. Levanta la pila con 'make up'. "
            f"Último error: {last_error}"
        )
    with connection:
        yield connection


@pytest.fixture(scope="session")
def mongo_db() -> Iterator[Database]:
    """Base del flujo crudo en el MongoDB de la pila, tras esperar su ping.

    Los detalles de conexión salen de ``.env`` con los mismos valores por
    omisión que el compose: el host local, el puerto publicado y la base que
    usa el backend. El cliente se cierra al terminar la sesión de pruebas.
    """
    client = MongoClient(
        host=_setting("MONGO_HOST", "localhost"),
        port=int(_setting("MONGO_PORT", "27017")),
        serverSelectionTimeoutMS=2000,
    )
    last_error: Exception | None = None
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        try:
            client.admin.command("ping")
            break
        except PyMongoError as error:
            last_error = error
            time.sleep(WAIT_INTERVAL)
    else:
        client.close()
        pytest.fail(
            "MongoDB no respondió tras "
            f"{WAIT_SECONDS:.0f} segundos. Levanta la pila con 'make up'. "
            f"Último error: {last_error}"
        )
    with client:
        yield client[_setting("MONGO_DB", "hta")]


@pytest.fixture
def second_connection() -> Iterator[psycopg.Connection]:
    """Conexión independiente, para ver lo que otra sesión ya ve confirmado.

    La conexión que ejecutó una migración revertida no puede testificar sobre
    sus efectos: esta conexión los consulta desde fuera.
    """
    with psycopg.connect(_postgres_conninfo(), autocommit=True) as connection:
        yield connection


@dataclass(frozen=True)
class ActiveUser:
    """Cuenta activa creada para una prueba, con su identificador y su correo."""

    id: UUID
    email: str


@pytest.fixture
def active_user(db: psycopg.Connection, clean_db: None) -> ActiveUser:
    """Crea una cuenta activa con rol de administrador y contraseña conocida.

    Depende de ``clean_db`` para que el alta ocurra después del vaciado
    automático: la prueba recibe las tablas vacías y esta cuenta ya creada.
    """
    email = "admin@hta.demo"
    (user_id,) = db.execute(
        "insert into users (email, password_hash, role, full_name) "
        "values (%s, %s, 'admin', %s) returning id",
        (email, hash_password("s3cret"), "Administradora de prueba"),
    ).fetchone()
    return ActiveUser(id=user_id, email=email)


@pytest.fixture
def logged_in(client: httpx.Client, active_user: ActiveUser) -> dict[str, Any]:
    """Inicia sesión con la cuenta activa y entrega el cuerpo de la respuesta."""
    response = client.post(
        "/api/auth/login",
        json={"email": active_user.email, "password": "s3cret"},
    )
    assert response.status_code == 200
    return response.json()


# Contraseña de las cuentas de paciente que crean las fixtures, para que una
# prueba pueda iniciar sesión sin pasar por el registro público.
PATIENT_PASSWORD = "s3cret"
PATIENT_EMAIL = "paciente@hta.demo"
OTHER_PATIENT_EMAIL = "otro-paciente@hta.demo"
READING_PATIENT_EMAIL = "lectura@hta.demo"
CONSENTED_PATIENT_EMAIL = "consentido@hta.demo"
PHYSICIAN_EMAIL = "medico-consulta@hta.demo"
CAREGIVER_EMAIL = "cuidador-lecturas@hta.demo"
CAREGIVER_MINIMAL_EMAIL = "cuidador-minimo@hta.demo"
OTHER_CAREGIVER_EMAIL = "cuidador-otro@hta.demo"
OTHER_PHYSICIAN_EMAIL = "medico-otro@hta.demo"
CAREGIVER_TARGET_EMAIL = "cuidador-destino@hta.demo"


def _create_patient(connection: psycopg.Connection, email: str) -> UUID:
    """Inserta una cuenta de paciente con su perfil y devuelve su id.

    Todo paciente del sistema tiene perfil, así que la fixture los crea juntos:
    un paciente sin perfil no sería un caso de prueba válido sino una fixture
    inconsistente, y el consentimiento no tendría a qué apuntar.
    """
    (user_id,) = connection.execute(
        "insert into users (email, password_hash, role, full_name) "
        "values (%s, %s, 'patient', %s) returning id",
        (email, hash_password(PATIENT_PASSWORD), "Paciente de prueba"),
    ).fetchone()
    connection.execute(
        "insert into patient_profiles (user_id) values (%s)",
        (user_id,),
    )
    return user_id


def _login_headers(client: httpx.Client, email: str) -> dict[str, str]:
    """Inicia sesión y devuelve el encabezado Authorization con el token de acceso."""
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": PATIENT_PASSWORD},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_user(
    connection: psycopg.Connection,
    email: str,
    role: str,
    full_name: str,
) -> UUID:
    """Inserta una cuenta con el rol indicado y devuelve su identificador.

    La usan las fixtures de médico y de cuidador, que no tienen perfil de
    paciente. Todas las cuentas de prueba comparten la contraseña para que
    ``_login_headers`` pueda iniciar sesión sin más datos.
    """
    (user_id,) = connection.execute(
        "insert into users (email, password_hash, role, full_name) "
        "values (%s, %s, %s, %s) returning id",
        (email, hash_password(PATIENT_PASSWORD), role, full_name),
    ).fetchone()
    return user_id


def _profile_id(connection: psycopg.Connection, user_id: UUID) -> UUID:
    """Devuelve el perfil de paciente de una cuenta, que las fixtures ya crearon."""
    (profile_id,) = connection.execute(
        "select id from patient_profiles where user_id = %s",
        (user_id,),
    ).fetchone()
    return profile_id


@pytest.fixture
def admin_id(active_user: ActiveUser) -> UUID:
    """Identificador de la cuenta administradora activa."""
    return active_user.id


@pytest.fixture
def admin_headers(logged_in: dict[str, Any]) -> dict[str, str]:
    """Encabezado de la sesión del administrador ya iniciada."""
    return {"Authorization": f"Bearer {logged_in['access_token']}"}


@pytest.fixture
def patient_id(db: psycopg.Connection, clean_db: None) -> UUID:
    """Crea una cuenta de paciente y devuelve su identificador."""
    return _create_patient(db, PATIENT_EMAIL)


@pytest.fixture
def other_patient_id(db: psycopg.Connection, clean_db: None) -> UUID:
    """Crea una segunda cuenta de paciente, sin sesión, y devuelve su id."""
    return _create_patient(db, OTHER_PATIENT_EMAIL)


@pytest.fixture
def consented_patient_id(db: psycopg.Connection, clean_db: None) -> UUID:
    """Crea un paciente con perfil y una aceptación vigente de la versión actual.

    Las pruebas clínicas necesitan un paciente que pase la compuerta de
    consentimiento. Los fixtures anteriores se conservan sin aceptación para no
    alterar las pruebas de consentimiento del incremento anterior, que cuentan
    filas de ``consents``.
    """
    user_id = _create_patient(db, CONSENTED_PATIENT_EMAIL)
    db.execute(
        "insert into consents (patient_id, version) "
        "select id, %s from patient_profiles where user_id = %s",
        (CURRENT_VERSION, user_id),
    )
    return user_id


@pytest.fixture
def patient_headers(client: httpx.Client, patient_id: UUID) -> dict[str, str]:
    """Encabezado de la sesión del paciente de prueba."""
    return _login_headers(client, PATIENT_EMAIL)


@pytest.fixture
def consented_patient_headers(
    client: httpx.Client, consented_patient_id: UUID
) -> dict[str, str]:
    """Encabezado de la sesión del paciente con consentimiento vigente."""
    return _login_headers(client, CONSENTED_PATIENT_EMAIL)


@pytest.fixture
def device_headers() -> dict[str, str]:
    """Encabezado con la clave compartida que espera el servidor.

    El dispositivo no inicia sesión: se autentica con ``X-Device-Key``. La
    clave se lee del entorno o de ``.env``, igual que la lee el backend, y si no
    está configurada se usa la del comando de desarrollo documentado. Un valor
    vacío cuenta como no configurado: ``.env.example`` puede traer la variable
    presente pero sin valor, y enviar la cadena vacía solo produciría un 401
    contra un servidor que sí tiene la clave de desarrollo. Así una pila
    levantada con otra clave se sigue probando definiendo ``HTA_DEVICE_KEY`` en
    el entorno, sin tocar las pruebas.
    """
    key = _setting("HTA_DEVICE_KEY", "").strip() or "clave-de-prueba"
    return {"X-Device-Key": key}


@pytest.fixture
def patient_login(client: httpx.Client, patient_id: UUID) -> dict[str, str]:
    """Encabezado de la sesión del paciente, para la prueba de desactivación."""
    return _login_headers(client, PATIENT_EMAIL)


@pytest.fixture
def patient_with_reading(db: psycopg.Connection, clean_db: None) -> tuple[UUID, UUID]:
    """Crea un paciente con perfil y una lectura manual.

    Devuelve ``(user_id, reading_id)``: el primero es la cuenta y el segundo la
    lectura, que cuelga del perfil y debe sobrevivir a la desactivación.
    """
    user_id = _create_patient(db, READING_PATIENT_EMAIL)
    (profile_id,) = db.execute(
        "select id from patient_profiles where user_id = %s",
        (user_id,),
    ).fetchone()
    (reading_id,) = db.execute(
        "insert into readings "
        "(patient_id, systolic, diastolic, heart_rate, source, measured_at) "
        "values (%s, %s, %s, %s, 'manual', now()) returning id",
        (profile_id, 138, 88, 72),
    ).fetchone()
    return user_id, reading_id


@pytest.fixture
def reading_patient_login(
    client: httpx.Client,
    patient_with_reading: tuple[UUID, UUID],
) -> dict[str, Any]:
    """Inicia sesión con el paciente que tiene una lectura y entrega el cuerpo.

    La prueba de desactivación necesita un refresco emitido antes de desactivar
    para comprobar que la desactivación lo revoca y que ya no se puede rotar.
    """
    response = client.post(
        "/api/auth/login",
        json={"email": READING_PATIENT_EMAIL, "password": PATIENT_PASSWORD},
    )
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def physician_id(
    db: psycopg.Connection,
    clean_db: None,
    consented_patient_id: UUID,
) -> UUID:
    """Crea un médico vinculado al paciente con consentimiento vigente.

    El vínculo vive en ``patient_physician`` y es lo que abre al médico el
    directorio, las lecturas y los síntomas de ese paciente. Depende de
    ``clean_db`` para que el alta ocurra después del vaciado automático.
    """
    user_id = _create_user(db, PHYSICIAN_EMAIL, "physician", "Médico de prueba")
    db.execute(
        "insert into patient_physician (patient_id, physician_id) values (%s, %s)",
        (_profile_id(db, consented_patient_id), user_id),
    )
    return user_id


@pytest.fixture
def physician_headers(client: httpx.Client, physician_id: UUID) -> dict[str, str]:
    """Encabezado de la sesión del médico vinculado al paciente con consentimiento."""
    return _login_headers(client, PHYSICIAN_EMAIL)


@pytest.fixture
def open_alert_id(
    db: psycopg.Connection,
    clean_db: None,
    consented_patient_id: UUID,
) -> UUID:
    """Alerta crítica abierta del paciente con consentimiento vigente.

    Es el estado inicial de la máquina de alertas y el que usan las pruebas de
    las transiciones. Depende de ``clean_db`` para insertarse después del
    vaciado y del paciente con consentimiento porque el médico de las fixtures
    está vinculado a ese paciente y no al de ``patient_headers``.
    """
    (alert_id,) = db.execute(
        "insert into alerts (patient_id, type, severity, status) "
        "select id, 'crisis_hipertensiva', 'critical', 'open' "
        "from patient_profiles where user_id = %s returning id",
        (consented_patient_id,),
    ).fetchone()
    return alert_id


@pytest.fixture
def validated_alert_id(
    db: psycopg.Connection,
    clean_db: None,
    consented_patient_id: UUID,
    physician_id: UUID,
) -> UUID:
    """Alerta ya validada por el médico vinculado al paciente con consentimiento.

    Sirve para comprobar que una alerta validada no se valida dos veces ni
    cambia de estado. ``validated_by`` queda escrito con el médico de las
    fixtures porque una alerta validada sin validador contradice la regla de
    que ninguna alerta se cierra sin una persona.
    """
    (alert_id,) = db.execute(
        "insert into alerts "
        "(patient_id, type, severity, status, note, validated_by, validated_at) "
        "select id, 'crisis_hipertensiva', 'high', 'validated', "
        "'confirmada en consulta', %s, now() "
        "from patient_profiles where user_id = %s returning id",
        (physician_id, consented_patient_id),
    ).fetchone()
    return alert_id


def _caregiver(
    connection: psycopg.Connection,
    email: str,
    scope: str,
    patient_user_id: UUID,
) -> UUID:
    """Crea un cuidador con su vínculo y el alcance indicado hacia el paciente."""
    user_id = _create_user(connection, email, "caregiver", "Cuidador de prueba")
    connection.execute(
        "insert into caregiver_links (patient_id, caregiver_id, authorized_scope) "
        "values (%s, %s, %s)",
        (_profile_id(connection, patient_user_id), user_id, scope),
    )
    return user_id


@pytest.fixture
def caregiver_headers(
    client: httpx.Client,
    db: psycopg.Connection,
    clean_db: None,
    consented_patient_id: UUID,
) -> dict[str, str]:
    """Cuidador con alcance ``readings`` hacia el paciente con consentimiento.

    Es el único alcance que abre los datos clínicos. Depende de ``clean_db``
    para que la cuenta y el vínculo se creen después del vaciado.
    """
    _caregiver(db, CAREGIVER_EMAIL, "readings", consented_patient_id)
    return _login_headers(client, CAREGIVER_EMAIL)


@pytest.fixture
def caregiver_minimal_headers(
    client: httpx.Client,
    db: psycopg.Connection,
    clean_db: None,
    consented_patient_id: UUID,
) -> dict[str, str]:
    """Cuidador con alcance ``minimal`` hacia el paciente con consentimiento.

    El vínculo existe, pero el alcance no habilita datos clínicos: sirve para
    comprobar que la compuerta no confunde un vínculo con una autorización.
    """
    _caregiver(db, CAREGIVER_MINIMAL_EMAIL, "minimal", consented_patient_id)
    return _login_headers(client, CAREGIVER_MINIMAL_EMAIL)


@pytest.fixture
def other_caregiver_headers(
    client: httpx.Client,
    db: psycopg.Connection,
    clean_db: None,
    other_patient_id: UUID,
) -> dict[str, str]:
    """Cuidador con alcance ``readings`` hacia el otro paciente de las fixtures.

    Sirve para comprobar que el directorio y la resolución de alcance miran el
    vínculo concreto y no cualquier vínculo con alcance ``readings``: este
    cuidador no puede ver al paciente con consentimiento.
    """
    _caregiver(db, OTHER_CAREGIVER_EMAIL, "readings", other_patient_id)
    return _login_headers(client, OTHER_CAREGIVER_EMAIL)


@dataclass(frozen=True)
class CaregiverTarget:
    """Cuenta de cuidador que el médico puede autorizar, con su correo."""

    id: UUID
    email: str


@pytest.fixture
def other_physician_headers(
    client: httpx.Client,
    db: psycopg.Connection,
    clean_db: None,
) -> dict[str, str]:
    """Médico activo sin vínculo con el paciente de las fixtures.

    Sirve para comprobar que la autorización de cuidadores mira el vínculo
    concreto: un médico que no lleva al paciente recibe 403 en todas las rutas.
    """
    _create_user(db, OTHER_PHYSICIAN_EMAIL, "physician", "Médico sin vínculo")
    return _login_headers(client, OTHER_PHYSICIAN_EMAIL)


@pytest.fixture
def caregiver_target(
    db: psycopg.Connection,
    clean_db: None,
) -> CaregiverTarget:
    """Cuidador activo que todavía no está autorizado hacia ningún paciente."""
    return CaregiverTarget(
        id=_create_user(db, CAREGIVER_TARGET_EMAIL, "caregiver", "Cuidador Destino"),
        email=CAREGIVER_TARGET_EMAIL,
    )


@pytest.fixture
def caregiver_target_headers(
    client: httpx.Client,
    caregiver_target: CaregiverTarget,
) -> dict[str, str]:
    """Encabezado de la sesión del cuidador que el médico autoriza."""
    return _login_headers(client, caregiver_target.email)


@pytest.fixture
def home_readings(
    db: psycopg.Connection,
    clean_db: None,
    consented_patient_id: UUID,
) -> None:
    """Siembra doce lecturas válidas en tres fechas UTC para la ventana.

    La serie pone cuatro lecturas en cada uno de los días -6, -4 y -2. El día
    más antiguo lo descarta la ventana domiciliaria, así que al paciente le
    quedan ocho lecturas válidas en dos fechas: exactamente el mínimo para que
    el resumen sea suficiente. Las horas son fijas para que el dato no dependa
    de la hora en que corre la prueba.
    """
    profile_id = _profile_id(db, consented_patient_id)
    today = datetime.now(timezone.utc).date()
    for days_ago in (6, 4, 2):
        for slot in range(4):
            measured_at = datetime(
                today.year,
                today.month,
                today.day,
                9 + slot,
                tzinfo=timezone.utc,
            ) - timedelta(days=days_ago)
            db.execute(
                "insert into readings "
                "(patient_id, systolic, diastolic, source, measured_at, "
                "validation_status) "
                "values (%s, %s, %s, 'manual', %s, 'valid')",
                (
                    profile_id,
                    118 + days_ago * 2 + slot,
                    78 + slot,
                    measured_at,
                ),
            )


def _mutable_tables(connection: psycopg.Connection) -> list[str]:
    """Tablas públicas que no forman parte del registro de migraciones."""
    rows = connection.execute(
        "select table_name from information_schema.tables "
        "where table_schema = 'public' and table_type = 'BASE TABLE' "
        "and not (table_name = any(%s)) order by table_name",
        (list(PRESERVED_TABLES),),
    ).fetchall()
    return [row[0] for row in rows]


def _truncate(connection: psycopg.Connection) -> None:
    """Vacía todas las tablas mutables en una sola sentencia.

    PostgreSQL solo permite truncar una tabla referenciada por una llave
    foránea si la tabla que la referencia se trunca en el mismo comando. Al
    incluir todas las tablas mutables se respeta ON DELETE RESTRICT sin
    recurrir a CASCADE, que borraría filas de tablas ajenas al conjunto.
    """
    tables = _mutable_tables(connection)
    if not tables:
        return
    quoted = ", ".join(f'"{name}"' for name in tables)
    connection.execute(f"truncate table {quoted} restart identity")


@pytest.fixture(autouse=True)
def clean_db(db: psycopg.Connection) -> Iterator[None]:
    """Deja las tablas mutables vacías antes y después de cada prueba."""
    _truncate(db)
    yield
    _truncate(db)


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Marca con `integration` las pruebas de este directorio y sus hijos.

    El marcador se registra en ``pyproject.toml``; así ``-m "not integration"``
    excluye de verdad esta suite, aunque un archivo nuevo olvide declararlo.
    El filtro por ruta evita marcar las pruebas unitarias cuando pytest recorre
    todo ``tests/``.
    """
    root = Path(__file__).resolve().parent
    marker = pytest.mark.integration
    for item in items:
        if root in Path(item.path).resolve().parents:
            item.add_marker(marker)
