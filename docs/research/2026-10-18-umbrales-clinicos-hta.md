# Umbrales clínicos y mapeo de severidad para el monitoreo remoto de hipertensión arterial

**Proyecto:** prototipo de monitoreo remoto de pacientes con hipertensión arterial, Universidad Manuela Beltrán, Ingeniería de Software, Bogotá, Colombia.

**Fecha:** 18 de octubre de 2026.

**Versión:** 0.1, borrador técnico de investigación.

**Estado:** propuesta técnica. Todos los números de este documento deben ser validados y firmados por el cardiólogo asesor del proyecto antes de tratarse como evidencia o de usarse en un producto. Ver la sección "Pendiente de validación clínica".

**Pregunta clínica:** ¿cómo se transforma una lectura domiciliaria de presión arterial, o una serie reciente de lecturas, en uno de los cuatro valores del enum `low`, `medium`, `high`, `critical`, con umbrales numéricos trazables a fuentes primarias y honestidad explícita sobre lo que el sistema no puede afirmar?

## 0. Resumen para el lector ocupado

**Guía operativa recomendada:** la Guía de Práctica Clínica colombiana para el manejo de la hipertensión arterial primaria, actualización parcial 2025 del Ministerio de Salud y Protección Social y el IETS (MSPS, 2025), complementada con la tabla de equivalencias entre consultorio y medición domiciliaria que la propia guía reproduce de la AHA/ACC (MSPS, 2025, tabla de equivalencia, módulo 7), y con la definición de crisis de la OMS y la AHA/ACC.

**Mapeo propuesto en una línea por nivel:** `low` = media de 7 días con PAS menor de 130 mmHg y PAD menor de 80 mmHg, con al menos 8 lecturas válidas en 2 o más días, sin síntomas ni picos; `medium` = media de 7 días con PAS 130-134 mmHg o PAD 80-84 mmHg sin alcanzar 135/85 mmHg, o pico aislado de 140/90 a 159/99 sin media elevada, o datos insuficientes con media sugerente; `high` = media de 7 días con PAS mayor o igual a 135 mmHg o PAD mayor o igual a 85 mmHg, o lectura única con PAS mayor o igual a 160 mmHg o PAD mayor o igual a 100 mmHg, o síntomas con presión elevada, o hipotensión sintomática; `critical` = lectura reciente con PAS mayor o igual a 180 mmHg o PAD mayor o igual a 120 mmHg, o lectura con PAS mayor o igual a 180 mmHg o PAD mayor o igual a 110 mmHg más síntoma, o media con PAS mayor o igual a 180 mmHg o PAD mayor o igual a 110 mmHg, o síntoma de alarma mayor.

**Advertencia central:** el enum `low`/`medium`/`high`/`critical` debe documentarse como **severidad de la alerta**, no como "riesgo cardiovascular". El proyecto no recolecta tabaquismo, perfil lipídico, diabetes, función renal ni enfermedad cardiovascular previa, que son las variables que exigen SCORE2 y las ecuaciones de riesgo; por tanto no puede calcular un nivel de riesgo cardiovascular ni debe afirmarlo.

**Tres desacuerdos reales entre fuentes:** (1) el umbral diagnóstico es 130/80 mmHg para la AHA/ACC y para la GPC colombiana 2025 cuando se confirma con AMPA o MAPA, pero 140/90 mmHg para la OMS, la ESC 2024, la ESH 2023 y la OPS; (2) el umbral domiciliario es 130/80 mmHg para la AHA/ACC y la recomendación 13 de la GPC 2025, pero 135/85 mmHg para la ESC/ESH y para la propia GPC cuando habla de "hipertensión domiciliaria"; (3) la crisis se ancla en 180/120 mmHg para la AHA/ACC y la OMS, pero el grado 3 de la ESC/ESH y de la GPC empieza en 180/110 mmHg, y la AHA/ACC conserva la categoría "urgencia hipertensiva" mientras la ESC/ESH no la incluyen en sus tablas y exigen daño agudo de órgano diana para hablar de emergencia.

## 1. Pregunta clínica y alcance

El proyecto registra presión arterial sistólica y diastólica, frecuencia cardíaca, síntomas y estado de ánimo, y debe validar, clasificar, detectar anomalías y alertar con el enum `low`, `medium`, `high`, `critical`, mostrando al médico una explicación interpretable. La validación de plausibilidad ya está fijada por el manual del proyecto: sistólica entre 80 y 200 mmHg y diastólica entre 40 y 130 mmHg. Lo que falta es la regla que convierte una lectura o una serie en un nivel de severidad.

Este documento cubre siete preguntas: definición y umbrales de hipertensión con las fuentes que discrepan; tabla completa de categorías; crisis hipertensiva y distinción urgencia-emergencia; medición domiciliaria frente a consultorio; variables que impulsan el riesgo cardiovascular y cuáles no recolecta el proyecto; detección de anomalías clínicamente significativas frente a errores de medición; y obligaciones normativas colombianas sobre telemonitoreo y alertas.

Quedan fuera del alcance: decisiones de tratamiento, prescripción, diagnóstico autónomo, validación prospectiva del algoritmo, población pediátrica, embarazo y pacientes con dispositivos de asistencia ventricular. El sistema es apoyo a la decisión y cada alerta debe ser validada por un clínico, tal como exige el manual del proyecto y la normativa colombiana de telemedicina.

## 2. Método y calidad de las fuentes

Se consultaron fuentes primarias: el texto completo de la GPC colombiana 2025 (PDF de 1022 páginas, descargado y extraído), la hoja de datos de hipertensión de la OMS actualizada en 2025, la página de publicación de la guía OMS 2021, la página de hipertensión de la OPS, los textos completos de la Resolución 2654 de 2019 y de la Resolución 3100 de 2019 en el normograma de la Superintendencia Nacional de Salud, y los resúmenes indexados de SCORE2 y de la declaración conjunta AHA/AMA sobre automonitoreo.

No fue posible acceder al texto completo de la guía AHA/ACC 2017 ni al de la guía OMS 2021 en PDF por bloqueos del editor y fallas de conexión; sus umbrales se verificaron de forma indirecta en la GPC 2025, que las cita y reproduce sus tablas, y en la hoja de datos de la OMS 2025. Tampoco se accedió al texto completo de la ESC 2024 ni de la ESH 2023; sus tablas se verificaron en las Tablas 7-3, 7-4 y 7-5 de la GPC 2025, que las traduce y cita. Esas verificaciones indirectas se marcan como tales cuando corresponde y no se presentan como lectura directa.

La regla de este documento es simple: todo número lleva fuente; si la fuente no se pudo verificar directamente, se escribe "no verificado"; si las fuentes discrepan, se dice y se recomienda una opción con su justificación.

## 3. Referencia operativa recomendada

**Se recomienda adoptar la GPC colombiana 2025 como referencia operativa del sistema**, por cinco razones.

Primera, es la guía nacional vigente para atención primaria y la única que incorpora explícitamente el contexto colombiano de acceso, incluida la recomendación de priorizar el automonitoreo domiciliario (AMPA) sobre la medición exclusiva en consultorio en poblaciones con pobreza multidimensional o zonas apartadas, con préstamo de tensiómetros validados y capacitación estructurada (MSPS, 2025, módulo 7, consideraciones sobre confirmación diagnóstica).

Segunda, su recomendación 13 define hipertensión arterial en adultos de 18 años o más a partir de PAS mayor o igual a 130 mmHg y/o PAD mayor o igual a 80 mmHg con MAPA, si está disponible, o AMPA, y exige confirmar la cifra de consultorio con medición fuera del consultorio (MSPS, 2025, Rec. 13). Esa recomendación es la que hace posible que un sistema que solo recibe mediciones domiciliarias tenga un anclaje normativo nacional.

Tercera, la guía recomienda SCORE2 recalibrado para Colombia (SCORE2-PURE) como herramienta principal de estimación del riesgo cardiovascular (MSPS, 2025, Recs. 17 y 40), lo que deja claro que el riesgo no se obtiene de la presión arterial aislada y que el sistema no puede sustituir esa estimación.

Cuarta, la guía advierte que el automonitoreo aislado, sin educación ni plan de retroalimentación y ajuste terapéutico, muestra poco o ningún beneficio adicional, y recomienda AMPA acompañado de cointervenciones estructuradas, incluido el telemonitoreo (MSPS, 2025, Rec. 65). Eso respalda que el sistema no sea un tablero pasivo sino un circuito con profesional responsable.

Quinta, la guía reconoce que las guías internacionales discrepan y ofrece una tabla de equivalencias entre consultorio, AMPA y MAPA, lo que permite implementar el sistema sin mezclar umbrales de consultorio con mediciones domiciliarias.

La guía operativa se completa con tres anclas puntuales: la definición de crisis de la OMS y de la AHA/ACC para el nivel `critical`; la tabla de categorías de la ESC 2024 y de la ESH 2023 para nombrar los grados; y la declaración AHA/AMA sobre automonitoreo para el protocolo de medición. Cuando la GPC 2025 y la ESC/ESH discrepan en el umbral domiciliario, este documento recomienda el valor domiciliario de 135/85 mmHg para el nivel `high` y explica por qué en la sección 7.

## 4. Definiciones y umbrales: quién dice qué

