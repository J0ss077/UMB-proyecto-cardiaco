# ADR 0008: perfil del personal en la cuenta

- Estado: aceptado
- Fecha: 2026-11-09
- Ámbito: modelo relacional, tabla `users`, rutas `GET` y `PATCH /api/staff/profile`

## Contexto

El médico, el cuidador y el administrador necesitan una pantalla de perfil: nombre, teléfono y foto
para todos, y registro profesional y especialidad para el médico. El modelo relacional tiene
dieciséis tablas que no se amplían, y esos datos identifican a la persona, así que deben poder
olvidarse cuando se desactiva la cuenta.

## Decisión

Se añaden cuatro columnas nullable a `users`, en la migración `0006_staff_profile.sql`: `phone`,
`avatar`, `license_number` y `specialty`. No se crea una tabla de perfil del personal.

- `GET` y `PATCH /api/staff/profile` resuelven la cuenta desde la sesión y aceptan los roles
  `physician`, `caregiver` y `admin`; el paciente conserva `/api/profile`.
- La foto y el teléfono usan las mismas validaciones del paciente (ADR 0005).
- `license_number` y `specialty` solo los fija un médico; los demás roles reciben 422.
- La auditoría `staff.profile_updated` nombra los campos y nunca guarda sus valores.
- La desactivación vacía las cuatro columnas.

## Alternativas descartadas

- Una tabla `staff_profiles`: sería la decimoséptima tabla.
- Reutilizar `patient_profiles`: mezcla datos del paciente con los del personal y exigiría filas vacías.

## Consecuencias

Las columnas de `users` son opcionales y vacías para el paciente; el paciente no las usa. El registro
profesional no se verifica contra ninguna fuente externa: es un dato declarado por la persona.
