# Incremento 2 del backend: contrato congelado y núcleo clínico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el backend para que el desarrollo del frontend, de la base y de la ingesta pueda avanzar sin depender de cambios posteriores en la API.

**Architecture:** Se congela primero el contrato HTTP que el frontend va a consumir, se publica como archivo versionado y se habilita CORS para su origen de desarrollo. Después se añade el núcleo clínico que las pantallas necesitan: pacientes visibles, lecturas con su validación fisiológica y su ventana domiciliaria, síntomas y alertas con validación humana. La ingesta del simulador entra por separado, con su propio contrato. No hay migraciones: las dieciséis tablas y los siete enumerados ya existen y este incremento no los toca.

**Tech Stack:** Python 3.12 en el contenedor, FastAPI, psycopg 3 con grupo de conexiones asíncrono, PyMongo, PostgreSQL 16, MongoDB 7, pytest contra la pila.

**Spec:** `docs/superpowers/specs/2026-10-18-reconstruccion-plataforma-hta-design.md`

## Global Constraints

- El registro relacional tiene dieciséis tablas con los nombres del manual y siete tipos enumerados. **Ninguna tarea de este plan crea, altera ni migra el esquema.** Si una necesidad nueva aparece, se resuelve dentro de las dieciséis.
- Ningún dato clínico se procesa sin consentimiento vigente. La compuerta se consulta en la escritura de lecturas y síntomas y en el cálculo de la ventana domiciliaria.
- La IA no diagnostica ni trata y ninguna alerta se cierra de forma autónoma. Toda transición de una alerta la ejecuta una persona y queda en la auditoría.
- Los valores fuera de rango se conservan con `validation_status = 'out_of_range'`. La validación fisiológica vive en la aplicación: rangos plausibles sistólica 80 a 200 mmHg y diastólica 40 a 130 mmHg, del manual.
- Los umbrales clínicos viven en `alert_config` y no cuentan como evidencia hasta que un clínico los firme. Este plan los lee, no los escribe.
- El administrador no ve datos clínicos. Su alcance es cuentas, roles, umbrales y auditoría.
- Identificadores UUID, marcas de tiempo `TIMESTAMPTZ`, snake_case, tablas en plural, llave foránea con sufijo `_id`.
- La documentación va en español; los identificadores de código, los nombres de tablas y los asuntos de confirmación van en inglés.
- Sin emojis en archivos, confirmaciones ni mensajes de interfaz. Ningún artefacto de la capa humana menciona autoría asistida por IA.
- Las pruebas de integración corren contra el PostgreSQL y el MongoDB de la pila; las unitarias no tocan base de datos.
- La imagen del backend fija Python 3.12.

## Review Focus

Estas son las entradas que más probablemente rompan algo y que ninguna prueba existente cubre. Cada una lleva su prueba en la tarea que la posee.

1. Un paciente que envía una lectura con el `patient_id` de otra persona. Debe recibir 403 y no debe crearse ninguna fila.
2. Un médico que consulta a un paciente que no está vinculado a él en `patient_physician`. Debe recibir 403, no una lista vacía ni un 500.
3. Un cuidador con alcance `minimal` que intenta leer datos clínicos. Debe recibir 403; solo el alcance `readings` abre la lectura.
4. Una lectura fisiológicamente imposible, por ejemplo 300 sobre 200 o sistólica menor que diastólica. Debe guardarse con `out_of_range`, responderse 201 y nunca 500.
5. Un paciente con el consentimiento revocado que intenta registrar una lectura. Debe recibir 403 y no debe crearse ninguna fila.
6. Una ingesta repetida del mismo dispositivo con la misma marca de tiempo. No debe duplicar la lectura ni el documento crudo.
7. Una lectura con zona horaria explícita y el borde exacto de la ventana de siete días. La ventana debe incluir el instante del borde y descartar el primer día completo.

---

## Estructura de archivos

**Se crean:**

