# Plataforma de telemonitoreo de hipertensión arterial

Prototipo de grado de Ingeniería de Software (Universidad Manuela Beltrán) para el
seguimiento domiciliario de pacientes con hipertensión arterial. El alcance previsto incluye
el registro de lecturas y síntomas, el consentimiento informado, las alertas con validación
médica y un modelo de IA de apoyo a la decisión; no diagnostica ni trata.

**Estado del incremento 1.** Hoy existen la pila de contenedores, el esquema clínico
completo, la sesión, las cuentas y roles, el consentimiento, los datos de demostración y la
matriz de requerimientos. La interfaz web es una página en construcción; las lecturas, las
alertas y el modelo llegan en los incrementos siguientes. El paquete de la revisión está en
[`docs/manual/entrega-01.md`](docs/manual/entrega-01.md).

## Cómo se organiza el repositorio

| Ruta       | Contenido                                                                  |
| ---------- | -------------------------------------------------------------------------- |
| `backend/` | API y lógica: salud, sesión, cuentas, roles y consentimiento               |
| `web/`     | Esqueleto de la interfaz; las primeras pantallas llegan en el incremento 2 |
| `db/`      | Migraciones del registro clínico y colecciones del flujo crudo             |
| `scripts/` | Generadores de la trazabilidad y verificadores de autoría y estilo         |
| `docs/`    | Manual, ADRs, estado de los requerimientos e investigaciones               |

Las carpetas `ml/` e `iot/` aparecen con los incrementos que las construyen.

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

## Cuentas de demostración

La tabla autoritativa de las siete cuentas, su contraseña común y lo que se puede comprobar
hoy con cada una está en [`docs/manual/cuentas-demo.md`](docs/manual/cuentas-demo.md);
`make seed` las crea.

## Dónde seguir leyendo

- [`docs/manual/entrega-01.md`](docs/manual/entrega-01.md): qué entregó el incremento 1 y
  qué se puede demostrar hoy.
- [`docs/estado-requerimientos.md`](docs/estado-requerimientos.md): estado de los 47
  requerimientos y la evidencia anotada.
- [`docs/adr/`](docs/adr/): decisiones de arquitectura.
