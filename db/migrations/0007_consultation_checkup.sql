-- Formato de chequeo y enlace de Meet que el médico escribe al responder.
--
-- Cinco columnas en teleconsultations, dentro de las dieciséis tablas:
--
--   meet_url           enlace https de Meet que el médico envía con la respuesta
--   checkup_general    cómo está el paciente, con las palabras del médico
--   checkup_pressure   la presión que el médico consigna a mano
--   checkup_symptoms   los síntomas que el médico consigna a mano
--   checkup_conduct    la conducta del chequeo, con las palabras del médico
--
-- Quedan nulas en las consultas anteriores a esta migración. La justificación
-- está en docs/adr/0009-formato-de-chequeo-y-enlace-de-meet.md.

ALTER TABLE teleconsultations
    ADD COLUMN meet_url TEXT,
    ADD COLUMN checkup_general TEXT,
    ADD COLUMN checkup_pressure TEXT,
    ADD COLUMN checkup_symptoms TEXT,
    ADD COLUMN checkup_conduct TEXT;