- `backend/src/hta/clinical/__init__.py`, con la anotación del módulo.
- `backend/src/hta/clinical/access.py` (RNF-09): quién puede ver a qué paciente. Una sola función de resolución, usada por todas las rutas clínicas.
- `backend/src/hta/clinical/validation.py` (RF-08): plausibilidad fisiológica y resumen de la ventana domiciliaria.
- `backend/src/hta/clinical/patients.py` (RF-19): directorio de pacientes visibles para la cuenta que pregunta.
- `backend/src/hta/clinical/readings.py` (RF-05, RF-19): alta manual, consulta paginada y resumen.
- `backend/src/hta/clinical/symptoms.py` (RF-21): alta y consulta de síntomas.
- `backend/src/hta/clinical/alerts.py` (RF-16): consulta y transiciones humanas.
- `backend/src/hta/clinical/router.py`: los endpoints clínicos, todos en un archivo, para que la superficie que consume el frontend se lea de una vez.
- `backend/src/hta/ingest/__init__.py`, `service.py`, `router.py` (RF-04): contrato de ingesta y escritura en los dos almacenes.
- `backend/src/hta/api/cors.py`: configuración de orígenes permitidos, aparte de `app.py` para poder probarla.
- `scripts/export_openapi.py`: escribe `docs/api/openapi.json` desde la aplicación.
- `docs/api/api-para-el-frontend.md`: el documento que lee el integrante de frontend. Flujo de sesión, envoltura de las listas, códigos de error, paginación y ejemplos de cada ruta.
- `docs/api/openapi.json`: el contrato versionado, generado, nunca escrito a mano.
- `iot/simulator.py`: simulador del tensiómetro que publica contra el contrato de ingesta.
- `backend/tests/integration/clinical/test_patients.py`, `test_readings.py`, `test_symptoms.py`, `test_alerts.py`.
- `backend/tests/integration/ingest/test_ingest.py`.
- `backend/tests/unit/test_cors.py`, `backend/tests/unit/test_validation.py`.

**Se modifican:**

- `backend/src/hta/config.py`: campo `allowed_origins`.
- `backend/src/hta/app.py`: middleware de CORS y registro de los dos enrutadores nuevos.
- `backend/src/hta/accounts/router.py`: la lista de cuentas pasa a la envoltura paginada.
- `backend/tests/integration/conftest.py`: fixtures de lectura, de alerta y de paciente vinculado.
- `Makefile`: objetivo `contract`.
- `README.md`, `.agents/STATE.md`, `.agents/BACKLOG.md`: lo que se cierra y lo que queda.
- `docs/manual/requerimientos.md`: los estados que cambian; la matriz se regenera con `make docs`.

**Decisiones que el contrato fija y que no se vuelven a discutir**

- Las listas viajan en `{"items": [...], "total": N}`. `GET /api/accounts` se adapta a esa envoltura: hoy no hay ningún consumidor y es el momento de fijarla.
- Las fechas salen en ISO 8601 con desplazamiento, en UTC.
- Los errores son `{"detail": "<mensaje en español>"}`.
- La sesión es un token de portador de quince minutos y un refresco de siete días que rota en cada uso; el cliente reemplaza los dos en cada refresco.
- Los identificadores son cadenas UUID; los campos JSON van en snake_case.
- CORS se habilita para `HTA_ALLOWED_ORIGINS`, por omisión `http://localhost:5173,http://localhost:3000`, con el encabezado `Authorization` permitido.

---

### Task 1: Contrato publicado y CORS

**Files:**

- Create: `backend/src/hta/api/cors.py`, `scripts/export_openapi.py`, `docs/api/api-para-el-frontend.md`, `docs/api/openapi.json`, `backend/tests/unit/test_cors.py`
- Modify: `backend/src/hta/config.py`, `backend/src/hta/app.py`, `backend/src/hta/accounts/router.py`, `Makefile`
- Test: `backend/tests/unit/test_cors.py`, `backend/tests/integration/test_contract.py`

**Interfaces:**

- Consumes: `Settings` y `create_app()` existentes.
- Produces: `hta.api.cors.allowed_origins(settings: Settings) -> list[str]`; `Settings.allowed_origins: str` con el valor por omisión; `scripts/export_openapi.py` con `generate_contract() -> dict` y `main(argv: list[str] | None = None) -> int`; la envoltura `PaginatedAccounts(items: list[AccountSummary], total: int)` en `accounts/router.py`.

- [ ] **Step 1: Escribir la prueba de CORS que falla**

