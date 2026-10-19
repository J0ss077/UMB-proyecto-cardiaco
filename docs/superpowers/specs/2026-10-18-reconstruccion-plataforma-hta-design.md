# Reconstrucción de la plataforma de telemonitoreo de HTA — documento de diseño

Fecha: 2026-10-18
Ventana de ejecución: 18 de octubre a 18 de diciembre de 2026
Equipo: tres integrantes. Uno de ellos asume en solitario el frontend web.

## 1. Intención

Reconstruir desde cero el repositorio del proyecto de grado "Desarrollo de prototipo de modelo IA destinado a la optimización del monitoreo en telemedicina de pacientes con hipertensión arterial" (Universidad Manuela Beltrán, Ingeniería de Software).

El proyecto anterior no estaba roto: estaba revuelto. Tenía código funcional, doce ADRs, un rastreador de incidencias local y varios documentos que describían un sistema distinto del que el código implementaba. La reconstrucción no busca reescribir mejor lo mismo, sino establecer desde el primer día un orden explícito: artefactos en su sitio, una sola fuente de verdad por materia, y un flujo de trabajo que tres personas puedan seguir sin preguntarse quién es dueño de qué.

El entregable final del proyecto completo es a mediados de 2027. Lo que se construye en esta ventana es el avance que el tutor debe firmar, y la base sobre la que se trabajará el semestre siguiente.

## 2. Criterio de éxito

El tutor, sin acompañamiento del equipo, debe poder hacer tres cosas:

1. **Recorrer la aplicación como administrador.** Iniciar sesión, ver datos reales sembrados, y moverse entre pestañas. Cada pestaña abre con contenido; ninguna dice "en construcción".
2. **Comprobar la base de datos desde una herramienta externa.** Conectarse con DBeaver o pgAdmin y verificar que el esquema existe de verdad: tablas, tipos enumerados, llaves foráneas, restricciones e índices, con datos de ejemplo coherentes.
3. **Entender el proyecto leyendo el repositorio.** Clonar, leer un README de una pantalla, ejecutar un comando, y estar dentro. Sin preguntar.

Un criterio secundario, declarado por el usuario: al tutor le importa más la completitud del manual técnico que la del prototipo, pero también pedirá ver el avance funcionando. Por tanto el manual manda sobre el orden del trabajo, y el prototipo existe para que el manual sea verdad.

## 3. Qué entra y qué no en estos dos meses

### Entra

- El camino clínico completo de punta a punta: autenticación con roles, consentimiento informado, registro de presión arterial y síntomas, validación de rangos, clasificación de riesgo con explicación, alertas estratificadas con validación médica, tablero de seguimiento y auditoría.
- La administración de usuarios, roles y umbrales, que es lo que el tutor va a recorrer primero.
- El esquema PostgreSQL completo con las dieciséis tablas del manual, y las dos colecciones MongoDB que el manual exige.
- El despliegue con un solo comando mediante contenedores, incluyendo datos sembrados de demostración.
- El cierre de los huecos documentales del manual: diagrama entidad-relación y casos de uso extendidos en PlantUML, y la Fase 04 redactada con lo que el prototipo realmente hace.
- La matriz de estado por requerimiento, que es la pieza que sostiene la credibilidad de todo el manual.

### No entra, y se declara como pendiente en el manual

- Bluetooth Low Energy real contra hardware. Se construye el contrato de ingesta y un simulador de dispositivo que produce lecturas por ese contrato.
- HL7 FHIR y MQTT reales. Se documenta el contrato de interoperabilidad y se deja el punto de extensión.
- Chat con el paciente sobre NLP y teleconsulta síncrona.
- Predicción a 30-90 días, wearables y contenido educativo dinámico.
- Aplicación móvil nativa y modo sin conexión. El aplicativo web es responsivo, no un PWA con service worker. RF-05 y RNF-15 mencionan el funcionamiento sin conexión, y en esta ventana se declara pendiente en lugar de fingirlo: el manual no afirmará que el sistema opera sin conexión.
- Entrega de alertas y recordatorios por correo o mensajería. La notificación es dentro de la aplicación: la alerta se crea, se lista y se marca como vista. No hay servidor de correo, ni credenciales, ni cola de reintentos, y por tanto no aparece una decimoséptima tabla.

## 4. Restricciones que no se negocian

- **Normativas.** Ley 1581 de 2012 y Decreto 1377 de 2013 (datos sensibles, consentimiento, finalidad), Ley 1266 de 2008 (habeas data), Ley 1419 de 2010 y Resolución 2654 de 2019 (telesalud y supervisión médica), Resolución 3100 de 2019, Resolución 1995 de 1999 (conservación de historia clínica), Ley 23 de 1981, Declaración de Helsinki.
- **La IA no diagnostica ni trata.** Toda alerta requiere validación humana; el sistema nunca cierra una alerta por su cuenta. Esta regla se implementa, no se documenta solamente.
- **Ningún dato clínico se procesa sin consentimiento vigente.**
- **El historial clínico no se borra nunca.** La desactivación de una cuenta seudonimiza la identidad y conserva el perfil y sus registros; el motor impide el borrado físico mediante llave foránea con `ON DELETE RESTRICT`.
- **Los valores fuera de rango se conservan** con `validation_status = 'out_of_range'` y se enrutan a revisión. La validación fisiológica vive en la aplicación, no en la base de datos.
- **El almacén relacional es PostgreSQL** con las dieciséis tablas y los siete tipos enumerados del manual. **El flujo crudo de dispositivos va a MongoDB** en las colecciones `raw_readings` y `wearable_events`, indexadas por paciente, tiempo y dispositivo.
- **Todo corre en contenedores.** El tutor levanta el sistema con un comando.
- **Los identificadores del manual son canónicos.** RF-01 a RF-27, RNF-01 a RNF-20, CU-01 a CU-12, y los nombres de las dieciséis tablas, se usan literalmente en el código, en las pruebas y en la documentación del repositorio.

