# Contrato de la API para la interfaz web

Este documento describe cómo hablar con la API de la plataforma de telemonitoreo
desde la interfaz web. Está escrito para quien construye el cliente y no conoce
el interior del backend: cada ruta trae una petición de ejemplo y el cuerpo real
que devolvió la API.

El contrato generado y versionado está en `docs/api/openapi.json`. Se regenera
con `make contract` y no se edita a mano. Si este texto y el archivo generado
discrepan, manda el archivo generado: es el que produce la aplicación.

## URL base

La pila publica la API en `http://localhost:8000`. Todas las rutas llevan el
prefijo `/api`. El puerto se puede cambiar con `BACKEND_PORT` en `.env`; el
cliente debe leerlo de la configuración y no incrustarlo en el código.

Los cuerpos son JSON en UTF-8: toda petición con cuerpo envía
`Content-Type: application/json`.

## CORS y origen del navegador

El navegador puede llamar a la API desde los orígenes de desarrollo que la
política permite por omisión:

- `http://localhost:5173`, el puerto de Vite para React.
- `http://localhost:3000`, el puerto del servidor de ejemplo del repositorio.

La política es de encabezados, no de cookies: la sesión viaja en
`Authorization` y la API no envía `Set-Cookie`. El cliente no debe usar
`credentials: "include"` ni esperar cookies. La política admite los encabezados
`Authorization` y `Content-Type`, que son los que el cliente necesita.

Si el servidor de desarrollo usa otro origen, se agrega a la lista separada por
comas de `HTA_ALLOWED_ORIGINS` (en `.env` para la pila de compose) y el servicio
se reinicia. Un origen no declarado no recibe el encabezado
`Access-Control-Allow-Origin` y el navegador bloquea la respuesta.

## Fechas e identificadores

- Las fechas son ISO 8601. `birth_date` es una fecha sin hora, `AAAA-MM-DD`.
- Las marcas de tiempo son ISO 8601 en UTC, por ejemplo
  `2026-11-08T19:25:07Z`. La API devuelve todas las marcas de tiempo en UTC y
  el cliente las presenta en la zona horaria de quien usa la aplicación.
- Los identificadores son UUID en texto, por ejemplo
  `bf652215-8ac5-4c95-b884-a293cc1477af`. El identificador de paciente que
  viaja en la API es siempre el de la cuenta de usuario; el de
  `patient_profiles` no sale del servidor.

## La sesión

### Inicio

`POST /api/auth/login` recibe el correo y la contraseña y devuelve un par de
tokens y el rol de la cuenta:

```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIs...recortado",
    "refresh_token": "q-EaBLjHHDYE_XaYhCJX...recortado",
    "role": "patient"
}
```

El token de acceso es un JWT y dura 900 segundos por omisión. El de refresco es
opaco y dura siete días. Los roles posibles son `patient`, `physician`,
`caregiver` y `admin`.

### Cada petición autenticada

El token de acceso va en el encabezado `Authorization` con el esquema
`Bearer`: el valor es la palabra `Bearer`, un espacio y el token.

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

### Rotación del refresco

`POST /api/auth/refresh` recibe el token de refresco y devuelve un par completo
nuevo. El token presentado queda revocado en la misma operación, así que no se
puede volver a usar. El cliente reemplaza ambos tokens, aunque el de acceso
pueda coincidir carácter por carácter si se emitió en el mismo segundo y sus
reclamos no cambiaron.

```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIs...recortado",
    "refresh_token": "8Nf4uinsREBrbGASjdIy...recortado",
    "role": "admin"
}
```

Presentar un refresco ya usado se interpreta como una posible filtración: la
API revoca todos los refrescos de la cuenta. No se reintenta el mismo token ni
se guardan dos refrescos para la misma sesión.

### Qué hacer ante un 401

En una petición autenticada, un 401 significa que el token de acceso no sirve o
que la sesión ya no es válida. El cliente:

