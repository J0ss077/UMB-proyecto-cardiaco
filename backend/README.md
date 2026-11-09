# Backend

API de la plataforma de telemonitoreo de hipertensión arterial. Resuelve la sesión y las cuentas, el consentimiento informado, el registro de lecturas y síntomas, las alertas con validación médica, la consulta al médico y la ingesta desde dispositivos. No diagnostica ni trata: una alerta solo la cierra una persona.

Es una aplicación FastAPI en Python 3.12 que guarda el registro clínico en PostgreSQL y el flujo crudo de los dispositivos en MongoDB. La decisión de la pila está en [`docs/adr/0001-python-fastapi-stack.md`](../docs/adr/0001-python-fastapi-stack.md).

## Cómo verla con la pila

Desde la raíz del repositorio, con `.env` creado (ver el [`README.md`](../README.md) de la raíz):

```bash
make up
make seed
```

La API responde en `http://localhost:8000/api/health` y se explora en `http://localhost:8000/docs`. El puerto se cambia con `BACKEND_PORT`.

Al arrancar, el contenedor espera a PostgreSQL, aplica las migraciones del registro clínico y levanta la API. Si la migración falla, el contenedor no arranca. El detalle de esa secuencia está en `entrypoint.sh`.

## Cómo desarrollarlo

Hace falta Python 3.12, el mismo de la imagen.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
```

Los comandos llaman al entorno por su ruta (`.venv/bin/...`), de modo que funcionan igual en bash, zsh y fish sin activarlo. Quien prefiera activarlo usa `source .venv/bin/activate` en bash o zsh, y `source .venv/bin/activate.fish` en fish; el `activate` genérico falla en fish.

Para correr la API fuera del contenedor, con la pila de bases de datos arriba, define las variables de la tabla siguiente y ejecuta:

```bash
.venv/bin/uvicorn hta.app:create_app --factory --reload --port 8000
```

## Configuración

Se lee de variables de entorno con prefijo `HTA_`. La definición y los valores por omisión están en `src/hta/config.py`.

| Variable | Obligatoria | Para qué sirve |
| --- | --- | --- |
| `HTA_DATABASE_URL` | Sí | Conexión a PostgreSQL |
| `HTA_MONGO_URL` | Sí | Conexión a MongoDB |
| `HTA_JWT_SECRET` | Sí | Clave que firma los tokens. El servicio no arranca si conserva el valor de ejemplo o mide menos de 32 bytes |
| `HTA_DEVICE_KEY` | No | Clave que presentan los dispositivos en `X-Device-Key`. Vacía deja la ingesta cerrada |
| `HTA_ALLOWED_ORIGINS` | No | Orígenes que el navegador puede llamar, separados por comas |

Los tiempos de vida de los tokens y el entorno también se configuran; sus nombres y valores por omisión están en `src/hta/config.py`.

## Estructura

El código vive en `src/hta/`, un paquete por área funcional:

| Paquete | Responsabilidad |
| --- | --- |
| `auth` | Inicio de sesión, tokens de acceso y de refresco, contraseñas |
| `accounts` | Alta, desactivación y vínculos entre cuentas |
| `consent` | Consentimiento informado |
| `clinical` | Pacientes, lecturas, síntomas, validación y alertas |
| `consultations` | Consulta al médico, enlace de Meet y formato de chequeo |
| `profile` y `staffprofile` | Perfil del paciente y del personal |
| `passwordchange` | Cambio de contraseña del personal con aprobación del administrador |
| `adminconsole` | Cuentas, umbrales y consola del administrador |
| `audit` | Registro de auditoría |
| `ingest` | Ingesta de lecturas desde dispositivos |
| `db` | Pool de PostgreSQL, cliente de MongoDB, migraciones y siembra |
| `api` | Salud y CORS |

Cada paquete de negocio separa el `router.py` (HTTP) del `service.py` (lógica).

## Comandos

Desde la raíz del repositorio:

| Comando | Qué hace |
| --- | --- |
| `make test` | Unitarias e integración |
| `make migrate` | Aplica las migraciones en la pila en marcha |
| `make seed` | Crea las cuentas y los datos de demostración, sin duplicarlos |
| `make contract` | Regenera `docs/api/openapi.json` |

## Pruebas

Las unitarias están en `tests/unit` y no tocan base de datos. Las de integración están en `tests/integration` y usan el PostgreSQL y el MongoDB de la pila, así que piden `make up` antes.

```bash
cd backend
.venv/bin/python -m pytest tests/unit -v
.venv/bin/python -m pytest tests/integration -v
```

## Dónde está lo demás

- Contrato de la API para la interfaz: [`docs/api/api-para-el-frontend.md`](../docs/api/api-para-el-frontend.md), con el archivo generado en `docs/api/openapi.json`.
- Contrato de ingesta de dispositivos: [`docs/api/ingesta.md`](../docs/api/ingesta.md).
- Decisiones de diseño: [`docs/adr/`](../docs/adr/).
- Estado de los requerimientos: [`docs/estado-requerimientos.md`](../docs/estado-requerimientos.md).
