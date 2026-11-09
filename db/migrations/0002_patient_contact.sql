-- Datos de contacto y contacto de confianza del paciente.
--
-- Cuatro columnas nullable en patient_profiles, dentro de las dieciséis tablas
-- del modelo: el documento de identidad, el teléfono y el teléfono y el correo
-- del contacto de confianza. La justificación está en
-- docs/adr/0004-datos-de-contacto-en-el-perfil-del-paciente.md.
--
-- Son texto sin restricción: el formato se valida en la aplicación, igual que
-- los rangos fisiológicos. La desactivación de la cuenta las vacía.

ALTER TABLE patient_profiles
    ADD COLUMN document_number TEXT,
    ADD COLUMN phone TEXT,
    ADD COLUMN trusted_contact_phone TEXT,
    ADD COLUMN trusted_contact_email TEXT;
