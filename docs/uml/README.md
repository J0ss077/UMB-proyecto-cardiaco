# Diagramas UML

Los 58 diagramas del manual técnico y el de tipos enumerados, cada uno con su código PlantUML y su imagen. Cada carpeta tiene `puml/` y `png/`, y los dos archivos de un diagrama se llaman igual.

| Carpeta | Diagramas | Cantidad |
| --- | --- | --- |
| `01_casos_de_uso/` | Casos de uso | 12 |
| `02_modelo_entidad_relacion/` | Modelo entidad-relación | 1 |
| `03_casos_de_uso_extendidos/` | Casos de uso extendidos (diagramas de actividad) | 8 |
| `04_clases/` | Clases | 2 |
| `05_estados/` | Estados por clase | 10 |
| `06_colaboracion/` | Colaboración por proceso | 12 |
| `07_secuencia/` | Secuencia por proceso | 12 |
| `08_componentes/` | Componentes | 1 |
| `09_distribucion/` | Distribución | 1 |

Las imágenes son las del manual, salvo la de tipos enumerados, que se generó con PlantUML a partir de su código en `docs/manual/diagramas-uml.md`. Para regenerar una se abre el `.puml` en PlantUML.

## Casos de uso

| Diagrama | Código | Imagen |
| --- | --- | --- |
| CU-01 Autenticación y acceso | [puml](01_casos_de_uso/puml/CU-01_autenticacion_y_acceso.puml) | [png](01_casos_de_uso/png/CU-01_autenticacion_y_acceso.png) |
| CU-02 Gestión del consentimiento informado | [puml](01_casos_de_uso/puml/CU-02_gestion_del_consentimiento_informado.puml) | [png](01_casos_de_uso/png/CU-02_gestion_del_consentimiento_informado.png) |
| CU-03 Captura automática de signos vitales (IoT) | [puml](01_casos_de_uso/puml/CU-03_captura_automatica_de_signos_vitales_iot.puml) | [png](01_casos_de_uso/png/CU-03_captura_automatica_de_signos_vitales_iot.png) |
| CU-04 Registro manual de presión arterial y síntomas | [puml](01_casos_de_uso/puml/CU-04_registro_manual_de_presion_arterial_y_sintomas.puml) | [png](01_casos_de_uso/png/CU-04_registro_manual_de_presion_arterial_y_sintomas.png) |
| CU-05 Análisis y clasificación de riesgo | [puml](01_casos_de_uso/puml/CU-05_analisis_y_clasificacion_de_riesgo.puml) | [png](01_casos_de_uso/png/CU-05_analisis_y_clasificacion_de_riesgo.png) |
| CU-06 Generación y gestión de alertas | [puml](01_casos_de_uso/puml/CU-06_generacion_y_gestion_de_alertas.puml) | [png](01_casos_de_uso/png/CU-06_generacion_y_gestion_de_alertas.png) |
| CU-07 Generación de reportes de seguimiento | [puml](01_casos_de_uso/puml/CU-07_generacion_de_reportes_de_seguimiento.puml) | [png](01_casos_de_uso/png/CU-07_generacion_de_reportes_de_seguimiento.png) |
| CU-08 Interacción por chat con el modelo de IA | [puml](01_casos_de_uso/puml/CU-08_interaccion_por_chat_con_el_modelo_de_ia.puml) | [png](01_casos_de_uso/png/CU-08_interaccion_por_chat_con_el_modelo_de_ia.png) |
| CU-09 Gestión de recordatorios de medicación | [puml](01_casos_de_uso/puml/CU-09_gestion_de_recordatorios_de_medicacion.puml) | [png](01_casos_de_uso/png/CU-09_gestion_de_recordatorios_de_medicacion.png) |
| CU-10 Teleconsulta | [puml](01_casos_de_uso/puml/CU-10_teleconsulta.puml) | [png](01_casos_de_uso/png/CU-10_teleconsulta.png) |
| CU-11 Gestión de usuarios y roles | [puml](01_casos_de_uso/puml/CU-11_gestion_de_usuarios_y_roles.puml) | [png](01_casos_de_uso/png/CU-11_gestion_de_usuarios_y_roles.png) |
| CU-12 Auditoría y trazabilidad | [puml](01_casos_de_uso/puml/CU-12_auditoria_y_trazabilidad.puml) | [png](01_casos_de_uso/png/CU-12_auditoria_y_trazabilidad.png) |

