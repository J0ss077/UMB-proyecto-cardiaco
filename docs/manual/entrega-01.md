# Entrega 01: cierre del incremento 1

Documento de la revisión del tutor del 2 de noviembre de 2026. Cubre el incremento 1 del
plan de trabajo, ejecutado entre el 19 de octubre y esa fecha. Describe lo que el
repositorio hace hoy, no lo que el sistema hará. Donde este documento y la matriz de estado
discrepen, manda la matriz.

Es la primera revisión de esta reconstrucción: no hay una revisión anterior contra la cual
medir lo que se cerró, así que este documento describe el punto de partida.

## 1. Qué entregó el incremento 1

El incremento 1 dejó en pie la base sobre la que se construyen la interfaz y el modelo. En
términos de una persona que no conoce el proyecto, entrega:

- **Una pila reproducible.** Con `.env` preparado, `make up` levanta PostgreSQL 16,
  MongoDB 7, la API y una página web. El arranque del backend aplica las migraciones del
  registro clínico y la pila espera a que las dos bases estén sanas. La salud de la API
  informa por separado el estado de PostgreSQL y el de MongoDB.
- **El registro clínico completo.** Dieciséis tablas y siete tipos enumerados con los
  nombres del manual, incluida la extensión aprobada de `alert_config` con `critical_low`
  y `critical_high`. El diccionario de datos está en
  [`modelo-de-datos.md`](modelo-de-datos.md) y la extensión se justifica en el
  [ADR 0002](../adr/0002-alert-config-critical-thresholds.md).
- **La capa de sesión.** Registro público de pacientes, inicio de sesión, rotación del
  token de refresco con detección de reutilización y cierre de sesión. Las contraseñas se
  guardan con scrypt y la clave de firma de los tokens se valida al arrancar.
- **Cuentas y roles.** Cuatro roles, cambio de rol por administración y desactivación que
  seudonimiza la identidad, revoca los tokens de refresco y conserva el historial clínico.
- **Consentimiento versionado.** Aceptación y revocación con historial, y una consulta de
  vigencia que responde solo por la versión exacta del documento. La compuerta se aplicará
  cuando existan los endpoints de datos clínicos.
- **Datos de demostración.** Los cuatro escenarios de la revisión, con sus cuentas y sus
  datos descritos en [`cuentas-demo.md`](cuentas-demo.md).
- **Trazabilidad generada.** El catálogo de requerimientos está en
  [`requerimientos.md`](requerimientos.md); la matriz de estado se genera con `make docs` a
  partir de ese catálogo y de las anotaciones del código, y no se edita a mano.

La API se organiza en cuatro módulos: salud, sesión, cuentas y consentimiento. La interfaz
web todavía no tiene pantallas: es una página que informa que está en construcción.

### Lo que este incremento no entregó

Quedaron fuera de esta ventana, por decisión de alcance: las pantallas de paciente, médico,
cuidador y administración, la captura de datos clínicos, el motor de alertas, la
configuración de umbrales en interfaz, el modelo de IA, los reportes, la teleconsulta, la
interoperabilidad FHIR o MQTT, la captura Bluetooth Low Energy, el modo sin conexión y el
cifrado en tránsito y en reposo. La recuperación de credenciales tampoco existe; es la parte
que falta para cerrar RF-01. Nada de eso se presenta como terminado en la matriz de estado.

### Los cuatro roles

El esquema y el control de acceso distinguen cuatro roles: paciente (`patient`), médico
(`physician`), cuidador (`caregiver`) y administrador (`admin`). Hoy el administrador tiene
rutas para listar cuentas, cambiar un rol y desactivar una cuenta; el paciente tiene las
rutas de consentimiento; el médico y el cuidador pueden iniciar sesión y reciben un token
con su rol, pero sus rutas de datos clínicos todavía no existen. El registro público crea
únicamente pacientes: el rol no se elige desde el cliente.

### Los cuatro escenarios de demostración

Los datos sembrados cubren los cuatro escenarios de la revisión:

1. Lecturas fuera de rango.
2. Una alerta crítica abierta.
3. Consentimiento revocado.
4. Un vínculo de cuidador con alcance `readings` en la base.

Las cuentas, los valores y lo que se comprueba con cada una están en
[`cuentas-demo.md`](cuentas-demo.md); este documento no repite esa tabla.

## 2. Qué se puede mostrar hoy y cómo