## 5. Arquitectura

Monolito modular. El manual lo declara así en la página 44 y conviene: tres personas, dos meses y una sola cosa que desplegar.

Cuatro piezas en un `docker compose`:

| Pieza     | Responsabilidad                                                  | Tecnología                       |
| --------- | ---------------------------------------------------------------- | -------------------------------- |
| `backend` | Lógica clínica, autenticación, alertas, reportes, auditoría, API | Python, FastAPI                  |
| `web`     | Interfaz de paciente, médico, cuidador y administrador           | React, aplicación web responsiva |
| `db`      | Registro clínico y flujo crudo                                   | PostgreSQL y MongoDB             |
| `ml`      | Entrenamiento y evaluación del clasificador de riesgo            | Python, scikit-learn             |

### La costura entre frontend y backend

Una sola: un contrato HTTP documentado y versionado. El que hace React nunca abre Python; los otros dos nunca abren JavaScript.

El contrato se publica como OpenAPI generado desde el backend, y es el único acuerdo entre las dos mitades. Un cambio incompatible se anuncia cambiando la versión del prefijo; no se negocia por chat ni se descubre en la revisión. El frontend puede regenerar su cliente desde ese contrato, y el backend puede probar su API sin el frontend.

Esta costura importa por una razón concreta: una sola persona sabe React. Si esa persona se enferma o se atrasa, el resto del equipo debe poder seguir avanzando contra el contrato sin esperarla, y la interfaz debe poder levantarse desde el repositorio por cualquiera.

### Módulos profundos del backend

Cada módulo expone una interfaz pequeña y esconde su implementación. La interfaz es también la superficie de prueba: se prueba el módulo a través de ella, no atravesándola.

| Módulo      | Interfaz                                                     | Lo que esconde                                                                                                           |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `auth`      | iniciar sesión, refrescar, cerrar sesión, registrar paciente | Hashing scrypt, emisión y revocación de tokens, rotación de refresco, bloqueo por cuenta inactiva, registro en auditoría |
| `accounts`  | crear usuario, cambiar rol, desactivar cuenta                | RBAC, reglas de registro público, prohibición de autodesactivación, seudonimización, revocación de tokens                |
| `consent`   | otorgar, revocar, consultar vigente                          | Versionado inmutable, historial, activación y suspensión del monitoreo                                                   |
| `readings`  | registrar lectura, listar por paciente y periodo             | Validación fisiológica, estado `out_of_range`, promoción desde `raw_readings`, unicidad temporal                         |
| `symptoms`  | registrar síntomas y ánimo, listar                           | Texto libre, asociación opcional a lectura                                                                               |
| `risk`      | clasificar paciente, explicar inferencia                     | Extracción de variables, dos adaptadores, explicabilidad, registro de inferencia                                         |
| `alerts`    | evaluar disparadores, listar, validar, descartar             | Umbrales por paciente, estratificación, destinatarios, prohibición de cierre autónomo                                    |
| `adherence` | prescribir, confirmar toma, calcular adherencia              | Programación de recordatorios, ventanas de toma, cálculo por periodo                                                     |
| `reports`   | generar reporte de periodo, exportar                         | Consolidación de tendencias, adherencia y alertas; formato de salida                                                     |
| `audit`     | registrar evento, consultar con filtros                      | Actor, entidad, acción, IP, fecha y detalle                                                                              |

### El clasificador de riesgo: una costura con dos adaptadores reales

`risk` define una interfaz única: dado un paciente con sus datos, devolver un nivel de riesgo y los factores que lo explican. Detrás hay dos adaptadores:

- **Reglas clínicas.** Umbrales de presión arterial con base en las guías citadas en el marco teórico, más presencia de valores fuera de rango en la ventana reciente. Siempre funciona, no necesita datos de entrenamiento, y es explicable por construcción.
- **Modelo entrenado.** Clasificador de scikit-learn sobre un conjunto de datos público de hipertensión, serializado y cargado por el módulo.

Dos adaptadores justifican la costura: el sistema puede operar y demostrarse con reglas mientras el modelo se entrena y valida, y el modelo entra sin tocar a ningún llamador.

**Verdad sobre las métricas.** El manual exige AUROC ≥ 0.80, sensibilidad ≥ 90 % y falsos positivos < 10 % (RNF-06). Esos umbrales se evaluarán sobre el conjunto de datos público con el que se entrene, con validación cruzada de diez pliegues y partición 80/20, y los números que se reporten serán los que salgan, no los que se esperen. Si el modelo no alcanza el umbral, el manual lo dice y explica por qué, en lugar de omitirlo. La validación sobre pacientes reales (RNF-06 en su sentido clínico) queda para el piloto de 2027.

