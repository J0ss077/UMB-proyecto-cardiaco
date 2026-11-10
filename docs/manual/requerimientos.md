# Catálogo de requerimientos

Este archivo es el catálogo canónico de la plataforma: reúne los 27 requerimientos
funcionales y los 20 requerimientos no funcionales del manual técnico, con el estado vigente
de cada uno y el enunciado que le corresponde. El estado se escribe una sola vez, aquí. La
matriz de `docs/estado-requerimientos.md` se genera a partir de este archivo y de las
anotaciones del código, y no se edita a mano.

Estado vigente a 8 de noviembre de 2026, al cierre del incremento 2.

### Cómo se lee el estado

- **Implementado**: el comportamiento existe en el repositorio y al menos un archivo anotado lo respalda.
- **Parcial**: existe una parte del comportamiento; la línea `**Motivo:**` dice qué falta y por qué no está completa.
- **Declarado**: el requerimiento está reconocido en el manual y el esquema ya tiene la estructura que lo soporta (tabla, colección o tipo enumerado), pero ningún comportamiento lo cumple todavía.
- **Pendiente**: no hay estructura ni comportamiento en el repositorio; el requerimiento espera a una ventana posterior.

Cada sección lleva la línea `**Texto:**` con el enunciado tomado del manual y, cuando el
estado es `Parcial`, una línea `**Motivo:**` con la razón concreta. Un estado parcial sin
motivo es una afirmación que nadie puede comprobar. La línea `**Motivo:**` aparece también
cuando otro estado necesita explicar por qué no está más arriba.

## RF-01 Registro, autenticación y recuperación de credenciales

**Estado:** Parcial

**Texto:** Permitir el registro, la autenticación y la recuperación de credenciales de los usuarios.

**Motivo:** El registro de pacientes, el inicio de sesión, la rotación del token de refresco y el cierre de sesión están implementados y probados; la recuperación de credenciales no existe todavía.

## RF-02 Roles y permisos

**Estado:** Implementado

**Texto:** Gestionar roles y permisos de acceso de modo que cada usuario vea únicamente la información autorizada.

## RF-03 Consentimiento informado

**Estado:** Implementado

**Texto:** Gestionar el consentimiento informado del paciente antes del tratamiento de sus datos, con registro de la aceptación.

## RF-04 Captura automática desde tensiómetros

**Estado:** Parcial

**Texto:** Capturar de forma automática la presión arterial (sistólica y diastólica) y la frecuencia cardiaca desde tensiómetros conectados mediante Bluetooth Low Energy.

**Motivo:** La ruta `POST /api/ingest/readings` recibe lecturas de un dispositivo autenticado con clave compartida, las deduplica por paciente, dispositivo e instante y las guarda con `source = 'device'`; `iot/simulator.py` ejercita esa ruta. No existe la captura Bluetooth Low Energy ni un adaptador para un tensiómetro real.

## RF-05 Registro manual de lecturas

**Estado:** Implementado

**Texto:** Permitir el registro manual de presión arterial, frecuencia cardiaca y otros datos cuando no haya dispositivo conectado o en modo sin conexión.

## RF-06 Datos de wearables

**Estado:** Declarado

**Texto:** Capturar datos de wearables (ECG y presión arterial) y variables como peso, actividad, sueño y estrés.

## RF-07 Medicamentos y adherencia

**Estado:** Declarado

**Texto:** Registrar la toma de medicamentos del paciente para el seguimiento de la adherencia.

## RF-08 Validación de rangos fisiológicos

**Estado:** Implementado

**Texto:** Validar que las lecturas estén dentro de rangos fisiológicos plausibles (sistólica 80–200 mmHg y diastólica 40–130 mmHg) y marcar valores atípicos.

## RF-09 Clasificación del nivel de riesgo

**Estado:** Pendiente

**Texto:** Procesar los datos clínicos en tiempo real y clasificar el nivel de riesgo cardiovascular del paciente.

## RF-10 Detección de anomalías

**Estado:** Pendiente

**Texto:** Detectar anomalías en los valores de presión arterial de forma automática.

## RF-11 Predicción de descontrol a 30 a 90 días

**Estado:** Pendiente

**Texto:** Predecir el riesgo de descontrol tensional o de ingreso a urgencias en un horizonte de 30 a 90 días.

## RF-12 Análisis de texto libre con NLP

**Estado:** Declarado

**Texto:** Analizar texto libre (síntomas y estado de ánimo) mediante un módulo de procesamiento de lenguaje natural (NLP).

## RF-13 Explicabilidad de las inferencias

**Estado:** Pendiente

**Texto:** Generar una explicación interpretable de cada inferencia para que el médico tratante pueda entenderla.