### 4.1 OMS

La OMS define hipertensión como presión arterial de 140/90 mmHg o más y precisa que el diagnóstico se establece cuando, medida en dos días diferentes, la sistólica es mayor o igual a 140 mmHg y/o la diastólica es mayor o igual a 90 mmHg en ambos días (OMS, 2025). Para el tratamiento, la hoja de datos indica que la meta es menor de 140/90 mmHg para la mayoría de las personas y menor de 130/80 mmHg en personas con enfermedad cardiovascular, diabetes, enfermedad renal crónica o alto riesgo cardiovascular (OMS, 2025). La guía OMS 2021 de tratamiento farmacológico mantiene el umbral de inicio en 140/90 mmHg y las metas anteriores (OMS, 2021, citada en MSPS, 2025, módulo 7); el PDF de la guía no se pudo abrir directamente en esta revisión y por eso la verificación es indirecta.

La OMS también aporta el anclaje de la crisis: las personas con presión arterial muy alta, generalmente 180/120 mmHg o más, pueden presentar cefalea intensa, dolor torácico, mareo, dificultad para respirar, náuseas, vómito, visión borrosa, ansiedad, confusión, tinnitus, epistaxis o arritmia, y deben buscar atención de inmediato (OMS, 2025). Esa lista es la base de la regla de síntomas de alarma de este documento.

### 4.2 ACC/AHA 2017 y su actualización 2025

La guía ACC/AHA 2017 bajó el umbral diagnóstico a 130/80 mmHg y estableció cuatro categorías: normal menor de 120/80 mmHg, elevada 120-129 mmHg y menos de 80 mmHg, hipertensión estadio 1 de 130-139 mmHg o 80-89 mmHg, e hipertensión estadio 2 mayor o igual a 140/90 mmHg (Whelton et al., 2018). La guía define crisis hipertensiva como presión arterial mayor de 180 mmHg y/o mayor de 120 mmHg, y distingue emergencia hipertensiva, con daño agudo o progresivo de órgano diana, de urgencia hipertensiva, sin ese daño (Whelton et al., 2018). La actualización AHA/ACC 2025 conserva las mismas cuatro categorías y el umbral de 130/80 mmHg, según la Tabla 7-2 que reproduce la GPC 2025 (MSPS, 2025).

La guía AHA/ACC también considera hipertensión la medición domiciliaria mayor o igual a 130/80 mmHg (Whelton et al., 2018), y la tabla de equivalencias reproducida por la GPC 2025 hace corresponder 130/80 mmHg de consultorio con 130/80 mmHg de AMPA (MSPS, 2025).

### 4.3 ESC 2024 y ESH 2023

La ESC 2024 clasifica la presión arterial de consultorio en no elevada (menor de 120/70 mmHg), elevada (120-139/70-89 mmHg) e hipertensión (mayor o igual a 140/90 mmHg), y exige confirmar el diagnóstico con medición fuera del consultorio, AMPA o MAPA (McEvoy et al., 2024, reproducido en MSPS, 2025, Tabla 7-4). Para la medición domiciliaria, la ESC 2024 usa menos de 120/70 mmHg como no elevada, 120-134/70-84 mmHg como elevada y mayor o igual a 135/85 mmHg como hipertensión (McEvoy et al., 2024, reproducido en MSPS, 2025, Tabla 7-4).

La ESH 2023 mantiene la clasificación clásica: óptima menor de 120/80 mmHg, normal 120-129/80-84 mmHg, normal-alta 130-139 y/o 85-89 mmHg, hipertensión grado 1 de 140-159 y/o 90-99 mmHg, grado 2 de 160-179 y/o 100-109 mmHg y grado 3 mayor o igual a 180 y/o 110 mmHg (Mancia et al., 2023, reproducido en MSPS, 2025, Tabla 7-3). Para AMPA, la ESH 2023 considera hipertensión domiciliaria una presión mayor o igual a 135/85 mmHg, y su protocolo es de siete días consecutivos o al menos tres, con duplicados en la mañana y en la noche, excluyendo el primer día del promedio (Mancia et al., 2023, citado en MSPS, 2025, módulo 7).

### 4.4 OPS/PAHO

La OPS define hipertensión como presión arterial de 140/90 mmHg o más y llama prehipertensión a la sistólica entre 120 y 139 mmHg o la diastólica entre 80 y 89 mmHg (OPS, s. f.). No aporta un umbral domiciliario propio en la página consultada y remite a la iniciativa HEARTS para el manejo en atención primaria (OPS, s. f.).

### 4.5 GPC Colombia 2025

La GPC 2025 define hipertensión arterial en adultos de 18 años o más a partir de PAS mayor o igual a 130 mmHg y/o PAD mayor o igual a 80 mmHg con MAPA, si está disponible, o AMPA, y exige confirmar la cifra de consultorio con medición fuera del consultorio (MSPS, 2025, Rec. 13). La recomendación es fuerte a favor, con certeza baja en la evidencia. La misma guía describe la hipertensión domiciliaria como una presión mayor o igual a 135/85 mmHg y la hipertensión ambulatoria como una media de 24 horas mayor o igual a 130/80 mmHg (MSPS, 2025, módulo 7). Esa coexistencia de 130/80 y 135/85 es una inconsistencia interna de la guía y se discute en la sección 7.

La GPC 2025 también reproduce la clasificación de grados de la ESH 2023, con grado 3 en 180/110 mmHg, y adopta la tabla de categorías de la AHA/ACC 2025 con estadio 1 en 130-139/80-89 mmHg y estadio 2 en 140/90 mmHg o más (MSPS, 2025, Tablas 7-2 y 7-3). Para el control, el indicador de calidad de la guía usa una meta menor de 130/80 mmHg (MSPS, 2025, indicador 3).

### 4.6 Tabla comparativa de umbrales

**Tabla 1. Umbrales de hipertensión y de crisis por fuente.**

| Fuente | Umbral de hipertensión en consultorio | Umbral domiciliario (AMPA) | Categorías | Crisis | Verificación |
|---|---|---|---|---|---|
| OMS 2021/2025 | Mayor o igual a 140/90 mmHg en dos días distintos | No define un umbral domiciliario propio | No usa estadios; define hipertensión y metas | Generalmente 180/120 mmHg o más con síntomas | Directa en hoja de datos OMS 2025; indirecta para la guía 2021 |
| ACC/AHA 2017 | Mayor o igual a 130/80 mmHg | Mayor o igual a 130/80 mmHg | Normal, elevada, estadio 1, estadio 2 | Mayor de 180 y/o mayor de 120 mmHg | Indirecta en GPC 2025; texto completo bloqueado |
| AHA/ACC 2025 | Mayor o igual a 130/80 mmHg | No cambia el umbral de 130/80 mmHg | Iguales a 2017 | No verificado en esta revisión | Indirecta en GPC 2025, Tabla 7-2 |
| ESC 2024 | Mayor o igual a 140/90 mmHg; elevada 120-139/70-89 | Mayor o igual a 135/85 mmHg; elevada 120-134/70-84 | No elevada, elevada, hipertensión | Emergencia con daño agudo de órgano; grado 3 desde 180/110 | Indirecta en GPC 2025, Tabla 7-4 |
| ESH 2023 | Mayor o igual a 140/90 mmHg | Mayor o igual a 135/85 mmHg | Óptima, normal, normal-alta, grados 1-3 | Grado 3 desde 180/110; emergencia con daño agudo | Indirecta en GPC 2025, Tabla 7-3 |
| OPS/PAHO | Mayor o igual a 140/90 mmHg | No define | Prehipertensión 120-139/80-89 | No define en la página consultada | Directa |
| GPC Colombia 2025 | Mayor o igual a 130/80 mmHg confirmado con AMPA o MAPA; grados desde 140/90 | Mayor o igual a 130/80 mmHg en Rec. 13; 135/85 mmHg como "hipertensión domiciliaria" | Óptima a grado 3; estadios AHA | Grado 3 desde 180/110; evaluar emergencia | Directa, texto completo |

## 5. Tabla de categorías de presión arterial

La Tabla 2 presenta las categorías con sus cortes numéricos y la fuente exacta de cada fila. Se separan las tres familias porque no son intercambiables: la AHA/ACC usa estadios y un umbral más bajo; la ESC/ESH usa grados y un umbral más alto; la GPC colombiana mezcla la definición de la AHA/ACC con la tabla de grados de la ESH.

**Tabla 2. Categorías de presión arterial en adultos, con corte numérico y fuente por fila.**