```python
def test_allowed_origins_parses_the_list():
    settings = SimpleNamespace(allowed_origins="http://localhost:5173, http://localhost:3000")
    assert allowed_origins(settings) == ["http://localhost:5173", "http://localhost:3000"]

def test_allowed_origins_defaults_when_empty():
    settings = SimpleNamespace(allowed_origins="")
    assert allowed_origins(settings) == ["http://localhost:5173", "http://localhost:3000"]
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && .venv/bin/python -m pytest tests/unit/test_cors.py -v`
Expected: FAIL, `ModuleNotFoundError: hta.api.cors`.

- [ ] **Step 3: Implementar `allowed_origins`, el campo de configuración y el middleware**

En `config.py`, `allowed_origins: str = ""`. En `cors.py`, `allowed_origins(settings) -> list[str]`: parte por coma, recorta espacios, descarta vacíos y devuelve la lista por omisión si no queda ninguno. En `app.py`, `app.add_middleware(CORSMiddleware, allow_origins=allowed_origins(settings), allow_methods=["*"], allow_headers=["Authorization", "Content-Type"])`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && .venv/bin/python -m pytest tests/unit/test_cors.py -v`
Expected: PASS, dos pruebas.

- [ ] **Step 5: Escribir la prueba de contrato que falla**

```python
def test_cors_allows_the_react_dev_origin(client):
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

def test_cors_rejects_an_unknown_origin(client):
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in response.headers

def test_accounts_list_uses_the_paginated_envelope(client, admin_headers, db):
    body = client.get("/api/accounts", headers=admin_headers).json()
    assert set(body) == {"items", "total"}
    assert isinstance(body["items"], list)

def test_openapi_contract_is_committed_and_current():
    generated = generate_contract()
    committed = json.loads(Path("docs/api/openapi.json").read_text(encoding="utf-8"))
    assert generated == committed
```

- [ ] **Step 6: Ejecutar y ver que falla**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/test_contract.py -v`
Expected: FAIL en los cuatro casos; el de CORS porque aún no hay middleware, el de la envoltura porque hoy devuelve una lista y el del contrato porque el archivo no existe.

- [ ] **Step 7: Adaptar la lista de cuentas, escribir el contrato y documentarlo**

`list_accounts` devuelve `PaginatedAccounts(items=..., total=len(items))`; el modelo `AccountSummary` no cambia. `scripts/export_openapi.py` construye la aplicación con variables de entorno mínimas y escribe `docs/api/openapi.json` con `json.dumps(..., indent=2, sort_keys=True, ensure_ascii=False)` y un salto de línea final, para que dos ejecuciones den el mismo archivo. `make contract` ejecuta el script. `docs/api/api-para-el-frontend.md` documenta las seis decisiones del encabezado de este plan con un ejemplo de cada una.

- [ ] **Step 8: Ejecutar y ver que pasa**

Run: `make contract && cd backend && .venv/bin/python -m pytest tests/integration/test_contract.py tests/unit/test_cors.py -v`
Expected: PASS, seis pruebas, y `git status` con `docs/api/openapi.json` versionado.

- [ ] **Step 9: Confirmar**

```bash
git add backend/src/hta/api/cors.py backend/src/hta/config.py backend/src/hta/app.py scripts/export_openapi.py docs/api Makefile backend/tests Makefile
git commit -m "feat(api): freeze the http contract and allow the frontend origin"
```

---

### Task 2: Alta de lectura con síntomas, compuerta y validación

**Files:**

- Create: `backend/src/hta/clinical/__init__.py`, `access.py`, `validation.py`, `readings.py`, `symptoms.py`, `router.py`
- Modify: `backend/src/hta/app.py`
- Test: `backend/tests/integration/clinical/test_readings.py`

**Interfaces:**