## Modelo entidad-relación

| Diagrama | Código | Imagen |
| --- | --- | --- |
| Modelo entidad-relación de la base de datos | [puml](02_modelo_entidad_relacion/puml/modelo_entidad_relacion_de_la_base_de_datos.puml) | [png](02_modelo_entidad_relacion/png/modelo_entidad_relacion_de_la_base_de_datos.png) |

## Casos de uso extendidos (diagramas de actividad)

| Diagrama | Código | Imagen |
| --- | --- | --- |
| Diagrama de actividad CU-01. Autenticación y acceso al sistema | [puml](03_casos_de_uso_extendidos/puml/CU-01_autenticacion_y_acceso_al_sistema.puml) | [png](03_casos_de_uso_extendidos/png/CU-01_autenticacion_y_acceso_al_sistema.png) |
| Diagrama de actividad CU-02. Gestión del consentimiento informado | [puml](03_casos_de_uso_extendidos/puml/CU-02_gestion_del_consentimiento_informado.puml) | [png](03_casos_de_uso_extendidos/png/CU-02_gestion_del_consentimiento_informado.png) |
| Diagrama de actividad CU-03. Captura automática de signos vitales (IoT) | [puml](03_casos_de_uso_extendidos/puml/CU-03_captura_automatica_de_signos_vitales_iot.puml) | [png](03_casos_de_uso_extendidos/png/CU-03_captura_automatica_de_signos_vitales_iot.png) |
| Diagrama de actividad CU-04. Registro manual de presión arterial y síntomas | [puml](03_casos_de_uso_extendidos/puml/CU-04_registro_manual_de_presion_arterial_y_sintomas.puml) | [png](03_casos_de_uso_extendidos/png/CU-04_registro_manual_de_presion_arterial_y_sintomas.png) |
| Diagrama de actividad CU-05. Análisis y clasificación de riesgo | [puml](03_casos_de_uso_extendidos/puml/CU-05_analisis_y_clasificacion_de_riesgo.puml) | [png](03_casos_de_uso_extendidos/png/CU-05_analisis_y_clasificacion_de_riesgo.png) |
| Diagrama de actividad CU-06. Generación y gestión de alertas | [puml](03_casos_de_uso_extendidos/puml/CU-06_generacion_y_gestion_de_alertas.puml) | [png](03_casos_de_uso_extendidos/png/CU-06_generacion_y_gestion_de_alertas.png) |
| Diagrama de actividad CU-09. Gestión de recordatorios y adherencia | [puml](03_casos_de_uso_extendidos/puml/CU-09_gestion_de_recordatorios_y_adherencia.puml) | [png](03_casos_de_uso_extendidos/png/CU-09_gestion_de_recordatorios_y_adherencia.png) |
| Diagrama de actividad CU-11. Gestión de usuarios, roles y desactivación | [puml](03_casos_de_uso_extendidos/puml/CU-11_gestion_de_usuarios_roles_y_desactivacion.puml) | [png](03_casos_de_uso_extendidos/png/CU-11_gestion_de_usuarios_roles_y_desactivacion.png) |

## Clases

| Diagrama | Código | Imagen |
| --- | --- | --- |
| Diagrama de clases del dominio | [puml](04_clases/puml/clases_del_dominio.puml) | [png](04_clases/png/clases_del_dominio.png) |
| Tipos enumerados del dominio | [puml](04_clases/puml/tipos_enumerados_del_dominio.puml) | [png](04_clases/png/tipos_enumerados_del_dominio.png) |

## Estados por clase