## RF-14 Alertas estratificadas

**Estado:** Declarado

**Texto:** Generar alertas tempranas estratificadas por nivel de riesgo y dirigirlas al paciente, al cuidador y al equipo médico según la configuración.

## RF-15 Configuración de umbrales y destinatarios

**Estado:** Declarado

**Texto:** Permitir la configuración de umbrales, reglas y destinatarios de las alertas.

## RF-16 Historial de alertas

**Estado:** Implementado

**Texto:** Registrar el historial de alertas generadas y su estado de gestión.

## RF-17 Reportes de seguimiento

**Estado:** Parcial

**Texto:** Generar reportes de seguimiento automáticos por paciente (tendencias de presión arterial, adherencia y alertas).

**Motivo:** El paciente genera desde la interfaz un historial de automonitoreo con estadísticas del período, lecturas, síntomas y alertas. No es automático ni periódico, no incluye adherencia porque no existe la ruta de medicamentos, y el médico todavía no genera reportes por paciente.

## RF-18 Exportación de reportes

**Estado:** Parcial

**Texto:** Permitir la exportación de reportes en formato descargable para el médico y el paciente.

**Motivo:** El paciente descarga su historial de automonitoreo en Excel y en PDF, generados en el navegador. Falta la exportación desde la vista del médico y un formato de intercambio clínico, y el archivo del paciente no está firmado ni sustituye la historia clínica.

## RF-19 Visualización de datos y tendencias

**Estado:** Implementado

**Texto:** Permitir la visualización de los datos clínicos y sus tendencias en la interfaz web.

**Motivo:** La interfaz muestra las tendencias del paciente con sus líneas de referencia, el promedio de siete días, la distribución por estado, el detalle del paciente en la pantalla del médico, la bandeja de alertas con sus tres transiciones, la vista de solo lectura del cuidador y la descarga del historial en Excel y PDF. El cuidador ve la información que le autorizó el médico tratante con el alcance del vínculo, que es lo que el diseño le asigna, y no series clínicas completas.

## RF-20 Chat con el modelo de IA

**Estado:** Pendiente

**Texto:** Permitir la interacción por chat entre el paciente y el modelo de IA para consultas básicas de autocuidado.

## RF-21 Síntomas y estado de ánimo

**Estado:** Implementado

**Texto:** Permitir el registro de síntomas y estado de ánimo por parte del paciente.

## RF-22 Contenido educativo

**Estado:** Pendiente

**Texto:** Ofrecer contenido educativo sobre hipertensión arterial y autocuidado al paciente.

## RF-23 Recordatorios

**Estado:** Declarado

**Texto:** Generar recordatorios inteligentes de toma de medicación y de medición de presión arterial.

## RF-24 Teleconsulta

**Estado:** Parcial

**Texto:** Soportar tele consulta síncrona y asíncrona entre el paciente y el médico tratante.

**Motivo:** La modalidad asíncrona existe como consulta rápida: el paciente envía un mensaje con su última lectura al médico vinculado y este lo responde. No hay modalidad síncrona, agendamiento ni videollamada, y un paciente con varios médicos escribe siempre al más antiguo.

## RF-25 Interoperabilidad HL7 FHIR y MQTT

**Estado:** Pendiente

**Texto:** Intercambiar datos clínicos mediante los estándares HL7 FHIR y MQTT.

## RF-26 Integración con sistemas externos

**Estado:** Pendiente

**Texto:** Integrarse con plataformas de telemedicina y sistemas de información en salud (historia clínica electrónica, RIPS/SISPRO).

## RF-27 Auditoría y trazabilidad

**Estado:** Parcial

**Texto:** Registrar logs de acceso, de inferencias del modelo y de eventos críticos, con trazabilidad completa para auditoría.

**Motivo:** Se auditan el inicio y el cierre de sesión, la rotación del token, el registro y la desactivación de cuentas, el consentimiento, el alta de lecturas y síntomas, la ingesta de dispositivo y las transiciones de alerta; los accesos de lectura a datos clínicos y las inferencias del modelo no se registran.

## RNF-01 Latencia de la alerta

**Estado:** Pendiente

**Texto:** Generar las alertas en menos de 5 segundos desde la lectura del dato.

## RNF-02 Latencia de respuesta

**Estado:** Pendiente

**Texto:** Responder las solicitudes de la plataforma en menos de 2 segundos.

## RNF-03 Disponibilidad del servicio

**Estado:** Pendiente

**Texto:** Mantener una disponibilidad del servicio (uptime) igual o mayor al 99 %.

## RNF-04 Tasa de errores

**Estado:** Pendiente

**Texto:** Mantener una tasa de errores del sistema menor al 1 %.

## RNF-05 Sincronización de datos IoT