| Categoría | PAS (mmHg) | PAD (mmHg) | Fuente exacta |
|---|---|---|---|
| Normal (AHA/ACC) | Menor de 120 | y menor de 80 | Whelton et al. (2018), tabla de categorías; reproducida en MSPS (2025), Tabla 7-2 |
| Elevada (AHA/ACC) | 120-129 | y menor de 80 | Whelton et al. (2018); MSPS (2025), Tabla 7-2 |
| Hipertensión estadio 1 (AHA/ACC) | 130-139 | o 80-89 | Whelton et al. (2018); MSPS (2025), Tabla 7-2 |
| Hipertensión estadio 2 (AHA/ACC) | Mayor o igual a 140 | o mayor o igual a 90 | Whelton et al. (2018); MSPS (2025), Tabla 7-2 |
| Crisis hipertensiva (AHA/ACC) | Mayor de 180 | y/o mayor de 120 | Whelton et al. (2018); OMS (2025) para el corte de 180/120 |
| Óptima (ESH) | Menor de 120 | y menor de 80 | Mancia et al. (2023); MSPS (2025), Tabla 7-3 |
| Normal (ESH) | 120-129 | y 80-84 | Mancia et al. (2023); MSPS (2025), Tabla 7-3 |
| Normal-alta (ESH) | 130-139 | y/o 85-89 | Mancia et al. (2023); MSPS (2025), Tabla 7-3 |
| Hipertensión grado 1 (ESH) | 140-159 | y/o 90-99 | Mancia et al. (2023); MSPS (2025), Tabla 7-3 |
| Hipertensión grado 2 (ESH) | 160-179 | y/o 100-109 | Mancia et al. (2023); MSPS (2025), Tabla 7-3 |
| Hipertensión grado 3 (ESH) | Mayor o igual a 180 | y/o mayor o igual a 110 | Mancia et al. (2023); MSPS (2025), Tabla 7-3 |
| No elevada (ESC 2024) | Menor de 120 | y menor de 70 | McEvoy et al. (2024); MSPS (2025), Tabla 7-4 |
| Elevada (ESC 2024) | 120-139 | o 70-89 | McEvoy et al. (2024); MSPS (2025), Tabla 7-4 |
| Hipertensión (ESC 2024) | Mayor o igual a 140 | o mayor o igual a 90 | McEvoy et al. (2024); MSPS (2025), Tabla 7-4 |
| Hipertensión confirmada (GPC Colombia 2025) | Mayor o igual a 130 | y/o mayor o igual a 80, con AMPA o MAPA | MSPS (2025), Rec. 13 |
| Hipertensión estadio 1 (GPC Colombia 2025) | 130-139 | o 80-89 | MSPS (2025), Tabla 7-2, que reproduce AHA/ACC 2025 |
| Hipertensión estadio 2 (GPC Colombia 2025) | Mayor o igual a 140 | o mayor o igual a 90 | MSPS (2025), Tabla 7-2 |
| Hipertensión grado 3 (GPC Colombia 2025) | Mayor o igual a 180 | y/o mayor o igual a 110 | MSPS (2025), Tablas 7-3 y 7-5 |

La Tabla 2 mezcla intencionalmente filas que no deben combinarse en una misma regla. El sistema debe elegir una familia y declararla. La recomendación de este documento es usar los cortes domiciliarios de la Tabla 4 y no aplicar directamente los cortes de consultorio de la Tabla 2, porque la presión domiciliaria suele ser menor que la de consultorio y la propia GPC 2025 publica una tabla de equivalencias.

## 6. Crisis hipertensiva: el único anclaje razonable para `critical`

La crisis hipertensiva se define por una elevación severa de la presión arterial, con o sin daño agudo de órgano diana. La AHA/ACC usa el corte de mayor de 180 mmHg de sistólica y/o mayor de 120 mmHg de diastólica y distingue emergencia, cuando hay daño agudo o progresivo de órgano diana, de urgencia, cuando no lo hay (Whelton et al., 2018). La OMS usa generalmente el mismo corte de 180/120 mmHg o más y añade que, si hay síntomas, la persona debe buscar atención de inmediato (OMS, 2025). La diferencia entre "mayor de" y "mayor o igual a" no es clínicamente material; el sistema usa mayor o igual a para no perder el valor exacto del límite.

La ESC 2024 y la ESH 2023 sitúan el grado 3 en 180/110 mmHg y definen la emergencia por la presencia de daño agudo de órgano diana, no por la cifra aislada (McEvoy et al., 2024; Mancia et al., 2023; reproducidos en MSPS, 2025, Tablas 7-3 y 7-5). La GPC 2025 adopta esa lógica: si las cifras superan 180/110 mmHg debe descartarse una emergencia hipertensiva y tratarse de inmediato; en ausencia de emergencia, el diagnóstico debe confirmarse idealmente dentro de la primera semana (MSPS, 2025, módulo 7).

El sistema no puede distinguir una urgencia de una emergencia, porque esa distinción exige exploración física, electrocardiograma, laboratorio, imagen y juicio clínico. Lo único honesto que puede hacer es marcar "posible emergencia hipertensiva" y activar el protocolo de contacto inmediato. La regla de `critical` debe incluir, por tanto, la cifra de crisis y los síntomas de alarma, no solo la cifra.

**Tabla 3. Crisis hipertensiva: definiciones y consecuencias para el sistema.**

| Concepto | Definición | Fuente | Implicación para el sistema |
|---|---|---|---|
| Crisis hipertensiva | PAS mayor de 180 mmHg y/o PAD mayor de 120 mmHg | Whelton et al. (2018); OMS (2025) usa generalmente 180/120 o más | Disparar `critical` con cualquier lectura válida que alcance el corte |
| Emergencia hipertensiva | Elevación severa con daño agudo o progresivo de órgano diana | Whelton et al. (2018); McEvoy et al. (2024); Mancia et al. (2023) | El sistema solo puede marcarla como "posible"; requiere validación clínica inmediata |
| Urgencia hipertensiva | Elevación severa sin daño agudo de órgano diana | Whelton et al. (2018) | La GPC 2025 no la define; no aparece en las tablas de la ESC 2024 ni de la ESH 2023 reproducidas por la GPC; el sistema no debe usarla como diagnóstico |
| Hipertensión grado 3 | PAS mayor o igual a 180 y/o PAD mayor o igual a 110 mmHg | Mancia et al. (2023); MSPS (2025), Tablas 7-3 y 7-5 | Sin síntomas, `high` con revisión prioritaria; con síntomas, `critical` |
| Síntomas de alarma | Cefalea intensa, dolor torácico, disnea, mareo, náuseas, vómito, visión borrosa, ansiedad, confusión, tinnitus, epistaxis, arritmia | OMS (2025) | Activan escalamiento; el subconjunto mayor activa `critical` aunque la cifra no llegue a 180/120 |

## 7. Medición domiciliaria frente a consultorio

El sistema recibe mediciones domiciliarias, no mediciones de consultorio. Aplicar los cortes de consultorio sin examinarlos es un error de diseño, porque la presión domiciliaria promedio suele ser menor y porque las guías publican equivalencias explícitas. La GPC 2025 reproduce la tabla de equivalencias de la AHA/ACC 2025 (Tabla 4 de este documento): 120/80 mmHg de consultorio equivalen a 120/80 mmHg de AMPA, 130/80 a 130/80, 140/90 a 135/85 y 160/100 a 145/90 (MSPS, 2025, tabla de equivalencia entre métodos). La relación no es lineal, y por eso no se puede extrapolar alegremente por encima de 160/100.

**Tabla 4. Equivalencia entre consultorio, AMPA y MAPA.**

| Consultorio (mmHg) | AMPA (mmHg) | MAPA diurna (mmHg) | MAPA nocturna (mmHg) | MAPA 24 horas (mmHg) |
|---|---|---|---|---|
| 120/80 | 120/80 | 120/80 | 100/65 | 115/75 |
| 130/80 | 130/80 | 130/80 | 110/65 | 125/75 |
| 140/90 | 135/85 | 135/85 | 120/70 | 130/80 |
| 160/100 | 145/90 | 145/90 | 140/85 | 145/90 |

Fuente: MSPS (2025), tabla de equivalencia entre métodos de medición, tomada y traducida de la guía AHA/ACC 2025.

### 7.1 Protocolo de medición domiciliaria

La GPC 2025, siguiendo a la ESH 2023, recomienda que el AMPA se realice con dispositivos automáticos validados con manguito braquial, durante siete días consecutivos o al menos tres, con duplicados en la mañana y en la noche, excluyendo el primer día al calcular el promedio (MSPS, 2025, módulo 7; Mancia et al., 2023). La declaración conjunta AHA/AMA exige un dispositivo oscilométrico validado y un protocolo estandarizado de medición y monitoreo (Shimbo et al., 2020). La GPC 2025 también exige dispositivos oscilométricos automatizados con manguito validados y estandarizados según protocolos internacionales, por ejemplo ISO 81060-2, STRIDE-BP o equivalentes (MSPS, 2025, módulo 7).

**Número de lecturas y ventana.** El protocolo mínimo de tres días con dos duplicados en la mañana y dos en la noche produce 12 lecturas; al descartar el primer día quedan 8 lecturas válidas en 2 días. El protocolo ideal de siete días produce 28 lecturas; al descartar el primer día quedan 24 lecturas en 6 días. Esa aritmética es una derivación del protocolo, no un número que la guía formule como "mínimo de lecturas". Este documento propone, por tanto, exigir al menos 8 lecturas válidas en 2 o más días después de descartar el primer día para clasificar una serie, y preferir 24 lecturas en 6 días para tener confianza alta. La Tabla 5 resume la propuesta.

**Tabla 5. Reglas de suficiencia de datos para una serie domiciliaria.**

