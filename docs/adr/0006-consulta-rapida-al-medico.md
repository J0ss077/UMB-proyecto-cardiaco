# ADR 0006: consulta rápida al médico sobre `teleconsultations`

- Estado: aceptado
- Fecha: 2026-11-09
- Ámbito: modelo relacional, tabla `teleconsultations`, rutas `/api/consultations`

## Contexto

La pantalla de ayuda médica permite que el paciente le escriba a su médico, adjunte su última
lectura y vea la respuesta. La tabla `teleconsultations` ya existe, con modalidad `sync` o
`async`, pero no guarda un mensaje, una respuesta ni la fecha de envío. El modelo relacional
tiene dieciséis tablas y una necesidad nueva se resuelve dentro de ellas.

## Decisión

Se usa la modalidad `async` de `teleconsultations` para la consulta rápida y se añaden cinco
columnas en la migración `0004_consultation_messages.sql`:

- `message TEXT`: el mensaje del paciente.
- `response TEXT`: la respuesta del médico, nula mientras esté pendiente.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`: cuándo se envió.
- `responded_at TIMESTAMPTZ`: cuándo se respondió.
- `reading_id UUID REFERENCES readings(id) ON DELETE SET NULL`: la última lectura válida al
  enviar. Si la lectura se borra, la consulta se conserva sin ella.

El estado de la consulta rápida es `pending` o `answered`.

Rutas, todas con sesión:

- `POST /api/consultations` (paciente): crea la consulta. Exige consentimiento informado vigente.
  La dirige al médico que lleva más tiempo vinculado; sin médico responde 409. Adjunta la última
  lectura válida del paciente.
- `GET /api/consultations` (paciente o médico): el paciente ve las propias y el médico las que le
  llegan. No exige consentimiento. Acepta `patient_id`, `status`, `limit` y `offset`.
- `POST /api/consultations/{id}/respond` (médico): responde una consulta pendiente que le llegó.
  Una ya respondida responde 409.

El cuidador y el administrador reciben 403.

## Por qué

- Reutiliza una tabla que el manual ya declara para la teleconsulta (RF-24) en lugar de crear la
  decimoséptima.
- Escribir como paciente es un dato clínico nuevo, así que exige consentimiento vigente, igual que
  las lecturas y los síntomas. Leer el historial no lo exige (ADR 0003).
- La respuesta del médico no exige consentimiento: es la continuidad de la atención de una
  consulta que el paciente ya envió, como las transiciones de las alertas.
- La auditoría registra `consultation.created` y `consultation.answered` con la consulta y el
  actor, nunca el texto del mensaje ni de la respuesta.

## Alternativas consideradas

### Una tabla de mensajes

Permitiría conversaciones con varios mensajes, pero es la decimoséptima tabla y el diseño solo
contempla un mensaje y una respuesta. Si más adelante hace falta un hilo, esta decisión se revisa.

### Reutilizar `notes` para el mensaje

`notes` queda libre para las notas de una teleconsulta agendada, que es otro uso. Mezclar el
mensaje del paciente con ellas dejaría el campo con dos significados.

## Consecuencias

- La consulta rápida no sustituye una teleconsulta agendada: `scheduled_at` queda nulo y no hay
  videollamada.
- Un paciente con varios médicos escribe siempre al más antiguo; elegir destinatario queda para un
  incremento posterior.
- Los mensajes son datos clínicos y la desactivación de la cuenta los conserva, igual que las
  lecturas.
