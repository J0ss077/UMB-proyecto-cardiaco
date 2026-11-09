-- Datos estructurados de la consulta rápida.
--
-- Cinco columnas en teleconsultations, dentro de las dieciséis tablas:
--
--   reason         motivo de la consulta, de una lista fija que valida la aplicación
--   onset          desde cuándo, de una lista fija que valida la aplicación
--   medications    medicamentos que el paciente dice tomar, texto libre opcional
--   urgent         si el paciente la marca como urgente
--   contact_phone  teléfono que el paciente decide compartir; copia del de su
--                  perfil, nula si no lo comparte
--
-- Las filas anteriores a esta migración quedan con reason, onset y
-- contact_phone nulos y urgent en falso. La justificación está en
-- docs/adr/0007-datos-y-destinatario-de-la-consulta.md.

ALTER TABLE teleconsultations
    ADD COLUMN reason TEXT,
    ADD COLUMN onset TEXT,
    ADD COLUMN medications TEXT,
    ADD COLUMN urgent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN contact_phone TEXT;
