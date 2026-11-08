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

El contrato declara un único esquema de seguridad, `HTTPBearer`: tipo `http`,
esquema `bearer` y formato `JWT`. Todas las rutas lo exigen salvo cuatro:
`GET /api/health`, `POST /api/auth/login`, `POST /api/auth/refresh` y
`POST /api/accounts/register`. El cliente generado a partir de
`docs/api/openapi.json` ya lleva el esquema y adjunta el token en las rutas
protegidas; una petición sin token, con un esquema distinto de Bearer o con un
token vencido responde 401, y un rol sin permiso responde 403. Esas dos
respuestas están declaradas en el contrato de cada ruta con sesión.

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

| Código | Cuándo                                                                                                                                                                                                                                     | `detail`                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 200    | Petición atendida                                                                                                                                                                                                                          | No aplica                                                                     |
| 201    | Recurso creado                                                                                                                                                                                                                             | No aplica                                                                     |
| 204    | Operación sin cuerpo de respuesta                                                                                                                                                                                                          | No hay cuerpo                                                                 |
| 401    | Sin sesión, token inválido, cuenta inactiva o credenciales incorrectas                                                                                                                                                                     | `Sesión inválida o expirada` o `Credenciales inválidas`                       |
| 403    | Sesión válida con un rol que no permite la ruta, cuenta de paciente sin perfil o paciente fuera del alcance de la cuenta                                                                                                                   | `Permiso denegado`                                                            |
| 403    | Escritura clínica o resumen de la ventana sin consentimiento informado vigente                                                                                                                                                             | `No hay consentimiento informado vigente`                                     |
| 404    | La cuenta o la alerta indicadas no existen                                                                                                                                                                                                 | `La cuenta no existe` o `La alerta no existe`                                 |
| 409    | Correo ya registrado o desactivación de la propia cuenta                                                                                                                                                                                   | `El correo ya está registrado` o `No puedes desactivar tu propia cuenta`      |
| 409    | Transición de alerta no permitida para su estado actual                                                                                                                                                                                    | `La alerta está en estado 'validated' y no puede pasar al estado 'validated'` |
| 422    | Rol desconocido, cuerpo inválido, `limit` fuera de rango, fecha de medición futura o sin desplazamiento, fecha de filtro sin desplazamiento, síntoma vacío, estado o severidad de alerta fuera de los tipos enumerados o descarte sin nota | Un mensaje o una lista de errores de validación                               |
| 500    | Error no previsto                                                                                                                                                                                                                          | Forma no garantizada; no se muestra al usuario                                |

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

Errores: 401 sin sesión válida, 403 si el rol no es `patient` o la cuenta de paciente no
tiene perfil.

### `POST /api/consent`

Exige sesión con rol `patient`. Registra una aceptación nueva. La petición no
lleva cuerpo: el servidor graba la versión vigente y la referencia del documento
que la plataforma publica. El cliente no elige ninguna de las dos, así que no
puede registrar la aceptación de una versión o de un documento que la plataforma
nunca emitió. El historial es de solo agregar: aceptar no reescribe aceptaciones
anteriores.

Petición:

