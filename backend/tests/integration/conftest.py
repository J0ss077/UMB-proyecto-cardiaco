"""Fixtures compartidas por las pruebas de integración.

Las pruebas corren desde el host contra la pila levantada con `make up`: la API
en http://localhost:8000 y PostgreSQL en el puerto publicado del compose. Las
credenciales se leen de `.env`, el mismo archivo que lee la pila, para no
duplicar secretos en el código de las pruebas.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Iterator

import httpx
import psycopg
import pytest
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

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
    last_error: Exception | None = None
    deadline = time.monotonic() + WAIT_SECONDS
    with httpx.Client(base_url=BASE_URL, timeout=10.0) as http:
        while time.monotonic() < deadline:
            try:
                if http.get("/api/health").status_code == 200:
                    break
            except httpx.HTTPError as error:
                last_error = error
            time.sleep(WAIT_INTERVAL)
        else:
            pytest.fail(
                f"El backend no respondió en {BASE_URL} tras {WAIT_SECONDS:.0f} segundos. "
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