| Diagrama | Código | Imagen |
| --- | --- | --- |
| Estados de User | [puml](05_estados/puml/01_user.puml) | [png](05_estados/png/01_user.png) |
| Estados de Consent | [puml](05_estados/puml/02_consent.puml) | [png](05_estados/png/02_consent.png) |
| Estados de Reading | [puml](05_estados/puml/03_reading.puml) | [png](05_estados/png/03_reading.png) |
| Estados de Alert | [puml](05_estados/puml/04_alert.puml) | [png](05_estados/png/04_alert.png) |
| Estados de RefreshToken | [puml](05_estados/puml/05_refreshtoken.puml) | [png](05_estados/png/05_refreshtoken.png) |
| Estados de Medication | [puml](05_estados/puml/06_medication.puml) | [png](05_estados/png/06_medication.png) |
| Estados de AdherenceEvent | [puml](05_estados/puml/07_adherenceevent.puml) | [png](05_estados/png/07_adherenceevent.png) |
| Estados de Reminder | [puml](05_estados/puml/08_reminder.puml) | [png](05_estados/png/08_reminder.png) |
| Estados de Teleconsultation | [puml](05_estados/puml/09_teleconsultation.puml) | [png](05_estados/png/09_teleconsultation.png) |
| Estados del modelo de apoyo a la decisión | [puml](05_estados/puml/10_modelo_de_apoyo_a_la_decision.puml) | [png](05_estados/png/10_modelo_de_apoyo_a_la_decision.png) |

## Colaboración por proceso

| Diagrama | Código | Imagen |
| --- | --- | --- |
| CU-01 Autenticación y acceso: colaboración | [puml](06_colaboracion/puml/CU-01_autenticacion_y_acceso.puml) | [png](06_colaboracion/png/CU-01_autenticacion_y_acceso.png) |
| CU-02 Consentimiento informado: colaboración | [puml](06_colaboracion/puml/CU-02_consentimiento_informado.puml) | [png](06_colaboracion/png/CU-02_consentimiento_informado.png) |
| CU-03 Captura automática desde tensiómetros: colaboración | [puml](06_colaboracion/puml/CU-03_captura_automatica_desde_tensiometros.puml) | [png](06_colaboracion/png/CU-03_captura_automatica_desde_tensiometros.png) |
| CU-04 Registro manual de presión y síntomas: colaboración | [puml](06_colaboracion/puml/CU-04_registro_manual_de_presion_y_sintomas.puml) | [png](06_colaboracion/png/CU-04_registro_manual_de_presion_y_sintomas.png) |
| CU-05 Análisis y clasificación de riesgo: colaboración | [puml](06_colaboracion/puml/CU-05_analisis_y_clasificacion_de_riesgo.puml) | [png](06_colaboracion/png/CU-05_analisis_y_clasificacion_de_riesgo.png) |
| CU-06 Generación y gestión de alertas: colaboración | [puml](06_colaboracion/puml/CU-06_generacion_y_gestion_de_alertas.puml) | [png](06_colaboracion/png/CU-06_generacion_y_gestion_de_alertas.png) |
| CU-07 Reportes de seguimiento: colaboración | [puml](06_colaboracion/puml/CU-07_reportes_de_seguimiento.puml) | [png](06_colaboracion/png/CU-07_reportes_de_seguimiento.png) |
| CU-08 Chat con el modelo de apoyo: colaboración | [puml](06_colaboracion/puml/CU-08_chat_con_el_modelo_de_apoyo.puml) | [png](06_colaboracion/png/CU-08_chat_con_el_modelo_de_apoyo.png) |
| CU-09 Recordatorios y adherencia: colaboración | [puml](06_colaboracion/puml/CU-09_recordatorios_y_adherencia.puml) | [png](06_colaboracion/png/CU-09_recordatorios_y_adherencia.png) |
| CU-10 Teleconsulta: colaboración | [puml](06_colaboracion/puml/CU-10_teleconsulta.puml) | [png](06_colaboracion/png/CU-10_teleconsulta.png) |
| CU-11 Gestión de usuarios y roles: colaboración | [puml](06_colaboracion/puml/CU-11_gestion_de_usuarios_y_roles.puml) | [png](06_colaboracion/png/CU-11_gestion_de_usuarios_y_roles.png) |
| CU-12 Auditoría y trazabilidad: colaboración | [puml](06_colaboracion/puml/CU-12_auditoria_y_trazabilidad.puml) | [png](06_colaboracion/png/CU-12_auditoria_y_trazabilidad.png) |