**Estado:** Pendiente

**Texto:** Lograr una tasa de sincronización exitosa de datos IoT igual o mayor al 98 %.

## RNF-06 Desempeño del modelo

**Estado:** Pendiente

**Texto:** Alcanzar AUROC igual o mayor a 0.80, sensibilidad igual o mayor al 90 % para eventos críticos, tasa de falsos positivos menor al 10 % y cobertura de alertas críticas igual o mayor al 95 %.

## RNF-07 Cumplimiento de la Ley 1581 y la Ley 1266

**Estado:** Parcial

**Texto:** Cumplir la Ley 1581 de 2012 y la Ley 1266 de 2008 sobre consentimiento, habeas data y tratamiento de datos sensibles.

**Motivo:** El consentimiento informado con aceptación y revocación está implementado, y el acceso a las cuentas se limita por rol; no hay procedimiento de habeas data para consulta, corrección o supresión de datos personales. El registro de un correo ya existente responde 409 y con ello revela que esa dirección está registrada; es un compromiso aceptado de esta ventana, no un descuido.

## RNF-08 Seudonimización y minimización

**Estado:** Parcial

**Texto:** Aplicar seudonimización y minimización de datos por diseño.

**Motivo:** Desactivar una cuenta seudonimiza la identidad en `users` y conserva el historial clínico, pero el perfil del paciente conserva fecha de nacimiento, sexo, talla y peso, y no hay una revisión de minimización campo por campo.

## RNF-09 Control de acceso por roles y trazabilidad

**Estado:** Parcial

**Texto:** Implementar control de acceso basado en roles y trazabilidad de los accesos.

**Motivo:** El control de acceso por roles está implementado y probado, y los eventos de sesión se auditan; no se registra cada acceso de lectura a los datos clínicos.

## RNF-10 Cifrado en tránsito y en reposo

**Estado:** Pendiente

**Texto:** Cifrar los datos clínicos en tránsito y en reposo.

**Motivo:** Las conexiones de la pila no están cifradas: PostgreSQL se alcanza con `postgresql://`, MongoDB con `mongodb://` y la API habla HTTP sin TLS. Ni el tránsito ni el reposo cumplen el requerimiento; la afirmación del diseño de que el tránsito ya está cifrado es un objetivo, no una observación del estado actual.

## RNF-11 Apoyo a la decisión con supervisión humana

**Estado:** Parcial

**Texto:** Operar exclusivamente como apoyo a la decisión médica, sin autonomía clínica y con supervisión humana.

**Motivo:** Las tres transiciones de una alerta exigen el rol `physician`, escriben quién la validó y cuándo, quedan en la auditoría y ninguna ruta crea o cierra una alerta de forma autónoma. Falta la inferencia del modelo de apoyo a la decisión que esa supervisión debe acompañar: el modelo no existe todavía.

## RNF-12 Protocolos de interoperabilidad

**Estado:** Pendiente

**Texto:** Soportar los protocolos HL7 FHIR, MQTT y Bluetooth Low Energy.

## RNF-13 Usabilidad SUS

**Estado:** Pendiente

**Texto:** Obtener una puntuación SUS igual o mayor a 68/100 (nivel aceptable).

## RNF-14 Accesibilidad e inducción

**Estado:** Pendiente

**Texto:** Ofrecer una interfaz inclusiva para adultos con baja alfabetización digital, con inducción (onboarding) menor a 15 minutos.

## RNF-15 Operación sin conexión

**Estado:** Pendiente

**Texto:** Funcionar en modo sin conexión o con bajo ancho de banda para zonas con conectividad limitada.

## RNF-16 Arquitectura modular y contenedores

**Estado:** Parcial

**Texto:** Mantener una arquitectura modular y escalable, con despliegue mediante contenedores (Docker).

**Motivo:** La pila se despliega con contenedores y el backend está partido en módulos con interfaces separadas; la escalabilidad no está medida ni probada.

## RNF-17 Reentrenamiento del modelo

**Estado:** Pendiente

**Texto:** Incluir mecanismos de reacondicionamiento y actualización continua del modelo para contrarrestar su degradación por cambio de datos (dataset shift).

## RNF-18 Completitud de variables clínicas

**Estado:** Pendiente

**Texto:** Garantizar una completitud de variables clínicas por paciente igual o mayor al 95 %.

## RNF-19 Validación de rangos en las lecturas

**Estado:** Declarado

**Texto:** Validar las lecturas contra rangos fisiológicos y detectar valores atípicos.

## RNF-20 Auditoría de sesgo del modelo

**Estado:** Pendiente

**Texto:** Permitir la auditoría del modelo para detectar sesgos en subpoblaciones y garantizar inferencias interpretables por el médico.
