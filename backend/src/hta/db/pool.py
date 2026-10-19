"""Grupo de conexiones asíncronas a PostgreSQL, construido bajo demanda."""

from __future__ import annotations

from psycopg_pool import AsyncConnectionPool

from hta.config import Settings

_pool: AsyncConnectionPool | None = None


def get_pool() -> AsyncConnectionPool:
    """Devuelve el grupo compartido y lo construye en la primera llamada.

    El grupo se crea cerrado: abrirlo corresponde al ciclo de vida de la
    aplicación. Así importar este módulo, o construir la aplicación, no abre
    conexiones ni exige que PostgreSQL esté disponible.
    """
    global _pool
    if _pool is None:
        settings = Settings()
        _pool = AsyncConnectionPool(conninfo=settings.database_url, open=False)
    return _pool


async def close_pool() -> None:
    """Cierra el grupo compartido y lo olvida para que otro arranque lo recree.

    Un grupo cerrado no se puede volver a abrir. Olvidarlo aquí permite que una
    segunda aplicación del mismo proceso construya uno nuevo: lo necesita la
    suite unitaria, que levanta varias aplicaciones seguidas, y el reinicio del
    servicio sin cambiar de proceso.
    """
    global _pool
    if _pool is None:
        return
    pool, _pool = _pool, None
    await pool.close()
