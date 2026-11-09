-- Foto de perfil del paciente.
--
-- Una columna nullable en patient_profiles, dentro de las dieciséis tablas: la
-- imagen ya recortada y reducida por el cliente, guardada como URL de datos
-- (data:image/...;base64,...). La aplicación valida el tipo, el contenido y el
-- tamaño; la base solo guarda texto. La justificación está en
-- docs/adr/0005-foto-de-perfil-como-imagen-pequena-en-la-base.md.
--
-- La desactivación de la cuenta la vacía.

ALTER TABLE patient_profiles
    ADD COLUMN avatar TEXT;