| Nivel de confianza | Lecturas válidas | Días con lecturas, después de descartar el día 1 | Uso |
|---|---|---|---|
| Alta | 24 o más | 6 o más | Permite todas las reglas de serie, incluida la media de 7 días |
| Media | 12 a 23 | 3 a 5 | Permite reglas de serie; la explicación debe indicar confianza media |
| Baja | 8 a 11 | 2 | Permite reglas de serie; no permite concluir control ni tendencia |
| Insuficiente | Menos de 8 | Menos de 2 | No emite `high` por media; emite `medium` si la media disponible alcanza 135/85, y siempre pide más lecturas |

Fuente: elaboración propia a partir del protocolo de la GPC 2025 y de la ESH 2023 (MSPS, 2025; Mancia et al., 2023). Los conteos son aritmética del protocolo, no umbrales publicados.

### 7.2 El desacuerdo 130/80 frente a 135/85

La GPC 2025 contiene dos afirmaciones que no coinciden. Su recomendación 13 define hipertensión con 130/80 mmHg confirmado por AMPA o MAPA. Su descripción del AMPA, en cambio, considera hipertensión domiciliaria una presión mayor o igual a 135/85 mmHg, siguiendo a la ESC/ESH. La tabla de equivalencias agrava la ambigüedad: hace corresponder 130/80 de consultorio con 130/80 de AMPA, pero 140/90 de consultorio con 135/85 de AMPA. No es un error aritmético: son dos convenciones superpuestas, la de la AHA/ACC y la de la ESC/ESH.

Para un sistema que solo recibe mediciones domiciliarias, este documento recomienda usar 130/80 mmHg como umbral inferior de "posible hipertensión" y 135/85 mmHg como umbral de "hipertensión domiciliaria" que activa el nivel `high`. La justificación es triple: 135/85 es el umbral domiciliario específico de la ESC/ESH y el que la propia GPC usa cuando habla de hipertensión domiciliaria; 130/80 sigue siendo el umbral de la recomendación 13 y de la AHA/ACC para iniciar la conversación clínica; y separar ambos evita etiquetar como hipertensión a una persona con una media de 131/81 mmHg, algo especialmente relevante en un sistema que no tiene confirmación de consultorio. La alternativa, si el cardiólogo asesor prefiere la lógica AHA/ACC pura, es subir el nivel `high` a 140/90 mmHg y mantener 130-139/80-89 como `medium`; la configuración es parametrizable y el Anexo B recoge ambas.

## 8. Estratificación del riesgo cardiovascular: qué variables la impulsan y qué no recolecta el proyecto

Las guías no derivan el riesgo cardiovascular de la presión arterial aislada. SCORE2, el modelo que la GPC 2025 recomienda recalibrado para Colombia como SCORE2-PURE, se construyó con edad, tabaquismo, presión arterial sistólica, colesterol total y colesterol HDL, con modelos específicos por sexo, en personas de 40 a 69 años sin enfermedad cardiovascular previa ni diabetes (SCORE2 Working Group, 2021). La guía AHA/ACC 2017 usa las ecuaciones de cohorte agrupadas, que incorporan edad, sexo, raza, colesterol total, HDL, presión arterial sistólica, diabetes, tabaquismo y tratamiento antihipertensivo (Whelton et al., 2018). La GPC 2025 añade que, cuando no se disponga de perfil lipídico, puede usarse el puntaje INTERHEART sin laboratorio con recalibración colombiana o la calculadora HEARTS de la OMS/OPS, y que esas herramientas no deben omitirse (MSPS, 2025, Rec. 17, consideraciones adicionales).

**Tabla 6. Variables que exige el riesgo cardiovascular frente a las que recolecta el proyecto.**

| Variable | ¿La exige SCORE2? | ¿La exige la ecuación AHA/ACC? | ¿La recolecta el proyecto? | Consecuencia |
|---|---|---|---|---|
| Edad | Sí | Sí | Sí | Disponible, pero insuficiente por sí sola |
| Sexo | Sí, modelos específicos | Sí | No declarado en el alcance | Sin sexo no se puede aplicar SCORE2 |
| Tabaquismo | Sí | Sí | No | No se puede calcular SCORE2 ni la ecuación AHA/ACC |
| Presión arterial sistólica | Sí | Sí | Sí | Disponible |
| Colesterol total | Sí | Sí | No | No se puede calcular SCORE2 ni la ecuación AHA/ACC |
| Colesterol HDL | Sí | Sí | No | No se puede calcular SCORE2 ni la ecuación AHA/ACC |
| Diabetes | Excluida del SCORE2 base; variante específica | Sí | No | No se puede clasificar el riesgo con ninguna de las dos |
| Enfermedad renal crónica o albuminuria | No en SCORE2 base; modificador clínico | No en la ecuación base | No | No se puede ajustar el riesgo |
| Enfermedad cardiovascular previa | Excluida del SCORE2 base | Sí, cambia la categoría | No | No se puede distinguir prevención primaria de secundaria |
| Tratamiento antihipertensivo | No en SCORE2 base | Sí | Parcial: eventos de medicación, no estado terapéutico | No se puede aplicar la ecuación AHA/ACC con tratamiento |
| Peso y talla | No | No | Sí | Permiten calcular IMC como contexto, no riesgo |
| Frecuencia cardíaca | No | No | Sí | Contexto y detección de anomalías, no riesgo |
| Síntomas | No | No | Sí | Alarmas clínicas, no riesgo |
| Estado de ánimo | No | No | Sí | Contexto, sin asociación validada con el nivel de presión |

Fuente: SCORE2 Working Group (2021); Whelton et al. (2018); MSPS (2025), Recs. 17 y 40; alcance del proyecto descrito en el manual técnico.

La conclusión es incómoda pero necesaria: con los datos disponibles el sistema puede calcular una categoría de presión arterial, un estado de control frente a una meta, una media, una variabilidad, una tendencia y una adherencia reportada, pero no puede calcular un riesgo cardiovascular a 10 años. Tampoco puede usar el nivel de presión como sustituto del riesgo, porque una persona joven con 150/95 mmHg y sin otros factores puede tener un riesgo absoluto menor que una persona mayor con 135/85 mmHg, diabetes y tabaquismo.

Por eso este documento recomienda renombrar la salida del sistema. Donde el manual dice "clasificar el riesgo cardiovascular", el sistema debe decir "nivel de severidad de la alerta" y reservar la expresión "riesgo cardiovascular" para una calculadora validada que el proyecto no tiene. Si el equipo insiste en mostrar una estimación de riesgo, debe hacerlo solo con SCORE2-PURE o con la calculadora HEARTS, con todas sus variables, y marcarla como estimación no validada en el prototipo. Mostrar "riesgo alto" a partir de la presión arterial sería una afirmación que las fuentes no respaldan.

## 9. Anomalías: lo clínicamente significativo frente a lo fisiológicamente imposible

La validación de plausibilidad ya está fijada por el manual: sistólica entre 80 y 200 mmHg y diastólica entre 40 y 130 mmHg. Esa es la frontera de lo imposible, no la de lo anormal. Entre ambas hay tres categorías que el sistema debe separar.

**Categoría A: lectura inválida o error de medición.** Se rechaza y se pide repetir. Criterios: sistólica menor o igual a diastólica; diferencia sistólica-diastólica menor de 20 mmHg; diferencia mayor de 150 mmHg; frecuencia cardíaca fuera de 30 a 220 lpm; marca temporal futura o duplicada; valor exactamente en el límite 200/130 mmHg sin contexto; presión de pulso mayor de 100 mmHg. La diferencia sistólica-diastólica menor de 20 mmHg es fisiológicamente improbable con un manguito bien colocado y suele indicar error de técnica, arritmia o un dispositivo descalibrado; la mayor de 100 mmHg puede ser real en personas mayores con arterias rígidas, pero también es un signo frecuente de error, por lo que se marca para repetir antes de interpretar. Estos cortes son reglas de ingeniería, no umbrales publicados en una guía, y se marcan como "no verificados" hasta que el asesor clínico los firme.

**Categoría B: valor plausible pero anómalo para el paciente.** Se compara con la línea base individual, definida como la mediana de las lecturas válidas de los últimos 30 días. Se marca anomalía si la sistólica se desvía 30 mmHg o más de la mediana, o la diastólica 20 mmHg o más, o si el valor se aleja más de tres desviaciones estándar robustas. El fundamento es que la norma ISO 81060-2 exige a los dispositivos validados un error medio menor o igual a 5 mmHg y una desviación estándar menor o igual a 8 mmHg (ISO, 2018); una diferencia de 30 mmHg equivale a casi cuatro desviaciones estándar y es improbable que se deba solo al error del dispositivo. El texto de la norma no es de acceso abierto y no se verificó directamente en esta revisión; se cita por su número y por la exigencia de validación que la GPC 2025 le atribuye.

**Categoría C: valor plausible y clínicamente significativo.** Es la que alimenta las alertas: media sostenida por encima de los umbrales, tendencia ascendente, hipotensión, taquicardia o bradicardia, síntomas compatibles. Una lectura aislada de 150/95 mmHg en una persona que suele medir 120/75 es una señal, pero no una serie; la regla debe pedir repetición antes de escalar, salvo que se trate de una cifra de crisis o de un síntoma de alarma.

**Tabla 7. Reglas de anomalía y su tratamiento.**