```http
POST /api/consent
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 201:

```json
{
    "id": "560be6e8-c9c1-4c23-a9fb-da1929be72cb"
}
```

Errores: 401 sin sesión válida, 403 si el rol no es `patient` o la cuenta de paciente no
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
cuenta de paciente no tiene perfil.

### Alcance de los datos clínicos

Estas rutas son las que alimentan los tableros. La tabla dice qué devuelve
cada cuenta:

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

El listado y la consulta de alertas siguen la matriz de `GET /api/readings`: el
paciente ve sus alertas, el médico las de sus pacientes vinculados, el cuidador
las de los autorizados con alcance `readings` y el administrador recibe 403. En
el listado de alertas `patient_id` es opcional: sin él, el médico recibe todas
las alertas de sus pacientes vinculados y el cuidador todas las de los
autorizados con alcance `readings`, en una sola línea de tiempo; con él, el
alcance se reduce a ese paciente y uno fuera de la cuenta responde 403. En la
consulta y en las transiciones el paciente se toma de la alerta y se comprueba
el mismo vínculo. Las tres transiciones exigen además el rol `physician`: un
paciente o un cuidador con acceso recibe 403 con `Permiso denegado` y la alerta
no cambia.

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
o si la cuenta es de paciente y no tiene perfil. Un médico o un cuidador no
tienen fila en `patient_profiles`: su directorio responde 200 con la página que
su alcance permite, que puede estar vacía.

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

Respuesta 200 real de la sesión del paciente del escenario de la alerta abierta
sobre una base recién sembrada:

```json
{
    "items": [
        {
            "id": "3aa34d4e-2d18-4620-abe0-6a528a781c2d",
            "patient_id": "7d39cdbb-9e5d-406b-a762-bcd5369d8834",
            "free_text": "mareo y dolor de cabeza desde la tarde",
            "mood": "ansioso",
            "recorded_at": "2026-11-07T21:30:00Z"
        }
    ],
    "total": 1
}
```

`free_text` y `mood` pueden ser `null` por separado. `patient_id` es el de la
cuenta del paciente.

La siembra de demostración deja ese síntoma, con texto y hora fijos respecto
del día de la siembra, y no lo duplica al volver a ejecutarse. Los demás
pacientes empiezan sin síntomas: su página es `{"items": [], "total": 0}`
hasta que registren alguno.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol es `admin`,
si el paciente no está en el alcance o si el médico o el cuidador omiten
`patient_id`.

### Alertas y validación humana

Las alertas nacen del motor de umbrales, que llega con un incremento posterior:
ninguna ruta de este contrato crea una alerta. Las rutas de esta sección listan,
leen y mueven una alerta existente. El listado y la consulta siguen la misma
resolución de alcance que las lecturas; las tres transiciones exigen además el
rol `physician`, porque mover una alerta es el acto clínico que la cierra. El
administrador recibe 403 en todas.

La máquina de estados es la única autoridad sobre una transición. El software no
cierra una alerta por su cuenta: cada cambio de estado lo firma una cuenta
autenticada, queda en la auditoría con la acción `alert.acknowledged`,
`alert.validated` o `alert.dismissed` y se confirma antes de responder.

| Estado actual  | Acción        | Estado siguiente |
| -------------- | ------------- | ---------------- |
| `open`         | `acknowledge` | `acknowledged`   |
| `open`         | `validate`    | `validated`      |
| `open`         | `dismiss`     | `dismissed`      |
| `acknowledged` | `validate`    | `validated`      |
| `acknowledged` | `dismiss`     | `dismissed`      |
| `validated`    | ninguna       | 409              |
| `dismissed`    | ninguna       | 409              |

Solo un médico puede ejecutar las acciones de la tabla. Un paciente o un
cuidador con acceso puede listar y leer la alerta, pero cualquier transición
responde 403 con `Permiso denegado` y no cambia el estado. El cliente debe
ocultar los botones de transición a esos roles en lugar de mostrarlos y recoger
el 403.

Cualquier otra combinación responde 409 con el estado actual en el mensaje. Este
es el cuerpo real de un intento de validar una alerta ya validada:

```json
{
    "detail": "La alerta está en estado 'validated' y no puede pasar al estado 'validated'"
}
```

`validate` escribe `validated_by` y `validated_at`. `dismiss` exige una `note` no
vacía: sin ella, o con solo espacios, responde 422 y no cambia la alerta.
`acknowledge` solo cambia el estado. La nota de las tres transiciones vive en el
detalle de auditoría y no sobrescribe `alerts.note`, que conserva la descripción
clínica con la que nació la alerta. Las tres transiciones responden 204, sin
cuerpo.

### `GET /api/alerts`

Exige sesión con rol `patient`, `physician` o `caregiver`. Es la bandeja de
alertas: sin `patient_id` devuelve todas las alertas visibles para la cuenta, de
la más reciente a la más antigua, con la envoltura y la paginación de la sección
de listados. El paciente ve las propias, el médico las de todos sus pacientes
vinculados y el cuidador las de todos los autorizados con alcance `readings`:
una sola petición y una sola línea de tiempo para la pantalla de inicio.

Parámetros:

- `patient_id` es opcional y es el identificador de la cuenta del paciente. Sin
  él la página abarca todo el alcance de la cuenta; con él se reduce a ese
  paciente y uno fuera del alcance responde 403.
- `status` es opcional y vale `open`, `acknowledged`, `validated` o `dismissed`.
- `severity` es opcional y vale `low`, `medium`, `high` o `critical`.
- `limit` y `offset` son los de la paginación general.

Un valor de `status` o `severity` fuera de esos conjuntos responde 422.

La lista está ordenada por `created_at` descendente en todos los pacientes, así
que la bandeja se lee como una sola línea de tiempo y no como un bloque por
paciente.

Petición:

```http
GET /api/alerts?limit=50&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 200 real de la sesión del paciente de demostración:

