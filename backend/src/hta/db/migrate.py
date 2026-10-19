"""Ejecutor de las migraciones del registro clínico.

Cada archivo de ``db/migrations`` se aplica una sola vez, en orden de nombre,
dentro de una transacción, y su nombre queda registrado en
``schema_migrations``. Un archivo que falla se revierte por completo y no se
registra, de modo que la siguiente ejecución lo vuelve a intentar.
"""

from __future__ import annotations

import logging
from pathlib import Path

import psycopg
from psycopg import Connection

from hta.config import Settings

logger = logging.getLogger(__name__)

REGISTRY = "schema_migrations"


def _migrations_directory(origin: Path | None = None) -> Path:
    """Localiza ``db/migrations`` subiendo desde este archivo hasta la raíz.

    El mismo módulo sirve en el host, donde el paquete vive en
    ``backend/src/hta/db``, y en la imagen, donde el compose monta el
    repositorio en ``/app/db``. Si el directorio no aparece se falla con un
    mensaje explícito, en lugar de aplicar cero migraciones en silencio.

    ``origin`` es el archivo desde el que empieza la búsqueda; existe para
    probar la disposición de la imagen sin construirla.
    """
    start = (origin or Path(__file__)).resolve().parent
    for parent in (start, *start.parents):
        candidate = parent / "db" / "migrations"
        if candidate.is_dir():
            return candidate
    raise RuntimeError(
        "No se encontró el directorio db/migrations desde "
        f"{start}; el esquema quedaría vacío si se continuara."
    )


def _sql_files(directory: Path) -> list[Path]:
    """Devuelve los archivos .sql del directorio, ordenados por nombre."""
    return sorted(directory.glob("*.sql"), key=lambda path: path.name)


def apply_migrations(
    conn: Connection, extra_directory: Path | None = None
) -> list[str]:
    """Aplica los archivos pendientes y devuelve los nombres recién aplicados.

    ``extra_directory`` añade, después de los archivos del proyecto, los .sql de
    un directorio alterno. Es una costura de prueba: permite comprobar que un
    archivo que falla no deja tablas a medias sin escribir en ``db/migrations``.

    Cada archivo se ejecuta dentro de una transacción junto con su registro en
    ``schema_migrations``. Si el archivo falla, la transacción se revierte, no
    se registra y el error se propaga con el nombre del archivo.
    """
    files = _sql_files(_migrations_directory())
    if extra_directory is not None:
        extra = Path(extra_directory)
        if not extra.is_dir():
            raise FileNotFoundError(f"El directorio de migraciones no existe: {extra}")
        files.extend(_sql_files(extra))

    with conn.transaction():
        conn.execute(
            f"create table if not exists {REGISTRY} ("
            " filename text primary key,"
            " applied_at timestamptz not null default now()"
            ")"
        )

    registered = {
        row[0] for row in conn.execute(f"select filename from {REGISTRY}").fetchall()
    }

    applied: list[str] = []
    for path in files:
        if path.name in registered:
            continue
        sql = path.read_text(encoding="utf-8")
        try:
            with conn.transaction():
                conn.execute(sql)
                conn.execute(
                    f"insert into {REGISTRY} (filename) values (%s)", (path.name,)
                )
        except Exception as error:
            raise RuntimeError(
                f"La migración {path.name} falló y se revirtió sin dejar cambios."
            ) from error
        registered.add(path.name)
        applied.append(path.name)
        logger.info("Migración aplicada: %s", path.name)
    return applied


def main() -> int:
    """Aplica las migraciones con la conexión que describe el entorno."""
    settings = Settings()
    with psycopg.connect(settings.database_url, autocommit=True) as connection:
        applied = apply_migrations(connection)
    if applied:
        print(f"Migraciones aplicadas: {', '.join(applied)}")
    else:
        print("No hay migraciones pendientes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