| Tipo | Criterio propuesto | Acción | Fuente o estado |
|---|---|---|---|
| Implausible | Fuera de 80-200/40-130 mmHg; sistólica menor o igual a diastólica | Rechazar, pedir repetir | Manual del proyecto; MSPS (2025) para el uso de dispositivos validados |
| Error probable | Diferencia sistólica-diastólica menor de 20 mmHg o mayor de 150 mmHg; presión de pulso mayor de 100 mmHg; frecuencia cardíaca fuera de 30-220 lpm | Marcar `error_medicion`, pedir repetir, no clasificar | Regla de ingeniería, no verificada en guía; requiere firma clínica |
| Anómalo para el paciente | Desviación de 30 mmHg o más en sistólica o 20 mmHg o más en diastólica frente a la mediana de 30 días; más de 3 desviaciones estándar robustas | Marcar `anomalia_individual`, pedir segunda lectura, no cambiar la severidad por sí sola | ISO 81060-2 (2018) para el error del dispositivo; regla de ingeniería |
| Tendencia | Aumento de 10 mmHg o más en la media sistólica de 7 días frente a la ventana anterior de 7 días | Marcar `tendencia_ascendente`, severidad `medium` si el resto está en `low` | MSPS (2025) cita el efecto de 10 mmHg en eventos; regla operativa |
| Clínicamente significativo | Media con PAS mayor o igual a 135 mmHg o PAD mayor o igual a 85 mmHg, o lectura mayor o igual a 160/100 mmHg, o hipotensión sintomática, o síntomas | Aplicar el mapeo de la sección 10 | MSPS (2025); McEvoy et al. (2024); Mancia et al. (2023) |
| Crisis | Lectura mayor o igual a 180/120 mmHg, o mayor o igual a 180/110 mmHg con síntoma | `critical` inmediato | Whelton et al. (2018); OMS (2025); MSPS (2025) |

## 10. Mapeo propuesto de lectura o serie a `low`, `medium`, `high`, `critical`

### 10.1 Definiciones operativas

**Lectura válida:** sistólica entre 80 y 200 mmHg, diastólica entre 40 y 130 mmHg, sistólica mayor que diastólica, diferencia sistólica-diastólica entre 20 y 150 mmHg, frecuencia cardíaca entre 30 y 220 lpm si está presente, marca temporal válida y no duplicada.

**Ventana:** 7 días calendario hacia atrás desde la última lectura válida. Se descarta el primer día calendario con lecturas de la ventana, siempre que queden al menos 2 días con lecturas; si no quedan, se usa la ventana completa y se baja la confianza.

**Media de la serie:** promedio aritmético de todas las lecturas válidas de la ventana, con el primer día descartado. Se calcula solo si hay al menos 8 lecturas válidas en 2 o más días. Se calcula también la media de las medias diarias; si difiere de la media de lecturas en más de 5 mmHg, se marca inestabilidad y se informa en la explicación.

**Confianza:** alta con 24 o más lecturas en 6 o más días; media con 12 a 23 lecturas en 3 a 5 días; baja con 8 a 11 lecturas en 2 días; insuficiente con menos de 8 lecturas o menos de 2 días.

**Síntomas:** se consideran mayores el dolor torácico, la disnea en reposo, el déficit neurológico focal, el síncope y la pérdida visual; se consideran inespecíficos la cefalea, el mareo, las náuseas, el tinnitus, la epistaxis, la ansiedad y las palpitaciones. La lista completa de la OMS incluye cefalea intensa, dolor torácico, mareo, dificultad para respirar, náuseas, vómito, visión borrosa, ansiedad, confusión, tinnitus, epistaxis y arritmia (OMS, 2025).

**Ciclo de vida de la alerta:** una alerta `critical` permanece abierta hasta que un clínico la valide o la descarte; no se cierra por el paso del tiempo.

**Regla de precedencia:** se evalúan en orden y gana la primera que se cumple, con la severidad más alta primero. Las reglas de lectura única críticas se evalúan antes que la suficiencia de datos, para no silenciar una crisis por falta de serie.

### 10.2 Reglas

**Tabla 8. Reglas de mapeo, con condición, severidad, acción y fuente.**

| ID | Condición | Severidad | Acción y explicación | Fuente |
|---|---|---|---|---|
| C1 | Cualquier lectura válida en las últimas 24 horas con PAS mayor o igual a 180 mmHg o PAD mayor o igual a 120 mmHg | `critical` | Contacto inmediato; explicar que la cifra está en rango de crisis y que debe descartarse emergencia | Whelton et al. (2018); OMS (2025) |
| C2 | Cualquier lectura válida con PAS mayor o igual a 180 mmHg o PAD mayor o igual a 110 mmHg, más al menos un síntoma de la lista de la OMS (mayor o inespecífico) en las 6 horas previas o posteriores | `critical` | Contacto inmediato; posible emergencia hipertensiva | MSPS (2025), Tablas 7-3 y 7-5; OMS (2025) |
| C3 | Síntoma de alarma mayor (dolor torácico, disnea en reposo, déficit neurológico focal, síncope, pérdida visual, confusión) en las 6 horas previas o posteriores, con cualquier cifra | `critical` | Contacto inmediato y activación de ruta de urgencias; no esperar a la serie | OMS (2025); MSPS (2025), módulo 7 |
| C4 | Media de la serie con PAS mayor o igual a 180 mmHg o PAD mayor o igual a 110 mmHg, con datos suficientes | `critical` | Contacto inmediato; explicar la media y la ventana | MSPS (2025), Tabla 7-5 |
| C5 | Frecuencia cardíaca mayor o igual a 130 lpm o menor o igual a 40 lpm, más cualquier síntoma (mayor o inespecífico) en las 6 horas previas o posteriores | `critical` | Contacto inmediato; valorar causa cardíaca o medicamentosa | Regla de ingeniería, no verificada en guía; requiere firma clínica |
| H1 | Media de la serie con PAS mayor o igual a 135 mmHg o PAD mayor o igual a 85 mmHg, con datos suficientes | `high` | Revisión clínica prioritaria; confirmar con nuevas lecturas; explicar que es hipertensión domiciliaria | MSPS (2025), módulo 7; Mancia et al. (2023) |
| H2 | Cualquier lectura válida con PAS mayor o igual a 160 mmHg o PAD mayor o igual a 100 mmHg, aunque la media sea menor | `high` | Revisión prioritaria; repetir medición y descartar error | Mancia et al. (2023); MSPS (2025), Tabla 7-3 |
| H3 | Síntoma inespecífico (cefalea, mareo, náuseas, tinnitus, epistaxis, ansiedad, palpitaciones) más lectura con PAS mayor o igual a 140 mmHg o PAD mayor o igual a 90 mmHg, o media con PAS mayor o igual a 135 mmHg o PAD mayor o igual a 85 mmHg | `high` | Revisión prioritaria; si la cifra llega a 180/110, pasa a C2 | OMS (2025); MSPS (2025) |
| H4 | Hipotensión sintomática: PAS menor de 90 mmHg o PAD menor de 60 mmHg más mareo, síncope o debilidad | `high` | Revisión prioritaria; revisar medicación y deshidratación | Regla de ingeniería, no verificada en guía; requiere firma clínica |
| H5 | Frecuencia cardíaca mayor o igual a 130 lpm o menor o igual a 40 lpm, repetida en dos lecturas, sin síntomas | `high` | Revisión prioritaria; repetir y revisar medicación | Regla de ingeniería, no verificada en guía; requiere firma clínica |
| M1 | Media de la serie con PAS 130-134 mmHg o PAD 80-84 mmHg, sin alcanzar 135/85 mmHg, con datos suficientes | `medium` | Revisión en la consulta; posible hipertensión, confirmar con nueva serie | MSPS (2025), Rec. 13; McEvoy et al. (2024) para la categoría elevada |
| M2 | Lectura aislada entre 140/90 y 159/99 mmHg sin media que alcance 135/85 mmHg | `medium` | Repetir medición; explicar que un pico aislado no confirma hipertensión | MSPS (2025); Mancia et al. (2023) |
| M3 | Hipotensión asintomática: PAS menor de 90 mmHg o PAD menor de 60 mmHg sin síntomas | `medium` | Revisar tendencia y medicación; repetir | Regla de ingeniería, no verificada en guía |
| M4 | Frecuencia cardíaca en reposo entre 100 y 129 lpm o entre 41 y 49 lpm, repetida en dos lecturas | `medium` | Revisar contexto, fiebre, medicación, ansiedad; repetir | Regla de ingeniería, no verificada en guía |
| M5 | Datos insuficientes (menos de 8 lecturas o menos de 2 días) con media disponible que alcance 135/85 mmHg | `medium` | Pedir más lecturas; no clasificar como `high` todavía | Elaboración propia a partir del protocolo de la GPC 2025 |
| M6 | Aumento de la media sistólica de 7 días de 10 mmHg o más frente a la ventana anterior de 7 días, con datos suficientes en ambas | `medium` | Revisar tendencia; explicar el cambio | MSPS (2025), módulo 7, efecto de 10 mmHg; regla operativa |
| L1 | Media con PAS menor de 130 mmHg y PAD menor de 80 mmHg, todas las lecturas con PAS menor de 160 mmHg y PAD menor de 100 mmHg, sin síntomas, frecuencia cardíaca normal y datos suficientes | `low` | Sin notificación activa; registrar para el informe | MSPS (2025), Rec. 13; Whelton et al. (2018) |
| L2 | Datos insuficientes sin ningún criterio C, H o M | `low` | Notificar solo al paciente que faltan lecturas; no generar alerta clínica | Elaboración propia |
| X1 | Lectura inválida o error probable de medición | Sin severidad clínica; tipo `error_medicion` | Pedir repetición; no cuenta para la media | Manual del proyecto; ISO (2018); regla de ingeniería |