## Secuencia por proceso

| Diagrama | Código | Imagen |
| --- | --- | --- |
| CU-01 Autenticación y acceso al sistema | [puml](07_secuencia/puml/CU-01_autenticacion_y_acceso_al_sistema.puml) | [png](07_secuencia/png/CU-01_autenticacion_y_acceso_al_sistema.png) |
| CU-02 Gestión del consentimiento informado | [puml](07_secuencia/puml/CU-02_gestion_del_consentimiento_informado.puml) | [png](07_secuencia/png/CU-02_gestion_del_consentimiento_informado.png) |
| CU-03 Captura automática de signos vitales | [puml](07_secuencia/puml/CU-03_captura_automatica_de_signos_vitales.puml) | [png](07_secuencia/png/CU-03_captura_automatica_de_signos_vitales.png) |
| CU-04 Registro manual de presión y síntomas | [puml](07_secuencia/puml/CU-04_registro_manual_de_presion_y_sintomas.puml) | [png](07_secuencia/png/CU-04_registro_manual_de_presion_y_sintomas.png) |
| CU-05 Análisis y clasificación de riesgo | [puml](07_secuencia/puml/CU-05_analisis_y_clasificacion_de_riesgo.puml) | [png](07_secuencia/png/CU-05_analisis_y_clasificacion_de_riesgo.png) |
| CU-06 Generación y gestión de alertas | [puml](07_secuencia/puml/CU-06_generacion_y_gestion_de_alertas.puml) | [png](07_secuencia/png/CU-06_generacion_y_gestion_de_alertas.png) |
| CU-07 Reportes de seguimiento | [puml](07_secuencia/puml/CU-07_reportes_de_seguimiento.puml) | [png](07_secuencia/png/CU-07_reportes_de_seguimiento.png) |
| CU-08 Interacción por chat con el modelo de apoyo | [puml](07_secuencia/puml/CU-08_interaccion_por_chat_con_el_modelo_de_apoyo.puml) | [png](07_secuencia/png/CU-08_interaccion_por_chat_con_el_modelo_de_apoyo.png) |
| CU-09 Recordatorios y adherencia | [puml](07_secuencia/puml/CU-09_recordatorios_y_adherencia.puml) | [png](07_secuencia/png/CU-09_recordatorios_y_adherencia.png) |
| CU-10 Teleconsulta | [puml](07_secuencia/puml/CU-10_teleconsulta.puml) | [png](07_secuencia/png/CU-10_teleconsulta.png) |
| CU-11 Gestión de usuarios, roles y desactivación | [puml](07_secuencia/puml/CU-11_gestion_de_usuarios_roles_y_desactivacion.puml) | [png](07_secuencia/png/CU-11_gestion_de_usuarios_roles_y_desactivacion.png) |
| CU-12 Auditoría y trazabilidad | [puml](07_secuencia/puml/CU-12_auditoria_y_trazabilidad.puml) | [png](07_secuencia/png/CU-12_auditoria_y_trazabilidad.png) |

## Componentes

| Diagrama | Código | Imagen |
| --- | --- | --- |
| Diagrama de componentes del sistema | [puml](08_componentes/puml/componentes_del_sistema.puml) | [png](08_componentes/png/componentes_del_sistema.png) |

## Distribución

| Diagrama | Código | Imagen |
| --- | --- | --- |
| Diagrama de distribución | [puml](09_distribucion/puml/distribucion.puml) | [png](09_distribucion/png/distribucion.png) |