1. Intenta una sola rotación con el token de refresco.
2. Si la rotación responde 200, guarda el par nuevo y repite una sola vez la
   petición original.
3. Si la rotación responde 401, borra ambos tokens y lleva a la pantalla de
   inicio de sesión.
4. No repite el ciclo: una petición original no se reintenta más de una vez.

Una cuenta desactivada responde 401 aunque su token de acceso todavía no haya
vencido. El rol se lee de la base en cada petición: un cambio de rol surte
efecto en la petición siguiente sin esperar a que venza el token.

### Cierre

`POST /api/auth/logout` recibe el token de refresco y responde 204. Es
idempotente: repetirlo no produce error. Después de cerrar, el cliente borra
ambos tokens.

## El sobre de los listados

Todo listado devuelve un objeto con dos llaves, nunca una lista suelta:

```json
{
    "items": [
        {
            "id": "bf652215-8ac5-4c95-b884-a293cc1477af",
            "email": "ana.demo@example.com",
            "full_name": "Ana María Rojas",
            "role": "patient",
            "active": true
        }
    ],
    "total": 1
}
```

`items` lleva los elementos de la página y `total` las filas que existen en la
colección. Cuando el listado se pagina, `total` puede ser mayor que
`len(items)`.

### Paginación

Todos los listados aceptan dos parámetros de consulta:

- `limit`: cuántos elementos devuelve la página. Por omisión 50, mínimo 0 y
  máximo 200.
- `offset`: cuántos elementos se saltan desde el comienzo. Por omisión 0 y
  mínimo 0.

Una petición con `limit` mayor que 200 responde 422 con el cuerpo de validación.
`total` cuenta todas las filas de la colección, no las de la página: una página
de dos elementos puede informar `"total": 7`. Los parámetros se aplican en la
consulta, y la misma forma de respuesta y los mismos parámetros rigen para todos
los listados de este contrato.

## Los errores

Los errores de la aplicación tienen esta forma, con un mensaje en español
pensado para mostrarse:

```json
{
    "detail": "El correo ya está registrado"
}
```

La excepción son los errores de validación del cuerpo, que produce el marco
web: en un 422 `detail` es una lista de objetos con el campo, el motivo y el
valor recibido. Este es un cuerpo real:

```json
{
    "detail": [
        {
            "type": "missing",
            "loc": ["body", "password"],
            "msg": "Field required",
            "input": { "email": "ana.demo@example.com" }
        }
    ]
}
```

Códigos que el cliente debe manejar:

| Código | Cuándo                                                                                                                                                      | `detail`                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 200    | Petición atendida                                                                                                                                           | No aplica                                                                |
| 201    | Recurso creado                                                                                                                                              | No aplica                                                                |
| 204    | Operación sin cuerpo de respuesta                                                                                                                           | No hay cuerpo                                                            |
| 401    | Sin sesión, token inválido, cuenta inactiva o credenciales incorrectas                                                                                      | `Sesión inválida o expirada` o `Credenciales inválidas`                  |
| 403    | Sesión válida con un rol que no permite la ruta, cuenta sin perfil o paciente fuera del alcance de la cuenta                                                | `Permiso denegado`                                                       |
| 403    | Escritura clínica o resumen de la ventana sin consentimiento informado vigente                                                                              | `No hay consentimiento informado vigente`                                |
| 404    | La cuenta indicada no existe                                                                                                                                | `La cuenta no existe`                                                    |
| 409    | Correo ya registrado o desactivación de la propia cuenta                                                                                                    | `El correo ya está registrado` o `No puedes desactivar tu propia cuenta` |
| 422    | Rol desconocido, cuerpo inválido, `limit` fuera de rango, fecha de medición futura o sin desplazamiento, fecha de filtro sin desplazamiento o síntoma vacío | Un mensaje o una lista de errores de validación                          |
| 500    | Error no previsto                                                                                                                                           | Forma no garantizada; no se muestra al usuario                           |

