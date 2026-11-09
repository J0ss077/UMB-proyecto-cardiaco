"""Página de estado del servicio y de lo que hay detrás.

El navegador que abre ``/api/health`` recibe esta página; cualquier otro
cliente recibe el JSON del contrato. Cada comprobación mide su latencia y
devuelve el detalle que una persona necesita para ubicar una falla. Nunca se
muestran URL de conexión ni mensajes de error de los controladores, solo el
nombre del tipo de error, porque esos mensajes pueden traer credenciales.
"""

from __future__ import annotations

import html
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone

import psycopg
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from hta.config import Settings

logger = logging.getLogger(__name__)

# Tablas del registro clínico (no cuenta la bitácora de migraciones).
EXPECTED_TABLES = 16

STARTED_AT = time.monotonic()


@dataclass
class ComponentStatus:
    """Resultado de comprobar un componente: estado, latencia y datos sueltos."""

    name: str
    role: str
    state: str  # "ok" o "fail"
    latency_ms: float | None = None
    details: list[tuple[str, str]] = field(default_factory=list)
    error: str | None = None


def check_postgres(database_url: str) -> ComponentStatus:
    """Consulta versión, migraciones aplicadas y tablas del registro clínico."""
    status = ComponentStatus("PostgreSQL", "Registro clínico", "fail")
    started = time.perf_counter()
    try:
        with psycopg.connect(database_url, connect_timeout=2) as connection:
            version = connection.execute("SELECT version()").fetchone()[0]
            status.latency_ms = (time.perf_counter() - started) * 1000
            migrations = connection.execute(
                "SELECT count(*), max(applied_at) FROM schema_migrations"
            ).fetchone()
            tables = connection.execute(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "AND table_name <> 'schema_migrations'"
            ).fetchone()[0]
        status.state = "ok"
        status.details = [
            ("Versión", " ".join(version.split()[:2])),
            ("Migraciones aplicadas", str(migrations[0])),
            ("Última migración", _format_time(migrations[1])),
            ("Tablas del registro", f"{tables} de {EXPECTED_TABLES}"),
        ]
        if tables != EXPECTED_TABLES:
            status.state = "degraded"
            status.error = "El número de tablas no coincide con el esperado"
    except psycopg.Error as error:
        logger.warning("La comprobación de PostgreSQL falló: %s", error)
        status.error = type(error).__name__
    return status


def check_mongo(mongo_url: str) -> ComponentStatus:
    """Consulta versión y colecciones de la base del flujo crudo."""
    status = ComponentStatus("MongoDB", "Flujo crudo de dispositivos", "fail")
    client: MongoClient | None = None
    started = time.perf_counter()
    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=1500)
        info = client.server_info()
        status.latency_ms = (time.perf_counter() - started) * 1000
        database = client.get_default_database(default="hta")
        collections = sorted(database.list_collection_names())
        status.state = "ok"
        status.details = [
            ("Versión", str(info.get("version", "desconocida"))),
            ("Base de datos", database.name),
            ("Colecciones", ", ".join(collections) if collections else "ninguna"),
        ]
    except (PyMongoError, ValueError) as error:
        logger.warning("La comprobación de MongoDB falló: %s", error)
        status.error = type(error).__name__
    finally:
        if client is not None:
            client.close()
    return status


def check_demo_data(database_url: str) -> ComponentStatus:
    """Informa si los datos de demostración (`make seed`) están cargados."""
    status = ComponentStatus("Datos de prueba", "Cuentas y registros de demostración", "fail")
    try:
        with psycopg.connect(database_url, connect_timeout=2) as connection:
            accounts = connection.execute(
                "SELECT count(*) FROM users WHERE email LIKE '%@hta.demo'"
            ).fetchone()[0]
            counts = {
                table: connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                for table in (
                    "patient_profiles",
                    "consents",
                    "readings",
                    "alerts",
                    "medications",
                    "teleconsultations",
                    "alert_config",
                )
            }
    except psycopg.Error as error:
        logger.warning("La comprobación de datos de prueba falló: %s", error)
        status.error = type(error).__name__
        return status
    status.details = [
        ("Cuentas de demostración", str(accounts)),
        ("Pacientes", str(counts["patient_profiles"])),
        ("Consentimientos", str(counts["consents"])),
        ("Lecturas de presión", str(counts["readings"])),
        ("Alertas", str(counts["alerts"])),
        ("Medicamentos", str(counts["medications"])),
        ("Teleconsultas", str(counts["teleconsultations"])),
        ("Umbrales configurados", str(counts["alert_config"])),
    ]
    if accounts == 0 or counts["readings"] == 0:
        status.state = "degraded"
        status.error = "Sin datos de demostración; ejecuta make seed"
    else:
        status.state = "ok"
    return status


def check_web(web_url: str) -> ComponentStatus:
    """Comprueba que la interfaz web responde. Sin URL configurada no se mide."""
    status = ComponentStatus("Interfaz web", "Aplicación de paciente, médico y administrador", "fail")
    if not web_url:
        status.state = "degraded"
        status.error = "HTA_WEB_URL no está configurada"
        return status
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(web_url, timeout=2) as response:
            status.latency_ms = (time.perf_counter() - started) * 1000
            status.state = "ok"
            status.details = [("Respuesta HTTP", str(response.status))]
    except (urllib.error.URLError, OSError, ValueError) as error:
        logger.warning("La comprobación de la web falló: %s", error)
        status.error = type(error).__name__
    return status


def check_api(settings: Settings, version: str) -> ComponentStatus:
    """Describe la propia API: si responde esta página, está arriba."""
    seconds = int(time.monotonic() - STARTED_AT)
    return ComponentStatus(
        "API",
        "Servicio FastAPI",
        "ok",
        latency_ms=0.0,
        details=[
            ("Versión", version),
            ("Entorno", settings.environment),
            ("En línea desde hace", _format_duration(seconds)),
            ("Dispositivos", "ingesta abierta" if settings.device_key else "ingesta cerrada"),
        ],
    )


def _format_time(value: datetime | None) -> str:
    if value is None:
        return "ninguna"
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _format_duration(seconds: int) -> str:
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    if hours:
        return f"{hours} h {minutes} min"
    if minutes:
        return f"{minutes} min {secs} s"
    return f"{secs} s"


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
dl{margin:12px 0 0;display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;font-size:.9rem}
dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
.err{margin-top:10px;font-size:.9rem;color:var(--fail)}
footer{color:var(--muted);font-size:.8rem;margin-top:20px}
a{color:inherit}
""".strip()


def render(components: list[ComponentStatus], overall: str, now: datetime) -> str:
    """Arma la página HTML. Todo texto variable se escapa."""
    e = html.escape
    cards = []
    for item in components:
        rows = "".join(f"<dt>{e(k)}</dt><dd>{e(v)}</dd>" for k, v in item.details)
        if item.latency_ms is not None and item.name != "API":
            rows = f"<dt>Latencia</dt><dd>{item.latency_ms:.0f} ms</dd>" + rows
        error = (
            f'<div class="err">Error: {e(item.error)}</div>' if item.error else ""
        )
        details = f"<dl>{rows}</dl>" if rows else ""
        cards.append(
            f'<section class="card"><div class="head"><div>'
            f'<div class="name">{e(item.name)}</div><div class="role">{e(item.role)}</div>'
            f'</div><span class="badge {item.state}">{_LABELS[item.state]}</span></div>'
            f"{details}{error}</section>"
        )
    banner = {
        "ok": "Todos los servicios operan con normalidad.",
        "degraded": "Hay servicios con problemas. Revisa el detalle de cada uno.",
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
