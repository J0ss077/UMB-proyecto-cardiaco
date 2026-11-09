# ADR 0007: datos estructurados y destinatario de la consulta rápida

- Estado: aceptado
- Fecha: 2026-11-09
- Ámbito: modelo relacional, tabla `teleconsultations`, rutas `/api/consultations`
- Complementa: ADR 0006

## Contexto

La consulta rápida del ADR 0006 llevaba un mensaje libre y la última lectura, y siempre iba al
médico que lleva más tiempo vinculado. Un paciente con varios médicos no podía elegir, y el médico
recibía poco contexto para responder.

## Decisión

Cinco columnas más en `teleconsultations`, en la migración `0005_consultation_details.sql`:

- `reason TEXT`: motivo, de una lista fija: `high_pressure`, `dizziness_headache`,
  `chest_pain_or_breathing`, `medication`, `other`.
- `onset TEXT`: desde cuándo, de una lista fija: `today`, `since_yesterday`, `few_days`,
  `over_a_week`.
- `medications TEXT`: medicamentos que el paciente dice tomar, opcional, hasta 500 caracteres.
- `urgent BOOLEAN NOT NULL DEFAULT FALSE`: si el paciente la marca urgente.
- `contact_phone TEXT`: teléfono que el paciente decide compartir.

La aplicación valida las dos listas fijas; la base solo guarda texto. El motivo y el desde cuándo
son obligatorios en una consulta nueva y quedan nulos en las anteriores a la migración.

Cambios en las rutas:

- `GET /api/consultations/recipients` (paciente) devuelve los médicos vinculados y activos.
- `POST /api/consultations` acepta `physician_id`, que debe ser uno de los vinculados: cualquier
  otra cuenta responde 403 con el mismo mensaje que un paciente fuera de alcance. Sin él, la
  consulta va al médico más antiguo.
- `share_phone: true` copia el teléfono del perfil a `contact_phone`. El paciente nunca envía el
  número, así que no puede compartir uno distinto del suyo. Sin teléfono en el perfil responde 409.

La desactivación de la cuenta vacía `contact_phone` y conserva el resto de la consulta, que es dato
clínico.

## Por qué

- Las listas fijas dan al médico datos comparables y permiten ordenar o filtrar más adelante. Se
  validan en la aplicación, igual que los rangos fisiológicos.
- El teléfono se copia del perfil y no se pide de nuevo: un solo lugar donde corregirlo y ninguna
  forma de enviar un número ajeno. Es un dato que identifica a la persona, por eso la
  desactivación lo vacía.
- La auditoría sigue sin guardar texto: los medicamentos y el teléfono son datos de salud y
  personales.

## Alternativas consideradas

### Una tabla de datos de la consulta

Sería la decimoséptima tabla. Son campos de una sola consulta, no una relación.

### Aceptar el teléfono en la petición

Evita leer el perfil, pero permitiría compartir un número que no es del paciente y duplicaría su
captura.

## Consecuencias

- La respuesta de una consulta anterior a la migración trae `reason`, `onset` y `contact_phone`
  nulos, y el cliente debe tolerarlo.
- El médico ve el teléfono solo de las consultas que el paciente decidió compartir; el perfil del
  paciente sigue sin ser accesible para el médico.