- Consumes: `get_conn`, `current_user`, `require_role`, `audit.record`, `consent.is_active`.
- Produces: `validation.plausibility(systolic: int, diastolic: int) -> str` devolviendo `valid` o `out_of_range`; `access.patient_profile_id(conn, user, patient_id: UUID | None) -> UUID` que resuelve el perfil visible o lanza 403; `readings.create(conn, profile_id, actor_id, systolic, diastolic, heart_rate, measured_at, symptom) -> UUID`; endpoints `POST /api/readings` y `POST /api/symptoms`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```python
def test_patient_registers_a_reading(client, db, patient_headers, patient_id):
    response = client.post("/api/readings", json={"systolic": 138, "diastolic": 88}, headers=patient_headers)
    assert response.status_code == 201
    body = response.json()
    assert body["systolic"] == 138
    assert body["validation_status"] == "valid"
    row = db.execute("select count(*) from readings where id = %s", (body["id"],)).fetchone()
    assert row[0] == 1

def test_impossible_reading_is_preserved_as_out_of_range(client, patient_headers):
    response = client.post("/api/readings", json={"systolic": 300, "diastolic": 200}, headers=patient_headers)
    assert response.status_code == 201
    assert response.json()["validation_status"] == "out_of_range"

def test_systolic_below_diastolic_is_out_of_range(client, patient_headers):
    response = client.post("/api/readings", json={"systolic": 80, "diastolic": 120}, headers=patient_headers)
    assert response.json()["validation_status"] == "out_of_range"

def test_revoked_consent_blocks_the_reading(client, db, patient_headers, patient_id):
    db.execute("update consents set revoked_at = now() where patient_id = (select id from patient_profiles where user_id = %s)", (patient_id,))
    response = client.post("/api/readings", json={"systolic": 120, "diastolic": 80}, headers=patient_headers)
    assert response.status_code == 403
    assert db.execute("select count(*) from readings").fetchone()[0] == 0

def test_patient_cannot_write_for_another_patient(client, patient_headers, other_patient_id):
    response = client.post("/api/readings", json={"systolic": 120, "diastolic": 80, "patient_id": str(other_patient_id)}, headers=patient_headers)
    assert response.status_code == 403

def test_reading_and_symptoms_are_recorded_together(client, db, patient_headers):
    response = client.post("/api/readings", json={
        "systolic": 142, "diastolic": 92, "symptom": {"free_text": "dolor de cabeza leve", "mood": "ansioso"},
    }, headers=patient_headers)
    assert response.status_code == 201
    assert db.execute("select count(*) from symptoms_mood").fetchone()[0] == 1

def test_future_measured_at_is_rejected(client, patient_headers):
    response = client.post("/api/readings", json={"systolic": 120, "diastolic": 80, "measured_at": "2099-01-01T00:00:00Z"}, headers=patient_headers)
    assert response.status_code == 422
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/clinical/test_readings.py -v`
Expected: FAIL, todas con 404.

- [ ] **Step 3: Implementar la resolución de alcance, la plausibilidad y el alta**

