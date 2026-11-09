-- Consulta rápida del paciente al médico.
--
-- La tabla teleconsultations ya existe; la modalidad asíncrona se usa para un
-- mensaje del paciente que el médico vinculado responde. Cinco columnas
-- nuevas, dentro de las dieciséis tablas:
--
--   message       texto que escribe el paciente
--   response      respuesta del médico, nula mientras esté pendiente
--   created_at    cuándo se envió
--   responded_at  cuándo se respondió
--   reading_id    última lectura válida del paciente al enviar, que viaja con
--                 la solicitud; se conserva nula si la lectura se borra
--
-- La justificación está en docs/adr/0006-consulta-rapida-al-medico.md.

ALTER TABLE teleconsultations
    ADD COLUMN message TEXT,
    ADD COLUMN response TEXT,
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN responded_at TIMESTAMPTZ,
    ADD COLUMN reading_id UUID REFERENCES readings(id) ON DELETE SET NULL;

CREATE INDEX idx_teleconsultations_patient_created
    ON teleconsultations (patient_id, created_at DESC);
CREATE INDEX idx_teleconsultations_physician_status
    ON teleconsultations (physician_id, status);
