# Ingesta de lecturas desde dispositivos

Esta ruta recibe la medición que un dispositivo de presión arterial envía por su
cuenta, sin una persona frente a la aplicación. Es el contrato que debe
implementar un adaptador de dispositivo real. La interfaz web no la usa: el
navegador no tiene la clave compartida y no debe tenerla.

El resto del contrato HTTP está en `docs/api/api-para-el-frontend.md` y el
esquema generado en `docs/api/openapi.json`. Este documento describe solo lo que
necesita quien escribe el adaptador.

## Autenticación

El dispositivo se autentica con una clave compartida por instalación, no con una
sesión de usuario. La clave viaja en el encabezado `X-Device-Key` y el servidor
la compara con `HTA_DEVICE_KEY` usando `secrets.compare_digest`.

- Sin `HTA_DEVICE_KEY` configurada, la ruta responde 503 con
  `La ingesta de dispositivos no está configurada` y no escribe nada. Una
  instalación que olvidó la variable queda cerrada, nunca abierta.
- Con la clave configurada, una cabecera ausente o distinta responde 401 con
  `Clave de dispositivo inválida`. El mensaje no distingue los dos casos.
- La clave no se publica en el navegador, no se versiona y se rota cambiando
  `HTA_DEVICE_KEY` en `.env` y reiniciando el servicio. Todos los dispositivos
  de esa instalación comparten la clave; el contrato no tiene una tabla de
  dispositivos ni una clave por aparato.

## Petición

`POST /api/ingest/readings` recibe un objeto JSON en UTF-8. La ruta no admite
`Authorization: Bearer` y no acepta campos que el contrato no defina: un campo
desconocido responde 422.

```json
{
    "device_id": "sim-1",
    "patient_id": "e6f9e55e-65dc-4255-a1ee-a785fc8490e0",
    "systolic": 130,
    "diastolic": 85,
    "heart_rate": 72,
    "measured_at": "2026-11-08T10:00:00Z"
}
```

Campos:

- `device_id` es una cadena no vacía que identifica al aparato. Forma parte de
  la clave de deduplicación y se guarda en la lectura relacional.
- `patient_id` es obligatorio y es el identificador de la cuenta del paciente,
  el mismo que publica el resto de la API. El identificador de
  `patient_profiles` no sale del servidor. Una cuenta inexistente o que no es
  de paciente responde 422 con `El paciente indicado no existe`.
- `systolic` y `diastolic` son enteros obligatorios. No llevan límite en el
  cuerpo: el servidor aplica la misma plausibilidad fisiológica que el alta
  manual. Un valor imposible no se rechaza, se guarda con
  `validation_status` en `out_of_range`.
- `heart_rate` es opcional.
- `measured_at` es opcional. Sin él se registra el instante de recepción. Con él
  debe ser ISO 8601 con desplazamiento horario y no puede estar en el futuro;
  el servidor lo normaliza a UTC. Una marca sin desplazamiento o futura responde
  422 con el mismo mensaje que el alta manual.

El dispositivo debe enviar siempre `measured_at`: si lo omite, cada reintento
recibe una marca distinta y el servidor no puede reconocerlo como repetido.

## Respuesta

La primera recepción responde 201 con la lectura guardada:

```json
{
    "id": "fbdb6605-cecd-4bb8-a114-f2af36b53f12",
    "patient_id": "e6f9e55e-65dc-4255-a1ee-a785fc8490e0",
    "systolic": 130,
    "diastolic": 85,
    "heart_rate": null,
    "source": "device",
    "measured_at": "2026-11-08T10:00:00Z",
    "validation_status": "valid"
}
```

El cuerpo es el mismo que publica el alta manual, con `source` siempre
`device`. `patient_id` es el de la cuenta de usuario. `validation_status` vale
`valid` o `out_of_range`.