Un 403 con `Permiso denegado` también aparece cuando la cuenta es de paciente
pero no tiene perfil, y cuando el paciente consultado no está en el alcance de
la cuenta: la negativa es la misma que la de un paciente inexistente, a
propósito, para que el cliente no pueda enumerar pacientes. El otro 403 no es
de permisos: las rutas clínicas de escritura y el resumen de la ventana
responden `No hay consentimiento informado vigente` cuando el paciente no tiene
una aceptación vigente. El cliente distingue los dos por `detail` y solo en el
segundo lleva al paciente a aceptar el consentimiento.

## Rutas

### `GET /api/health`

Sin sesión. Informa el estado del servicio y de sus dependencias. Responde 200
aunque una dependencia esté caída; el campo `status` lo distingue.

```json
{
    "status": "ok",
    "database": "ok",
    "mongo": "ok"
}
```

`status` vale `ok` o `degraded`; `database` y `mongo` valen `ok` o `fail`.

### `POST /api/auth/login`

Sin sesión.

Petición:

```json
{
    "email": "ana.demo@example.com",
    "password": "s3cret-demo"
}
```

Respuesta 200:

```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIs...recortado",
    "refresh_token": "q-EaBLjHHDYE_XaYhCJX...recortado",
    "role": "patient"
}
```

Errores: 401 con `Credenciales inválidas` tanto para la contraseña equivocada
como para el correo desconocido o la cuenta inactiva.

### `POST /api/auth/refresh`

Sin sesión: el token de refresco va en el cuerpo. Devuelve un par nuevo.

Petición:

```json
{
    "refresh_token": "q-EaBLjHHDYE_XaYhCJX...recortado"
}
```

Respuesta 200:

```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIs...recortado",
    "refresh_token": "8Nf4uinsREBrbGASjdIy...recortado",
    "role": "admin"
}
```

Errores: 401 con `Sesión inválida o expirada` si el token está vencido,
revocado o es desconocido.

### `POST /api/auth/logout`

Sin sesión: el token de refresco va en el cuerpo.

Petición:

```json
{
    "refresh_token": "8Nf4uinsREBrbGASjdIy...recortado"
}
```

Respuesta 204, sin cuerpo.

### `POST /api/accounts/register`

Sin sesión. Crea una cuenta de paciente y su perfil. El rol no se envía: toda
cuenta creada por esta ruta es `patient`.

Petición:

```json
{
    "email": "ana.demo@example.com",
    "password": "s3cret-demo",
    "full_name": "Ana María Rojas",
    "birth_date": "1971-03-14"
}
```

Respuesta 201:

```json
{
    "id": "bf652215-8ac5-4c95-b884-a293cc1477af"
}
```

Errores: 409 con `El correo ya está registrado`; 422 si falta un campo o el
cuerpo no tiene la forma esperada. El correo se normaliza antes de guardarlo:
se recortan los espacios y se pasa a minúsculas, y la unicidad se decide sobre
esa versión.

### `GET /api/accounts`

Exige sesión con rol `admin`. Devuelve la envoltura de listado con las cuentas
ordenadas por correo. Acepta `limit` y `offset` con los valores por omisión y el
máximo de la sección de paginación.

Petición:

