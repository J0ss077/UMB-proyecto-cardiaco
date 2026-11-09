-- Solicitud de cambio de contraseña del personal.
--
-- Dos columnas nullable en users, dentro de las dieciséis tablas: el hash de la
-- contraseña nueva que el médico o el cuidador pidió, y el instante de la
-- solicitud. Hay a lo sumo una solicitud por cuenta; una nueva reemplaza a la
-- anterior. Un administrador la aprueba (el hash pasa a password_hash) o la
-- rechaza (se vacían las dos columnas). La contraseña vigente no cambia hasta la
-- aprobación. La justificación está en
-- docs/adr/0011-cambio-de-contrasena-con-aprobacion-del-administrador.md.
--
-- La desactivación de la cuenta las vacía.

ALTER TABLE users
    ADD COLUMN pending_password_hash TEXT,
    ADD COLUMN password_change_requested_at TIMESTAMPTZ;
