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
def patient_headers(client: httpx.Client, patient_id: UUID) -> dict[str, str]:
    """Encabezado de la sesión del paciente de prueba."""
    return _login_headers(client, PATIENT_EMAIL)


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