Hoy no hay pantallas de producto. Lo que se puede mostrar es la API y los datos que la
respaldan. Con la pila levantada según el [`README.md`](../../README.md), `make seed` deja
las cuentas de demostración y los datos de los cuatro escenarios. Las cuentas y la
contraseña común están en [`cuentas-demo.md`](cuentas-demo.md); cada comando usa la cuenta
que necesita. A partir de ahí, los comandos producen una respuesta visible.

### Salud de la API

```bash
curl -s http://localhost:8000/api/health
```

```json
{ "status": "ok", "database": "ok", "mongo": "ok" }
```

El campo `status` solo queda en `ok` si PostgreSQL y MongoDB responden; si una dependencia
falla, responde igual con `status` en `degraded` y la dependencia en `fail`.

### Inicio de sesión

```bash
curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"medico@hta.demo","password":"Demo2026!"}'
```

La respuesta tiene esta forma; en la ejecución real los dos tokens van completos:

```json
{ "access_token": "...", "refresh_token": "...", "role": "physician" }
```

### Listado de cuentas

El listado exige una sesión de administración. El primer comando guarda el token de acceso
en una variable y el segundo consulta la ruta:

```bash
ADMIN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@hta.demo","password":"Demo2026!"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -s http://localhost:8000/api/accounts \
  -H "Authorization: Bearer $ADMIN"
```

Devuelve las cuentas ordenadas por correo, cada una con `id`, `email`, `full_name`, `role` y
`active`. Con el token de un paciente la misma ruta responde 403, y sin token responde 401.

### Estado del consentimiento

La consulta exige una sesión de paciente. Con `paciente1@hta.demo` el consentimiento está
vigente:

```bash
P1=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"paciente1@hta.demo","password":"Demo2026!"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -s http://localhost:8000/api/consent \
  -H "Authorization: Bearer $P1"
```

```json
{ "active": true, "requires_acceptance_of_version": null }
```

Con `paciente3@hta.demo`, el mismo comando devuelve un consentimiento revocado y nombra la
versión que falta:

```json
{ "active": false, "requires_acceptance_of_version": 1 }
```

La documentación interactiva de la API está en `http://localhost:8000/docs` y enumera las
diez rutas con sus operaciones. Además de las cuatro rutas anteriores, la documentación
muestra las operaciones de refresco y cierre de sesión, registro público, cambio de rol,
desactivación y aceptación o revocación del consentimiento.

### El esquema y los datos clínicos

Las consultas son de lectura y se ejecutan dentro del contenedor de PostgreSQL, así que no
hace falta `psql` en el host. Desde la raíz del repositorio, con la pila arriba, prepara el
comando de compose y las variables de `.env`:

```bash
COMPOSE=$(command -v podman-compose >/dev/null 2>&1 && echo podman-compose || echo "docker compose")
set -a; . ./.env; set +a
```

El listado de tablas:

```bash
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\dt'
```

```text
               List of tables
 Schema |       Name        | Type  | Owner
--------+-------------------+-------+-------
 public | adherence_events  | table | hta
 public | alert_config      | table | hta
 public | alerts            | table | hta
 public | audit_logs        | table | hta
 public | caregiver_links   | table | hta
 public | consents          | table | hta
 public | medications       | table | hta
 public | patient_physician | table | hta
 public | patient_profiles  | table | hta
 public | readings          | table | hta
 public | refresh_tokens    | table | hta
 public | reminders         | table | hta
 public | reports           | table | hta
 public | schema_migrations | table | hta
 public | symptoms_mood     | table | hta
 public | teleconsultations | table | hta
 public | users             | table | hta
(17 rows)
```

Son diecisiete relaciones: las dieciséis tablas clínicas y `schema_migrations`, el registro
interno del ejecutor de migraciones. La distinción está en la sección "Registro de
migraciones" de [`modelo-de-datos.md`](modelo-de-datos.md).

La tabla de umbrales, con las dos columnas críticas:

```bash
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\d alert_config'
```

```text
                     Table "public.alert_config"
     Column     |  Type   | Collation | Nullable |      Default
----------------+---------+-----------+----------+-------------------
 id             | uuid    |           | not null | gen_random_uuid()
 patient_id     | uuid    |           |          |
 metric         | text    |           | not null |
 low_threshold  | numeric |           |          |
 high_threshold | numeric |           |          |
 critical_low   | numeric |           |          |
 critical_high  | numeric |           |          |
 recipients     | jsonb   |           | not null | '[]'::jsonb
Indexes:
    "alert_config_pkey" PRIMARY KEY, btree (id)
Foreign-key constraints:
    "alert_config_patient_id_fkey" FOREIGN KEY (patient_id) REFERENCES patient_profiles(id) ON DELETE CASCADE
```

