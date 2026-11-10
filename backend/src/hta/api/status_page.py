"""@requirement none

Página pública de estado del servicio y de lo que hay detrás.

El navegador que abre ``/api/health`` recibe esta página; cualquier otro
cliente recibe el JSON del contrato. La página publica solo si cada componente
responde: no muestra cifras clínicas, ni el entorno, ni versiones, ni rutas de
conexión. Un dato así ayudaría a tantear el sistema y no aporta a quien solo
quiere saber si el servicio está arriba. Los mensajes de error de los
controladores tampoco salen: pueden traer credenciales.
"""

from __future__ import annotations

import html
import http.client
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlparse

import psycopg
from pymongo import MongoClient
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ComponentStatus:
    """Resultado de comprobar un componente: si responde o no."""

    name: str
    role: str
    state: str  # "ok" o "fail"


def check_postgres(database_url: str) -> ComponentStatus:
    """Comprueba que PostgreSQL responde a una consulta trivial."""
    try:
        with psycopg.connect(database_url, connect_timeout=2) as connection:
            connection.execute("SELECT 1")
    except psycopg.Error as error:
        logger.warning("La comprobación de PostgreSQL falló: %s", error)
        return ComponentStatus("PostgreSQL", "Registro clínico", "fail")
    return ComponentStatus("PostgreSQL", "Registro clínico", "ok")


def check_mongo(mongo_url: str) -> ComponentStatus:
    """Comprueba que MongoDB responde a un ping.

    El cliente se construye dentro del ``try``: una URL vacía lanza
    ``ConfigurationError``, una malformada ``InvalidURI`` y un puerto inválido
    ``ValueError``. Las dos primeras heredan de ``PyMongoError``; la tercera se
    captura aparte para que el handler nunca propague la excepción.
    """
    status = ComponentStatus("MongoDB", "Flujo crudo de dispositivos", "fail")
    client: MongoClient | None = None
    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=1500)
        client.admin.command("ping")
    except (PyMongoError, ValueError) as error:
        logger.warning("La comprobación de MongoDB falló: %s", error)
        return status
    finally:
        if client is not None:
            client.close()
    return ComponentStatus("MongoDB", "Flujo crudo de dispositivos", "ok")


def check_web(web_url: str) -> ComponentStatus:
    """Comprueba que la interfaz web responde a una petición HTTP.

    Una URL ausente, una que no sea ``http`` o ``https`` y una que no se pueda
    interpretar dejan el componente como no disponible. No se lanza la
    excepción: la página de estado tiene que seguir respondiendo aunque la
    configuración esté mal.
    """
    status = ComponentStatus("Interfaz web", "Aplicación de paciente, médico y administrador", "fail")
    if not web_url:
        return status
    parsed = urlparse(web_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        logger.warning("HTA_WEB_URL no es una URL HTTP utilizable: %s", web_url)
        return status
    try:
        with urllib.request.urlopen(web_url, timeout=2):
            pass
    except (
        urllib.error.URLError,
        http.client.HTTPException,
        OSError,
        UnicodeError,
        ValueError,
    ) as error:
        # ``InvalidURL`` y ``RemoteDisconnected`` heredan de ``HTTPException``;
        # no de ``ValueError``. Un puerto no numérico cae aquí y no debe tumbar
        # la página.
        logger.warning("La comprobación de la web falló: %s", error)
        return status
    return ComponentStatus("Interfaz web", "Aplicación de paciente, médico y administrador", "ok")


def check_api() -> ComponentStatus:
    """Describe la propia API: si responde esta página, está arriba."""
    return ComponentStatus("API", "Servicio FastAPI", "ok")


_LABELS = {"ok": "Operativo", "degraded": "Degradado", "fail": "Caído"}

_STYLE = """
:root{--bg:#f5f6f8;--card:#fff;--text:#1c2430;--muted:#5d6878;--line:#dde1e8;
--ok:#14703b;--ok-bg:#dff3e6;--warn:#8a5a00;--warn-bg:#fdf0cf;--fail:#a4262c;--fail-bg:#fbe0e1}
@media(prefers-color-scheme:dark){:root{--bg:#12161c;--card:#1b212a;--text:#e6e9ee;
--muted:#9aa4b2;--line:#2c3440;--ok:#6fd49a;--ok-bg:#16301f;--warn:#f0c15a;
--warn-bg:#352a0f;--fail:#f08a8f;--fail-bg:#3a1a1c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.4rem;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 20px;font-size:.9rem}
.banner{padding:14px 16px;border-radius:10px;font-weight:600;margin-bottom:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;
padding:16px;margin-bottom:12px}
.head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.name{font-weight:600;font-size:1.05rem}
.role{color:var(--muted);font-size:.85rem}
.badge{padding:3px 12px;border-radius:999px;font-weight:600;font-size:.85rem}
.ok{background:var(--ok-bg);color:var(--ok)}
.degraded{background:var(--warn-bg);color:var(--warn)}
.fail{background:var(--fail-bg);color:var(--fail)}
.err{margin-top:10px;font-size:.9rem;color:var(--fail)}
footer{color:var(--muted);font-size:.8rem;margin-top:20px}
a{color:inherit}
""".strip()


def render(components: list[ComponentStatus], overall: str, now: datetime) -> str:
    """Arma la página HTML. Todo texto variable se escapa."""
    e = html.escape
    cards = []
    for item in components:
        error = '<div class="err">No responde</div>' if item.state != "ok" else ""
        cards.append(
            f'<section class="card"><div class="head"><div>'
            f'<div class="name">{e(item.name)}</div><div class="role">{e(item.role)}</div>'
            f'</div><span class="badge {item.state}">{_LABELS[item.state]}</span></div>'
            f"{error}</section>"
        )
    banner = {
        "ok": "Todos los servicios responden.",
        "degraded": "Hay servicios que no responden.",
    }[overall]
    stamp = now.strftime("%Y-%m-%d %H:%M:%S UTC")
    return (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta http-equiv="refresh" content="10">'
        "<title>Estado del servicio</title>"
        f"<style>{_STYLE}</style></head><body><main>"
        "<h1>Estado del servicio</h1>"
        '<p class="sub">Plataforma de telemonitoreo de hipertensión arterial</p>'
        f'<div class="banner {overall}">{banner}</div>'
        f'{"".join(cards)}'
        f"<footer>Comprobado el {stamp}. La página se actualiza cada 10 segundos. "
        'El JSON del contrato se obtiene con <code>curl localhost:8000/api/health</code> '
        "o añadiendo <code>?format=json</code>.</footer></main></body></html>"
    )
