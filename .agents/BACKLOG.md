# Backlog

Trabajo pendiente, cada elemento con su requerimiento y su estado. Los estados posibles son `pendiente`, `en curso`, `hecho` y `bloqueado`.

| id   | requerimiento | descripción                                                                                                                                                | estado    |
| ---- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| B-01 | incremento 1  | Sembrar las siete cuentas de demostración y los cuatro escenarios de la revisión                                                                           | hecho     |
| B-02 | RF-04         | Contrato de ingesta y simulador de dispositivo; sin Bluetooth Low Energy real                                                                              | pendiente |
| B-03 | RF-06         | Captura e ingesta de datos de wearables; las colecciones `raw_readings` y `wearable_events` y sus índices ya existen; sin hardware                         | pendiente |
| B-04 | RF-09         | Adaptador de modelo de IA como segunda vía de clasificación; bloqueado por la elección del banco de datos                                                  | bloqueado |
| B-05 | RF-11         | Predicción a 30-90 días; fuera de esta ventana                                                                                                             | pendiente |
| B-06 | RF-14         | Alertas estratificadas: generación, severidad y destinatarios; los umbrales sembrados no cuentan como evidencia hasta la firma clínica                     | pendiente |
| B-07 | RF-20         | Chat con el modelo sobre lenguaje natural; fuera de esta ventana                                                                                           | pendiente |
| B-08 | RF-24         | Teleconsulta; solo la tabla del esquema, sin flujo                                                                                                         | pendiente |
| B-09 | RF-25         | Interoperabilidad HL7 FHIR y MQTT; ni contrato ni implementación                                                                                           | pendiente |
| B-10 | RNF-10        | Cifrado en tránsito y en reposo; la pila habla HTTP y `postgresql://`/`mongodb://` sin TLS                                                                 | pendiente |
| B-11 | RF-09         | Clasificación del nivel de riesgo con reglas clínicas; primera vía, sin modelo                                                                             | pendiente |
| B-12 | RF-05         | Registro manual de lecturas con validación de rango y compuerta de consentimiento; sin modo sin conexión                                                   | pendiente |
| B-13 | RF-08         | Validación de rangos fisiológicos en la aplicación; hoy la siembra marca `out_of_range` y el esquema guarda el estado, pero no hay validación al registrar | pendiente |
| B-14 | RF-21         | Registro y consulta de síntomas y estado de ánimo                                                                                                          | pendiente |
| B-15 | RF-19         | Tableros de paciente y médico con lecturas y tendencias                                                                                                    | pendiente |
| B-16 | RF-27         | Auditoría de los accesos de lectura a datos clínicos y de las inferencias del modelo                                                                       | pendiente |
| B-17 | RF-01         | Recuperación de credenciales; el registro, el inicio y el cierre de sesión están implementados                                                             | pendiente |
| B-18 | incremento 3  | Firma clínica de los umbrales de `alert_config`; sin ella, RF-10 y RF-14 no podrán pasar de parciales cuando se implementen                                | bloqueado |

B-01 no declara un requerimiento porque los datos de demostración no pertenecen a uno solo: por eso apunta al incremento y queda como registro de lo cerrado en el incremento 1. B-18 tampoco declara uno: la firma clínica cruza RF-10 y RF-14, así que apunta al incremento 3.