**Qué estima el modelo, y cómo se nombra.** La investigación de bancos de datos concluyó algo que hay que escribir antes de entrenar nada: ningún conjunto abierto contiene el evento que el producto promete detectar —una crisis hipertensiva durante el monitoreo domiciliario— con las variables que el sistema recoge, y no existe ningún conjunto abierto de serie diaria de presión domiciliaria con eventos etiquetados. Por tanto el modelo no se presentará como detector de crisis. Lo que sí se sostiene es la **estimación de la probabilidad de descontrol tensional** a partir de los datos longitudinales del paciente, con etiqueta posterior a la medición de entrada.

Sobre cómo se nombra, hay una regla de dos registros y una sola verdad. En los documentos académicos y en la interfaz, el componente se llama **modelo de IA de apoyo a la decisión**, y lo que hace se describe en términos clínicos: estima el riesgo de descontrol tensional, detecta anomalías en la serie de mediciones, estratifica la severidad de una alerta y explica los factores que la sustentan. No se reduce el proyecto a la técnica que lo implementa por dentro, porque el producto no es una técnica: es un sistema de monitoreo con un modelo adentro. En el registro técnico —ADR, código, documentación del repositorio— la técnica se nombra con precisión, porque un ingeniero que lea el código necesita saber exactamente qué hay, y un jurado con formación en machine learning va a preguntarlo.

Las dos cosas son la misma verdad dicha a dos niveles de abstracción. Lo que no se hace en ninguno de los dos registros es atribuir al modelo una capacidad que no tiene: no diagnostica, no detecta crisis, no reemplaza al médico.

De ahí sale una regla que no se negocia: **la presión que entra al modelo no puede definir la etiqueta.** Si la etiqueta se calcula con la misma lectura que el modelo ve como variable, el modelo aprende a reproducir un umbral, el AUROC sube por encima de 0.95 y la métrica deja de significar algo. Cualquier resultado que dependa de esa circularidad se descarta, aunque sea el número que el manual querría tener.

**Severidad no es riesgo cardiovascular, y el manual no puede confundirlos.** La investigación clínica llegó a una conclusión incómoda: el enum `low/medium/high/critical` no puede presentarse como "nivel de riesgo cardiovascular", porque el riesgo cardiovascular real exige sexo, tabaquismo, colesterol total y HDL, diabetes, enfermedad renal con albuminuria y enfermedad cardiovascular previa, y el sistema no recoge ninguno de esos datos. Lo que sí puede afirmar es un **nivel de severidad de la alerta**, calculado con presión, frecuencia cardiaca, síntomas y la ventana de mediciones. La casualidad terminológica ayuda: el manual ya llamó al enum `alert_severity`, no `risk_level`. La corrección es de redacción, no de esquema, y va al manual: donde diga "riesgo cardiovascular" se dice "severidad de la alerta", y la expresión "riesgo cardiovascular" se reserva para el día en que exista una calculadora validada con todas sus variables.

**Regla de degradación, para que no quede ambigua.** Si el 30 de noviembre no hay un conjunto de datos citable, RF-09 se queda en "Implementado con adaptador de reglas" y el adaptador de modelo pasa a "Parcial, sin métricas", con el cuaderno de entrenamiento como evidencia de avance. La fecha de corte existe para que el 30 de noviembre esa decisión no se discuta: se toma y se sigue.

### Umbrales clínicos: de dónde salen los números

El manual fija los rangos fisiológicos plausibles (sistólica 80–200, diastólica 40–130), los cuatro niveles de severidad `low/medium/high/critical` y nada más. No hay en ninguno de los tres documentos una tabla que convierta una lectura en una severidad, ni la definición de las clases de riesgo, ni los disparadores de RF-14. Eso hay que decidirlo.

Mi propuesta: la referencia operativa es la **Guía de Práctica Clínica colombiana de hipertensión arterial primaria, actualización parcial 2025** (Ministerio de Salud y Protección Social, Guía 18, tercera edición), complementada con la tabla de equivalencias consultorio, automedida y monitorización ambulatoria que la propia guía reproduce, y con el ancla de crisis de la OMS y la AHA/ACC. Es la guía nacional, prioriza la automedida domiciliaria en zonas de baja accesibilidad y exige confirmación fuera del consultorio, que es exactamente lo que este sistema hace.

Los umbrales viven en la base de datos (`alert_config`), se siembran con una configuración inicial explícita y se documentan en `docs/manual/umbrales-clinicos.md`, cada uno con su fuente. **Requieren la firma de un clínico antes de que las pruebas de RF-10 y RF-14 se consideren evidencia.** Mientras no esté firmada, esos requerimientos figuran como "Parcial: umbrales pendientes de validación clínica". Inventar los números y presentarlos como si tuvieran respaldo es la peor salida posible en una tesis de salud.

### Superficie de interfaz y roles

La prueba del tutor no puede ser "entra como administrador y ve datos clínicos", porque el manual le da al administrador cuentas, roles, umbrales y auditoría, y nada de dato clínico. La aplicación respeta eso:

| Rol           | Pantallas                                                               |
| ------------- | ----------------------------------------------------------------------- |
| Paciente      | Su registro de lecturas y síntomas, consentimiento, sus alertas         |
| Médico        | Sus pacientes asignados, sus lecturas, clasificación de riesgo, alertas |
| Cuidador      | Alertas y la información mínima que autorizó el paciente                |
| Administrador | Usuarios, roles, umbrales, auditoría y estado del sistema               |