```http
GET /api/accounts
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 200:

```json
{
    "items": [
        {
            "id": "440ba1c5-6748-44ea-b903-ccd520cd7625",
            "email": "admin.demo@example.com",
            "full_name": "Administrador de demostración",
            "role": "admin",
            "active": true
        },
        {
            "id": "bf652215-8ac5-4c95-b884-a293cc1477af",
            "email": "ana.demo@example.com",
            "full_name": "Ana María Rojas",
            "role": "patient",
            "active": true
        }
    ],
    "total": 2
}
```

Una cuenta desactivada sigue en la lista con `active` en `false`; su correo y
su nombre ya no identifican a la persona. Errores: 401 sin sesión válida, 403
si el rol no es `admin`.

### `PATCH /api/accounts/{user_id}/role`

Exige sesión con rol `admin`. Cambia el rol de la cuenta indicada.

Petición:

```json
{
    "role": "caregiver"
}
```

Respuesta 204, sin cuerpo. Los roles válidos son `patient`, `physician`,
`caregiver` y `admin`.

Errores: 404 con `La cuenta no existe`; 422 con `Rol desconocido` si el valor
no pertenece al conjunto.

### `POST /api/accounts/{user_id}/deactivate`

Exige sesión con rol `admin`. Desactiva la cuenta: seudonimiza su identidad,
conserva su historial clínico y revoca sus tokens de refresco.

Petición:

```http
POST /api/accounts/bf652215-8ac5-4c95-b884-a293cc1477af/deactivate
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 204, sin cuerpo.

Errores: 404 con `La cuenta no existe`; 409 con
`No puedes desactivar tu propia cuenta`.

### `GET /api/consent`

Exige sesión con rol `patient`. Informa si el paciente tiene consentimiento
vigente para una versión del documento.

Acepta el parámetro de consulta `required_version`; si se omite, consulta la
versión 1.

```http
GET /api/consent?required_version=1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 200 sin consentimiento vigente:

```json
{
    "active": false,
    "requires_acceptance_of_version": 1
}
```

Respuesta 200 con consentimiento vigente:

```json
{
    "active": true,
    "requires_acceptance_of_version": null
}
```

`requires_acceptance_of_version` es la versión cuya aceptación falta, o `null`
si no falta ninguna. Así el cliente no compara versiones por su cuenta.

Errores: 401 sin sesión válida, 403 si el rol no es `patient` o la cuenta no
tiene perfil.

### `POST /api/consent`

Exige sesión con rol `patient`. Registra una aceptación nueva. El historial es
de solo agregar: aceptar no reescribe aceptaciones anteriores.

Petición:

```json
{
    "version": 1,
    "content_ref": "docs/manual/consentimiento-informado.md"
}
```

Respuesta 201:

```json
{
    "id": "560be6e8-c9c1-4c23-a9fb-da1929be72cb"
}
```

Errores: 401 sin sesión válida, 403 si el rol no es `patient` o la cuenta no
tiene perfil.

### `POST /api/consent/revoke`

Exige sesión con rol `patient`. Revoca las aceptaciones vigentes del paciente y
conserva el historial.

Petición:

```http
POST /api/consent/revoke
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 204, sin cuerpo.

Después de revocar, la consulta vuelve a informar la versión pendiente de
aceptación. Errores: 401 sin sesión válida, 403 si el rol no es `patient` o la
cuenta no tiene perfil.

### Alcance de los datos clínicos

Estas cuatro rutas son las que alimentan los tableros. La tabla dice qué
devuelve cada cuenta:

| Cuenta                          | `GET /api/patients`                        | `GET /api/readings` y `GET /api/symptoms`   | `GET /api/readings/summary`                                     |
| ------------------------------- | ------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| Paciente                        | Solo a sí mismo                            | Solo las propias                            | Solo la propia, con consentimiento vigente                      |
| Médico                          | Solo los vinculados en `patient_physician` | Solo las del paciente indicado y vinculado  | Solo las del paciente indicado y vinculado, con consentimiento  |
| Cuidador con alcance `readings` | Solo los autorizados                       | Solo las del paciente indicado y autorizado | Solo las del paciente indicado y autorizado, con consentimiento |
| Cuidador con alcance `minimal`  | Lista vacía, `total` 0                     | 403 `Permiso denegado`                      | 403 `Permiso denegado`                                          |
| Administrador                   | 403 `Permiso denegado`                     | 403 `Permiso denegado`                      | 403 `Permiso denegado`                                          |

