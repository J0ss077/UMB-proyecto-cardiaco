-- Perfil del personal: médico, cuidador y administrador.
--
-- Cuatro columnas nullable en users, dentro de las dieciséis tablas: teléfono y
-- foto de perfil para cualquier rol del personal, y registro profesional y
-- especialidad que solo usa el médico. La aplicación valida el formato, el rol
-- que puede fijar cada dato y el tamaño de la foto; la base solo guarda texto.
-- La justificación está en docs/adr/0008-perfil-del-personal-en-la-cuenta.md.
--
-- La desactivación de la cuenta las vacía.

ALTER TABLE users
    ADD COLUMN phone TEXT,
    ADD COLUMN avatar TEXT,
    ADD COLUMN license_number TEXT,
    ADD COLUMN specialty TEXT;