El orden de las filas de la Tabla 8 es expositivo y agrupa por severidad; el orden real de evaluación es el del seudocódigo: primero todas las reglas `critical`, después las `high`, después las `medium` y al final `low`, con las reglas de lectura única antes que el juicio de suficiencia.

### 10.3 Seudocódigo

```text
funcion clasificar(paciente, ahora):
    lecturas = lecturas_validas(paciente, desde = ahora - 7 dias)
    lecturas = descartar_primer_dia(lecturas)
    recientes = lecturas con timestamp >= ahora - 24 horas
    suficiente = lecturas.cantidad >= 8 y lecturas.dias >= 2
    media = promedio(lecturas) si suficiente

    # Reglas críticas
    si existe r en recientes con r.sbp >= 180 o r.dbp >= 120:
        retornar critical(C1, r)

    si existe r en lecturas con (r.sbp >= 180 o r.dbp >= 110)
       y existe sintoma_oms(r.timestamp, ventana = 6 horas):
        retornar critical(C2, r)

    si existe sintoma_mayor(ventana = 6 horas):
        retornar critical(C3)

    si existe frecuencia_extrema(lecturas, repeticiones = 2)
       y existe sintoma_cualquiera(ventana = 6 horas):
        retornar critical(C5)

    si suficiente y (media.sbp >= 180 o media.dbp >= 110):
        retornar critical(C4, media)

    # Reglas altas
    si existe r en lecturas con r.sbp >= 160 o r.dbp >= 100:
        retornar high(H2, r)

    si existe sintoma_inespecifico(ventana = 6 horas)
       y existe r en lecturas con r.sbp >= 140 o r.dbp >= 90:
        retornar high(H3, r)

    si existe r en lecturas con r.sbp < 90 o r.dbp < 60
       y existe sintoma_hipotension(ventana = 6 horas):
        retornar high(H4, r)

    si existe frecuencia_extrema(lecturas, repeticiones = 2):
        retornar high(H5)

    # Suficiencia y reglas de serie
    si no suficiente:
        m = media_disponible(lecturas)
        si m.sbp >= 135 o m.dbp >= 85:
            retornar medium(M5, m)
        si existe r en lecturas con r.sbp < 90 o r.dbp < 60:
            retornar medium(M3, r)
        retornar low(L2)

    si media.sbp >= 135 o media.dbp >= 85:
        retornar high(H1, media)

    si existe sintoma_inespecifico(ventana = 6 horas)
       y (media.sbp >= 130 o media.dbp >= 80):
        retornar high(H3, media)

    si (media.sbp < 90 o media.dbp < 60)
       y existe sintoma_hipotension(ventana = 6 horas):
        retornar high(H4, media)

    si media.sbp >= 130 o media.dbp >= 80:
        retornar medium(M1, media)

    si existe r en lecturas con (140 <= r.sbp < 160) o (90 <= r.dbp < 100):
        retornar medium(M2, r)

    si media.sbp < 90 o media.dbp < 60:
        retornar medium(M3, media)

    si frecuencia_cardiaca_anomala(lecturas):
        retornar medium(M4, lecturas)

    si tendencia_ascendente(media, ventana_anterior = 7 dias):
        retornar medium(M6, media)

    retornar low(L1, media)
```

### 10.4 Ejemplos de aplicación

**Ejemplo 1.** Paciente con 24 lecturas válidas en 6 días, media 128/78 mmHg, sin síntomas. Resultado: `low` (L1), confianza alta, sin notificación activa.

**Ejemplo 2.** Paciente con 24 lecturas en 6 días, media 132/82 mmHg, sin síntomas. Resultado: `medium` (M1), revisión en consulta, confianza alta. No se etiqueta como hipertensión.

**Ejemplo 3.** Paciente con 20 lecturas en 5 días, media 138/86 mmHg. Resultado: `high` (H1), revisión prioritaria, confianza media.

**Ejemplo 4.** Paciente con 24 lecturas, media 126/76 mmHg, pero una lectura aislada de 168/102 mmHg. Resultado: `high` (H2), revisión prioritaria y repetición; la media no explica el nivel, la lectura sí.

**Ejemplo 5.** Paciente con 10 lecturas en 2 días, media 142/90 mmHg. Resultado: `medium` (M5), porque los datos son insuficientes para `high`; se piden más lecturas. Es una decisión conservadora y explícita.

**Ejemplo 6.** Lectura única de 190/100 mmHg, sin síntomas. Resultado: `critical` (C1), contacto inmediato, aunque no haya serie.

**Ejemplo 7.** Lectura de 176/114 mmHg con cefalea intensa. Resultado: `critical` (C2), porque la PAD es mayor o igual a 110 y hay síntoma.

**Ejemplo 8.** Lectura de 176/114 mmHg sin síntomas. Resultado: no cumple C1, cumple H2 por PAS mayor o igual a 160; `high` con revisión prioritaria y nota de que es grado 3 sin síntoma. Si el asesor prefiere tratar todo grado 3 como `critical`, se cambia el parámetro y se documenta.

**Ejemplo 9.** Lectura de 85/55 mmHg con mareo. Resultado: `high` (H4). Sin mareo, `medium` (M3).

### 10.5 Explicación interpretable que debe acompañar cada alerta

Cada alerta debe registrar y mostrar: identificador de la regla que se activó (C1, H1, M1, etc.); lecturas usadas, con fecha, hora y valores; ventana exacta y primer día descartado; media y desviación estándar; umbral aplicado y su fuente; síntomas considerados y su ventana temporal; nivel de confianza por cantidad de lecturas y días; y una frase que recuerde que es una señal de apoyo y no un diagnóstico, pendiente de validación por el médico.

Esa explicación es la que hace auditable el sistema y la que permite que el médico acepte o descarte la alerta sin confiar ciegamente en el modelo. También es la que exige la normativa colombiana de historia clínica y trazabilidad.

## 11. Configuración propuesta para la tabla de umbrales de alerta

El manual del proyecto define la tabla `alert_config` con las columnas `metric`, `low_threshold`, `high_threshold` y `recipients`. Esa estructura no tiene columnas para el umbral crítico ni para la severidad asociada, de modo que el enum `critical` quedaría sin configuración. La propuesta es añadir `critical_low`, `critical_high`, `severity_on_low` y `severity_on_high`, o bien una tabla `alert_rules` separada con la regla, el umbral, la severidad y la fuente. La Tabla 9 usa las columnas actuales y marca la extensión propuesta.

**Tabla 9. Configuración por defecto propuesta para `alert_config`.**

| Métrica (`metric`) | `low_threshold` | `high_threshold` | `critical_low` (extensión) | `critical_high` (extensión) | Unidad | Justificación y fuente |
|---|---|---|---|---|---|---|
| `systolic` | 90 | 140 | No aplica | 180 | mmHg | 140 es el umbral de hipertensión de OMS/ESC/ESH y el inicio del estadio 2 AHA/ACC; 180 es el corte de crisis de la OMS y la AHA/ACC; 90 es una convención de hipotensión no verificada en las guías de hipertensión |
| `diastolic` | 60 | 90 | No aplica | 120 | mmHg | 90 es el umbral de hipertensión de OMS/ESC/ESH; 120 es el corte de crisis AHA/ACC y OMS; 110 es el grado 3 ESC/ESH y activa `critical` solo con síntoma; 60 es una convención no verificada |
| `systolic_mean_7d` | 90 | 135 | No aplica | 180 | mmHg | 135 es el umbral domiciliario de la ESC/ESH y de la "hipertensión domiciliaria" de la GPC 2025; 180 es el corte de crisis |
| `diastolic_mean_7d` | 60 | 85 | No aplica | 110 | mmHg | 85 es el umbral domiciliario de la ESC/ESH; 110 es el grado 3 ESC/ESH |
| `pulse_pressure` | 20 | 100 | No aplica | No aplica | mmHg | Diferencia sistólica-diastólica menor de 20 o mayor de 100: regla de error de medición, no umbral clínico; requiere firma |
| `heart_rate` | 50 | 100 | 40 | 130 | lpm | 100 es el límite superior convencional del reposo; 50, 40 y 130 son reglas operativas no verificadas en guía; requieren firma |
| `systolic_delta_7d` | No aplica | 10 | No aplica | 30 | mmHg | 10 mmHg es el cambio que la GPC 2025 usa para explicar el efecto en eventos; 30 mmHg es un valor atípico según la exactitud de ISO 81060-2 |
| `diastolic_delta_7d` | No aplica | 5 | No aplica | 20 | mmHg | Cambio operativo para tendencia; 20 mmHg como valor atípico; regla de ingeniería |
| `systolic_diastolic_gap` | 20 | 150 | No aplica | No aplica | mmHg | Fuera de este rango la lectura es inválida; regla de ingeniería |
| `readings_count_7d` | 8 | No aplica | No aplica | No aplica | conteo | Derivado del protocolo mínimo de 3 días con 4 lecturas y descarte del primer día |
| `days_with_readings_7d` | 2 | No aplica | No aplica | No aplica | días | Derivado del mismo protocolo |
| `missed_doses_7d` | No aplica | 2 | No aplica | No aplica | conteo | Contexto de adherencia; no cambia la severidad por sí solo; regla operativa |
| `alarm_symptom` | 0 | 1 | No aplica | No aplica | booleano | Lista de síntomas de la OMS (2025); el síntoma mayor activa `critical` |

