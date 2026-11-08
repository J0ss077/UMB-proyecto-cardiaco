# ADR 0003: lectura del historial clínico sin consentimiento vigente

- Estado: aceptado
- Fecha: 2026-11-08
- Ámbito: rutas clínicas de lectura, consentimiento informado y compuerta de análisis

## Contexto

Las rutas clínicas de lectura (`GET /api/patients`, `GET /api/readings`,
`GET /api/symptoms` y las consultas de alertas) sirven la historia clínica sin
exigir un consentimiento vigente. La regla dura del proyecto decía que ningún
dato clínico se procesa sin consentimiento vigente, y esa frase no distinguía
leer de escribir ni de analizar. El comportamiento es deliberado, pero no estaba
registrado en ninguna decisión.

## Decisión

Leer la historia clínica no exige consentimiento vigente. Escribir datos
clínicos nuevos y calcular el resumen de la ventana sí lo exigen, con la
compuerta de `clinical.access.require_consent` y el 403
`No hay consentimiento informado vigente`.

## Por qué

- El historial clínico no se borra: la desactivación seudonimiza la identidad y
  conserva los registros, y la revocación del consentimiento también conserva lo
  ya registrado.
- Revocar el consentimiento detiene el tratamiento nuevo, no el acceso a la
  atención previa. El médico tratante necesita leer lo que ya ocurrió para
  atender al paciente.
- El paciente conserva el acceso a su propio historial y el médico tratante al
  de sus pacientes vinculados.

## Qué no permite

- No permite escribir datos clínicos nuevos: el alta de lecturas y de síntomas
  sigue respondiendo 403 sin consentimiento vigente.
- No permite calcular el análisis: el resumen de la ventana domiciliaria es
  análisis y sigue detrás de la compuerta.
- No convierte la lectura en una autorización implícita: la vigencia se sigue
  consultando contra la versión actual del documento.

## Consecuencia para la interfaz

El cliente no puede deducir el consentimiento de que una lectura responda 200.
Antes de habilitar las rutas de escritura o el resumen, consulta
`GET /api/consent`. Si el resumen responde 403 con
`No hay consentimiento informado vigente`, lleva al paciente a aceptar el
documento y no lo trates como un problema de permisos. Después de una
revocación, la historia sigue visible y solo se bloquean las escrituras y el
resumen.
