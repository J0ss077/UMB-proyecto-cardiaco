# ADR 0011: cambio de contraseña con aprobación del administrador

- Estado: aceptado
- Fecha: 2026-11-09
- Ámbito: modelo relacional, tabla `users`, rutas `/api/account/password-change` y `/api/admin/password-requests`

## Contexto

El médico, el cuidador y el administrador deben poder cambiar su contraseña. Como estas cuentas abren
datos clínicos o gobiernan el sistema, el cambio del médico y del cuidador lo aprueba un
administrador. El administrador cambia la suya sin aprobación, porque no hay quien la apruebe sin
dejar la cuenta sin salida cuando existe un solo administrador. El modelo tiene dieciséis tablas que
no se amplían.

## Decisión

Dos columnas nullable en `users`, en la migración `0009_password_change_request.sql`:
`pending_password_hash` y `password_change_requested_at`. Hay a lo sumo una solicitud por cuenta; una
nueva reemplaza a la anterior.

- La persona envía la contraseña actual y la nueva (8 a 128 caracteres y distinta de la actual). Con
  la actual incorrecta responde 400. La nueva se guarda solo como hash; la contraseña vigente sigue
  valiendo hasta la aprobación.
- Un administrador lista las solicitudes y las aprueba o las rechaza. Aprobar copia el hash a
  `password_hash`, vacía la solicitud y revoca los refrescos de la cuenta. Rechazar solo vacía la
  solicitud. Nadie decide su propia solicitud.
- El administrador que cambia la suya la cambia al momento y se le cierran las sesiones.
- La persona puede retirar su solicitud pendiente.
- La auditoría registra `password.change_requested`, `password.change_approved`,
  `password.change_rejected`, `password.change_cancelled` y `password.changed`, sin contraseñas ni
  hashes. La desactivación de la cuenta vacía la solicitud.
- El paciente queda fuera de este flujo.

## Consecuencias

La contraseña pedida queda cifrada en la base mientras espera. Un administrador aprueba sin conocerla.
Con un solo administrador de demostración, la solicitud de otro administrador no existe: cambia al
momento. Un administrador comprometido podría aprobar solicitudes ajenas; el rastro lo deja
registrado.
