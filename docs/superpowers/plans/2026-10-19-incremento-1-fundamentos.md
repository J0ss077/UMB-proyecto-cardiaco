# Incremento 1 — Fundamentos, esquema y acceso: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el repositorio nuevo en pie: contenedores que levantan con un comando, esquema PostgreSQL completo con las dieciséis tablas, autenticación con roles, consentimiento informado, auditoría y datos de demostración sembrados.

**Architecture:** Monolito modular en Python sobre FastAPI, con un paquete por módulo de dominio y una única costura HTTP hacia el frontend. PostgreSQL es la fuente de verdad del registro clínico y MongoDB recibe el flujo crudo de dispositivos. Todo corre en contenedores orquestados por un solo archivo compose.

**Tech Stack:** Python 3.12 en la imagen, FastAPI, psycopg 3, pydantic-settings, pytest, PostgreSQL 16, MongoDB 7, React con Vite para la interfaz, `podman-compose` o `docker compose` según la máquina.

**Spec:** `docs/superpowers/specs/2026-10-18-reconstruccion-plataforma-hta-design.md`

**Ventana del incremento:** 19 de octubre al 2 de noviembre de 2026, con revisión del tutor el lunes 2 de noviembre. Lo que se demuestra ese día es el sistema levantando, el esquema completo aplicado y verificable desde una herramienta externa, y el recorrido de sesión de las cuatro cuentas aunque la interfaz todavía esté en esqueleto.

## Global Constraints

- Dieciséis tablas con los nombres exactos del manual y siete tipos enumerados: `user_role`, `reading_source`, `validation_status`, `alert_severity`, `alert_status`, `reminder_kind`, `teleconsultation_mode`.
- `alert_config` incluye dos columnas nullable adicionales, `critical_low` y `critical_high`, aprobadas en el diseño, con su ADR.
- Identificadores UUID con `gen_random_uuid()`. Marcas de tiempo `TIMESTAMPTZ` con `now()`. Tablas en plural, columnas en snake_case, llaves foráneas con sufijo `_id`.
- Toda llave foránea declara acción de borrado explícita. El vínculo perfil-usuario usa `ON DELETE RESTRICT`; los datos clínicos dependientes del paciente usan `ON DELETE CASCADE`.
- La desactivación de una cuenta nunca borra registros clínicos: marca `active = false`, seudonimiza correo y nombre, inutiliza la contraseña y revoca los tokens de refresco.
- Ningún dato clínico se procesa sin consentimiento vigente.
- La IA no diagnostica ni trata. Ninguna alerta se cierra de forma autónoma.
- El enum se llama severidad de la alerta, nunca riesgo cardiovascular, en documentos e interfaz.
- Sin emojis en ningún archivo, commit, mensaje de interfaz ni error.
- Ningún artefacto de la capa humana declara autoría asistida por IA. Las menciones se permiten solo en `AGENTS.md`, `.agents/` y `docs/superpowers/`.
- El código y los identificadores van en inglés; la documentación del repositorio y los mensajes de interfaz van en español.
- El proyecto anterior, `.legacy-project/`, queda ignorado por git y ninguna herramienta del proyecto lo lee.
- La imagen del backend fija Python 3.12 aunque el host tenga otra versión.
- Los tests de integración corren contra el PostgreSQL del compose; los unitarios no tocan base de datos.

## Review Focus

Cada línea tiene su prueba en la tarea que posee el código, no al final del incremento.

- Un correo ya registrado, en mayúsculas o con espacios, no debe crear una segunda cuenta ni dejar un perfil clínico huérfano: el resultado esperado es 409 y una sola fila en `users`. Prueba en la tarea 9.
- Una cuenta desactivada con un token de acceso todavía vigente debe ser rechazada de inmediato, no cuando expire el token. Prueba en la tarea 9.
- Un token de refresco reutilizado después de rotar debe revocar la sesión completa, no emitir un par nuevo. Prueba en la tarea 8.
- Un consentimiento revocado debe impedir aceptar el mismo consentimiento como si nada y conservar el histórico con su revocación. Prueba en la tarea 10.
- Reiniciar el sistema no debe volver a aplicar migraciones ni duplicar la siembra: dos arranques seguidos dejan el mismo estado. Prueba en las tareas 5 y 11.
- Una migración a medio aplicar debe dejar la base intacta: el archivo corre dentro de una transacción, así que un error no deja tablas a medias. Prueba en la tarea 5.

Dos modos de fallo que este incremento todavía no puede ejercitar, y que pertenecen a incrementos posteriores: el cálculo de severidad con series cortas y los umbrales exactos en el borde (incremento 3), y el acceso de un paciente a datos de otro (incremento 2, cuando existan los endpoints de datos clínicos).

---

### Task 1: Esqueleto del repositorio y continuidad entre sesiones

**Files:**

- Create: `.gitignore`, `README.md`, `AGENTS.md`, `Makefile`, `.agents/STATE.md`, `.agents/BACKLOG.md`, `.agents/.gitkeep`
- Create: `.github/workflows/ci.yml`
- Test: verificación manual con `make brief` al final de la tarea

**Interfaces:**

- Consumes: nada.
- Produces: `make brief`, `make test`, `make up`, `make down` como puntos de entrada que las tareas siguientes amplían; `AGENTS.md` con las invariantes que todo agente lee primero.

- [ ] **Step 1: Crear `.gitignore`**

Debe ignorar, como mínimo: `.legacy-project/`, `.recon/`, `.env`, `__pycache__/`, `.venv/`, `node_modules/`, `dist/`, `*.pyc`, `.pytest_cache/`, `.agents/*.local.md`, `ml/data/`, `ml/models/*.joblib`.

- [ ] **Step 2: Crear `AGENTS.md`**

Contenido obligatorio, corto: qué es el proyecto en tres líneas; las invariantes globales de esta lista como reglas duras; el orden de lectura al empezar una sesión (`AGENTS.md`, `.agents/STATE.md`, `.agents/BACKLOG.md`, `.agents/MAP.md`); dónde vive cada cosa; y la prohibición explícita de usar `.legacy-project/` como referencia de implementación. Sin mención de herramientas concretas ni de modelos.