La tabla tiene una limitación de diseño que conviene explicitar: `low_threshold` y `high_threshold` son límites para generar un evento candidato, no la severidad final. La severidad la decide el motor de reglas de la Tabla 8. Un sistema que asigne severidad solo comparando con `low_threshold` y `high_threshold` no podrá distinguir `medium` de `high` ni de `critical`.

## 12. Requisitos que la normativa colombiana impone al manejo de alertas

La Resolución 2654 de 2019 regula la telesalud y la telemedicina, no la guía de hipertensión. Es importante corregir esa atribución: la norma no fija umbrales de presión arterial; fija obligaciones de responsabilidad, consentimiento, registro, telemonitoreo, seguridad de plataformas y calidad. La GPC de hipertensión es un documento técnico del Ministerio de Salud y Protección Social, y su adopción formal por resolución no se pudo verificar en esta revisión, por lo que se marca como "no verificado".

**Tabla 10. Obligaciones normativas aplicables al sistema de alertas.**

| Norma | Artículo o criterio | Obligación | Implicación para el software |
|---|---|---|---|
| Resolución 2654 de 2019 | Artículo 6 | El prestador que habilita telemedicina es responsable de cumplir los estándares y de la formación continua del talento humano | La alerta debe tener un prestador responsable y un profesional formado en el uso de la plataforma |
| Resolución 2654 de 2019 | Artículo 7 | Consentimiento informado con alcance, riesgos, beneficios, responsabilidades, privacidad, datos, protocolos de contacto, procedimientos en emergencia y por fallas tecnológicas | El consentimiento debe explicar qué pasa si el sistema falla, cómo se contacta al paciente y quién responde |
| Resolución 2654 de 2019 | Artículo 12, numeral 12.2 | Si se usa inteligencia artificial para teleorientación, debe informarse al usuario y señalar el responsable de la plataforma | La interfaz debe declarar que hay un componente de IA, su función y su responsable |
| Resolución 2654 de 2019 | Artículo 13 | Las actividades de telemedicina deben registrarse en la historia clínica | Cada alerta, lectura y validación debe quedar en la historia clínica o en un registro equivalente trazable |
| Resolución 2654 de 2019 | Artículo 14 y 18 | El telemonitoreo es una categoría de telemedicina; el profesional verifica que el usuario esté entrenado para recolectar y enviar los datos | El sistema debe registrar la capacitación del paciente y la validación del dispositivo |
| Resolución 2654 de 2019 | Artículos 21 a 24 | Seguridad, privacidad, confidencialidad, integridad, disponibilidad y habeas data de las plataformas | Cifrado, control de acceso, registro de auditoría y cumplimiento de la Ley 1581 de 2012 |
| Resolución 2654 de 2019 | Artículos 26 y 27 | Calidad de la atención con accesibilidad, oportunidad, seguridad, pertinencia y continuidad; seguridad del paciente | La alerta crítica no puede quedar sin acuse de recibo ni sin plan de escalamiento |
| Resolución 3100 de 2019 | Numeral 8.3.1.6 | La historia clínica y los registros deben garantizar la trazabilidad de la atención | Registrar quién, cuándo, con qué dato y con qué regla se generó y se cerró cada alerta |
| Resolución 3100 de 2019 | Estándar de talento humano, telemonitoreo | El prestador de referencia cuenta con personal de salud profesional para el telemonitoreo, según lo documentado en el estándar de procesos prioritarios | Debe existir un protocolo documentado de revisión y respuesta a alertas, con responsable y respaldo |
| Resolución 3100 de 2019 | Numeral 9.1.3, literal c | El prestador de telemedicina presenta certificación de un ingeniero de sistemas sobre las responsabilidades de la plataforma | Documentar arquitectura, seguridad y control de cambios |
| Resolución 3100 de 2019 | Reporte de atenciones | Reporte mensual de atenciones en telemedicina, incluido telemonitoreo | El sistema debe permitir exportar el conteo de atenciones y alertas |

La normativa no fija tiempos de respuesta para las alertas. La Resolución 2654 de 2019 exige oportunidad y continuidad, y la Resolución 3100 de 2019 exige procesos prioritarios documentados, pero ningún artículo consultado establece, por ejemplo, "responder una alerta crítica en 15 minutos". Ese vacío debe llenarse con un protocolo interno del prestador, aprobado por el comité clínico y registrado en el consentimiento informado. La Tabla 11 propone tiempos operativos, marcados como propuesta no normativa.

**Tabla 11. Tiempos de respuesta propuestos, no verificados en la norma.**

| Severidad | Canal | Acuse de recibo | Acción clínica esperada | Escalamiento |
|---|---|---|---|---|
| `critical` | Notificación push, SMS y llamada | 5 minutos | 15 minutos | Si no hay acuse en 5 minutos, llamar al respaldo; si no hay acuse en 15 minutos, activar ruta de urgencias y contactar al paciente |
| `high` | Notificación push y tarea en el tablero | 24 horas | 72 horas | Si no hay acuse en 24 horas, notificar al coordinador médico |
| `medium` | Aviso en la aplicación | 72 horas | 7 días | Revisión en la consulta programada |
| `low` | Sin notificación activa; incluir en el informe | No aplica | Siguiente consulta | No aplica |

## 13. Lo que este sistema NO puede afirmar

El sistema no puede diagnosticar hipertensión arterial. El diagnóstico exige confirmación con medición fuera del consultorio y validación clínica, y la propia GPC 2025 exige confirmar la cifra de consultorio con MAPA o AMPA (MSPS, 2025, Rec. 13). Una alerta es una señal, no un diagnóstico.

El sistema no puede calcular el riesgo cardiovascular a 10 años ni clasificarlo en bajo, moderado, alto o muy alto. No recolecta sexo, tabaquismo, colesterol total, colesterol HDL, diabetes, enfermedad renal crónica, albuminuria ni enfermedad cardiovascular previa, que son las variables de SCORE2, de SCORE2-PURE y de las ecuaciones de cohorte agrupadas (SCORE2 Working Group, 2021; Whelton et al., 2018; MSPS, 2025, Recs. 17 y 40). Tampoco puede usar la presión arterial como sustituto del riesgo.

El sistema no puede distinguir una urgencia hipertensiva de una emergencia hipertensiva. Esa distinción exige exploración física, electrocardiograma, laboratorio, imagen y juicio clínico, y la presencia de daño agudo de órgano diana no se deduce de una lectura domiciliaria (Whelton et al., 2018; McEvoy et al., 2024). Solo puede marcar "posible emergencia" y activar el contacto inmediato.

El sistema no puede detectar daño de órgano diana ni hipertrofia ventricular izquierda, retinopatía, enfermedad renal o enfermedad arterial, porque no tiene electrocardiograma, fondo de ojo, laboratorio ni imagen.

El sistema no puede distinguir hipertensión primaria de secundaria, ni descartar causas secundarias como apnea del sueño, enfermedad renal, hiperaldosteronismo o feocromocitoma.

El sistema no puede diagnosticar hipertensión de bata blanca ni hipertensión enmascarada, porque no tiene mediciones de consultorio ni MAPA; solo puede sugerir que se confirmen.

El sistema no puede evaluar la adherencia real. Solo registra eventos de medicación reportados por el paciente, que pueden estar incompletos o ser inexactos.

El sistema no puede recomendar ni ajustar tratamiento, ni prescribir. La prescripción en telemedicina está limitada a las categorías interactiva y telexperticia sincrónica (MSPS, 2019a, Art. 19), y el inicio de tratamiento farmacológico depende del riesgo cardiovascular y del juicio clínico (MSPS, 2025, Rec. 14).

El sistema no puede afirmar que una lectura es "normal" en un sentido absoluto. Los umbrales son convenciones acordadas entre guías que discrepan, y la relación entre presión arterial y riesgo es continua hasta al menos 115/75 mmHg (MSPS, 2025, módulo 7, que cita a Lewington y colaboradores).

El sistema no puede generalizar a niños, adolescentes, embarazadas, pacientes con trasplante, diálisis o dispositivos de asistencia ventricular. La evidencia y los umbrales citados son de población adulta no embarazada.

El sistema no puede afirmar que el estado de ánimo, el estrés o los síntomas inespecíficos predicen una elevación de la presión arterial. Esas variables son contexto y pueden activar una conversación clínica, no una inferencia causal.

El sistema no puede presentarse como dispositivo médico certificado ni como algoritmo validado prospectivamente. Es un prototipo académico y requiere validación clínica antes de cualquier uso asistencial.