Un reintento de la misma pareja `device_id` y `measured_at` responde 200 con el
mismo cuerpo, incluido el mismo `id`, y no crea una lectura nueva. El adaptador
puede tratar 200 como éxito y dejar de reintentar.

## Deduplicación

La clave de deduplicación es la pareja `device_id` y `measured_at`, con la marca
ya normalizada a UTC. El servidor:

1. Inserta el documento crudo en `raw_readings` con `$setOnInsert`, de modo que
   un reintento no reescribe la primera recepción.
2. Busca una lectura con `source = 'device'` para esa pareja. Si existe,
   responde 200 y no inserta.
3. Si no existe, inserta la lectura con `source = 'device'`, audita
   `reading.ingested` y confirma la transacción.

La comprobación del paso 2 vive en la aplicación: la tabla `readings` no tiene
una restricción única sobre la pareja y este incremento no puede añadir una
migración. Dos peticiones simultáneas con la misma pareja pueden ver las dos que
no existe y duplicar la fila. La ventana es estrecha y se acepta mientras la
restricción no exista; cerrarla exige un índice único parcial sobre
`(device_id, measured_at)` para las filas de dispositivo, que es un cambio de
esquema de un incremento posterior. El reintento secuencial, que es el que
producen los dispositivos reales, sí queda cubierto.

Un reintento con la misma pareja pero valores distintos devuelve la lectura
original, no la nueva: el dispositivo no debe corregir una medición reenviándola
con otra cifra.

## Los dos almacenes

- `raw_readings` guarda el mensaje recibido con `patient_id`, `device_id`,
  `systolic`, `diastolic`, `heart_rate`, `measured_at` y `received_at`, la marca
  de recepción del servidor. Es el registro de lo que el dispositivo envió.
- `readings` guarda la lectura validada con `source = 'device'`, `device_id`,
  la marca normalizada y el estado de plausibilidad. La lectura y su auditoría
  se confirman en un solo `commit`.

El documento crudo se escribe primero. Si la escritura en PostgreSQL falla, el
documento crudo permanece: perder el mensaje original es peor que dejar un
documento huérfano. Reenviar la misma lectura completa la fila relacional sin
duplicar el documento crudo. Si MongoDB no responde, la petición falla completa
y no se escribe la lectura relacional: el dispositivo reintenta y no queda una
lectura sin su mensaje crudo.

La auditoría del alta es `reading.ingested`, con actor nulo porque quien escribe
es el dispositivo y no una persona, y con `device_id` en el detalle. El
reintento no repite la auditoría.

## Errores

- 401 con `Clave de dispositivo inválida` si falta `X-Device-Key` o no coincide.
- 403 con `No hay consentimiento informado vigente` si el paciente no tiene una
  aceptación vigente. Sin consentimiento no se escribe ni el documento crudo.
- 422 con `El paciente indicado no existe` si el paciente no tiene cuenta de
  paciente, o con un mensaje de validación si el cuerpo no tiene la forma
  esperada, la fecha es futura o no trae desplazamiento horario.
- 503 con `La ingesta de dispositivos no está configurada` si el servidor no
  tiene `HTA_DEVICE_KEY`.

Ningún rechazo escribe en los dos almacenes.

## Simulador

`iot/simulator.py` es una herramienta de demostración, no un protocolo de
dispositivo. Envía una lectura por segundo durante los minutos indicados:

```bash
HTA_DEVICE_KEY=clave-de-prueba python iot/simulator.py \
    --patient-id e6f9e55e-65dc-4255-a1ee-a785fc8490e0 --minutes 1
```

Los valores también se pueden dejar en el entorno: `HTA_API_BASE_URL` o
`API_BASE_URL` para la URL base (por omisión `http://localhost:8000`),
`HTA_DEVICE_KEY` para la clave y `HTA_PATIENT_ID` para el paciente.
`--device-id` cambia el identificador del aparato simulado. El programa
devuelve 0 si todas las lecturas fueron aceptadas y 1 ante un rechazo o un
error de red.