Un paciente fuera del alcance responde 403 con `Permiso denegado`, igual que un
paciente inexistente: el cliente no puede distinguir los dos casos. El médico y
el cuidador deben indicar `patient_id` en las tres rutas del paciente; sin él
responden 403. El cuidador con alcance `minimal` no ve datos clínicos aunque el
vínculo exista; solo el alcance `readings` lo autoriza.

**La consulta de lecturas y de síntomas no exige consentimiento; el resumen de
la ventana sí.** La historia clínica se consulta sin la compuerta. El resumen es
análisis de datos clínicos y responde 403 con
`No hay consentimiento informado vigente` si el paciente no tiene una aceptación
vigente. El cliente no debe confundir ese 403 con una falta de permisos ni
reintentar la petición: lleva al paciente a aceptar el consentimiento.

### `GET /api/patients`

Exige sesión con rol `patient`, `physician` o `caregiver`. Devuelve el
directorio de pacientes que la cuenta puede ver, con la envoltura y la
paginación de la sección de listados. El administrador recibe 403.

Petición:

```http
GET /api/patients?limit=50&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 200 real de la sesión del médico de demostración:

```json
{
    "items": [
        {
            "user_id": "31679784-1cd5-4b84-b7e5-af6ac0b303df",
            "full_name": "Ana María Torres Gil",
            "birth_date": "1955-01-30"
        },
        {
            "user_id": "fbcd6674-42cc-4928-86e2-2be365309200",
            "full_name": "Carlos Alberto Pérez Ruiz",
            "birth_date": "1958-03-14"
        },
        {
            "user_id": "058f72ca-eaed-4ab8-8303-8b08a9292f86",
            "full_name": "Jorge Enrique Ramírez Salas",
            "birth_date": "1970-11-05"
        },
        {
            "user_id": "f19b4b99-a1bb-4a6c-9af3-d560f578181b",
            "full_name": "María Fernanda López Díaz",
            "birth_date": "1962-07-22"
        }
    ],
    "total": 4
}
```

`user_id` es el identificador de la cuenta del paciente, nunca el del perfil.
`birth_date` puede ser `null` y el orden es por nombre. `total` cuenta todos los
pacientes visibles, no los de la página.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol es `admin`
o si la cuenta no tiene perfil.

### `GET /api/readings`

Exige sesión con rol `patient`, `physician` o `caregiver`. Lista las lecturas
del paciente de la más reciente a la más antigua, con la envoltura y la
paginación. No exige consentimiento: es la historia clínica.

Parámetros:

- `patient_id` es opcional y es el identificador de la cuenta del paciente. El
  paciente que lo omite ve sus propias lecturas; el médico y el cuidador deben
  indicarlo y solo obtienen las del paciente que tienen en su alcance.
- `since` y `until` son opcionales, inclusivos y deben ser ISO 8601 con
  desplazamiento horario. Sin desplazamiento responden 422.
- `limit` y `offset` son los de la paginación general.

Petición:

```http
GET /api/readings?limit=2
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 200 real de la sesión del paciente de demostración:

```json
{
    "items": [
        {
            "id": "99b7fe5b-5c29-4c9e-8371-715aefd8f30a",
            "patient_id": "fbcd6674-42cc-4928-86e2-2be365309200",
            "systolic": 154,
            "diastolic": 100,
            "heart_rate": 83,
            "source": "manual",
            "measured_at": "2026-11-07T20:00:00Z",
            "validation_status": "valid"
        },
        {
            "id": "306b08d7-db97-46a7-84f9-b5d1a8cbd682",
            "patient_id": "fbcd6674-42cc-4928-86e2-2be365309200",
            "systolic": 146,
            "diastolic": 94,
            "heart_rate": 76,
            "source": "device",
            "measured_at": "2026-11-07T07:00:00Z",
            "validation_status": "valid"
        }
    ],
    "total": 20
}
```

