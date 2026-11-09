# Plataforma de telemonitoreo de hipertensión arterial

Prototipo de grado de Ingeniería de Software de la Universidad Manuela Beltrán para el seguimiento domiciliario de pacientes con hipertensión arterial. Registra lecturas y síntomas, el consentimiento informado, las alertas con validación médica y la consulta al médico. No diagnostica ni trata: ninguna alerta se cierra sola.

La interfaz se abre en `http://localhost:3000` cuando la pila está levantada. La API responde en `http://localhost:8000/api/health` y se explora en `http://localhost:8000/docs`.

## Cómo se organiza el repositorio

| Ruta | Contenido |
| --- | --- |
| `backend/` | API y lógica: sesión, cuentas, consentimiento, datos clínicos, alertas, consultas e ingesta |
| `web/` | Interfaz de paciente, médico, cuidador y administrador. Cómo trabajarla está en [`web/README.md`](web/README.md) |
| `db/` | Migraciones del registro clínico y colecciones del flujo crudo |
| `iot/` | Contrato de ingesta y simulador de dispositivo |
| `scripts/` | Generadores de la trazabilidad y verificadores de autoría y estilo |
| `docs/` | Manual, ADRs, contrato de la API, estado de los requerimientos e investigaciones |

La carpeta `ml/` aparece con el incremento que construye el modelo de apoyo a la decisión.

## Requisitos previos

- `git` y `make`.
- `podman-compose` o `docker compose`, con el motor de contenedores en marcha.
- Puertos libres: 8000 para la API, 3000 para la interfaz, 5432 para PostgreSQL y 27017 para MongoDB. Se cambian con `BACKEND_PORT`, `WEB_PORT`, `POSTGRES_PORT` y `MONGO_PORT`.

## Cómo levantarlo

```bash
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
# pega el resultado en HTA_JWT_SECRET dentro de .env
make up
make seed
```

El backend no arranca si `HTA_JWT_SECRET` conserva el valor de ejemplo o mide menos de 32 bytes.

`make up` usa `podman-compose` si está instalado y, si no, `docker compose`. `make seed` crea las siete cuentas y los datos de demostración, y se puede repetir sin duplicarlos. Para detener la pila: `make down`.

Si otra pila ya usa esos puertos, define `BACKEND_PORT`, `POSTGRES_PORT`, `MONGO_PORT` y `WEB_PORT` en `.env` y vuelve a ejecutar `make up`.

## Cuentas de demostración

Las siete cuentas, la contraseña común y lo que se puede recorrer con cada una están en [`docs/manual/cuentas-demo.md`](docs/manual/cuentas-demo.md). Los datos son sintéticos.

Las credenciales de PostgreSQL en `.env.example` y la contraseña de las cuentas son públicas a propósito: sirven en una máquina local. Antes de un host compartido hay que cambiarlas, y no dejar el puerto de MongoDB abierto.

Para abrir PostgreSQL desde DBeaver o pgAdmin: host `localhost`, puerto `POSTGRES_PORT` (5432 por omisión), base `POSTGRES_DB`, usuario `POSTGRES_USER` y contraseña `POSTGRES_PASSWORD`.

## Cómo correr las pruebas

Antes de la primera corrida: `python3 -m pip install -e './backend[dev]'`.

```bash
make test
```

Las unitarias no tocan base de datos. Las de integración usan el PostgreSQL y el MongoDB de la pila, así que piden `make up` antes. Autoría, estilo y pruebas juntos:

```bash
make check
```

El contrato HTTP vive en `docs/api/openapi.json` y se regenera con `make contract`. Las pruebas de la interfaz se corren desde `web/`, como dice su README.

## Dónde seguir leyendo

- [`web/README.md`](web/README.md): interfaz, desarrollo con Vite y pruebas del navegador.
- [`docs/api/api-para-el-frontend.md`](docs/api/api-para-el-frontend.md): contrato de la API.
- [`docs/api/ingesta.md`](docs/api/ingesta.md): ingesta desde dispositivos.
- [`docs/manual/entrega-01.md`](docs/manual/entrega-01.md): entrega del incremento 1.
- [`docs/estado-requerimientos.md`](docs/estado-requerimientos.md): estado de los requerimientos.
- [`docs/adr/`](docs/adr/): decisiones de arquitectura.