```json
{
    "items": [
        {
            "id": "da916e4c-4759-4e37-9594-ab64904adca7",
            "patient_id": "7d39cdbb-9e5d-406b-a762-bcd5369d8834",
            "type": "crisis_hipertensiva",
            "severity": "critical",
            "status": "open",
            "note": "Lecturas domiciliarias de 186/122 mmHg y 184/120 mmHg; pendiente de revisión médica.",
            "created_at": "2026-11-07T21:00:00Z",
            "validated_by": null,
            "validated_at": null
        }
    ],
    "total": 1
}
```

`patient_id` es el identificador de la cuenta del paciente, nunca el del perfil.
`type` es texto libre y la siembra usa `crisis_hipertensiva`. `validated_by` y
`validated_at` valen `null` mientras la alerta no esté validada; `note` conserva
la descripción clínica de la alerta y puede ser `null`. El motivo del descarte no
se escribe ahí: lo devuelve `GET /api/alerts/{alert_id}` en `dismissal_reason`, y
el listado no incluye ese campo.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol es `admin`
o si el `patient_id` indicado no está en el alcance; 422 si `status`, `severity`
o `limit` quedan fuera de rango.

### `GET /api/alerts/{alert_id}`

Exige sesión con rol `patient`, `physician` o `caregiver`. Devuelve una alerta
visible para la cuenta, con los mismos campos de un elemento del listado, sin la
envoltura y con dos campos adicionales: `validated_by_name` y
`dismissal_reason`. No se pagina.

Petición:

```http
GET /api/alerts/da916e4c-4759-4e37-9594-ab64904adca7
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...recortado
```

Respuesta 200 real de la sesión del paciente de demostración:

```json
{
    "id": "da916e4c-4759-4e37-9594-ab64904adca7",
    "patient_id": "7d39cdbb-9e5d-406b-a762-bcd5369d8834",
    "type": "crisis_hipertensiva",
    "severity": "critical",
    "status": "open",
    "note": "Lecturas domiciliarias de 186/122 mmHg y 184/120 mmHg; pendiente de revisión médica.",
    "created_at": "2026-11-07T21:00:00Z",
    "validated_by": null,
    "validated_at": null,
    "validated_by_name": null,
    "dismissal_reason": null
}
```

`validated_by_name` es el nombre de la cuenta que validó y vale `null` mientras
la alerta no esté validada; el cliente lo usa para mostrar quién la firmó sin
pedir el listado administrativo de cuentas. `dismissal_reason` vale `null`
mientras la alerta no esté descartada; en una alerta `dismissed` trae el motivo
del evento `alert.dismissed` más reciente de la auditoría, no el texto de
`note`, que conserva la descripción clínica. `GET /api/alerts` no devuelve
ninguno de los dos campos para no consultar la auditoría ni la cuenta una vez
por cada fila de la página.

Respuesta 200 real de una alerta descartada:

```json
{
    "id": "c8646730-68d7-4ff7-9f02-8c2f4846ccb1",
    "patient_id": "fa7a04d8-d882-4e47-b90e-34a68e4f4c91",
    "type": "crisis_hipertensiva",
    "severity": "high",
    "status": "dismissed",
    "note": null,
    "created_at": "2026-11-08T21:58:36.048776Z",
    "validated_by": null,
    "validated_at": null,
    "validated_by_name": null,
    "dismissal_reason": "Lectura mal tomada; se confirmó en consulta."
}
```

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol es `admin`
o si la alerta es de un paciente fuera del alcance; 404 con `La alerta no existe`
si el identificador no corresponde a ninguna alerta. El 403 es el mismo
`Permiso denegado` de cualquier otra negativa de alcance y no revela a quién
pertenece la alerta.

### `POST /api/alerts/{alert_id}/acknowledge`

Exige sesión con rol `physician` y una alerta en estado `open`. Acusa recibo y
la deja en `acknowledged`.

Petición real de la sesión del médico de demostración:

```json
{
    "note": "Paciente contactado; confirma la toma."
}
```

La `note` es opcional y viaja al detalle de auditoría; no se guarda en la
alerta. Respuesta 204, sin cuerpo.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol no es
`physician` (el administrador, un paciente o un cuidador) o si la alerta está
fuera del alcance; 404 con `La alerta no existe`; 409 si el
estado actual no admite la transición.

### `POST /api/alerts/{alert_id}/validate`

Exige sesión con rol `physician` y una alerta en estado `open` o
`acknowledged`. La valida y escribe la persona que la validó.

Petición real de la sesión del médico de demostración:

```json
{
    "note": "Confirmada en consulta; se ajusta el tratamiento."
}
```

La `note` es opcional y viaja al detalle de auditoría; no se guarda en la
alerta. Respuesta 204, sin cuerpo. La consulta posterior de la misma alerta
devuelve el estado y la persona que la firmó:

```json
{
    "id": "da916e4c-4759-4e37-9594-ab64904adca7",
    "patient_id": "7d39cdbb-9e5d-406b-a762-bcd5369d8834",
    "type": "crisis_hipertensiva",
    "severity": "critical",
    "status": "validated",
    "note": "Lecturas domiciliarias de 186/122 mmHg y 184/120 mmHg; pendiente de revisión médica.",
    "created_at": "2026-11-07T21:00:00Z",
    "validated_by": "1106cf54-2606-47f6-a368-cb15e834ca56",
    "validated_at": "2026-11-08T21:18:18.139814Z",
    "validated_by_name": "Julián Andrés Morales Vega",
    "dismissal_reason": null
}
```

`validated_by` es el identificador de la cuenta que validó y `validated_at` la
marca en UTC. `validated_by_name` es el nombre de esa cuenta, resuelto en la
misma consulta para que la pantalla del médico no tenga que pedir el listado
administrativo. Una alerta validada no vuelve a moverse: el intento responde 409
con el estado actual.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol no es
`physician` (el administrador, un paciente o un cuidador) o si la alerta está
fuera del alcance; 404 con `La alerta no existe`; 409 si el
estado actual no admite la transición.

### `POST /api/alerts/{alert_id}/dismiss`

Exige sesión con rol `physician` y una alerta en estado `open` o
`acknowledged`. La descarta con un motivo obligatorio.

Petición real de la sesión del médico de demostración:

```json
{
    "note": "Lectura mal tomada; se confirmó en consulta."
}
```

Sin `note`, o con una cadena de solo espacios, responde 422 con
`El descarte de la alerta necesita una nota` y no cambia la alerta. Respuesta
204, sin cuerpo. El motivo se registra en el detalle de auditoría; `note`
conserva la descripción clínica y no se sobrescribe.

Errores: 401 sin sesión válida; 403 con `Permiso denegado` si el rol no es
`physician` (el administrador, un paciente o un cuidador) o si la alerta está
fuera del alcance; 404 con `La alerta no existe`; 409 si el
estado actual no admite la transición; 422 si falta la nota.

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
`patient`, la cuenta de paciente no tiene perfil o `patient_id` no es el propio; 403 con
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
`patient` o la cuenta de paciente no tiene perfil; 403 con
`No hay consentimiento informado vigente` si falta la aceptación; 422 si el
síntoma está vacío. Sin consentimiento no se escribe la fila ni su auditoría.

Después de aceptar el consentimiento (ver `POST /api/consent`), las dos rutas de
escritura clínica quedan habilitadas. Si el paciente lo revoca, vuelven a
responder 403 con `No hay consentimiento informado vigente`.

## Ingesta desde dispositivos

Existe una ruta de escritura que no usa la sesión: `POST /api/ingest/readings`
recibe lecturas de un dispositivo autenticado con la clave compartida
`X-Device-Key`. La interfaz web no la llama: el navegador no tiene la clave y no
debe tenerla. El contrato completo, con los campos, la deduplicación por
paciente, dispositivo e instante y los dos almacenes, está en
`docs/api/ingesta.md`.

## Regenerar el contrato

Después de un cambio de rutas o de modelos, el backend regenera el archivo y lo
confirma:

```bash
make contract
```

La prueba de integración compara el archivo confirmado con el esquema que
genera la aplicación, de modo que un cambio sin regenerar el contrato falla en
la verificación.