La lectura fuera de rango de `paciente1`:

```bash
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
select r.systolic, r.diastolic, r.validation_status
from readings r
join patient_profiles p on p.id = r.patient_id
join users u on u.id = p.user_id
where u.email = 'paciente1@hta.demo'
  and r.validation_status = 'out_of_range';
"
```

```text
 systolic | diastolic | validation_status
----------+-----------+-------------------
       78 |        46 | out_of_range
(1 row)
```

La alerta crítica abierta:

```bash
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
select u.email, a.severity, a.status, a.type
from alerts a
join patient_profiles p on p.id = a.patient_id
join users u on u.id = p.user_id
where a.status = 'open' and a.severity = 'critical';
"
```

```text
       email        | severity | status |        type
--------------------+----------+--------+---------------------
 paciente2@hta.demo | critical | open   | crisis_hipertensiva
(1 row)
```

El vínculo del cuidador y su alcance:

```bash
$COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
select p.email as patient, c.email as caregiver, l.authorized_scope
from caregiver_links l
join patient_profiles pp on pp.id = l.patient_id
join users p on p.id = pp.user_id
join users c on c.id = l.caregiver_id;
"
```

```text
      patient       |     caregiver     | authorized_scope
--------------------+-------------------+------------------
 paciente4@hta.demo | cuidador@hta.demo | readings
(1 row)
```

Las consultas no modifican datos: son `\dt`, `\d` y tres `select`.

## 3. Estado de los requerimientos

El estado vigente, requerimiento por requerimiento, está en
[`docs/estado-requerimientos.md`](../estado-requerimientos.md). Esa matriz se genera desde
el catálogo y las anotaciones del código; la evidencia anotada y el motivo de cada parcial
están allí, y este documento no repite el estado fila por fila.

Dos decisiones no dependen del equipo técnico y bloquean el incremento 3, no este:

- **Firma clínica de los umbrales.** Los umbrales de `alert_config` son una propuesta
  documentada en [`umbrales-clinicos.md`](umbrales-clinicos.md), sembrados con su fuente, y
  no cuentan como evidencia hasta que un clínico los firme.
  Fecha de corte: **30 de noviembre de 2026**. Mientras no exista la firma, RF-10 y RF-14
  no pueden presentarse como implementados ni como evidencia clínica.
- **Elección del banco de datos público para el adaptador de modelo.** La investigación de
  [`docs/research/2026-10-18-bancos-de-datos-hta.md`](../research/2026-10-18-bancos-de-datos-hta.md)
  recomienda CHESS y deja NHANES como respaldo, pero la elección no está tomada. Fecha de
  corte: **30 de noviembre de 2026**. Si no se elige, RF-09 se sostiene con reglas y el
  adaptador de modelo queda parcial, sin métricas.

## 4. Lo declarado como pendiente

La matriz distingue cuatro estados: implementado, parcial, declarado y pendiente; allí están
el motivo y la evidencia de cada fila. Lo que sigue es solo la correspondencia entre lo que
no está terminado y su identificador, para que nada se dé por cerrado.

**Parciales.** RF-01, RF-27, RNF-07, RNF-08, RNF-09 y RNF-16.

**Declarados.** RF-04, RF-05, RF-06, RF-07, RF-08, RF-12, RF-14, RF-15, RF-16, RF-17,
RF-21, RF-23, RF-24, RNF-11 y RNF-19.

**Pendientes.** RF-09, RF-10, RF-11, RF-13, RF-18, RF-19, RF-20, RF-22, RF-25, RF-26,
RNF-01 a RNF-06, RNF-10, RNF-12 a RNF-15, RNF-17, RNF-18 y RNF-20.

## 5. Qué viene después

El plan corta el trabajo en cinco incrementos. El primero es este: fundamentos, esquema y
acceso. Los siguientes:

- **Incremento 2:** lecturas, síntomas, ingesta desde el simulador y tableros de paciente y
  médico.
- **Incremento 3:** modelo de IA, estimación de severidad, alertas y validación clínica.
- **Incremento 4:** reportes, adherencia, recordatorios y auditoría consultable en la
  interfaz.
- **Incremento 5:** cierre documental, diagramas UML, Fase 04 y ensayo general de la
  entrega.

El siguiente paso es el incremento 2. El incremento 1 cierra el 2 de noviembre de 2026; la
ventana de ejecución del proyecto llega al 18 de diciembre de 2026. El piloto con pacientes
reales y la entrega final son posteriores.
