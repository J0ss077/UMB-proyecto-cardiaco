# Cuentas de demostración

## Qué entrega este incremento

La interfaz web es todavía un esqueleto en construcción. La API ya cubre la salud, la
autenticación, las cuentas y los roles, el consentimiento, el directorio de pacientes, el
registro y la consulta de lecturas y síntomas, el resumen de la ventana domiciliaria, las
alertas con validación médica y la ingesta desde dispositivos. El contrato completo para
quien construye el cliente está en
[`docs/api/api-para-el-frontend.md`](../api/api-para-el-frontend.md); la ingesta tiene el
suyo en [`docs/api/ingesta.md`](../api/ingesta.md). Las pantallas llegan con el incremento
que las construya; la tabla dice qué se puede comprobar hoy con cada cuenta y qué queda
pendiente.

El token de acceso se obtiene con `POST /api/auth/login` y el registro público de pacientes
es `POST /api/accounts/register`. Listar cuentas, cambiar un rol y desactivar una cuenta
exigen rol de administración; las rutas de consentimiento y las dos escrituras clínicas
exigen rol de paciente; el directorio y las lecturas, síntomas y alertas de un paciente
exigen que la cuenta sea la del propio paciente o que el médico o el cuidador lo tengan en
su alcance. Las transiciones de una alerta exigen rol de médico. La ingesta
(`POST /api/ingest/readings`) no usa sesión: se autentica con la clave de dispositivo y se
documenta aparte.

Todas las cuentas usan la contraseña `Demo2026!`. Los datos son de demostración: no
corresponden a personas reales ni a mediciones tomadas en un domicilio, y no sustituyen una
historia clínica.

| Correo               | Rol            | Contraseña  | Qué se puede comprobar hoy                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin@hta.demo`     | Administración | `Demo2026!` | Rol de administración. `GET /api/accounts` devuelve la envoltura paginada con las siete cuentas; `PATCH /api/accounts/{id}/role` cambia un rol y `POST /api/accounts/{id}/deactivate` desactiva una cuenta. Las rutas clínicas responden 403 y las pantallas de umbrales y auditoría no existen todavía.                                                                                                                                                                 |
| `medico@hta.demo`    | Médico         | `Demo2026!` | Rol de médico. `GET /api/patients` lista los cuatro pacientes vinculados; `GET /api/readings`, `GET /api/symptoms` y `GET /api/readings/summary` (con consentimiento) leen los del paciente indicado; `GET /api/alerts` y `GET /api/alerts/{id}` leen sus alertas. Puede acusar recibo, validar o descartar con las tres rutas de transición, por ejemplo la alerta abierta de `paciente2@hta.demo`. La pantalla que lo muestra llega después.                           |
| `cuidador@hta.demo`  | Cuidador       | `Demo2026!` | Rol de cuidador. `GET /api/patients` lista solo a `paciente4@hta.demo`; con el alcance `readings` puede leer sus lecturas, síntomas, resumen y alertas. Las transiciones de alerta le responden 403. La pantalla llega después.                                                                                                                                                                                                                                          |
| `paciente1@hta.demo` | Paciente       | `Demo2026!` | `GET /api/consent` responde `active: true`. `GET /api/readings` devuelve sus veinte lecturas, doce por encima de 140/90 mmHg y una 78/46 marcada `out_of_range`, y `GET /api/readings/summary` responde `sufficient: true`; `POST /api/readings` y `POST /api/symptoms` escriben mientras el consentimiento siga vigente. `GET /api/symptoms` empieza vacío. La pantalla llega después.                                                                                  |
| `paciente2@hta.demo` | Paciente       | `Demo2026!` | `GET /api/consent` responde `active: true`. `GET /api/readings` devuelve sus veinte lecturas con dos de 186/122 y 184/120 mmHg; `GET /api/alerts` devuelve una alerta abierta de severidad crítica y `GET /api/symptoms` devuelve el síntoma sembrado, `mareo y dolor de cabeza desde la tarde` con estado de ánimo `ansioso`. Puede leer sus datos y registrar lecturas y síntomas, pero no mover la alerta: las transiciones responden 403. La pantalla llega después. |
| `paciente3@hta.demo` | Paciente       | `Demo2026!` | `GET /api/consent` responde `active: false` con `requires_acceptance_of_version: 1`; la única fila de consentimiento se conserva revocada. `GET /api/readings` y `GET /api/symptoms` siguen disponibles porque son su historia clínica; `GET /api/readings/summary` y las dos escrituras clínicas responden 403 con `No hay consentimiento informado vigente`. La pantalla llega después.                                                                                |
| `paciente4@hta.demo` | Paciente       | `Demo2026!` | `GET /api/consent` responde `active: true`. `GET /api/readings`, `GET /api/symptoms` y `GET /api/readings/summary` devuelven sus datos; el vínculo con el cuidador y el alcance `readings` están en la base, así que la cuenta de `cuidador@hta.demo` puede leerlos. La pantalla llega después.                                                                                                                                                                          |

Los recordatorios de los pacientes 1, 2 y 4, la alerta y el síntoma del paciente 2 y el
vínculo del paciente 4 con el cuidador están en la base. Sus pantallas llegarán con los
incrementos que las construyan.

La alerta del escenario crítico queda abierta y pendiente de revisión médica. Los umbrales
de `alert_config` son una propuesta documentada en
[`umbrales-clinicos.md`](umbrales-clinicos.md) y siguen pendientes de firma: ninguna alerta
es evidencia clínica hasta que un clínico los firme.

## Cómo cargar los datos

Desde la carpeta del proyecto, con la pila levantada mediante `make up`, ejecuta:

```sh
make seed
```

El comando crea las siete cuentas y los datos de los cuatro escenarios, incluido el
síntoma del escenario crítico. Se puede volver a ejecutar sin duplicar nada: si una cuenta
ya existe, no se recrea; si un paciente ya tiene lecturas, no se le añade otra serie aunque
haya pasado el tiempo; los síntomas, consentimientos, alertas, vínculos, recordatorios y
umbrales tampoco se insertan de nuevo. La siembra no completa una serie parcial: si la
primera ejecución se interrumpió, hay que regenerar los datos desde cero con el
procedimiento de la sección siguiente.

## Si los datos ya están cargados

Ejecutar `make seed` otra vez es seguro y no duplica ni reubica las lecturas. Para regenerar
la rejilla desde cero hay que borrar la base: `podman-compose down -v` o
`docker compose down -v` eliminan los volúmenes de la pila, y después `make up` y
`make seed` la reconstruyen. Esa operación borra toda la base, no solo los datos de
demostración.
