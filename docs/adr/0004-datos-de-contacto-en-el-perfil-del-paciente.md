# ADR 0004: datos de contacto en el perfil del paciente

> Nota de vigencia: la parte que declara que no hay foto de perfil quedó
> superada por el ADR 0005 desde el 2026-11-09. El resto de esta decisión sigue
> vigente.

- Estado: aceptado
- Fecha: 2026-11-09
- Ámbito: modelo relacional, tabla `patient_profiles`, rutas `GET` y `PATCH /api/profile`

## Contexto

La pantalla de perfil del paciente muestra y permite editar un teléfono y un contacto de
confianza con teléfono y correo, y muestra el documento de identidad. La tabla
`patient_profiles` tenía fecha de nacimiento, sexo, fecha de diagnóstico, talla y peso, pero
ninguna columna para esos cuatro datos. El modelo relacional tiene dieciséis tablas y ese
número es parte del contrato con el manual técnico: una necesidad nueva se resuelve dentro de
las dieciséis.

## Decisión

Se añaden cuatro columnas nullable de tipo `TEXT` a `patient_profiles`, en la migración
`0002_patient_contact.sql`:

- `document_number`: documento de identidad.
- `phone`: teléfono del paciente.
- `trusted_contact_phone`: teléfono del contacto de confianza.
- `trusted_contact_email`: correo del contacto de confianza.

El correo de la cuenta sigue viviendo en `users.email`, que identifica la sesión.

Dos rutas exigen rol de paciente y resuelven el perfil desde la sesión, sin recibir un
identificador:

- `GET /api/profile` devuelve el perfil.
- `PATCH /api/profile` cambia, de forma parcial, el nombre completo, el teléfono y el contacto
  de confianza. El correo, la fecha de nacimiento, el sexo, el documento y la fecha de
  diagnóstico no se pueden cambiar desde ahí y se rechazan con 422.

El formato de teléfono y correo se valida en la aplicación, no en la base de datos, igual que
los rangos fisiológicos. La actualización se audita con la acción `profile.updated` y el
detalle nombra los campos cambiados, nunca sus valores.

La desactivación de una cuenta vacía las cuatro columnas nuevas junto con la seudonimización de
`users`: son datos que identifican a la persona.

## Por qué

- Caben en las dieciséis tablas: una tabla de contactos sería la decimoséptima, y el paciente
  tiene como máximo un contacto de confianza en el diseño.
- Son datos personales, no clínicos, así que no exigen consentimiento informado vigente: un
  paciente que revocó el consentimiento sigue pudiendo corregir su teléfono.
- Auditar los nombres de los campos y no los valores evita que el rastro de auditoría, que no
  se borra, conserve un dato que la desactivación sí debe olvidar.

## Alternativas consideradas

### Una tabla de contactos

Permitiría varios contactos por paciente, pero rompe el contrato de dieciséis tablas y el
diseño solo contempla uno. Si más adelante hacen falta varios, esta decisión se revisa.

### Guardar los datos solo en el navegador

Evita la migración, pero los datos no llegarían al médico ni sobrevivirían a un cambio de
equipo, y datos personales quedarían en un almacenamiento local sin auditoría.

## Consecuencias

- Ninguna ruta escribe todavía el documento, el sexo ni la fecha de diagnóstico: los carga la
  siembra de demostración. Registrarlos desde la historia clínica queda para un incremento
  posterior.
- El correo de la cuenta no se edita desde el perfil: cambiarlo exige decidir la verificación
  del nuevo correo y la rotación de sesiones.
- No hay foto de perfil: no existe almacenamiento de archivos.
