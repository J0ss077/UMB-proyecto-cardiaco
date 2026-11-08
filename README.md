# Plataforma de telemonitoreo de hipertensión arterial

Prototipo de grado de Ingeniería de Software (Universidad Manuela Beltrán) para el
seguimiento domiciliario de pacientes con hipertensión arterial. El alcance previsto incluye
el registro de lecturas y síntomas, el consentimiento informado, las alertas con validación
médica y un modelo de IA de apoyo a la decisión; no diagnostica ni trata.

**Estado del incremento 2.** La API cubre la sesión, las cuentas y los roles, el consentimiento,
las lecturas y los síntomas, el resumen de la ventana domiciliaria, las alertas con
validación médica y la ingesta desde dispositivos. La interfaz web sigue siendo una página
en construcción; las pantallas llegan con el incremento que las construya. El paquete del
incremento 1 está en [`docs/manual/entrega-01.md`](docs/manual/entrega-01.md).

## Cómo se organiza el repositorio

| Ruta       | Contenido                                                                        |
| ---------- | -------------------------------------------------------------------------------- |
| `backend/` | API y lógica: sesión, cuentas, consentimiento, datos clínicos, alertas e ingesta |
| `web/`     | Esqueleto de la interfaz; las pantallas llegan con el incremento del frontend    |
| `db/`      | Migraciones del registro clínico y colecciones del flujo crudo                   |
| `iot/`     | Contrato de ingesta y simulador de dispositivo                                   |
| `scripts/` | Generadores de la trazabilidad y verificadores de autoría y estilo               |
| `docs/`    | Manual, ADRs, contrato de la API, estado de los requerimientos e investigaciones |

La carpeta `ml/` aparece con el incremento que la construye.

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

El backend se niega a arrancar si `HTA_JWT_SECRET` conserva el valor de ejemplo o mide menos
de 32 bytes: con una clave conocida, cualquiera puede firmar un token válido.

`make up` usa `podman-compose` si está instalado y, si no, cae a `docker compose`.
`make seed` crea las siete cuentas y los datos de demostración. La salud del sistema se
consulta en `http://localhost:8000/api/health` y la API se explora en
`http://localhost:8000/docs`; si cambiaste `BACKEND_PORT`, usa ese puerto en las dos rutas.
Para detener la pila: `make down`.

Si ya hay otra pila levantada, define los cuatro puertos en `.env` (`BACKEND_PORT`,
`POSTGRES_PORT`, `MONGO_PORT` y `WEB_PORT`) y levanta con `make up`; así `make` usa el mismo
`BACKEND_PORT` en la espera de salud y en las pruebas de integración.

## Credenciales locales y conexión a PostgreSQL

Las credenciales locales son deliberadamente débiles: `POSTGRES_PASSWORD` conserva el valor
de ejemplo, los puertos publicados de PostgreSQL y MongoDB quedan al alcance de la red y
MongoDB no lleva credenciales en esta configuración, mientras las siete cuentas de
demostración comparten una contraseña publicada. Eso solo es aceptable porque los datos son
sintéticos y la pila está pensada para una máquina local. Antes de desplegar en cualquier
host compartido o público hay que cambiar la contraseña de PostgreSQL y la de las cuentas de
demostración, y no dejar el puerto de MongoDB abierto; el repositorio no incorpora todavía
una protección que lo haga por ti.

Para abrir la base desde una herramienta externa como DBeaver o pgAdmin, usa los valores de
`.env`: host `localhost`, puerto `POSTGRES_PORT` (5432 por omisión), base `POSTGRES_DB`,
usuario `POSTGRES_USER` y la contraseña `POSTGRES_PASSWORD`. La contraseña de ejemplo de
`.env.example` es pública y no sirve para un host compartido.

## Cómo correr las pruebas

Antes de la primera corrida, instala las dependencias de desarrollo:
`python3 -m pip install -e './backend[dev]'`.

```bash
make test
```

Las pruebas unitarias no tocan base de datos. Las de integración corren contra el PostgreSQL
y el MongoDB de la pila y requieren `make up` antes. La verificación completa, que suma
autoría y estilo a las pruebas, es:

```bash
make check
```

El contrato HTTP se versiona en `docs/api/openapi.json` y se regenera con `make contract`.

## Cuentas de demostración

La tabla autoritativa de las siete cuentas, su contraseña común y lo que se puede comprobar
hoy con cada una está en [`docs/manual/cuentas-demo.md`](docs/manual/cuentas-demo.md);
`make seed` las crea.

## Dónde seguir leyendo

- [`docs/api/api-para-el-frontend.md`](docs/api/api-para-el-frontend.md): contrato de la API
  para quien construye la interfaz web.
- [`docs/api/ingesta.md`](docs/api/ingesta.md): contrato de la ingesta desde dispositivos.
- [`docs/manual/entrega-01.md`](docs/manual/entrega-01.md): qué entregó el incremento 1 y
  qué se puede demostrar hoy.
- [`docs/estado-requerimientos.md`](docs/estado-requerimientos.md): estado de los 47
  requerimientos y la evidencia anotada.
- [`docs/adr/`](docs/adr/): decisiones de arquitectura.
