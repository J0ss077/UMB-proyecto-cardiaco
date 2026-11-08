# Estado de los requerimientos

Generado por `scripts/build_status.py` a partir de `docs/manual/requerimientos.md` y de las anotaciones `@requirement` del código. No se edita a mano: se regenera con `make docs`.

Una fila por requerimiento del catálogo. El estado se escribe una sola vez, en el catálogo, que también guarda el enunciado completo y la fecha del estado vigente. La columna de evidencia lista los módulos y las pruebas que declaran el requerimiento; un requerimiento sin evidencia anotada no se declara implementado.

Esta matriz describe el estado en el momento en que se genera, con la evidencia anotada hoy en el código. La tabla de la sección 11 del diseño fija el estado objetivo al 18 de diciembre, no el estado actual: donde las dos difieren, esta matriz dice qué existe hoy y la tabla, qué queda por delante.

| Requerimiento | Estado | Evidencia | Motivo |
| --- | --- | --- | --- |
| RF-01 Registro, autenticación y recuperación de credenciales | Parcial | `backend/src/hta/audit/__init__.py`, `backend/src/hta/audit/service.py`, `backend/src/hta/auth/deps.py`, `backend/src/hta/auth/passwords.py`, `backend/src/hta/auth/router.py`, `backend/src/hta/auth/service.py`, `backend/src/hta/auth/tokens.py`, `backend/tests/integration/auth/test_login.py`, `backend/tests/integration/auth/test_refresh.py` | El registro de pacientes, el inicio de sesión, la rotación del token de refresco y el cierre de sesión están implementados y probados; la recuperación de credenciales no existe todavía. |
| RF-02 Roles y permisos | Implementado | `backend/src/hta/accounts/__init__.py`, `backend/src/hta/accounts/router.py`, `backend/src/hta/accounts/service.py`, `backend/tests/integration/accounts/test_deactivate.py`, `backend/tests/integration/accounts/test_register.py`, `backend/tests/integration/accounts/test_roles.py` | — |
| RF-03 Consentimiento informado | Implementado | `backend/src/hta/consent/__init__.py`, `backend/src/hta/consent/router.py`, `backend/src/hta/consent/service.py`, `backend/tests/integration/consent/test_consent.py` | — |
| RF-04 Captura automática desde tensiómetros | Parcial | `backend/src/hta/ingest/__init__.py`, `backend/src/hta/ingest/router.py`, `backend/src/hta/ingest/service.py`, `backend/tests/integration/ingest/test_ingest.py`, `backend/tests/unit/test_ingest.py`, `iot/simulator.py` | La ruta `POST /api/ingest/readings` recibe lecturas de un dispositivo autenticado con clave compartida, las deduplica por paciente, dispositivo e instante y las guarda con `source = 'device'`; `iot/simulator.py` ejercita esa ruta. No existe la captura Bluetooth Low Energy ni un adaptador para un tensiómetro real. |
| RF-05 Registro manual de lecturas | Implementado | `backend/src/hta/clinical/__init__.py`, `backend/src/hta/clinical/readings.py`, `backend/src/hta/clinical/router.py`, `backend/tests/integration/clinical/test_readings.py` | — |
| RF-06 Datos de wearables | Declarado | Sin evidencia anotada. | — |
| RF-07 Medicamentos y adherencia | Declarado | Sin evidencia anotada. | — |
| RF-08 Validación de rangos fisiológicos | Implementado | `backend/src/hta/clinical/validation.py`, `backend/tests/unit/test_validation.py` | — |
| RF-09 Clasificación del nivel de riesgo | Pendiente | Sin evidencia anotada. | — |
| RF-10 Detección de anomalías | Pendiente | Sin evidencia anotada. | — |
| RF-11 Predicción de descontrol a 30 a 90 días | Pendiente | Sin evidencia anotada. | — |
| RF-12 Análisis de texto libre con NLP | Declarado | Sin evidencia anotada. | — |
| RF-13 Explicabilidad de las inferencias | Pendiente | Sin evidencia anotada. | — |
| RF-14 Alertas estratificadas | Declarado | Sin evidencia anotada. | — |
| RF-15 Configuración de umbrales y destinatarios | Declarado | Sin evidencia anotada. | — |
| RF-16 Historial de alertas | Implementado | `backend/src/hta/clinical/alerts.py`, `backend/src/hta/clinical/router.py`, `backend/tests/integration/clinical/test_alerts.py` | — |
| RF-17 Reportes de seguimiento | Declarado | Sin evidencia anotada. | — |
| RF-18 Exportación de reportes | Pendiente | Sin evidencia anotada. | — |
| RF-19 Visualización de datos y tendencias | Parcial | `backend/src/hta/clinical/patients.py`, `backend/src/hta/clinical/readings.py`, `backend/src/hta/clinical/router.py`, `backend/tests/integration/clinical/test_patients.py`, `backend/tests/integration/clinical/test_readings.py` | La API publica el directorio de pacientes, el listado de lecturas, el resumen de la ventana domiciliaria y las alertas, y la ingesta guarda lecturas de dispositivo; la interfaz web sigue siendo una página en construcción, así que no hay gráficas ni pantalla de tendencias. |
| RF-20 Chat con el modelo de IA | Pendiente | Sin evidencia anotada. | — |
| RF-21 Síntomas y estado de ánimo | Implementado | `backend/src/hta/clinical/router.py`, `backend/src/hta/clinical/symptoms.py`, `backend/tests/unit/test_symptoms.py` | — |
| RF-22 Contenido educativo | Pendiente | Sin evidencia anotada. | — |
| RF-23 Recordatorios | Declarado | Sin evidencia anotada. | — |
| RF-24 Teleconsulta | Declarado | Sin evidencia anotada. | — |
| RF-25 Interoperabilidad HL7 FHIR y MQTT | Pendiente | Sin evidencia anotada. | — |
| RF-26 Integración con sistemas externos | Pendiente | Sin evidencia anotada. | — |
| RF-27 Auditoría y trazabilidad | Parcial | Sin evidencia anotada. | Se auditan el inicio y el cierre de sesión, la rotación del token, el registro y la desactivación de cuentas, el consentimiento, el alta de lecturas y síntomas, la ingesta de dispositivo y las transiciones de alerta; los accesos de lectura a datos clínicos y las inferencias del modelo no se registran. |
| RNF-01 Latencia de la alerta | Pendiente | Sin evidencia anotada. | — |
| RNF-02 Latencia de respuesta | Pendiente | Sin evidencia anotada. | — |
| RNF-03 Disponibilidad del servicio | Pendiente | Sin evidencia anotada. | — |
| RNF-04 Tasa de errores | Pendiente | Sin evidencia anotada. | — |
| RNF-05 Sincronización de datos IoT | Pendiente | Sin evidencia anotada. | — |
| RNF-06 Desempeño del modelo | Pendiente | Sin evidencia anotada. | — |
| RNF-07 Cumplimiento de la Ley 1581 y la Ley 1266 | Parcial | Sin evidencia anotada. | El consentimiento informado con aceptación y revocación está implementado, y el acceso a las cuentas se limita por rol; no hay procedimiento de habeas data para consulta, corrección o supresión de datos personales. El registro de un correo ya existente responde 409 y con ello revela que esa dirección está registrada; es un compromiso aceptado de esta ventana, no un descuido. |
| RNF-08 Seudonimización y minimización | Parcial | Sin evidencia anotada. | Desactivar una cuenta seudonimiza la identidad en `users` y conserva el historial clínico, pero el perfil del paciente conserva fecha de nacimiento, sexo, talla y peso, y no hay una revisión de minimización campo por campo. |
| RNF-09 Control de acceso por roles y trazabilidad | Parcial | `backend/src/hta/clinical/access.py` | El control de acceso por roles está implementado y probado, y los eventos de sesión se auditan; no se registra cada acceso de lectura a los datos clínicos. |
| RNF-10 Cifrado en tránsito y en reposo | Pendiente | Sin evidencia anotada. | Las conexiones de la pila no están cifradas: PostgreSQL se alcanza con `postgresql://`, MongoDB con `mongodb://` y la API habla HTTP sin TLS. Ni el tránsito ni el reposo cumplen el requerimiento; la afirmación del diseño de que el tránsito ya está cifrado es un objetivo, no una observación del estado actual. |
| RNF-11 Apoyo a la decisión con supervisión humana | Parcial | Sin evidencia anotada. | Las tres transiciones de una alerta exigen el rol `physician`, escriben quién la validó y cuándo, quedan en la auditoría y ninguna ruta crea o cierra una alerta de forma autónoma. Falta la inferencia del modelo de apoyo a la decisión que esa supervisión debe acompañar: el modelo no existe todavía. |
| RNF-12 Protocolos de interoperabilidad | Pendiente | Sin evidencia anotada. | — |
| RNF-13 Usabilidad SUS | Pendiente | Sin evidencia anotada. | — |
| RNF-14 Accesibilidad e inducción | Pendiente | Sin evidencia anotada. | — |
| RNF-15 Operación sin conexión | Pendiente | Sin evidencia anotada. | — |
| RNF-16 Arquitectura modular y contenedores | Parcial | Sin evidencia anotada. | La pila se despliega con contenedores y el backend está partido en módulos con interfaces separadas; la escalabilidad no está medida ni probada. |
| RNF-17 Reentrenamiento del modelo | Pendiente | Sin evidencia anotada. | — |
| RNF-18 Completitud de variables clínicas | Pendiente | Sin evidencia anotada. | — |
| RNF-19 Validación de rangos en las lecturas | Declarado | Sin evidencia anotada. | — |
| RNF-20 Auditoría de sesgo del modelo | Pendiente | Sin evidencia anotada. | — |