- [ ] **Step 3: Crear `.agents/STATE.md` y `.agents/BACKLOG.md`**

`STATE.md` con tres secciones fijas y fecha visible: terminado, en curso, siguiente paso y bloqueos. `BACKLOG.md` con una tabla de columnas `id`, `requerimiento`, `descripción`, `estado`, donde estado es uno de `pendiente`, `en curso`, `hecho`, `bloqueado`.

- [ ] **Step 4: Crear `README.md`**

Una pantalla: qué es el sistema, qué contiene el repositorio, requisitos previos, cómo levantarlo con un comando para `podman-compose` y para `docker compose`, cómo correr las pruebas, y las cuatro cuentas de demostración. Sin capturas todavía.

- [ ] **Step 5: Crear `Makefile`**

Objetivos: `up` (levanta el compose), `down`, `logs`, `test` (unitarios y de integración), `migrate`, `seed`, `brief` (imprime `STATE.md`, `BACKLOG.md` y `MAP.md` si existe), `check` (autoría, estilo y pruebas), `docs` (genera mapa y matriz de estado). Los objetivos que dependen de contenedores detectan `podman-compose` y caen a `docker compose`.

- [ ] **Step 6: Crear `.github/workflows/ci.yml`**

Disparador en `push` y `pull_request` sobre `main`. Pasos: checkout, instalar Python 3.12, instalar dependencias del backend, correr unitarios, levantar servicios de PostgreSQL y MongoDB como servicios del job, correr integraciones, y ejecutar los verificadores de autoría y estilo. El workflow se escribe ahora aunque la integración continua solo empiece a correr cuando el repositorio se publique.

- [ ] **Step 7: Verificar y confirmar**

Run: `make brief`
Expected: imprime el estado y el backlog sin error, y menciona que el mapa todavía no existe.

```bash
git add .gitignore README.md AGENTS.md Makefile .agents .github
git commit -m "chore: scaffold repository, working rules and session continuity"
```

---

### Task 2: Verificadores de autoría y de estilo

**Files:**

- Create: `scripts/check_authorship.py`, `scripts/check_style.py`
- Test: `scripts/tests/test_check_authorship.py`, `scripts/tests/test_check_style.py`

**Interfaces:**

- Consumes: nada.
- Produces: `check_authorship.py --root <path>` y `check_style.py --root <path>`, ambos con código de salida 1 cuando encuentran una violación y 0 cuando no; `make check` los invoca.

- [ ] **Step 1: Escribir el test que falla para autoría**

```python
def test_flags_ai_authorship_claim(tmp_path):
    doc = tmp_path / "manual.md"
    doc.write_text("Este documento fue generado por IA.", encoding="utf-8")
    assert run_check(tmp_path) == 1

def test_allows_the_word_ai_when_it_names_the_product(tmp_path):
    doc = tmp_path / "manual.md"
    doc.write_text("El sistema integra un modelo de IA de apoyo a la decision.", encoding="utf-8")
    assert run_check(tmp_path) == 0

def test_ignores_agent_layer(tmp_path):
    agents = tmp_path / ".agents"
    agents.mkdir()
    (agents / "STATE.md").write_text("Sesion asistida por IA.", encoding="utf-8")
    assert run_check(tmp_path) == 0
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `python3 -m pytest scripts/tests/test_check_authorship.py -v`
Expected: FAIL con `ModuleNotFoundError` o `ImportError`.

- [ ] **Step 3: Implementar `scripts/check_authorship.py`**

Función pública `scan(root: Path) -> list[Violation]`. Busca, sin distinguir mayúsculas, las fórmulas: `generado por ia`, `asistido por ia`, `con ayuda de ia`, `apoyado por ia`, `escrito por ia`, `coautor ia`, `chatgpt`, `copilot`, `claude`, `gpt-`, `gemini`, `llm`, `modelo de lenguaje`. Recorre archivos de texto con extensiones `.md`, `.py`, `.ts`, `.tsx`, `.sql`, `.yml`, `.yaml`, `.json`, `.html`, `.css`, `.txt`. Excluye `.legacy-project`, `.recon`, `.agents`, `docs/superpowers`, `node_modules`, `.venv`, `ml/data`. La lista de patrones vive en una constante `PATTERNS` al inicio del archivo.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `python3 -m pytest scripts/tests/test_check_authorship.py -v`
Expected: PASS, tres pruebas.

- [ ] **Step 5: Escribir el test que falla para emojis**

```python
def test_flags_emoji_in_markdown(tmp_path):
    (tmp_path / "doc.md").write_text("Listo \U0001F600", encoding="utf-8")
    assert run_style(tmp_path) == 1

def test_allows_plain_text(tmp_path):
    (tmp_path / "doc.md").write_text("Estado: implementado.", encoding="utf-8")
    assert run_style(tmp_path) == 0