La página trae dos lecturas y `total` veinte: el cliente pide la siguiente con
`offset`. `patient_id` es el de la cuenta, `source` vale `manual` o `device` y
`validation_status` vale `valid`, `out_of_range` o `flagged`.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol es `admin`,
si el paciente no está en el alcance o si el médico o el cuidador omiten
`patient_id`; 422 si `since` o `until` no traen desplazamiento horario.

### `GET /api/readings/summary`

Exige sesión con rol `patient`, `physician` o `caregiver` y consentimiento
informado vigente del paciente. Resume la ventana domiciliaria de los últimos
siete días. Acepta `patient_id` opcional con la misma regla que
`GET /api/readings`; no se pagina.

Petición:

```http
GET /api/readings/summary
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 200 real de la sesión del paciente de demostración:

```json
{
    "window_start": "2026-11-01T20:40:22.985177Z",
    "window_end": "2026-11-08T20:40:22.985177Z",
    "sufficient": true,
    "valid_count": 9,
    "days_with_readings": 5,
    "mean_systolic": 134.4,
    "mean_diastolic": 86.0
}
```

Reglas del resumen:

- La ventana va de `window_end` menos siete días hasta `window_end`, ambas
  orillas incluidas, y las dos fechas se publican para rotular la pantalla.
- Las lecturas se agrupan por fecha UTC. Si hay dos o más fechas distintas se
  descarta completa la más antigua, porque el primer día suele estar incompleto.
- Del resto solo cuentan las lecturas con `validation_status` en `valid`.
- `sufficient` es `true` con al menos ocho lecturas válidas en al menos dos
  fechas distintas después del descarte. `days_with_readings` cuenta esas fechas.
- `mean_systolic` y `mean_diastolic` son números con un decimal y valen `null`
  cuando el resumen no es suficiente: el cliente no debe mostrar un promedio de
  dos lecturas.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol es `admin`,
si el paciente no está en el alcance o si falta `patient_id`; 403 con
`No hay consentimiento informado vigente` si el paciente no tiene una aceptación
vigente.

### `GET /api/symptoms`

Exige sesión con rol `patient`, `physician` o `caregiver`. Lista los síntomas
del paciente del más reciente al más antiguo, con la misma resolución de alcance
y la misma paginación que las lecturas. Acepta `patient_id` opcional con la
misma regla y no exige consentimiento.

Petición:

```http
GET /api/symptoms
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 200 real de la sesión del paciente de demostración:

```json
{
    "items": [
        {
            "id": "3aa34d4e-2d18-4620-abe0-6a528a781c2d",
            "patient_id": "fbcd6674-42cc-4928-86e2-2be365309200",
            "free_text": "mareo leve por la mañana",
            "mood": "ansioso",
            "recorded_at": "2026-11-08T20:40:23.020873Z"
        }
    ],
    "total": 1
}
```

`free_text` y `mood` pueden ser `null` por separado. `patient_id` es el de la
cuenta del paciente.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol es `admin`,
si el paciente no está en el alcance o si el médico o el cuidador omiten
`patient_id`.

### `POST /api/readings`

Exige sesión con rol `patient` y consentimiento informado vigente. Registra una
lectura manual de presión arterial y, si viene, el síntoma que la acompañó. La
lectura se guarda siempre: un valor fisiológicamente imposible no se descarta, se
guarda con `validation_status` en `out_of_range` y la respuesta sigue siendo 201.

Petición:

```json
{
    "systolic": 138,
    "diastolic": 88,
    "heart_rate": 72,
    "measured_at": "2026-11-08T10:00:00-05:00",
    "symptom": {
        "free_text": "dolor de cabeza leve",
        "mood": "ansioso"
    }
}
```

Campos:

- `systolic` y `diastolic` son enteros obligatorios y no llevan límite en el
  cuerpo: el servidor decide la plausibilidad.