El sistema no puede usar el enum `low`/`medium`/`high`/`critical` como sinónimo de riesgo cardiovascular. Ese enum mide severidad de la alerta y debe nombrarse así en la interfaz, en la base de datos y en la documentación del proyecto.

## 14. Pendiente de validación clínica

Los números de este documento son una propuesta técnica construida a partir de fuentes primarias y de decisiones de ingeniería explícitamente marcadas. No son evidencia clínica validada para este sistema, no han sido aprobados por el cardiólogo asesor y no deben usarse para tomar decisiones de tratamiento ni para afirmar riesgos a pacientes o familiares.

Antes de convertir esta propuesta en configuración del producto, el cardiólogo asesor debe revisar y firmar, como mínimo: el umbral domiciliario de `high` (135/85 frente a 140/90); la definición de `critical` (180/120 frente a 180/110 con síntoma); los umbrales de hipotensión (90/60) y de frecuencia cardíaca (50/100/130/40); las reglas de error de medición (diferencia sistólica-diastólica menor de 20 o mayor de 150, presión de pulso mayor de 100); el número mínimo de lecturas y días; la lista de síntomas mayores y menores; y los tiempos de respuesta de la Tabla 11.

La firma debe quedar registrada con nombre, número de registro profesional, fecha, versión del documento y alcance aprobado. Cualquier cambio posterior a los umbrales debe versionarse y volver a firmarse. Mientras no exista esa firma, el sistema debe operar en modo demostración, con alertas marcadas como "propuesta no validada" y sin consecuencias clínicas.

## 15. Referencias

Nota de estilo: en las guías con listas de autoría extensas se citan los seis primeros autores y "et al.", como adaptación de APA 7 para evitar errores de transcripción; en los demás casos se sigue APA 7.

Congreso de la República de Colombia. (2012). Ley 1581 de 2012, por la cual se dictan disposiciones generales para la protección de datos personales. https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981

International Organization for Standardization. (2018). Non-invasive sphygmomanometers — Part 2: Clinical investigation of intermittent automated measurement type (ISO 81060-2:2018). https://www.iso.org/standard/65519.html

Mancia, G., Kreutz, R., Brunström, M., Burnier, M., Grassi, G., Januszewicz, A., et al. (2023). 2023 ESH guidelines for the management of arterial hypertension. Journal of Hypertension, 41(12), 1874–2071. https://doi.org/10.1097/HJH.0000000000003480

McEvoy, J. W., McCarthy, C. P., Bruno, R. M., Brouwers, S., Canavan, M. D., Ceconi, C., et al. (2024). 2024 ESC guidelines for the management of elevated blood pressure and hypertension. European Heart Journal, 45(38), 3912–4018. https://doi.org/10.1093/eurheartj/ehae178

Ministerio de Salud y Protección Social. (2019a). Resolución 2654 de 2019, por la cual se establecen disposiciones para la Telesalud y parámetros para la práctica de la telemedicina en el país. Diario Oficial No. 51.096 del 4 de octubre de 2019. https://normograma.supersalud.gov.co/compilacion/docs/resolucion_minsaludps_2654_2019.htm

Ministerio de Salud y Protección Social. (2019b). Resolución 3100 de 2019, por la cual se definen los procedimientos y condiciones de inscripción de los prestadores de servicios de salud y de habilitación de los servicios de salud y se adopta el Manual de Inscripción de Prestadores y Habilitación de Servicios de Salud. Diario Oficial No. 51.149 del 26 de noviembre de 2019. https://normograma.supersalud.gov.co/compilacion/docs/resolucion_minsaludps_3100_2019.htm

Ministerio de Salud y Protección Social. (2025). Guía de práctica clínica para el manejo de la hipertensión arterial primaria (HTA). Actualización parcial (Guía No. 18, 3.ª ed.). https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/CA/gpc-actualizacion-parcial-hta-primaria-vc.pdf

Organización Mundial de la Salud. (2021). Guideline for the pharmacological treatment of hypertension in adults. https://www.who.int/publications/i/item/9789240033986

Organización Mundial de la Salud. (2025, 25 de septiembre). Hypertension [Hoja de datos]. https://www.who.int/news-room/fact-sheets/detail/hypertension

Organización Panamericana de la Salud. (s. f.). Hypertension. Recuperado el 18 de octubre de 2026, de https://www.paho.org/en/topics/hypertension

SCORE2 Working Group and ESC Cardiovascular Risk Collaboration. (2021). SCORE2 risk prediction algorithms: New models to estimate 10-year risk of cardiovascular disease in Europe. European Heart Journal, 42(25), 2439–2454. https://doi.org/10.1093/eurheartj/ehab309

Shimbo, D., Artinian, N. T., Basile, J. N., Krakoff, L. R., Margolis, K. L., Rakotz, M. K., & Wozniak, G. (2020). Self-measured blood pressure monitoring at home: A joint policy statement from the American Heart Association and American Medical Association. Circulation, 142(4), e42–e63. https://doi.org/10.1161/CIR.0000000000000803

Whelton, P. K., Carey, R. M., Aronow, W. S., Casey, D. E., Collins, K. J., Dennison Himmelfarb, C., et al. (2018). 2017 ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA guideline for the prevention, detection, evaluation, and management of high blood pressure in adults: A report of the American College of Cardiology/American Heart Association Task Force on Clinical Practice Guidelines. Hypertension, 71(6), e13–e115. https://doi.org/10.1161/HYP.0000000000000065

## Anexo A. Registro de verificación de fuentes

| Fuente | Acceso | Qué se verificó | Limitación |
|---|---|---|---|
| GPC Colombia 2025, PDF completo | Directo, descarga y extracción de texto | Recomendaciones 13, 14, 17, 40, 41 y 65; Tablas 7-2, 7-3, 7-4 y 7-5; tabla de equivalencias; protocolo de AMPA; indicador de control | Documento de 1022 páginas; la adopción formal por resolución no se verificó |
| OMS, hoja de datos de hipertensión, 2025 | Directo | Definición 140/90, metas 140/90 y 130/80, crisis 180/120, lista de síntomas | Es una hoja de datos, no la guía completa |
| OMS, guía 2021, página de publicación | Directo | Título, año, ISBN, alcance y recomendaciones generales | El PDF no se pudo descargar por fallas de conexión |
| ACC/AHA 2017 | Indirecto | Categorías, crisis 180/120, urgencia frente a emergencia | Texto completo bloqueado por el editor; se verificó en la GPC 2025 y en la OMS 2025 |
| AHA/ACC 2025 | Indirecto | Tabla de categorías | Se verificó en la GPC 2025, Tabla 7-2; no se accedió al texto original |
| ESC 2024 | Indirecto | Categorías de consultorio y domicilio, grado 3, emergencia | Se verificó en la GPC 2025, Tablas 7-4 y 7-5; no se accedió al texto original |
| ESH 2023 | Indirecto | Categorías, AMPA 135/85, protocolo de 3 a 7 días y descarte del primer día | Se verificó en la GPC 2025, Tabla 7-3 y módulo 7; no se accedió al texto original |
| OPS, página de hipertensión | Directo | Definición 140/90 y prehipertensión 120-139/80-89 | No define umbral domiciliario |
| Resolución 2654 de 2019 | Directo, texto completo | Artículos 6, 7, 12, 13, 14, 18, 21-24, 26 y 27 | Ninguna |
| Resolución 3100 de 2019 | Directo, texto completo | Numeral 8.3.1.6, estándar de telemonitoreo, numeral 9.1.3 y reporte de atenciones | Ninguna |
| SCORE2, resumen indexado | Directo | Variables del modelo y población | Solo resumen, no texto completo |
| Shimbo et al. (2020), resumen indexado | Directo | Dispositivo validado y protocolo estandarizado | Solo resumen, no texto completo |
| ISO 81060-2 | No verificado | Criterio de exactitud citado | Norma de acceso cerrado |

## Anexo B. Decisiones que el asesor clínico debe tomar

| Decisión | Opción recomendada | Alternativa | Consecuencia |
|---|---|---|---|
| Umbral domiciliario de `high` | 135/85 mmHg | 140/90 mmHg | 135/85 es más sensible y coincide con la ESC/ESH; 140/90 es más específico y coincide con la AHA/ACC |
| Umbral de `critical` sin síntomas | 180/120 mmHg | 180/110 mmHg | 180/120 reduce falsos críticos; 180/110 es más sensible al grado 3 |
| Umbral de hipotensión | 90/60 mmHg | 100/70 mmHg en mayores de 80 años | 90/60 es la convención clásica; 100/70 puede ser más útil en ancianos |
| Mínimo de lecturas | 8 en 2 días después del día 1 | 12 en 3 días | 8 es menos exigente y más rápido; 12 es más robusto |
| Ventana de la media | 7 días | 14 días | 7 días coincide con el protocolo; 14 días suaviza la variabilidad |
| Síntomas mayores | Dolor torácico, disnea, déficit neurológico, síncope, pérdida visual | Añadir cefalea intensa y confusión | Añadirlos aumenta la sensibilidad y los falsos positivos |
| Tiempo de acuse de `critical` | 5 minutos | 15 minutos | 5 minutos exige guardia activa; 15 minutos es más factible en un prototipo |
