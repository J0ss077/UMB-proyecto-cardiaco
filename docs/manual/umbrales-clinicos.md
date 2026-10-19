# Umbrales clínicos de la alerta

`alert_config` es la configuración que la lógica de alertas leerá cuando exista; desde el
momento en que se escribe, la tabla es la autoridad de esos umbrales. Este documento
transcribe los valores sembrados y la fuente de cada uno; no la sustituye.

## Valores sembrados

`backend/src/hta/db/seed.py` inserta una sola vez dos filas globales, con `patient_id` nulo,
de modo que valen para todo paciente que no tenga configuración propia. La unidad es mmHg.

| Métrica     | `low_threshold` | `high_threshold` | `critical_low` | `critical_high` | `recipients`    |
| ----------- | --------------- | ---------------- | -------------- | --------------- | --------------- |
| `systolic`  | NULL            | 140              | NULL           | 180             | `["physician"]` |
| `diastolic` | NULL            | 90               | NULL           | 120             | `["physician"]` |

Las constantes de la siembra solo crean la configuración inicial. Una base ya sembrada no
cambia al editar `seed.py`: la lectura vigente es siempre la de `alert_config`.

## Fuente de cada número

La fuente es la Tabla 9 del informe
[`docs/research/2026-10-18-umbrales-clinicos-hta.md`](../research/2026-10-18-umbrales-clinicos-hta.md),
que adopta la Guía de Práctica Clínica colombiana de hipertensión arterial 2025 (MSPS, 2025)
como referencia operativa y nombra las guías de las que toma cada corte. Para las métricas de
lectura única del sistema, los cuatro valores tienen este origen:

| Valor sembrado             | Referencia que lo sostiene                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `systolic.high_threshold`  | 140 mmHg: umbral de hipertensión de la OMS, la ESC y la ESH, e inicio del estadio 2 de la AHA/ACC (informe, Tabla 9; OMS, 2025; McEvoy et al., 2024; Mancia et al., 2023; Whelton et al., 2018). |
| `systolic.critical_high`   | 180 mmHg: corte de crisis hipertensiva de la OMS y de la AHA/ACC (informe, Tabla 9; OMS, 2025; Whelton et al., 2018).                                                                            |
| `diastolic.high_threshold` | 90 mmHg: umbral de hipertensión de la OMS, la ESC y la ESH (informe, Tabla 9; OMS, 2025; McEvoy et al., 2024; Mancia et al., 2023).                                                              |
| `diastolic.critical_high`  | 120 mmHg: corte de crisis hipertensiva de la AHA/ACC y de la OMS (informe, Tabla 9; Whelton et al., 2018; OMS, 2025).                                                                            |

La Tabla 9 también propone 110 mmHg como grado 3 de la ESC/ESH para la diastólica, pero ese
valor activa `critical` solo cuando hay síntomas; por eso no es el `critical_high` de una
lectura aislada.

## La banda inferior

`low_threshold` y `critical_low` quedan en NULL. La Tabla 9 propone 90/60 mmHg para la banda
inferior, pero el propio informe los marca como una convención de hipotensión no verificada
en las guías de hipertensión, y `critical_low` figura allí como "No aplica". Como no hay una
fuente documentada para una banda inferior, el valor honesto es ninguno: el sistema no
inventa un umbral que no puede respaldar. Las reglas de hipotensión del informe son reglas de
ingeniería pendientes de firma, no valores sembrados.

## Pendiente de firma clínica

Estos valores son una propuesta documentada pendiente de firma clínica. Ninguna alerta es
evidencia clínica hasta que un clínico firme los umbrales. La firma convierte la propuesta en
la configuración clínica aprobada: desde ese momento los valores de `alert_config` y las
alertas que producen pueden presentarse como evidencia de RF-10 y RF-14. La firma no cambia
los números por sí sola; si el clínico pide otros, se cambian la siembra y esta tabla en el
mismo acto.
