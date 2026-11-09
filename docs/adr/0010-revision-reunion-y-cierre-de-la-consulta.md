# ADR 0010: revisión, reunión y cierre de la consulta

- Estado: aceptado
- Fecha: 2026-11-09
- Ámbito: tabla `teleconsultations`, rutas de la consulta rápida
- Complementa: ADR 0006, ADR 0007 y ADR 0009

## Contexto

La consulta nacía en `pending` y el médico la cerraba de una vez, con el comentario,
el enlace de Meet y el formato. El paciente necesita decir si quiere una reunión o
solo comentarios, y el formato tiene que llegar después de la reunión.

## Decisión

Una columna `wants_meet BOOLEAN NOT NULL DEFAULT FALSE` en `teleconsultations`, en la
migración `0008_consultation_flow.sql`. El paciente la marca al enviar. La columna
`urgent` se conserva y deja de recibirse: el formulario ya no pregunta si es urgente.

El estado de la consulta rápida usa tres valores:

- `in_review`: acaba de enviarse. En la interfaz, «En revisión».
- `pending`: el médico envió el enlace de Meet. En la interfaz, «Pendiente».
- `completed`: el médico envió el formato y el comentario. En la interfaz, «Completado».

`POST /api/consultations/{id}/meet` solo vale cuando `wants_meet` es verdadero y el
estado es `in_review`. Pasa la consulta a `pending`. `POST /api/consultations/{id}/complete`
guarda el formato y el comentario. Si el paciente pidió Meet, solo vale desde `pending`.
Si pidió solo comentarios, vale desde `in_review` y la consulta no pasa por la reunión.

Las filas que estaban en `pending` quedan en `in_review`. Las que estaban en `answered`
quedan en `completed`.

## Consecuencias

Enviar el formato antes del enlace, o un enlace cuando el paciente no lo pidió,
responde 409 y no cambia la consulta. La auditoría registra `consultation.meet_sent` y
`consultation.completed` sin los textos.