El recorrido de demostración inicia sesión con las cuatro cuentas, no solo con la de administrador. Las funcionalidades declaradas como pendientes tienen una pantalla propia que explica qué hará y por qué no está, en lugar de una pestaña vacía o un botón que no hace nada.

## 6. Datos

PostgreSQL, dieciséis tablas, exactamente las del manual y con sus nombres: `users`, `patient_profiles`, `patient_physician`, `caregiver_links`, `consents`, `readings`, `symptoms_mood`, `medications`, `adherence_events`, `alerts`, `alert_config`, `reports`, `reminders`, `teleconsultations`, `audit_logs`, `refresh_tokens`.

Tipos enumerados: `user_role`, `reading_source`, `validation_status`, `alert_severity`, `alert_status`, `reminder_kind`, `teleconsultation_mode`.

Convenciones que se conservan: UUID con `gen_random_uuid()`, `TIMESTAMPTZ` con `now()`, snake_case, tablas en plural, acción de borrado explícita en toda llave foránea, magnitudes clínicas como `NUMERIC` o `INTEGER`.

MongoDB: `raw_readings` y `wearable_events`, de solo anexado, indexadas por paciente y tiempo, y por dispositivo. La lectura validada se promueve al relacional.

Las migraciones son la fuente de verdad del esquema, versionadas y aplicadas automáticamente al arrancar el contenedor del backend. El DDL se genera desde ellas, no se escribe dos veces.

### El hueco de `alert_config`: cuatro niveles, dos umbrales

La investigación clínica encontró un defecto en el modelo de datos del manual que hay que resolver antes de escribir la primera migración. El enum `alert_severity` tiene cuatro valores `low`, `medium`, `high` y `critical`, pero la tabla `alert_config` solo declara `low_threshold` y `high_threshold`. Con dos umbrales no se puede configurar el nivel `critical`, que es precisamente el único que justifica un sistema de alertas clínicas.

Hay dos salidas y una es claramente peor. La primera es añadir dos columnas nullable, `critical_low` y `critical_high`, a `alert_config`. La segunda es crear una tabla nueva de reglas, que rompería la regla de las dieciséis tablas y abriría la puerta a rediseñar el esquema cada vez que aparece un caso. Propongo la primera: **dos columnas nullable**, que no cambian la estructura del modelo ni el número de tablas, y que se documentan en el diccionario de datos como extensión justificada en un ADR.

Esa extensión tiene una consecuencia documental obligatoria: el diccionario de datos del manual, hoy con las columnas de `alert_config`, hay que actualizarlo en la misma entrega. Es exactamente el tipo de cambio que el repositorio genera y el Word absorbe, y por tanto es la primera prueba real de que el mecanismo de la sección 8 funciona.

## 7. Organización del repositorio

Un solo árbol, legible de arriba abajo. La regla es que cualquier carpeta de primer nivel se explique sola. La separación entre lo que lee una persona y lo que lee un agente es explícita: `.agents/` y `docs/superpowers/` son capa de agente y no forman parte del entregable humano.

```
README.md                 qué es, cómo se levanta, en una pantalla
docs/                     capa humana
  manual/                 espejo del manual técnico: requerimientos, modelo de datos, casos de uso
  adr/                    decisiones de arquitectura, numeradas
  api/                    contrato OpenAPI
  diagramas/              fuentes PlantUML y salidas
  research/               investigaciones con sus fuentes: umbrales clínicos, bancos de datos
  estado-requerimientos.md  matriz RF/RNF generada, con estado y evidencia
backend/                  FastAPI, monolito modular
  src/                    un paquete por módulo de la sección 5
  tests/
web/                      React
db/
  migrations/             esquema PostgreSQL versionado
  mongo/                  colecciones e índices
ml/                       entrenamiento, evaluación y modelo serializado
iot/                      contrato de ingesta y simulador de dispositivo
deploy/                   Dockerfiles y compose
scripts/                  generadores y verificaciones, ejecutables por personas
.agents/                  capa de agente, borrable sin romper nada
  STATE.md                estado, siguiente paso y bloqueos
  MAP.md                  mapa de trazabilidad generado desde el código
  BACKLOG.md              trabajo pendiente con su requerimiento
AGENTS.md                 protocolo de trabajo para agentes
```

El proyecto anterior permanece en la carpeta del proyecto, pero fuera de git: entra en `.gitignore` y ninguna herramienta del proyecto lo lee, lo indexa ni lo cita. Se conserva solo como referencia de consulta durante la reconstrucción. Su ciclo de vida termina con ella: cuando el sistema nuevo está completo se descarta, porque el desarrollo continúa sobre lo nuevo y el archivo antiguo deja de tener valor.

Tres consecuencias operativas de esa decisión. El mapa de trazabilidad y el resumen de sesión lo ignoran explícitamente, para que ningún agente confunda el código viejo con el vigente. `AGENTS.md` declara que el proyecto anterior no es referencia para ninguna decisión de implementación. Y el verificador de autoría y el de estilo no recorren esa carpeta: no se gasta esfuerzo corrigiendo lo que se va a descartar.

## 8. Qué manda sobre qué