- `heart_rate` es opcional.
- `measured_at` es opcional. Sin él se registra el instante actual; con él debe
  ser ISO 8601 con desplazamiento horario y no puede estar en el futuro. La API
  lo devuelve en UTC: la petición de ejemplo, `2026-11-08T10:00:00-05:00`, sale
  como `2026-11-08T15:00:00Z`. Una marca futura responde 422 con
  `La fecha de la medición no puede estar en el futuro`; una sin desplazamiento,
  422 con `La fecha de la medición debe incluir el desplazamiento horario`. Las
  fechas pasadas se aceptan sin límite.
- `patient_id` es opcional y, si llega, es el identificador de la cuenta del
  paciente: solo se admite el propio. Cualquier otro responde 403.
- `symptom` es opcional; sus dos campos, `free_text` y `mood`, son opcionales,
  pero al menos uno debe traer texto. Un objeto vacío o de solo espacios responde
  422 con `El síntoma necesita un texto o un estado de ánimo`.

Respuesta 201 real de la petición anterior:

```json
{
    "id": "708e4261-d2e5-4ef9-9f68-de99c400e173",
    "patient_id": "b785c512-dbbd-4e9d-8b97-d5a41ffbd693",
    "systolic": 138,
    "diastolic": 88,
    "heart_rate": 72,
    "source": "manual",
    "measured_at": "2026-11-08T15:00:00Z",
    "validation_status": "valid"
}
```

`patient_id` es el de la cuenta de usuario, no el del perfil. `source` es siempre
`manual` en esta ruta. `validation_status` vale `valid` o `out_of_range`; hoy el
alta no produce `flagged`. Una lectura imposible también responde 201:

```json
{
    "id": "497a3391-5a38-4ab6-976a-a84d3601bfe7",
    "patient_id": "b785c512-dbbd-4e9d-8b97-d5a41ffbd693",
    "systolic": 300,
    "diastolic": 200,
    "heart_rate": null,
    "source": "manual",
    "measured_at": "2026-11-08T20:17:01.381345Z",
    "validation_status": "out_of_range"
}
```

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol no es
`patient`, la cuenta no tiene perfil o `patient_id` no es el propio; 403 con
`No hay consentimiento informado vigente` si falta la aceptación, por ejemplo:

```json
{
    "detail": "No hay consentimiento informado vigente"
}
```

También responde 422 con un mensaje o una lista de validación si el cuerpo no
tiene la forma esperada, la fecha es futura o no trae desplazamiento, o el
síntoma está vacío. Ningún rechazo escribe una lectura ni una fila de auditoría.

### `POST /api/symptoms`

Exige sesión con rol `patient` y consentimiento informado vigente. Registra un
síntoma que no acompaña a una lectura.

Petición:

```json
{
    "free_text": "mareo",
    "mood": "bien"
}
```

Los dos campos son opcionales, pero al menos uno debe traer texto; un objeto
vacío responde 422 con `El síntoma necesita un texto o un estado de ánimo`.
Respuesta 201 real:

```json
{
    "id": "97d38e8d-79d3-499f-a0fb-55869baa02ce"
}
```

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol no es
`patient` o la cuenta no tiene perfil; 403 con
`No hay consentimiento informado vigente` si falta la aceptación; 422 si el
síntoma está vacío. Sin consentimiento no se escribe la fila ni su auditoría.

Después de aceptar el consentimiento (ver `POST /api/consent`), las dos rutas de
escritura clínica quedan habilitadas. Si el paciente lo revoca, vuelven a
responder 403 con `No hay consentimiento informado vigente`.

## Regenerar el contrato

Después de un cambio de rutas o de modelos, el backend regenera el archivo y lo
confirma:

```bash
make contract
```

La prueba de integración compara el archivo confirmado con el esquema que
genera la aplicación, de modo que un cambio sin regenerar el contrato falla en
la verificación.
