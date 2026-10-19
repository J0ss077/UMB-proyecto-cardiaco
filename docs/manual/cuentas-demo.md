# Cuentas de demostración

## Qué entrega este incremento

La interfaz web es todavía un esqueleto en construcción. Lo que existe hoy son los endpoints
de autenticación (`/api/auth/login`, `/api/auth/refresh` y `/api/auth/logout`), de cuentas y
roles (`/api/accounts` y el registro público `/api/accounts/register`), de consentimiento
(`/api/consent`) y los datos que siembra `make seed`. Las pantallas de lecturas, alertas,
umbrales, auditoría y telemonitoreo llegan con los incrementos que las construyan; la tabla
dice qué se puede comprobar hoy y qué queda pendiente. El token de acceso se obtiene con
`POST /api/auth/login`; el registro de pacientes en `POST /api/accounts/register` es público,
mientras que listar cuentas, cambiar un rol y desactivar una cuenta exigen rol de
administración; las rutas de consentimiento exigen rol de paciente.

Todas las cuentas usan la contraseña `Demo2026!`. Los datos son de demostración: no
corresponden a personas reales ni a mediciones tomadas en un domicilio, y no sustituyen una
historia clínica.

| Correo               | Rol            | Contraseña  | Qué se puede comprobar hoy                                                                                                                                                                                                                                              |
| -------------------- | -------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin@hta.demo`     | Administración | `Demo2026!` | Rol de administración. `GET /api/accounts` lista las siete cuentas; la auditoría se escribe al iniciar sesión, y las pantallas de umbrales y auditoría llegan con el incremento que las construya.                                                                      |
| `medico@hta.demo`    | Médico         | `Demo2026!` | Rol de médico. Inicia sesión y obtiene un token con rol `physician`; los cuatro pacientes y sus lecturas están sembrados y vinculados, pero la pantalla que los muestra llega después.                                                                                  |
| `cuidador@hta.demo`  | Cuidador       | `Demo2026!` | Rol de cuidador. Inicia sesión y obtiene un token con rol `caregiver`; el vínculo con paciente4 y el alcance `readings` están en la base, pero su pantalla llega después.                                                                                               |
| `paciente1@hta.demo` | Paciente       | `Demo2026!` | `GET /api/consent` responde `active: true`. Un sembrado sin interrupciones deja veinte lecturas: doce por encima del umbral de referencia de 140/90 mmHg y una fisiológicamente implausible (78/46 mmHg) marcada `out_of_range`; la pantalla de lecturas llega después. |
| `paciente2@hta.demo` | Paciente       | `Demo2026!` | `GET /api/consent` responde `active: true`. La base tiene dos lecturas de 186/122 y 184/120 mmHg y una alerta abierta de severidad crítica; la pantalla de alertas llega después.                                                                                       |
| `paciente3@hta.demo` | Paciente       | `Demo2026!` | `GET /api/consent` responde `active: false` con `requires_acceptance_of_version: 1`; la única fila de consentimiento se conserva revocada. La pantalla de lecturas llega después.                                                                                       |
| `paciente4@hta.demo` | Paciente       | `Demo2026!` | `GET /api/consent` responde `active: true`; el vínculo con el cuidador y el alcance `readings` están en la base, y su pantalla llega después.                                                                                                                           |

Los recordatorios de los pacientes 1, 2 y 4, la alerta del paciente 2 y el vínculo del
paciente 4 con el cuidador están en la base. Sus pantallas llegarán con los incrementos que
las construyan.

La alerta del escenario crítico queda abierta y pendiente de revisión médica. Los umbrales
de `alert_config` son una propuesta documentada en la investigación clínica del proyecto y
siguen pendientes de firma: ninguna alerta es evidencia clínica hasta que un clínico los
firme.

## Cómo cargar los datos

Desde la carpeta del proyecto, con la pila levantada mediante `make up`, ejecuta:

```sh
make seed
```

El comando crea las siete cuentas y los datos de los cuatro escenarios. Se puede volver a
ejecutar sin duplicar nada: si una cuenta ya existe, no se recrea; si un paciente ya tiene
lecturas, no se le añade otra serie aunque haya pasado el tiempo; los consentimientos,
alertas, vínculos, recordatorios y umbrales tampoco se insertan de nuevo. La siembra no
completa una serie parcial: si la primera ejecución se interrumpió, hay que regenerar los
datos desde cero con el procedimiento de la sección siguiente.

## Si los datos ya están cargados

Ejecutar `make seed` otra vez es seguro y no duplica ni reubica las lecturas. Para regenerar
la rejilla desde cero hay que borrar la base: `podman-compose down -v` o
`docker compose down -v` eliminan los volúmenes de la pila, y después `make up` y
`make seed` la reconstruyen. Esa operación borra toda la base, no solo los datos de
demostración.