El manual vive como documento de Word en OneDrive y se exporta a PDF. El repositorio vive en git. Son dos fuentes y van a divergir si no se decide qué manda en cada materia.

- **El documento académico manda sobre el comportamiento.** Lo que el manual dice que el sistema hace es el requisito. Si el código hace otra cosa, el código está mal, no el manual. Esto vale para los flujos, las reglas de negocio, los requerimientos y los casos de uso.
- **El repositorio manda sobre el detalle técnico.** Tipos de columna, índices, nombres de endpoints, estructura de módulos, mensajes de error. El manual describe qué debe ocurrir; el repositorio resuelve cómo.
- **En conflicto sobre el comportamiento, gana el manual y se abre un ADR** explicando por qué se implementó distinto si la implementación tenía razón. Lo que no se hace nunca es dejar las dos versiones vivas y que cada quien lea la que le conviene.

Lo que el repositorio genera se pega al Word sin retipear: el DDL y el diccionario de datos salen del repositorio; los diagramas salen del repositorio como imagen. Cuando llegue un PDF actualizado, se comparan los identificadores y se detecta qué cambió, en lugar de descubrirlo en la revisión del tutor.

**Formato de entrega al documento académico.** Los cambios que van al Word se entregan como archivos Markdown separados, uno por sección, con el texto listo para pegar y la referencia al requerimiento o al caso de uso que lo justifica. No se entregan capturas de pantalla del repositorio ni instrucciones de "copie esto de aquí": se entrega el texto. Cada archivo declara qué sección del manual reemplaza, para que el dueño del documento sepa qué borrar antes de pegar.

## 9. El manual: los huecos exactos a cerrar

El manual técnico v01 está completo en Fase 01 y Fase 02. Le falta:

1. **Fase 03, diagramas UML.** Hoy dice `[Aquí poner]`. Los Anexos ya traen el PlantUML de los doce casos de uso multinivel; falta el código del modelo entidad-relación y el de los casos de uso extendidos, ambos declarados y vacíos. Todo se versiona en `docs/diagramas/` y se renderiza a imagen para el Word.
2. **Fase 04, prototipo semi-funcional.** Hoy dice `[Aquí poner]`. Se redacta con lo que el sistema hace de verdad: capturas, recorrido de los casos de uso implementados, y la matriz de estado.
3. **Referencias y anexos.** Vacíos. Se completan con lo que cite el repositorio.

La matriz de estado por requerimiento es la pieza central de la Fase 04: cada RF y RNF con estado —implementado, parcial, declarado— y su evidencia (archivo, endpoint, tabla, prueba). Un manual que promete 27 requerimientos y un prototipo que ejecuta 8 destruye la confianza; el mismo manual con la columna de estado se lee como una obra en curso con un plan.

## 10. Flujo de trabajo del equipo

### Reparto decidido

El equipo se divide en tres frentes, uno por integrante: **frontend**, **backend** y **documento académico**. Los dos primeros cargan la lógica y la funcionalidad; el tercero carga el Word y la trazabilidad.

Ese reparto tiene una consecuencia que hay que mirar de frente: el frente técnico queda con dos personas, y de esas dos solo una toca el backend. Por eso el backend se construye como monolito modular con las interfaces de la sección 5: cada módulo se puede terminar y probar sin esperar a los demás, y el orden de trabajo no depende de que dos personas estén disponibles al mismo tiempo.

**Supuesto mío, corrígeme si está mal:** yo produzco el código, las migraciones, las pruebas y la documentación técnica del repositorio; ustedes revisan, aprueban y son dueños del Word y de las decisiones clínicas. Si en realidad el backend lo escribe el integrante y yo solo acompaño, el plan cambia de forma y hay que decirlo antes de empezar, no en la semana cuatro.

### Reglas de trabajo

- **git** en la raíz del repositorio, con `main` siempre desplegable.
- Una rama corta por unidad de trabajo, con nombre que cite el requerimiento o el caso de uso.
- Integración por solicitud de revisión, revisada por otro integrante. Nadie integra su propio trabajo sin revisión.
- Mensajes de confirmación en el formato convencional, que permiten leer el historial y generar la trazabilidad del manual.
- Las pruebas corren localmente antes de integrar y vuelven a correr en integración continua cuando el repositorio se publica. El repositorio es privado y lo publica uno de los integrantes, así que la integración continua llega un paso después: la prueba local es la primera red y la de integración continua es la segunda, no la única.
- El trabajo se registra como incidencias con identificador, con el requerimiento asociado.
- Al cierre de cada semana, el estado de los requerimientos se actualiza. Es la única obligación documental periódica, y es la que mantiene el manual verdadero.
- **Ritmo de dos semanas, alineado con la revisión del tutor.** Las revisiones son aproximadamente cada dos semanas, los lunes. El trabajo se corta en incrementos de dos semanas, y cada incremento cierra un conjunto de requerimientos que se puede demostrar sobre el sistema levantado. Nada queda a medias entre dos revisiones si se puede evitar: se prefiere terminar seis cosas y no empezar otras seis.
- **Cada revisión intermedia se prepara como una demostración sobre el sistema desplegado,** no como una presentación de diapositivas: lo que se muestra tiene que estar en `main` y levantarse con un comando. El tutor evalúa progreso respecto de la revisión anterior, así que la demostración se abre mostrando qué se cerró desde la última vez y qué está declarado como pendiente.

