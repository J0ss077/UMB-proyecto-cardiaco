# ADR 0012: autorización de cuidadores por el médico vinculado

- Estado: aceptado
- Fecha: 2026-11-10
- Ámbito: tabla `caregiver_links`, rutas `/api/patients/{patient_id}/caregivers` y `/api/admin/links`

## Contexto

Hasta hoy, el administrador era el único que podía crear una fila de
`caregiver_links` con alcance clínico, y podía cambiar el alcance y revocarla.
El diccionario de datos decía que el paciente autorizaba, pero el paciente no
tenía ninguna ruta para hacerlo, verlo ni retirarlo. La autorización clínica
quedaba en manos de quien gobierna las cuentas y no de quien responde por la
atención.

La decisión humana es que el médico vinculado al paciente autoriza, fija el
alcance y revoca al cuidador. El paciente debe poder ver quién tiene acceso y
con qué alcance, pero no puede revocarlo. El administrador deja de conceder
alcance clínico: conserva las cuentas y la asignación de médico, y puede leer el
directorio de vínculos para supervisión.

## Decisión

- El médico que está en `patient_physician` para el paciente es el único que
  crea, cambia el alcance y revoca un vínculo de cuidador. El alcance es
  `readings` o `minimal`; cualquier otro valor responde 422.
- El paciente ve la lista de sus cuidadores con nombre, correo, alcance y fecha.
  Las tres mutaciones le responden 403.
- El administrador conserva `GET /api/admin/links` para supervisión, sin datos
  clínicos. Las rutas `POST`, `PATCH` y `DELETE` de `/api/admin/caregivers`
  dejan de existir.
- Cada alta, cambio de alcance y revocación se audita con el actor, el vínculo y
  el alcance (`caregiver.linked`, `caregiver.scope_changed`,
  `caregiver.unlinked`) y se confirma antes de responder.

## Por qué el médico y no el paciente ni el administrador

El médico es quien responde por la atención y quien conoce si el cuidador
necesita leer las lecturas o solo acompañar. Dejar la autorización en el
paciente suena más respetuoso con su autonomía, pero en la práctica permite que
una persona cancele el acceso de quien la cuida por conveniencia o por un
conflicto familiar, y que quede sin vigilancia una condición que sí la necesita.
El administrador, en cambio, no tiene juicio clínico: su papel es sostener las
cuentas, no decidir quién ve una historia. La autoría clínica concentra la
decisión en quien puede responder por ella.

## La tensión con el derecho a revocar la autorización

El derecho del titular a retirar una autorización no se elimina: se reconoce y
se difiere. El paciente no puede revocar por sí mismo, pero la decisión no es
irreversible ni silenciosa: puede pedir la revocación a su médico, ve el vínculo
mientras exista y el rastro conserva quién lo creó y quién lo retiró. La
plataforma prefiere una revocación clínicamente mediada a una revocación
instantánea que pueda dejar a una persona sin acompañamiento. Esta es una
decisión de producto, no una lectura de la ley, y queda declarada como tal.

## Las tres garantías

1. **Transparencia.** El paciente ve la lista completa de cuidadores, su alcance
   y la fecha de la autorización. No hay accesos ocultos.
2. **Autoría clínica.** Solo el médico vinculado crea, cambia y revoca. La
   decisión tiene un responsable identificable y no se diluye en la
   administración.
3. **Auditoría.** Las tres mutaciones dejan actor, vínculo y alcance en
   `audit_logs`; el administrador puede leerlas sin ver datos clínicos.

## Pendiente

- Una ruta formal para que el paciente **pida** la revocación, con su motivo y
  el estado de la solicitud, sin que la petición ejecute el borrado por sí
  misma. Hasta que exista, el pedido se hace por los canales de atención y la
  revocación la firma el médico.
- Revisar si el paciente debe poder revocar un vínculo `minimal`, que no abre
  datos clínicos. La decisión actual lo impide igual que el `readings`.

## Consecuencias

- El esquema no cambia: no hay tabla ni enumerado nuevo, ni migración. El
  alcance sigue siendo `TEXT` con dos valores válidos en la aplicación.
- La interfaz del administrador pierde las acciones de alta, cambio y
  revocación de cuidadores y conserva la consulta del directorio.
- La interfaz del paciente gana una lista de acceso de solo lectura; la del
  médico gana las tres acciones. Esa ola es posterior a este ADR.