```

- [ ] **Step 6: Implementar `scripts/check_style.py`**

Recorre los mismos tipos de archivo y las mismas exclusiones. Una violación es cualquier carácter cuyo punto de código caiga en los rangos `U+1F300–U+1FAFF`, `U+2600–U+27BF`, `U+FE0F`, `U+2B00–U+2BFF`, o `U+2190–U+21FF` cuando aparezca en un `.md`. Reporta archivo y número de línea.

- [ ] **Step 7: Ejecutar, verificar y confirmar**

Run: `python3 -m pytest scripts/tests -v`
Expected: PASS, cinco pruebas en total.

```bash
git add scripts
git commit -m "feat(scripts): add authorship and style verifiers"
```

---

### Task 3: Esqueleto del backend con configuración y salud

**Files:**

- Create: `backend/pyproject.toml`, `backend/Dockerfile`, `backend/src/hta/__init__.py`, `backend/src/hta/config.py`, `backend/src/hta/app.py`, `backend/src/hta/api/__init__.py`, `backend/src/hta/api/health.py`
- Create: `docs/adr/0001-python-fastapi-stack.md`
- Test: `backend/tests/unit/test_config.py`, `backend/tests/integration/test_health.py`

**Interfaces:**

- Consumes: `make` de la tarea 1.
- Produces: `hta.config.Settings` con campos `database_url: str`, `mongo_url: str`, `jwt_secret: str`, `access_ttl_seconds: int`, `refresh_ttl_seconds: int`, `environment: str`; `hta.app.create_app() -> FastAPI`; `GET /api/health` devuelve `{"status": "ok", "database": "ok", "mongo": "ok"}`.

- [ ] **Step 1: Escribir el test que falla para la configuración**

```python
def test_settings_reads_environment(monkeypatch):
    monkeypatch.setenv("HTA_DATABASE_URL", "postgresql://u:p@h:5432/d")
    monkeypatch.setenv("HTA_MONGO_URL", "mongodb://h:27017")
    monkeypatch.setenv("HTA_JWT_SECRET", "secret")
    settings = Settings()
    assert settings.database_url == "postgresql://u:p@h:5432/d"
    assert settings.access_ttl_seconds == 900
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && python3 -m pytest tests/unit/test_config.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'hta'`.

- [ ] **Step 3: Crear `backend/pyproject.toml` y el paquete**

`pyproject.toml` con dependencias `fastapi`, `uvicorn[standard]`, `psycopg[binary,pool]`, `pymongo`, `pydantic-settings`, `pyjwt`, y de desarrollo `pytest`, `pytest-cov`, `httpx`. Configurar `[tool.pytest.ini_options]` con `testpaths` y marcadores `unit` e `integration`. Crear `backend/src/hta/__init__.py` vacío y `hta/config.py` con `Settings(BaseSettings)` y `model_config = SettingsConfigDict(env_prefix="HTA_")`.

- [ ] **Step 4: Implementar `create_app` y `/api/health`**

`hta/app.py` define `create_app() -> FastAPI`, registra el router de salud y no conecta nada al construirse: la comprobación de base de datos ocurre dentro del handler, que devuelve `database` en `"ok"` o `"fail"` sin lanzar excepción. `hta/api/health.py` expone `GET /api/health`.

- [ ] **Step 5: Escribir el ADR del stack**

`docs/adr/0001-python-fastapi-stack.md`, en español y en formato de decisión: contexto, la decisión, las alternativas descartadas, y las consecuencias. Debe citar literalmente la frase de la documentación de semestre 1, sección 6.1, que nombra "Python, TensorFlow, Node.js, MongoDB, React.js y Docker" y explicar por qué se interpreta como ilustrativa y no como obligatoria, y por qué el manual técnico, que no fija lenguaje, prevalece. Es el registro técnico donde la técnica se nombra con precisión.

- [ ] **Step 6: Escribir el test de integración de salud**

```python
def test_health_reports_dependencies(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["database"] == "ok"
```

- [ ] **Step 7: Crear el `Dockerfile`**

Base `python:3.12-slim`, usuario sin privilegios, instala el paquete, expone 8000, arranca con `uvicorn hta.app:create_app --factory --host 0.0.0.0 --port 8000`.

- [ ] **Step 8: Ejecutar, verificar y confirmar**

Run: `cd backend && python3 -m pytest tests/unit -v`
Expected: PASS en unitarios. El de integración queda pendiente hasta la tarea 4.

```bash
git add backend
git commit -m "feat(backend): scaffold FastAPI app with settings and health endpoint"
```

---

### Task 4: Compose con PostgreSQL, MongoDB y arranque con un comando

**Files:**

- Create: `compose.yaml`, `.env.example`, `backend/entrypoint.sh`, `web/Dockerfile`, `web/package.json`
- Modify: `Makefile` (objetivos `up`, `down`, `migrate`)
- Test: `backend/tests/integration/conftest.py`

**Interfaces:**

- Consumes: `hta.app.create_app`, `hta.config.Settings`.
- Produces: `make up` levanta `db` (PostgreSQL 16), `mongo` (MongoDB 7) y `backend`; el backend espera a la base, aplica migraciones y sirve en `http://localhost:8000`; la fixture `client` de integración apunta a ese backend y la fixture `db` da un `Connection` a PostgreSQL.

- [ ] **Step 1: Escribir `compose.yaml`**

Servicios `db`, `mongo`, `backend`, `web`. `db` con volumen nombrado, `healthcheck` con `pg_isready`; `mongo` con `healthcheck` con `mongosh --eval`. `backend` con `depends_on` en condición `service_healthy`, montaje de `./backend/src` para desarrollo y variable `HTA_DATABASE_URL` apuntando al servicio `db`. `web` aún sin código, sirviendo un placeholder estático. Sin `version:` en el archivo, para compatibilidad con ambas herramientas.

- [ ] **Step 2: Escribir `.env.example`**

Variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `HTA_JWT_SECRET`, `HTA_ACCESS_TTL_SECONDS`, `HTA_REFRESH_TTL_SECONDS`, `HTA_ENVIRONMENT`. El `README.md` explica copiarlo a `.env`.

- [ ] **Step 3: Escribir `backend/entrypoint.sh`**

Espera a PostgreSQL con un bucle acotado, ejecuta `python -m hta.db.migrate`, y luego arranca uvicorn. Si la migración falla, el contenedor sale con código distinto de cero para que el fallo sea visible.

- [ ] **Step 4: Escribir `conftest.py` de integración**

Fixtures de sesión: `client` (httpx contra `http://localhost:8000`), `db` (psycopg a la base del compose), `clean_db` (trunca las tablas mutables entre pruebas, respetando `ON DELETE RESTRICT`). Marca todas las pruebas del directorio con `integration`.

- [ ] **Step 5: Verificar el arranque**

Run: `cp .env.example .env && make up && sleep 15 && curl -s localhost:8000/api/health`
Expected: `{"status":"ok","database":"ok","mongo":"ok"}`. En este punto `database` puede ser `ok` sin tablas todavía; las tablas llegan en la tarea 5.

- [ ] **Step 6: Confirmar**

```bash
git add compose.yaml .env.example backend/entrypoint.sh backend/tests/integration web Makefile
git commit -m "feat(deploy): compose stack with postgres, mongo and backend entrypoint"
```

---

### Task 5: Migración inicial con las dieciséis tablas

**Files:**

- Create: `db/migrations/0001_initial.sql`, `backend/src/hta/db/migrate.py`, `backend/src/hta/db/pool.py`, `docs/manual/modelo-de-datos.md`
- Create: `docs/adr/0002-alert-config-critical-thresholds.md`
- Test: `backend/tests/integration/test_schema.py`

**Interfaces:**

- Consumes: el PostgreSQL del compose.
- Produces: función `hta.db.migrate.apply_migrations(conn) -> list[str]` que aplica en orden los archivos de `db/migrations` y registra cada uno en la tabla `schema_migrations`; `hta.db.pool.get_pool() -> AsyncConnectionPool`.

- [ ] **Step 1: Redactar `docs/manual/modelo-de-datos.md` desde el manual**

Transcribir el diccionario de datos del manual técnico v01, sección 1.4, para las dieciséis tablas, con columnas, tipos, restricciones y propósito, más los siete tipos enumerados y las relaciones de la sección 1.5. La fuente es el texto extraído en `.recon/manual-tecnico-v01.txt`, líneas 803 a 1275. Incluir la nota de la extensión aprobada de `alert_config` con sus dos columnas nuevas. Este archivo es la fuente de la migración y de la entrega en Markdown al Word.

- [ ] **Step 2: Escribir el test de esquema que falla**

```python
EXPECTED_TABLES = {
    "users", "patient_profiles", "patient_physician", "caregiver_links",
    "consents", "readings", "symptoms_mood", "medications",
    "adherence_events", "alerts", "alert_config", "reports",
    "reminders", "teleconsultations", "audit_logs", "refresh_tokens",
}

def test_all_tables_exist(db):
    rows = db.execute(
        "select table_name from information_schema.tables where table_schema = 'public'"
    ).fetchall()
    assert EXPECTED_TABLES <= {row[0] for row in rows}

def test_enums_have_expected_values(db):
    rows = db.execute(
        "select t.typname, e.enumlabel from pg_type t "
        "join pg_enum e on e.enumtypid = t.oid order by t.typname, e.enumsortorder"
    ).fetchall()
    actual = {}
    for name, label in rows:
        actual.setdefault(name, []).append(label)
    assert actual["alert_severity"] == ["low", "medium", "high", "critical"]
    assert actual["user_role"] == ["patient", "physician", "caregiver", "admin"]

def test_profile_delete_is_restricted(db):
    rows = db.execute(
        "select confdeltype from pg_constraint where conname = 'patient_profiles_user_id_fkey'"
    ).fetchall()
    assert rows[0][0] == "r"

def test_alert_config_has_critical_thresholds(db):
    rows = db.execute(
        "select column_name from information_schema.columns "
        "where table_name = 'alert_config'"
    ).fetchall()
    names = {row[0] for row in rows}
    assert {"critical_low", "critical_high"} <= names

def test_migrations_are_idempotent(db):
    applied_once = db.execute("select filename from schema_migrations order by filename").fetchall()
    apply_migrations(db)
    applied_twice = db.execute("select filename from schema_migrations order by filename").fetchall()
    assert applied_once == applied_twice

def test_failed_migration_leaves_no_partial_tables(db, tmp_path):
    bad = tmp_path / "9999_broken.sql"
    bad.write_text("create table should_not_exist (id int); select 1/0;", encoding="utf-8")
    with pytest.raises(Exception):
        apply_migrations(db, extra_directory=tmp_path)
    assert db.execute(
        "select 1 from information_schema.tables where table_name = 'should_not_exist'"
    ).fetchone() is None
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cd backend && python3 -m pytest tests/integration/test_schema.py -v`
Expected: FAIL, las tablas no existen.

- [ ] **Step 4: Escribir `db/migrations/0001_initial.sql`**

Contenido exacto del modelo documentado en el paso 1: `CREATE EXTENSION IF NOT EXISTS pgcrypto`, los siete `CREATE TYPE`, y los dieciséis `CREATE TABLE` con sus restricciones, acciones de borrado e índices por `patient_id` y tiempo. `alert_config` incluye `critical_low NUMERIC` y `critical_high NUMERIC`. Añadir al final `CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`.

- [ ] **Step 5: Implementar `apply_migrations` y `get_pool`**

`apply_migrations` lee `db/migrations/*.sql` ordenados por nombre, salta los ya registrados, ejecuta cada archivo en una transacción y registra el nombre. `get_pool` construye un `AsyncConnectionPool` perezoso desde `Settings().database_url`.

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `make down && make up && sleep 20 && cd backend && python3 -m pytest tests/integration/test_schema.py -v`
Expected: PASS, seis pruebas.

- [ ] **Step 7: Escribir el ADR de la extensión de `alert_config`**

`docs/adr/0002-alert-config-critical-thresholds.md`: el enum tiene cuatro niveles y la tabla del manual solo declara dos umbrales, de modo que `critical` no puede configurarse. Se decide añadir dos columnas nullable en lugar de crear una tabla de reglas, porque el número de tablas es parte del contrato con el manual y una tabla nueva abre la puerta a rediseñar el esquema ante cada caso. Consecuencia obligatoria: el diccionario de datos del manual se actualiza con esas dos columnas en la misma entrega.

- [ ] **Step 8: Confirmar**

```bash
git add db backend/src/hta/db backend/tests/integration/test_schema.py docs/manual/modelo-de-datos.md docs/adr/0002-alert-config-critical-thresholds.md
git commit -m "feat(db): initial migration with the sixteen tables and enums"
```

---

### Task 6: Colecciones de MongoDB para el flujo crudo

**Files:**

- Create: `db/mongo/init.js`, `backend/src/hta/db/mongo.py`
- Modify: `compose.yaml` (montar `init.js` en el servicio `mongo`)
- Test: `backend/tests/integration/test_mongo.py`

**Interfaces:**

- Consumes: el MongoDB del compose.
- Produces: `hta.db.mongo.get_database() -> Database`; colecciones `raw_readings` y `wearable_events` con índices `(patient_id, measured_at)` y `(device_id, measured_at)`.

- [ ] **Step 1: Escribir el test que falla**

```python
def test_raw_readings_indexes_exist(mongo_db):
    names = {index["name"] for index in mongo_db.raw_readings.list_indexes()}
    assert "patient_time" in names
    assert "device_time" in names
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && python3 -m pytest tests/integration/test_mongo.py -v`
Expected: FAIL, la colección no tiene esos índices.

- [ ] **Step 3: Escribir `db/mongo/init.js` e implementar `get_database`**

`init.js` crea ambas colecciones y los índices nombrados. Se monta en `/docker-entrypoint-initdb.d/` del servicio `mongo`. `hta/db/mongo.py` expone `get_database()` con un cliente perezoso desde `Settings().mongo_url`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `make down && make up && sleep 20 && cd backend && python3 -m pytest tests/integration/test_mongo.py -v`
Expected: PASS.

- [ ] **Step 5: Confirmar**

```bash
git add db/mongo backend/src/hta/db/mongo.py backend/tests/integration/test_mongo.py compose.yaml
git commit -m "feat(db): mongo collections and indexes for raw device stream"
```

---

### Task 7: Contraseñas y tokens

**Files:**

- Create: `backend/src/hta/auth/__init__.py`, `backend/src/hta/auth/passwords.py`, `backend/src/hta/auth/tokens.py`
- Test: `backend/tests/unit/auth/test_passwords.py`, `backend/tests/unit/auth/test_tokens.py`

**Interfaces:**

- Consumes: `Settings`.
- Produces: `hash_password(password: str) -> str`, `verify_password(password: str, encoded: str) -> bool`; `issue_access(user_id: UUID, role: str) -> str`, `decode_access(token: str) -> AccessClaims` con campos `user_id` y `role`, `new_refresh_token() -> tuple[str, str]` que devuelve el token crudo y su SHA-256 en hexadecimal.

- [ ] **Step 1: Escribir los tests que fallan**

```python
def test_hash_is_not_the_password():
    encoded = hash_password("correct horse")
    assert "correct horse" not in encoded
    assert verify_password("correct horse", encoded) is True
    assert verify_password("wrong", encoded) is False

def test_two_hashes_of_same_password_differ():
    assert hash_password("x") != hash_password("x")

def test_access_token_roundtrip():
    user_id = uuid4()
    token = issue_access(user_id, "physician")
    claims = decode_access(token)
    assert claims.user_id == user_id
    assert claims.role == "physician"

def test_expired_token_is_rejected():
    token = issue_access(uuid4(), "patient", ttl_seconds=-1)
    with pytest.raises(InvalidToken):
        decode_access(token)
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && python3 -m pytest tests/unit/auth -v`
Expected: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar contraseñas**

`hashlib.scrypt` con `n=2**14`, `r=8`, `p=1`, sal de 16 bytes de `secrets.token_bytes`, `dklen=32`. Formato almacenado `scrypt$n$r$p$salt_hex$hash_hex`. `verify_password` usa `hmac.compare_digest`.

- [ ] **Step 4: Implementar tokens**

JWT HS256 con `sub` igual al UUID del usuario, `role`, `iat` y `exp`. `ttl_seconds` opcional para pruebas. `decode_access` lanza `InvalidToken` si la firma o la expiración fallan. `new_refresh_token` devuelve `secrets.token_urlsafe(32)` y su `hashlib.sha256` en hexadecimal.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd backend && python3 -m pytest tests/unit/auth -v`
Expected: PASS, cuatro pruebas.

- [ ] **Step 6: Confirmar**

```bash
git add backend/src/hta/auth backend/tests/unit/auth
git commit -m "feat(auth): scrypt password hashing and JWT access tokens"
```

---

### Task 8: Sesión con rotación de refresco y auditoría del acceso

**Files:**

- Create: `backend/src/hta/audit/__init__.py`, `backend/src/hta/audit/service.py`, `backend/src/hta/auth/service.py`, `backend/src/hta/auth/router.py`
- Modify: `backend/src/hta/app.py`
- Test: `backend/tests/integration/auth/test_login.py`, `backend/tests/integration/auth/test_refresh.py`

**Interfaces:**

- Consumes: `hash_password`, `verify_password`, `issue_access`, `decode_access`, `new_refresh_token`, `get_pool`.
- Produces: `audit.record(conn, actor_user_id: UUID | None, action: str, entity: str | None, entity_id: UUID | None, ip: str | None, details: dict | None) -> None`; `auth.service.login(conn, email: str, password: str, ip: str | None) -> TokenPair`; `auth.service.refresh(conn, raw_token: str, ip: str | None) -> TokenPair`; `auth.service.logout(conn, raw_token: str) -> None`; `TokenPair(access_token: str, refresh_token: str, role: str)`; endpoints `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`.

- [ ] **Step 1: Escribir el test de login que falla**

```python
def test_login_returns_tokens_and_audits(client, db, active_user):
    response = client.post("/api/auth/login", json={"email": active_user.email, "password": "s3cret"})
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "admin"
    assert body["access_token"]
    row = db.execute("select action from audit_logs where actor_user_id = %s", (active_user.id,)).fetchone()
    assert row[0] == "auth.login"

def test_wrong_password_is_generic(client, active_user):
    response = client.post("/api/auth/login", json={"email": active_user.email, "password": "nope"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales invalidas"

def test_unknown_email_says_the_same(client):
    response = client.post("/api/auth/login", json={"email": "nadie@example.com", "password": "x"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Credenciales invalidas"
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && python3 -m pytest tests/integration/auth/test_login.py -v`
Expected: FAIL, 404 en `/api/auth/login`.

- [ ] **Step 3: Implementar auditoría y login**

`audit.record` inserta en `audit_logs` con `details` como JSON. `login` busca por correo, exige `active = true`, verifica la contraseña y, ante cualquier fallo, registra `auth.login_failed` en auditoría con el actor nulo y responde el mismo mensaje. Si acierta, emite el par, guarda el hash del refresco en `refresh_tokens` con su expiración y registra `auth.login`.

- [ ] **Step 4: Escribir los tests de rotación que fallan**

```python
def test_refresh_rotates_and_revokes_the_old_token(client, logged_in):
    first = logged_in["refresh_token"]
    response = client.post("/api/auth/refresh", json={"refresh_token": first})
    assert response.status_code == 200
    second = response.json()["refresh_token"]
    assert second != first
    reused = client.post("/api/auth/refresh", json={"refresh_token": first})
    assert reused.status_code == 401

def test_refresh_of_deactivated_account_is_rejected(client, db, logged_in, active_user):
    db.execute("update users set active = false where id = %s", (active_user.id,))
    response = client.post("/api/auth/refresh", json={"refresh_token": logged_in["refresh_token"]})
    assert response.status_code == 401
```

- [ ] **Step 5: Implementar `refresh` y `logout`**

`refresh` busca por hash, exige `revoked_at IS NULL` y `expires_at > now()`, exige que la cuenta siga activa, marca el token usado como revocado, emite uno nuevo y registra `auth.refresh`. Si el token ya estaba revocado, además revoca todos los refrescos del usuario y registra `auth.refresh_reuse`. `logout` marca `revoked_at` y registra `auth.logout`.

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `cd backend && python3 -m pytest tests/integration/auth -v`
Expected: PASS, cinco pruebas.

- [ ] **Step 7: Confirmar**

```bash
git add backend/src/hta/audit backend/src/hta/auth backend/tests
git commit -m "feat(auth): login, refresh rotation with reuse detection and audit trail"
```

---

### Task 9: Registro público, roles y desactivación con seudonimización

**Files:**

- Create: `backend/src/hta/accounts/__init__.py`, `backend/src/hta/accounts/service.py`, `backend/src/hta/accounts/router.py`, `backend/src/hta/auth/deps.py`
- Modify: `backend/src/hta/app.py`, `backend/tests/integration/conftest.py`
- Test: `backend/tests/integration/accounts/test_register.py`, `backend/tests/integration/accounts/test_roles.py`, `backend/tests/integration/accounts/test_deactivate.py`

**Interfaces:**

- Consumes: `audit.record`, `hash_password`, `decode_access`.
- Produces: `auth.deps.current_user(conn, authorization: str) -> CurrentUser` con `user_id` y `role`; `auth.deps.require_role(*roles: str)` como dependencia que responde 403; `accounts.service.register_patient(conn, email, password, full_name, birth_date) -> UUID`; `accounts.service.set_role(conn, actor, user_id, role) -> None`; `accounts.service.deactivate(conn, actor, user_id) -> None`; endpoints `POST /api/accounts/register`, `PATCH /api/accounts/{user_id}/role`, `POST /api/accounts/{user_id}/deactivate`, `GET /api/accounts`.
- Fixtures compartidas que se añaden a `conftest.py` en esta tarea: `active_user`, `admin_id`, `admin_headers`, `patient_id`, `other_patient_id`, `patient_headers`, `patient_login` y `patient_with_reading`, que devuelve la tupla `(user_id, reading_id)`.

- [ ] **Step 1: Escribir el test de registro que falla**

```python
def test_public_registration_creates_patient_only(client, db):
    response = client.post("/api/accounts/register", json={
        "email": "nuevo@example.com", "password": "s3cret!", "full_name": "Nuevo Paciente",
        "birth_date": "1970-05-01",
    })
    assert response.status_code == 201
    row = db.execute("select role from users where email = %s", ("nuevo@example.com",)).fetchone()
    assert row[0] == "patient"
    profile = db.execute(
        "select 1 from patient_profiles p join users u on u.id = p.user_id where u.email = %s",
        ("nuevo@example.com",),
    ).fetchone()
    assert profile is not None

def test_registration_cannot_choose_role(client):
    response = client.post("/api/accounts/register", json={
        "email": "x@example.com", "password": "s3cret!", "full_name": "X",
        "birth_date": "1970-05-01", "role": "admin",
    })
    assert response.status_code == 422

def test_duplicate_email_in_any_case_is_rejected(client, db):
    payload = {"email": "Dup@Example.com", "password": "s3cret!", "full_name": "Duplicado",
               "birth_date": "1970-05-01"}
    assert client.post("/api/accounts/register", json=payload).status_code == 201
    payload["email"] = "  dup@example.com  "
    assert client.post("/api/accounts/register", json=payload).status_code == 409
    assert db.execute("select count(*) from users where email ilike 'dup@example.com'").fetchone()[0] == 1
    assert db.execute("select count(*) from patient_profiles").fetchone()[0] == 1
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && python3 -m pytest tests/integration/accounts/test_register.py -v`
Expected: FAIL, 404.

- [ ] **Step 3: Implementar dependencias y registro**

`deps.current_user` lee `Authorization: Bearer`, decodifica, verifica en la base que la cuenta siga activa y devuelve rol. `deps.require_role` compara y responde 403. El modelo de entrada de registro no declara campo `role`, de modo que un rol enviado produce 422. `register_patient` crea `users` y `patient_profiles` en una transacción y registra `accounts.register`.

- [ ] **Step 4: Escribir los tests de roles que fallan**

```python
def test_admin_can_change_role(client, admin_headers, db, patient_id):
    response = client.patch(f"/api/accounts/{patient_id}/role",
                            json={"role": "physician"}, headers=admin_headers)
    assert response.status_code == 204
    row = db.execute("select role from users where id = %s", (patient_id,)).fetchone()
    assert row[0] == "physician"

def test_patient_cannot_change_roles(client, patient_headers, other_patient_id):
    response = client.patch(f"/api/accounts/{other_patient_id}/role",
                            json={"role": "admin"}, headers=patient_headers)
    assert response.status_code == 403

def test_invalid_role_is_rejected(client, admin_headers, patient_id):
    response = client.patch(f"/api/accounts/{patient_id}/role",
                            json={"role": "superuser"}, headers=admin_headers)
    assert response.status_code == 422
```

- [ ] **Step 5: Implementar cambio de rol**

Valida contra el enum en la base, rechaza valores desconocidos con 422, actualiza y registra `accounts.role_changed` con el rol anterior y el nuevo en `details`.

- [ ] **Step 6: Escribir los tests de desactivación que fallan**

```python
def test_deactivation_pseudonymizes_and_preserves_clinical_data(
    client, admin_headers, db, patient_with_reading
):
    user_id, reading_id = patient_with_reading
    response = client.post(f"/api/accounts/{user_id}/deactivate", headers=admin_headers)
    assert response.status_code == 204
    row = db.execute("select email, full_name, active, password_hash from users where id = %s", (user_id,)).fetchone()
    assert row[0].startswith("deactivated+")
    assert row[1] == "Cuenta desactivada"
    assert row[2] is False
    assert row[3] == "!"
    assert db.execute("select 1 from readings where id = %s", (reading_id,)).fetchone() is not None
    assert db.execute("select count(*) from refresh_tokens where user_id = %s and revoked_at is null", (user_id,)).fetchone()[0] == 0

def test_admin_cannot_deactivate_self(client, admin_headers, admin_id):
    response = client.post(f"/api/accounts/{admin_id}/deactivate", headers=admin_headers)
    assert response.status_code == 409

def test_valid_access_token_of_deactivated_account_is_rejected_immediately(
    client, admin_headers, patient_login, patient_id
):
    before = client.get("/api/accounts", headers=patient_login)
    assert before.status_code == 403
    client.post(f"/api/accounts/{patient_id}/deactivate", headers=admin_headers)
    after = client.get("/api/accounts", headers=patient_login)
    assert after.status_code == 401
```

- [ ] **Step 7: Implementar desactivación, ejecutar y confirmar**

`deactivate` rechaza la auto-desactivación con 409, escribe `email = 'deactivated+' || id`, `full_name = 'Cuenta desactivada'`, `password_hash = '!'`, `active = false`, revoca los refrescos vigentes y registra `accounts.deactivated` sin guardar la identidad anterior en el detalle. `deps.current_user` consulta `active` en cada petición, de modo que un token todavía vigente deja de servir en el instante en que la cuenta se desactiva.

Run: `cd backend && python3 -m pytest tests/integration/accounts -v`
Expected: PASS, nueve pruebas.

```bash
git add backend/src/hta/accounts backend/src/hta/auth/deps.py backend/tests
git commit -m "feat(accounts): public patient registration, role management and deactivation"
```

---

### Task 10: Consentimiento informado con versionado y bloqueo del monitoreo

**Files:**

- Create: `backend/src/hta/consent/__init__.py`, `backend/src/hta/consent/service.py`, `backend/src/hta/consent/router.py`
- Modify: `backend/src/hta/app.py`
- Test: `backend/tests/integration/consent/test_consent.py`

**Interfaces:**

- Consumes: `deps.current_user`, `audit.record`.
- Produces: `consent.service.accept(conn, patient_id: UUID, version: int, content_ref: str) -> UUID`; `consent.service.revoke(conn, patient_id: UUID) -> None`; `consent.service.is_active(conn, patient_id: UUID) -> bool`; endpoints `GET /api/consent`, `POST /api/consent`, `POST /api/consent/revoke`.

- [ ] **Step 1: Escribir los tests que fallan**

```python
def test_patient_accepts_consent(client, patient_headers, db):
    response = client.post("/api/consent", json={"version": 1, "content_ref": "consent-v1.md"},
                           headers=patient_headers)
    assert response.status_code == 201
    assert client.get("/api/consent", headers=patient_headers).json()["active"] is True

def test_revocation_blocks_new_consent_but_keeps_history(client, patient_headers, db):
    client.post("/api/consent", json={"version": 1, "content_ref": "v1"}, headers=patient_headers)
    client.post("/api/consent/revoke", headers=patient_headers)
    assert client.get("/api/consent", headers=patient_headers).json()["active"] is False
    rows = db.execute("select version, accepted_at, revoked_at from consents").fetchall()
    assert len(rows) == 1
    assert rows[0][2] is not None

def test_new_version_requires_new_acceptance(client, patient_headers):
    client.post("/api/consent", json={"version": 1, "content_ref": "v1"}, headers=patient_headers)
    response = client.get("/api/consent", headers=patient_headers,
                          params={"required_version": 2})
    assert response.json()["active"] is False
    assert response.json()["requires_acceptance_of_version"] == 2
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && python3 -m pytest tests/integration/consent -v`
Expected: FAIL, 404.

- [ ] **Step 3: Implementar el servicio y los endpoints**

`accept` inserta una fila nueva en `consents`, nunca actualiza una existente. `revoke` marca `revoked_at` en la aceptación vigente. `is_active` devuelve verdadero solo si existe una aceptación con `revoked_at IS NULL` para la versión requerida. Cada operación registra `consent.accepted` o `consent.revoked` en auditoría.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && python3 -m pytest tests/integration/consent -v`
Expected: PASS, tres pruebas.

- [ ] **Step 5: Confirmar**

```bash
git add backend/src/hta/consent backend/tests/integration/consent
git commit -m "feat(consent): versioned informed consent with revocation and monitoring gate"
```

---

### Task 11: Datos de demostración y recorrido de las cuatro cuentas

**Files:**

- Create: `backend/src/hta/db/seed.py`, `docs/manual/cuentas-demo.md`
- Modify: `Makefile` (objetivo `seed`)
- Test: `backend/tests/integration/test_seed.py`

**Interfaces:**

- Consumes: `register_patient`, `set_role`, `accept`, `hash_password`.
- Produces: `hta.db.seed.seed(conn) -> dict[str, UUID]` idempotente, que devuelve los identificadores de las cuentas creadas.

- [ ] **Step 1: Escribir el test que falla**

```python
def test_seed_creates_four_scenarios(db):
    ids = seed(db)
    assert set(ids) == {"admin", "physician", "patient_out_of_range", "patient_alert",
                        "patient_revoked", "patient_caregiver"}
    assert db.execute("select count(*) from users").fetchone()[0] == 6

def test_seed_is_idempotent(db):
    seed(db)
    first = db.execute("select count(*) from readings").fetchone()[0]
    seed(db)
    assert db.execute("select count(*) from readings").fetchone()[0] == first
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && python3 -m pytest tests/integration/test_seed.py -v`
Expected: FAIL, `ImportError`.

- [ ] **Step 3: Implementar la siembra**

Seis cuentas con contraseña `Demo2026!`: una administradora, un médico, y cuatro pacientes en los escenarios acordados —lecturas fuera de rango, alerta abierta, consentimiento revocado y cuidador autorizado—. Cada paciente con perfil clínico, consentimiento en el estado que corresponda, entre ocho y veinte lecturas repartidas en los últimos treinta días con fechas deterministas, y el vínculo con el médico. Los valores de las lecturas se eligen para producir los escenarios descritos, no al azar. Idempotente por correo: si la cuenta existe, no se recrea.

- [ ] **Step 4: Escribir `docs/manual/cuentas-demo.md`**

Tabla con correo, rol, contraseña y qué debe verse al entrar con cada una. Este documento se entrega al Word para la Fase 04.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `make down && make up && sleep 20 && make seed && cd backend && python3 -m pytest tests/integration/test_seed.py -v`
Expected: PASS, dos pruebas.

- [ ] **Step 6: Confirmar**

```bash
git add backend/src/hta/db/seed.py backend/tests/integration/test_seed.py docs/manual/cuentas-demo.md Makefile
git commit -m "feat(seed): deterministic demo data for the four review scenarios"
```

---

### Task 12: Trazabilidad generada y matriz de estado

**Files:**

- Create: `scripts/build_map.py`, `scripts/build_status.py`, `docs/manual/requerimientos.md`
- Modify: `Makefile` (objetivo `docs`), `.agents/MAP.md` (generado, no escrito a mano)
- Test: `scripts/tests/test_build_map.py`

**Interfaces:**

- Consumes: las anotaciones `@requirement RF-xx` en módulos y pruebas.
- Produces: `scripts/build_map.py --root . --out .agents/MAP.md` y `--status-out docs/estado-requerimientos.md`; ambos fallan con código 1 si una anotación referencia un identificador que no existe en `docs/manual/requerimientos.md`.

- [ ] **Step 1: Crear `docs/manual/requerimientos.md`**

Catálogo de RF-01 a RF-27 y RNF-01 a RNF-20 con su texto tomado del manual, más el estado vigente de cada uno. Este es el catálogo canónico contra el que valida el generador y la fuente de la matriz que se entrega al Word.

- [ ] **Step 2: Escribir el test que falla**

```python
def test_map_lists_requirement_with_files(tmp_path):
    (tmp_path / "backend" / "src").mkdir(parents=True)
    module = tmp_path / "backend" / "src" / "alerts.py"
    module.write_text("# @requirement RF-14\n", encoding="utf-8")
    build_map(tmp_path)
    text = (tmp_path / ".agents" / "MAP.md").read_text(encoding="utf-8")
    assert "RF-14" in text
    assert "backend/src/alerts.py" in text

def test_unknown_requirement_fails(tmp_path):
    (tmp_path / "backend" / "src").mkdir(parents=True)
    (tmp_path / "backend" / "src" / "x.py").write_text("# @requirement RF-99\n", encoding="utf-8")
    assert build_map(tmp_path) == 1
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `python3 -m pytest scripts/tests/test_build_map.py -v`
Expected: FAIL, módulo inexistente.

- [ ] **Step 4: Implementar los generadores**

Recorren `.py`, `.ts`, `.tsx` y `.sql` excluyendo `.legacy-project`, `.recon`, `node_modules` y `.venv`. Extraen las anotaciones con una expresión regular, agrupan por requerimiento y escriben el mapa ordenado. `build_status.py` cruza el mapa con el catálogo y produce la tabla de estado. Ambos archivos generados llevan una línea de cabecera que dice que no se editan a mano.

- [ ] **Step 5: Ejecutar, verificar y confirmar**

Run: `python3 -m pytest scripts/tests -v && make docs && head -20 .agents/MAP.md`
Expected: PASS y el mapa contiene los requisitos ya anotados en las tareas 7 a 11.

```bash
git add scripts docs/manual/requerimientos.md docs/estado-requerimientos.md Makefile
git commit -m "feat(scripts): generate traceability map and requirement status matrix"
```

---

### Task 13: Cierre del incremento

**Files:**

- Modify: `.agents/STATE.md`, `.agents/BACKLOG.md`, `README.md`
- Create: `docs/manual/entrega-01.md`

**Interfaces:**

- Consumes: todo lo anterior.
- Produces: el paquete de demostración para la revisión del 2 de noviembre.

- [ ] **Step 1: Verificar desde un clon limpio**

Run: `git clone . /tmp/verificacion && cd /tmp/verificacion && cp .env.example .env && make up && sleep 25 && make seed && curl -s localhost:8000/api/health`
Expected: salud en `ok` y las seis cuentas creadas. Si falla en el clon, el incremento no está cerrado.

- [ ] **Step 2: Verificar el esquema desde fuera**

Run: `psql "$HTA_DATABASE_URL" -c '\dt' && psql "$HTA_DATABASE_URL" -c '\d alert_config'`
Expected: las dieciséis tablas y `critical_low` y `critical_high` visibles.

- [ ] **Step 3: Correr la verificación completa**

Run: `make check`
Expected: autoría, estilo y pruebas en verde.

- [ ] **Step 4: Escribir `docs/manual/entrega-01.md`**

Qué se cerró desde la revisión anterior, qué se puede demostrar y con qué cuenta, qué quedó declarado como pendiente y con qué requerimiento se corresponde. En Markdown, listo para pegar al Word como insumo de Fase 04.

- [ ] **Step 5: Actualizar estado y confirmar**

`STATE.md` con lo terminado, el siguiente paso del incremento 2 y los bloqueos vigentes —la firma clínica y el banco de datos—. `BACKLOG.md` con lo que queda fuera de este incremento.

```bash
git add .agents README.md docs/manual/entrega-01.md
git commit -m "docs: close increment one with review package and updated state"
```

---

## Fuera de este incremento

No se planifica en detalle aquí, y cada uno tendrá su propio plan cuando se aborde:

- **Incremento 2:** lecturas, síntomas, ingesta desde el simulador y dashboards de paciente y médico.
- **Incremento 3:** modelo de IA, estimación de severidad, alertas y validación clínica.
- **Incremento 4:** reportes, adherencia, recordatorios y auditoría consultable en la interfaz.
- **Incremento 5:** cierre documental, diagramas UML, Fase 04 y ensayo general de la entrega.

Las decisiones pendientes que bloquean el incremento 3 y no el actual: la firma clínica de los umbrales y la elección del banco de datos, ambas con fecha de corte del 30 de noviembre.