## 11. Estado objetivo de los requerimientos al 18 de diciembre

| Requerimiento                           | Estado objetivo | Evidencia exigida                                                                   |
| --------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| RF-01 Autenticación                     | Implementado    | Pruebas de sesión, refresco y rotación                                              |
| RF-02 Roles y permisos                  | Implementado    | Pruebas por rol                                                                     |
| RF-03 Consentimiento                    | Implementado    | Prueba de bloqueo sin consentimiento                                                |
| RF-04 Captura automática                | Parcial         | Contrato de ingesta y simulador; sin BLE                                            |
| RF-05 Registro manual                   | Implementado    | Prueba de validación y persistencia                                                 |
| RF-06 Wearables                         | Declarado       | Colección e índice creados                                                          |
| RF-07 Medicamentos y toma               | Implementado    | Pruebas de prescripción y evento                                                    |
| RF-08 Validación de rangos              | Implementado    | Prueba de `out_of_range`                                                            |
| RF-09 Clasificación de riesgo           | Implementado    | Estimación de descontrol tensional con reglas; con modelo si el dato llega a tiempo |
| RF-10 Detección de anomalías            | Implementado    | Prueba sobre serie con atípico; Parcial si faltan umbrales firmados                 |
| RF-11 Predicción 30-90 días             | Declarado       | Punto de extensión documentado                                                      |
| RF-12 NLP                               | Declarado       | Texto libre persistido                                                              |
| RF-13 Explicabilidad                    | Implementado    | Factores devueltos por la API                                                       |
| RF-14 Alertas estratificadas            | Parcial         | Severidad y destinatarios funcionando; umbrales pendientes de firma clínica         |
| RF-15 Configuración de umbrales         | Implementado    | Interfaz de administración                                                          |
| RF-16 Historial de alertas              | Implementado    | Consulta filtrada                                                                   |
| RF-17 Reportes de seguimiento           | Implementado    | Reporte de periodo con tendencias                                                   |
| RF-18 Exportación                       | Parcial         | CSV; PDF declarado                                                                  |
| RF-19 Visualización                     | Implementado    | Tablero con series                                                                  |
| RF-20 Chat con el modelo                | Declarado       | No entra                                                                            |
| RF-21 Síntomas y ánimo                  | Implementado    | Registro y consulta                                                                 |
| RF-22 Contenido educativo               | Parcial         | Contenido estático                                                                  |
| RF-23 Recordatorios                     | Implementado    | Programación y confirmación; sin notificación push                                  |
| RF-24 Teleconsulta                      | Declarado       | Tabla creada                                                                        |
| RF-25 FHIR y MQTT                       | Parcial         | Contrato documentado; sin implementación                                            |
| RF-26 Integración con sistemas externos | Declarado       | No entra                                                                            |
| RF-27 Auditoría                         | Implementado    | Eventos de acceso e inferencia consultables                                         |

Los RNF se verifican con pruebas medibles donde aplique. Latencia de respuesta (RNF-02), latencia de alerta desde la lectura (RNF-01), tasa de error (RNF-04) y completitud de variables clínicas (RNF-18) se miden con un script repetible y el número observado se escribe en el manual. RNF-10, cifrado en tránsito y en reposo, es una obligación de construcción y no una medición: en esta ventana se cumple el cifrado en tránsito dentro de la red del compose y el cifrado en reposo se declara como pendiente de infraestructura, porque el volumen local no lo ofrece. El manual lo dirá con esas palabras. Los que dependen del piloto —SUS, TAM, uptime prolongado, auditoría de sesgo (RNF-20)— quedan declarados para 2027.

## 12. Riesgos

| Riesgo                                            | Consecuencia                               | Mitigación                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una sola persona domina el frontend               | Si se atrasa, se atrasa todo lo visible    | Contrato OpenAPI como costura; la interfaz se levanta desde el repositorio por cualquiera; integración continua desde la primera semana, no al final |
| No hay conjunto de datos de entrenamiento elegido | El modelo no existe y el AUROC queda vacío | Las reglas clínicas sostienen el sistema desde el día uno; el modelo entra como segundo adaptador cuando el dato exista                              |
| El manual y el repositorio divergen               | El tutor detecta la contradicción          | Una sola fuente por materia, identificadores canónicos y matriz de estado semanal                                                                    |
| El alcance se estira hacia BLE, FHIR o chat       | Se pierde el camino clínico                | Lo no incluido se declara por escrito y no se negocia a mitad de la ventana                                                                          |
| El prototipo "funciona en mi máquina"             | Falla la primera prueba del tutor          | Un solo comando, datos sembrados, y verificación desde un clon limpio                                                                                |
| El manual promete más de lo que hay               | Se pierde la confianza en todo lo demás    | Columna de estado y evidencia por requerimiento                                                                                                      |

## 13. Decisiones que tomé yo

Estas son mías, no acuerdos contigo. Revísalas y objeta cualquiera.