`access.patient_profile_id` devuelve el `patient_profiles.id` del paciente cuando la cuenta es ese paciente, y 403 en cualquier otro caso en esta tarea. `validation.plausibility` compara los dos rangos plausibles y la relación sistólica mayor que diastólica. `readings.create` inserta la lectura con `source='manual'`, el estado que devuelve el validador y `measured_at` en UTC, inserta los síntomas si vienen y registra `reading.created` con el id; la compuerta se consulta antes de insertar y responde 403 si el consentimiento de la versión vigente no está activo.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/clinical/test_readings.py -v`
Expected: PASS, siete pruebas.

- [ ] **Step 5: Confirmar**

```bash
git add backend/src/hta/clinical backend/src/hta/app.py backend/tests
git commit -m "feat(clinical): register readings with consent gate and physiological validation"
```

---

### Task 3: Directorio de pacientes, consulta de lecturas y ventana domiciliaria

**Files:**

- Create: `backend/src/hta/clinical/patients.py`
- Modify: `backend/src/hta/clinical/readings.py`, `router.py`, `backend/tests/integration/conftest.py`
- Test: `backend/tests/integration/clinical/test_patients.py`, `backend/tests/integration/clinical/test_readings.py`

**Interfaces:**

- Consumes: `patient_profile_id` de la tarea 2.
- Produces: `patients.visible(conn, user) -> list[PatientSummary]`; `readings.list_for(conn, profile_id, since, until, limit, offset) -> tuple[list[Reading], int]`; `readings.window_summary(conn, profile_id) -> WindowSummary` con `sufficient: bool`, `valid_count`, `days_with_readings`, `mean_systolic`, `mean_diastolic`; `symptoms.list_for(conn, profile_id, limit, offset) -> tuple[list[Symptom], int]`; endpoints `GET /api/patients`, `GET /api/readings`, `GET /api/readings/summary`, `GET /api/symptoms`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```python
def test_physician_sees_only_linked_patients(client, physician_headers, patient_id, other_patient_id):
    body = client.get("/api/patients", headers=physician_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == str(patient_id)

def test_physician_of_another_patient_gets_403(client, physician_headers, other_patient_id):
    response = client.get(f"/api/readings?patient_id={other_patient_id}", headers=physician_headers)
    assert response.status_code == 403

def test_caregiver_with_readings_scope_sees_the_patient(client, caregiver_headers, patient_id):
    body = client.get(f"/api/readings?patient_id={patient_id}", headers=caregiver_headers).json()
    assert body["total"] >= 8

def test_caregiver_with_minimal_scope_is_rejected(client, caregiver_minimal_headers, patient_id):
    assert client.get(f"/api/readings?patient_id={patient_id}", headers=caregiver_minimal_headers).status_code == 403

def test_admin_cannot_read_clinical_data(client, admin_headers, patient_id):
    assert client.get(f"/api/readings?patient_id={patient_id}", headers=admin_headers).status_code == 403

def test_readings_are_ordered_and_paginated(client, patient_headers, patient_id):
    body = client.get("/api/readings?limit=5&offset=0", headers=patient_headers).json()
    assert len(body["items"]) == 5
    assert body["total"] >= 8
    measured = [item["measured_at"] for item in body["items"]]
    assert measured == sorted(measured, reverse=True)

def test_window_summary_discards_the_first_day_and_needs_eight_valid(client, patient_headers, patient_id, db):
    summary = client.get("/api/readings/summary", headers=patient_headers).json()
    assert summary["sufficient"] is True
    assert summary["valid_count"] >= 8
    assert summary["days_with_readings"] >= 2
    assert summary["mean_systolic"] > 0

def test_window_excludes_the_reading_exactly_at_the_seven_day_edge(client, db, patient_headers, patient_id):
    profile_id = db.execute("select id from patient_profiles where user_id = %s", (patient_id,)).fetchone()[0]
    db.execute("delete from readings where patient_id = %s", (profile_id,))
    db.execute(
        "insert into readings (patient_id, systolic, diastolic, source, measured_at, validation_status) "
        "values (%s, 120, 80, 'manual', now() - interval '7 days 1 second', 'valid')",
        (profile_id,),
    )
    summary = client.get("/api/readings/summary", headers=patient_headers).json()
    assert summary["valid_count"] == 0
    assert summary["sufficient"] is False

def test_symptoms_are_listed_for_the_patient(client, patient_headers, db, patient_id):
    profile_id = db.execute("select id from patient_profiles where user_id = %s", (patient_id,)).fetchone()[0]
    db.execute("insert into symptoms_mood (patient_id, free_text, mood, recorded_at) values (%s, 'mareo', 'bien', now())", (profile_id,))
    body = client.get("/api/symptoms", headers=patient_headers).json()
    assert body["total"] == 1
    assert body["items"][0]["free_text"] == "mareo"
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/clinical -v`
Expected: FAIL, 404 en las rutas nuevas.

- [ ] **Step 3: Añadir las fixtures de médico y cuidador**

En `conftest.py`: `physician_id` y `physician_headers` crean un médico vinculado al paciente de la fixture en `patient_physician`; `caregiver_headers` crea un cuidador con `authorized_scope='readings'` y `caregiver_minimal_headers` con `'minimal'`, ambos con su `caregiver_links` hacia `patient_id`. Todas dependen de `clean_db`.

- [ ] **Step 4: Implementar el directorio, la consulta y la ventana**

`patients.visible` devuelve los pacientes cuyo perfil corresponde a la cuenta, o los vinculados en `patient_physician`, o los autorizados en `caregiver_links` con alcance `readings`; el administrador recibe 403. `access.patient_profile_id` se extiende para resolver esos tres casos y devolver 403 en el resto. La ventana toma las lecturas desde `now() - interval '7 days'` hasta ahora, descarta el primer día completo y cuenta solo `valid`; con menos de ocho lecturas válidas en menos de dos días devuelve `sufficient: false` y las medias en `null`.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/clinical -v`
Expected: PASS, diecisiete pruebas.

- [ ] **Step 6: Confirmar**

```bash
git add backend/src/hta/clinical backend/tests
git commit -m "feat(clinical): patient directory, reading queries and home window summary"
```

---

### Task 4: Alertas con validación humana

**Files:**

- Create: `backend/src/hta/clinical/alerts.py`
- Modify: `backend/src/hta/clinical/router.py`
- Test: `backend/tests/integration/clinical/test_alerts.py`

**Interfaces:**

- Consumes: `patient_profile_id` de las tareas 2 y 3, `audit.record`.
- Produces: `alerts.list_for(conn, user, profile_id | None, status, severity, limit, offset) -> tuple[list[Alert], int]`; `alerts.transition(conn, alert_id, actor, action, note) -> None` con acciones `acknowledge`, `validate` y `dismiss`; endpoints `GET /api/alerts`, `GET /api/alerts/{alert_id}`, `POST /api/alerts/{alert_id}/acknowledge`, `/validate`, `/dismiss`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```python
def test_patient_sees_only_own_alerts(client, patient_headers, other_patient_id):
    body = client.get("/api/alerts", headers=patient_headers).json()
    assert body["total"] == 1
    assert all(item["patient_id"] == body["items"][0]["patient_id"] for item in body["items"])

def test_physician_validates_an_open_alert(client, db, physician_headers, open_alert_id, physician_id):
    response = client.post(f"/api/alerts/{open_alert_id}/validate", json={"note": "confirmada en consulta"}, headers=physician_headers)
    assert response.status_code == 204
    row = db.execute("select status, validated_by, validated_at from alerts where id = %s", (open_alert_id,)).fetchone()
    assert row[0] == "validated"
    assert row[1] == physician_id
    assert row[2] is not None

def test_alert_cannot_be_validated_twice(client, physician_headers, validated_alert_id):
    response = client.post(f"/api/alerts/{validated_alert_id}/validate", json={}, headers=physician_headers)
    assert response.status_code == 409

def test_patient_cannot_validate_an_alert(client, patient_headers, open_alert_id):
    assert client.post(f"/api/alerts/{open_alert_id}/validate", json={}, headers=patient_headers).status_code == 403

def test_dismissal_requires_a_note(client, physician_headers, open_alert_id):
    assert client.post(f"/api/alerts/{open_alert_id}/dismiss", json={}, headers=physician_headers).status_code == 422

def test_every_transition_is_audited(client, db, physician_headers, open_alert_id):
    client.post(f"/api/alerts/{open_alert_id}/acknowledge", json={}, headers=physician_headers)
    row = db.execute("select action from audit_logs where entity_id = %s order by occurred_at desc limit 1", (open_alert_id,)).fetchone()
    assert row[0] == "alert.acknowledged"
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/clinical/test_alerts.py -v`
Expected: FAIL, 404.

- [ ] **Step 3: Añadir las fixtures de alerta**

En `conftest.py`: `open_alert_id` inserta una alerta `critical` en estado `open` para `patient_id` y devuelve su id; `validated_alert_id` inserta una ya `validated`. Ambas dependen de `clean_db` y de `patient_id`.

- [ ] **Step 4: Implementar la consulta y las transiciones**

`transition` lee la alerta con `for update`, comprueba que el actor tenga acceso al paciente, valida la transición permitida (`open` a `acknowledged`, `validated` o `dismissed`; `acknowledged` a `validated` o `dismissed`) y responde 409 en cualquier otra; `validate` escribe `validated_by` y `validated_at`; `dismiss` exige `note` no vacía y la guarda. Cada transición registra su acción en la auditoría con el id de la alerta y confirma antes de responder.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/clinical/test_alerts.py -v`
Expected: PASS, seis pruebas.

- [ ] **Step 6: Confirmar**

```bash
git add backend/src/hta/clinical backend/tests
git commit -m "feat(clinical): alert listing and human validation transitions"
```

---

### Task 5: Contrato de ingesta y simulador

**Files:**

- Create: `backend/src/hta/ingest/__init__.py`, `service.py`, `router.py`, `iot/simulator.py`, `docs/api/ingesta.md`
- Modify: `backend/src/hta/app.py`
- Test: `backend/tests/integration/ingest/test_ingest.py`

**Interfaces:**

- Consumes: `db.mongo.ensure_collections`, `validation.plausibility`, `audit.record`.
- Produces: `ingest.service.ingest(conn, payload: IngestPayload) -> UUID`; endpoint `POST /api/ingest/readings` protegido por el encabezado `X-Device-Key` contra `HTA_DEVICE_KEY`; `iot/simulator.py` con `main(argv) -> int` que publica N lecturas contra una URL base. `Settings.device_key: str = ""`, `HTA_DEVICE_KEY` en `.env.example` y en `compose.yaml`, y la fixture `device_headers` en `conftest.py` que envía la clave configurada.

- [ ] **Step 1: Escribir las pruebas que fallan**

```python
def test_device_key_is_required(client):
    assert client.post("/api/ingest/readings", json={"device_id": "sim-1", "systolic": 130, "diastolic": 85}).status_code == 401

def test_valid_reading_is_stored_in_both_stores(client, db, mongo_db, device_headers, patient_id):
    response = client.post("/api/ingest/readings", json={"device_id": "sim-1", "patient_id": str(patient_id), "systolic": 130, "diastolic": 85, "measured_at": "2026-11-08T10:00:00Z"}, headers=device_headers)
    assert response.status_code == 201
    assert db.execute("select count(*) from readings where source = 'device'").fetchone()[0] == 1
    assert mongo_db["raw_readings"].count_documents({}) == 1

def test_repeated_ingest_does_not_duplicate(client, db, mongo_db, device_headers, patient_id):
    payload = {"device_id": "sim-1", "patient_id": str(patient_id), "systolic": 130, "diastolic": 85, "measured_at": "2026-11-08T10:00:00Z"}
    assert client.post("/api/ingest/readings", json=payload, headers=device_headers).status_code == 201
    assert client.post("/api/ingest/readings", json=payload, headers=device_headers).status_code == 200
    assert db.execute("select count(*) from readings where source = 'device'").fetchone()[0] == 1
    assert mongo_db["raw_readings"].count_documents({}) == 1
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/ingest -v`
Expected: FAIL, 404.

- [ ] **Step 3: Implementar la ingesta y el simulador**

`ingest` guarda primero el documento crudo en `raw_readings` con el cuerpo recibido y la marca de recepción, y después la lectura validada en `readings` con `source='device'`; la deduplicación es por `device_id` y `measured_at`, y responde 200 en vez de 201 cuando ya existía. La clave del dispositivo se compara con `secrets.compare_digest` y se configura en `HTA_DEVICE_KEY`; sin clave configurada responde 503 para no dejar la ruta abierta. `iot/simulator.py` envía una lectura cada segundo durante los minutos que recibe por argumento.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd backend && .venv/bin/python -m pytest tests/integration/ingest -v`
Expected: PASS, tres pruebas.

- [ ] **Step 5: Confirmar**

```bash
git add backend/src/hta/ingest backend/src/hta/app.py iot docs/api/ingesta.md backend/tests
git commit -m "feat(ingest): device ingestion contract, deduplication and simulator"
```

---

### Task 6: Trazabilidad, documentación y estado

**Files:**

- Modify: `docs/manual/requerimientos.md`, `.agents/STATE.md`, `.agents/BACKLOG.md`, `README.md`, `docs/manual/cuentas-demo.md`
- Test: `make docs` sin diferencias y los verificadores limpios

- [ ] **Step 1: Poner los estados que corresponden**

En el catálogo: RF-04 a parcial (hay contrato e ingesta, falta el dispositivo real), RF-05 a implementado, RF-08 a implementado, RF-16 a implementado, RF-19 a parcial (hay resumen y consulta, faltan las gráficas), RF-21 a implementado. Cada parcial con su motivo concreto.

- [ ] **Step 2: Regenerar y verificar**

Run: `make docs && python3 scripts/check_style.py --root . && python3 scripts/check_authorship.py --root . && git diff --stat`
Expected: la matriz cambia en las filas tocadas, los verificadores sin violaciones, y el mapa incluye los módulos nuevos.

- [ ] **Step 3: Actualizar los documentos humanos**

`README.md` con el objetivo `make contract` y la dirección de la documentación de la API; `docs/manual/cuentas-demo.md` con lo que ahora se puede comprobar de cada cuenta; `docs/manual/entrega-01.md` ajustando el ejemplo de `GET /api/accounts` a la envoltura nueva; `.agents/STATE.md` con lo terminado y el siguiente paso; `.agents/BACKLOG.md` cerrando lo que este incremento resuelve.

- [ ] **Step 4: Confirmar**

```bash
git add docs .agents README.md
git commit -m "docs: reflect the clinical endpoints in the catalogue and the state"
```
