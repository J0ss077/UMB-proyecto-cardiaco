# ADR 0009: formato de chequeo y enlace de Meet en la respuesta

- Estado: aceptado
- Fecha: 2026-11-09
- Ámbito: modelo relacional, tabla `teleconsultations`, ruta `POST /api/consultations/{id}/respond`
- Complementa: ADR 0006 y ADR 0007

## Contexto

La respuesta del médico era un solo texto. El paciente recibía un PDF armado en el
navegador con sus lecturas, y ese archivo se parecía al historial de automonitoreo.
El médico necesita escribir el chequeo él mismo y, al enviar el comentario, mandar
también el enlace de la reunión.

## Decisión

Cinco columnas más en `teleconsultations`, en la migración `0007_consultation_checkup.sql`:

- `meet_url TEXT`: enlace `https` de `meet.google.com`, obligatorio al responder.
- `checkup_general TEXT`: cómo está el paciente, texto del médico.
- `checkup_pressure TEXT`: la presión que el médico consigna.
- `checkup_symptoms TEXT`: los síntomas que el médico consigna.
- `checkup_conduct TEXT`: la conducta del chequeo.

Las cinco son obligatorias en `POST /api/consultations/{id}/respond` y quedan nulas en
las consultas anteriores. La aplicación valida el enlace y que ningún texto quede
vacío; la base solo guarda texto. El PDF del paciente se arma con estos textos y con
el comentario. No copia el historial de lecturas.

La desactivación de la cuenta sigue vaciando `contact_phone` y conserva el chequeo y
el enlace, igual que conserva la respuesta.

## Consecuencias

Responder sin el formato o sin un enlace de Meet responde 422 y no cambia la consulta.
El historial reciente que el médico ve mientras la consulta está pendiente sale de
las rutas de lecturas y síntomas que ya existen; no se guarda otra copia.

ADR 0010 partió ese cierre. El enlace va por `POST /api/consultations/{id}/meet` y el
formato, por `POST /api/consultations/{id}/complete`.