1. **Python con FastAPI para el backend.** La documentación de semestre 1 nombra Node.js y React.js en una frase que dice "tecnologías como", y el manual técnico no fija lenguaje de aplicación; el equipo programa en Python. La decisión se registra en un ADR que cita la frase del manual y explica el cambio.
2. **React para la interfaz,** en propiedad exclusiva del integrante con experiencia web, por delante de la alternativa de plantillas servidas desde Python. El argumento a favor es que libera a los otros dos de la interfaz; el argumento en contra es la concentración de conocimiento, que se mitiga con el contrato.
3. **Un ADR por decisión registrada,** numerados desde 0001, en lugar de los doce ADRs del proyecto anterior, que describían un sistema que el código no implementaba.
4. **El texto del repositorio en español** —lo leen tú y el tutor— e identificadores, código y nombres de tablas en inglés, como el manual ya los tiene.
5. **Las migraciones como fuente del esquema,** con el DDL generado desde ellas y no escrito dos veces.
6. **El simulador de dispositivo como sustituto de BLE** en esta ventana, entregando por el mismo contrato que usará el dispositivo real.
7. **El proyecto anterior se queda donde está, ignorado por git,** y se descarta cuando termine la reconstrucción.
8. **Nada de lo no incluido se borra del manual:** se marca como pendiente con su estado.
9. **Sin modo sin conexión en esta ventana.** RF-05 y RNF-15 se declaran pendientes y la interfaz no se anuncia como aplicación instalable. Prefiero un manual que dice la verdad a un service worker a medio hacer.
10. **Las notificaciones son dentro de la aplicación.** Ni correo ni mensajería, y por tanto el esquema se queda en las dieciséis tablas del manual.
11. **Los umbrales clínicos no se inventan ni se esconden en el código:** se siembran en `alert_config`, se documentan con su fuente en `docs/manual/umbrales-clinicos.md` y no cuentan como evidencia hasta que un clínico los firme. Mientras no haya firma, la interfaz y cada alerta indican que la configuración está pendiente de validación.
12. **Repositorio privado en GitHub, publicado por un integrante.** Yo dejo las confirmaciones listas y ejecuto las pruebas localmente; la publicación y la integración continua llegan un paso después.
13. **Dos capas separadas por dueño:** lo humano en `docs/`, `README.md` y los README de módulo; lo de agente en `AGENTS.md`, `.agents/` y `docs/superpowers/`. La capa de agente se puede borrar sin romper el proyecto, y se borrará antes del entregable final.
14. **El mapa de trazabilidad se genera desde anotaciones en el código,** no se escribe a mano (sección 15.4).
15. **Las reglas de autoría y de estilo se verifican en integración continua,** con dos scripts. Una regla sin verificación es una intención.
16. **El enum `low/medium/high/critical` se llama severidad de la alerta, no riesgo cardiovascular,** en todo el texto del manual y en toda la interfaz. El nombre del enum ya era `alert_severity`; lo que se corrige es la redacción.
17. **`alert_config` gana dos columnas nullable, `critical_low` y `critical_high`,** sin tocar el número de tablas, con ADR y con la actualización correspondiente del diccionario de datos del manual.

## 14. Qué queda abierto

### Resuelto

- **Reparto del equipo:** un integrante el frontend, otro el backend, otro el documento académico. Los dos primeros cargan la lógica y la funcionalidad.
- **Entregas intermedias:** cada dos semanas, los lunes, y son de revisión. El tutor evalúa el progreso respecto de la revisión anterior, así que el trabajo se corta en incrementos de dos semanas y cada incremento cierra requerimientos demostrables sobre el sistema desplegado.
- **Publicación:** el repositorio es privado y lo publica uno de los integrantes. Yo preparo las confirmaciones; la publicación la hace él.
- **Formato de entrega al documento académico:** archivos Markdown por sección, listos para pegar, con la sección que reemplazan indicada (sección 8).
- **Los umbrales clínicos y el banco de datos:** los investigo yo y quedan documentados en `docs/research/`, con sus fuentes. Son propuestas técnicas, no acuerdos contigo.
- **Las dos columnas nuevas en `alert_config`** (`critical_low` y `critical_high`): aprobadas. Se acompañan de ADR y de la actualización del diccionario de datos del manual.
- **La corrección de "riesgo cardiovascular" a "severidad de la alerta":** aprobada, y va al manual como una de las primeras entregas en Markdown.
- **Cómo se nombra el modelo:** en los documentos académicos y en la interfaz, modelo de IA de apoyo a la decisión que estima la probabilidad de descontrol tensional; en el registro técnico, la técnica con su nombre preciso.

### Sigue pendiente, y solo tú puedes cerrarlo

1. **Conseguir quien valide los umbrales clínicos.** El cardiólogo asesor todavía no está en el equipo, y sin una firma clínica RF-10 y RF-14 no pasan de "Parcial". Mientras tanto el sistema funciona con la propuesta documentada y cada alerta lleva marcado que la configuración está pendiente de validación, de modo que nadie confunda una propuesta con un criterio aprobado. Cuando aparezca el cardiólogo, la tarea es revisar una hoja de una página y firmarla, no rediseñar nada. Si antes de la entrega no hay nadie que firme, el manual lo declara así y el tutor verá un sistema honesto, no uno incompleto.
2. **La elección del banco de datos** entre las alternativas que arrojó la investigación, y la confirmación de que se puede citar en la tesis. Fecha de corte: 30 de noviembre; ese día se aplica la regla de degradación.
3. **La aceptación del cambio de etiqueta del modelo:** el componente se presenta como modelo de IA de apoyo a la decisión que estima la probabilidad de descontrol tensional, no como detector de crisis hipertensiva y no como "un clasificador". La técnica exacta queda en el registro técnico, no en el manual.
4. **La aceptación de las dos columnas nuevas en `alert_config`,** porque modifica el diccionario de datos del manual y el manual es el que manda sobre el modelo de datos. Sin esa aceptación, el nivel `critical` queda sin umbral configurable y el sistema no puede distinguir una alerta crítica de una alta.
5. **La corrección de "riesgo cardiovascular" a "severidad de la alerta"** en el texto del manual, que es un cambio de redacción con consecuencias académicas: el manual deja de afirmar algo que sus datos no permiten calcular.

