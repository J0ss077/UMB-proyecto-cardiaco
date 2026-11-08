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
  el cliente las presenta en la zona horaria de quien usa la aplicación. Hoy
  ninguna respuesta existente devuelve una.
- Los identificadores son UUID en texto, por ejemplo
  `bf652215-8ac5-4c95-b884-a293cc1477af`.

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

| Código | Cuándo                                                                 | `detail`                                                                 |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 200    | Petición atendida                                                      | No aplica                                                                |
| 201    | Recurso creado                                                         | No aplica                                                                |
| 204    | Operación sin cuerpo de respuesta                                      | No hay cuerpo                                                            |
| 401    | Sin sesión, token inválido, cuenta inactiva o credenciales incorrectas | `Sesión inválida o expirada` o `Credenciales inválidas`                  |
| 403    | Sesión válida con un rol que no permite la ruta                        | `Permiso denegado`                                                       |
| 404    | La cuenta indicada no existe                                           | `La cuenta no existe`                                                    |
| 409    | Correo ya registrado o desactivación de la propia cuenta               | `El correo ya está registrado` o `No puedes desactivar tu propia cuenta` |
| 422    | Rol desconocido, cuerpo inválido o `limit` fuera de rango              | Un mensaje o una lista de errores de validación                          |
| 500    | Error no previsto                                                      | Forma no garantizada; no se muestra al usuario                           |

Un 403 también aparece cuando la cuenta es de paciente pero no tiene perfil:
esa inconsistencia no se anuncia con un código distinto.

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

## Regenerar el contrato

Después de un cambio de rutas o de modelos, el backend regenera el archivo y lo
confirma:

```bash
make contract
```

La prueba de integración compara el archivo confirmado con el esquema que
genera la aplicación, de modo que un cambio sin regenerar el contrato falla en
la verificación.