Se resuelven por defecto, salvo que digas lo contrario: el ensayo de clon limpio se hace en Linux con Docker ya instalado y las imágenes se construyen localmente; los datos de demostración cubren cuatro pacientes —uno con lecturas fuera de rango, uno con alerta abierta, uno con consentimiento revocado y uno con cuidador autorizado—; y el primer incremento de dos semanas termina con el sistema levantando y el esquema completo aplicado, aunque la interfaz todavía esté en esqueleto.

## 15. Documentación, autoría y continuidad

Cuatro reglas del equipo, y lo que cada una obliga a construir.

### 15.1 Nunca se declara asistencia de IA

Ningún artefacto que lea una persona puede afirmar ni insinuar que el trabajo se produjo con apoyo de IA: ni el manual, ni el código, ni los comentarios, ni los mensajes de la interfaz, ni los documentos del repositorio. La única excepción es la capa de agente, que existe precisamente para eso: `AGENTS.md`, `.agents/` y `docs/superpowers/`.

Esto se hace cumplir con una verificación automática, no con buena voluntad. `scripts/check-authorship.py` recorre la capa humana y falla si encuentra una declaración de autoría asistida. El detalle que hay que cuidar: la palabra "IA" es legítima en este proyecto porque el producto es un modelo de IA, así que el verificador no busca "IA" sino fórmulas como "generado por IA", "asistido por IA", "con ayuda de IA", nombres de asistentes y modelos, y "coautor". La lista vive en el script y se amplía cuando aparece un caso nuevo.

### 15.2 Nunca se usan emojis

Ni en documentos, ni en commits, ni en la interfaz, ni en los mensajes de error. `scripts/check-style.py` rechaza cualquier carácter de las tablas de emoji. Los estados se escriben con palabras: implementado, parcial, declarado, bloqueado.

### 15.3 La documentación tiene que permitir leer el código

El requisito no es "que haya documentación", es que un integrante que no escribió el módulo pueda abrirlo y saber qué hace y qué requisito sirve. Para eso, tres piezas obligatorias por módulo:

- `README.md` del módulo con cinco secciones fijas: qué hace, qué interfaz expone, qué invariantes respeta, qué requerimientos implementa, y cómo se prueba en un comando.
- Docstring en cada función y clase pública que responde por qué existe y qué requerimiento atiende, no qué hace línea por línea. El código ya dice qué hace.
- Los identificadores del manual en el código. Cada módulo y cada prueba declara con una anotación qué RF o CU cubre, por ejemplo `@requirement RF-14`. Esa anotación no es decorativa: de ahí se genera el mapa de trazabilidad.

El porqué de una decisión no vive en un comentario suelto: vive en un ADR, y el código lo cita por número.

### 15.4 Una sesión nueva de agente tiene que poder trabajar sola

Este es el problema más caro de todo el proyecto, y el que hundió al anterior. Una sesión de agente que empieza en frío no recuerda nada, y si el estado vive solo en la conversación, ese estado se pierde. La regla es una sola: **si el estado no está en un archivo del repositorio, no existe.**

El mecanismo son cuatro piezas y un comando.

- `AGENTS.md`: corto y estable. Invariantes que nunca cambian, cómo trabajar, y a dónde mirar. Se toca poco; si crece, algo está mal ubicado.
- `.agents/STATE.md`: qué está terminado, qué está en curso, cuál es el siguiente paso concreto, y qué está bloqueado y por qué. Se actualiza al cerrar cada sesión. Es el archivo que un agente lee primero.
- `.agents/BACKLOG.md`: trabajo pendiente, cada elemento con su requerimiento y su estado.
- `.agents/MAP.md`: mapa de requerimiento a archivos y pruebas. **Se genera, no se escribe a mano.** `scripts/build-map.py` lo produce recorriendo las anotaciones del código.

`make brief` imprime, en una pantalla, el estado, el backlog y el mapa. Un agente que abre una sesión nueva ejecuta ese comando y sabe dónde está parado sin leer la conversación de nadie.

El error del proyecto anterior fue tener cuatro documentos de contexto escritos a mano que se desincronizaron del código y terminaron describiendo un sistema que no existía. Por eso el mapa se genera y el estado se reduce a un archivo con fecha de actualización visible: lo que se mantiene a mano se pudre, lo que se genera no puede mentir sin que la generación falle.

### 15.5 Un hecho vive en un solo lugar

La causa raíz del desorden anterior fue la duplicación: el mismo dato en cinco archivos y cinco versiones distintas de la verdad. La regla es que cada hecho tiene un dueño y los demás lo enlazan. El estado de un requerimiento tiene un dueño: el archivo generado. La decisión de arquitectura tiene un dueño: su ADR. El umbral clínico tiene un dueño: la configuración sembrada. Si un documento repite un hecho, ese documento está mal escrito.
