# Modelo de datos del registro clínico

El registro relacional se implementa sobre PostgreSQL. Está compuesto por dieciséis tablas
y siete tipos enumerados. Este documento es el diccionario de datos que absorbe el manual
técnico: transcribe la sección 1.4 y las relaciones de la sección 1.5, e incorpora la
extensión aprobada de `alert_config` que se justifica en el ADR 0002.

La identidad y los datos clínicos se separan: `users` es la única entidad con datos
personales y las entidades clínicas referencian al paciente por su identificador interno.
Esa separación materializa la seudonimización y permite desactivar una cuenta sin borrar su
historial clínico.

## Convenciones

| Convención             | Aplicación                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Claves primarias       | `UUID` generado con `gen_random_uuid()`, para evitar secuencias predecibles.                         |
| Marcas de tiempo       | `TIMESTAMPTZ` con valor por omisión `now()`, para conservar la zona horaria de los eventos clínicos. |
| Nomenclatura           | Tablas y columnas en `snake_case`, tablas en plural y llaves foráneas con el sufijo `_id`.           |
| Dominios cerrados      | Tipos enumerados del motor para roles, severidades y estados.                                        |
| Integridad referencial | Toda llave foránea declara su acción de borrado.                                                     |
| Magnitudes clínicas    | `NUMERIC` o `INTEGER`; la unidad se indica en la documentación, no en el nombre de la columna.       |
| Validación fisiológica | Vive en la aplicación, nunca como restricción de la base de datos.                                   |

## Tipos enumerados

| Tipo                    | Valores, en orden                                | Columna que lo usa           |
| ----------------------- | ------------------------------------------------ | ---------------------------- |
| `user_role`             | `patient`, `physician`, `caregiver`, `admin`     | `users.role`                 |
| `reading_source`        | `device`, `manual`                               | `readings.source`            |
| `validation_status`     | `valid`, `out_of_range`, `flagged`               | `readings.validation_status` |
| `alert_severity`        | `low`, `medium`, `high`, `critical`              | `alerts.severity`            |
| `alert_status`          | `open`, `acknowledged`, `validated`, `dismissed` | `alerts.status`              |
| `reminder_kind`         | `medication`, `measurement`                      | `reminders.kind`             |
| `teleconsultation_mode` | `sync`, `async`                                  | `teleconsultations.mode`     |

## Tablas

### `users`

Almacena las cuentas y su rol. Es la única entidad que contiene datos de identidad; las
entidades clínicas referencian al paciente por identificador interno.

| Columna         | Tipo          | Restricción                     | Descripción                                                      |
| --------------- | ------------- | ------------------------------- | ---------------------------------------------------------------- |
| `id`            | `UUID`        | PK, `DEFAULT gen_random_uuid()` | Identificador interno del usuario                                |
| `email`         | `TEXT`        | NOT NULL, UNIQUE                | Correo de acceso; se seudonimiza al desactivar la cuenta         |
| `password_hash` | `TEXT`        | NOT NULL                        | Hash de la contraseña con sal (scrypt)                           |
| `role`          | `user_role`   | NOT NULL                        | Rol de acceso: `patient`, `physician`, `caregiver`, `admin`      |
| `full_name`     | `TEXT`        | NOT NULL                        | Nombre completo del usuario                                      |
| `active`        | `BOOLEAN`     | NOT NULL, `DEFAULT TRUE`        | Indica si la cuenta está habilitada; falso tras la desactivación |
| `created_at`    | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`       | Fecha de creación de la cuenta                                   |
| `updated_at`    | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`       | Fecha de la última modificación                                  |

### `patient_profiles`

Perfil clínico del paciente. Existe exactamente un perfil por usuario paciente.

| Columna          | Tipo      | Restricción                                         | Descripción                          |
| ---------------- | --------- | --------------------------------------------------- | ------------------------------------ |
| `id`             | `UUID`    | PK, `DEFAULT gen_random_uuid()`                     | Identificador del perfil clínico     |
| `user_id`        | `UUID`    | NOT NULL, UNIQUE, FK `users(id)` ON DELETE RESTRICT | Usuario dueño del perfil             |
| `birth_date`     | `DATE`    |                                                     | Fecha de nacimiento                  |
| `sex`            | `TEXT`    |                                                     | Sexo del paciente                    |
| `diagnosis_date` | `DATE`    |                                                     | Fecha de diagnóstico de hipertensión |
| `height_cm`      | `NUMERIC` |                                                     | Talla en centímetros                 |
| `weight_kg`      | `NUMERIC` |                                                     | Peso en kilogramos                   |

### `patient_physician`

Tabla de unión que asigna médicos tratantes a pacientes.

| Columna        | Tipo          | Restricción                                     | Descripción              |
| -------------- | ------------- | ----------------------------------------------- | ------------------------ |
| `patient_id`   | `UUID`        | PK, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente asignado        |
| `physician_id` | `UUID`        | PK, FK `users(id)` ON DELETE CASCADE            | Médico tratante asignado |
| `assigned_at`  | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`                       | Fecha de la asignación   |

### `caregiver_links`

Autoriza a un cuidador a acompañar a un paciente con un alcance limitado.

| Columna            | Tipo          | Restricción                                           | Descripción                      |
| ------------------ | ------------- | ----------------------------------------------------- | -------------------------------- |
| `id`               | `UUID`        | PK, `DEFAULT gen_random_uuid()`                       | Identificador del vínculo        |
| `patient_id`       | `UUID`        | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente que autoriza            |
| `caregiver_id`     | `UUID`        | NOT NULL, FK `users(id)` ON DELETE CASCADE            | Cuidador autorizado              |
| `authorized_scope` | `TEXT`        | NOT NULL, `DEFAULT 'minimal'`                         | Alcance de los datos autorizados |
| `created_at`       | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`                             | Fecha de la autorización         |

### `consents`

Historial de consentimientos informados, versionado e inmutable.

| Columna       | Tipo          | Restricción                                           | Descripción                             |
| ------------- | ------------- | ----------------------------------------------------- | --------------------------------------- |
| `id`          | `UUID`        | PK, `DEFAULT gen_random_uuid()`                       | Identificador del consentimiento        |
| `patient_id`  | `UUID`        | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente que otorga                     |
| `version`     | `INTEGER`     | NOT NULL                                              | Versión del documento de consentimiento |
| `accepted_at` | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`                             | Fecha de aceptación                     |
| `content_ref` | `TEXT`        |                                                       | Referencia al documento aceptado        |
| `revoked_at`  | `TIMESTAMPTZ` |                                                       | Fecha de revocación, si aplica          |

### `readings`

Lecturas clínicas validadas de presión arterial y frecuencia cardiaca.

| Columna             | Tipo                | Restricción                                           | Descripción                                              |
| ------------------- | ------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `id`                | `UUID`              | PK, `DEFAULT gen_random_uuid()`                       | Identificador de la lectura                              |
| `patient_id`        | `UUID`              | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente de la lectura                                   |
| `systolic`          | `INTEGER`           | NOT NULL                                              | Presión arterial sistólica en mmHg                       |
| `diastolic`         | `INTEGER`           | NOT NULL                                              | Presión arterial diastólica en mmHg                      |
| `heart_rate`        | `INTEGER`           |                                                       | Frecuencia cardiaca en lpm                               |
| `source`            | `reading_source`    | NOT NULL                                              | Origen: `device` o `manual`                              |
| `device_id`         | `TEXT`              |                                                       | Identificador del dispositivo de origen                  |
| `measured_at`       | `TIMESTAMPTZ`       | NOT NULL                                              | Momento de la medición                                   |
| `validation_status` | `validation_status` | NOT NULL, `DEFAULT 'valid'`                           | Estado de validación: `valid`, `out_of_range`, `flagged` |
| `created_at`        | `TIMESTAMPTZ`       | NOT NULL, `DEFAULT now()`                             | Fecha de persistencia                                    |

### `symptoms_mood`

Registro de síntomas y estado de ánimo, con texto libre para el módulo de procesamiento de
lenguaje natural.

| Columna       | Tipo          | Restricción                                           | Descripción                   |
| ------------- | ------------- | ----------------------------------------------------- | ----------------------------- |
| `id`          | `UUID`        | PK, `DEFAULT gen_random_uuid()`                       | Identificador del registro    |
| `patient_id`  | `UUID`        | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente que reporta          |
| `free_text`   | `TEXT`        |                                                       | Descripción libre de síntomas |
| `mood`        | `TEXT`        |                                                       | Estado de ánimo reportado     |
| `recorded_at` | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`                             | Fecha del registro            |

### `medications`

Medicamentos prescritos al paciente.

| Columna      | Tipo   | Restricción                                           | Descripción                              |
| ------------ | ------ | ----------------------------------------------------- | ---------------------------------------- |
| `id`         | `UUID` | PK, `DEFAULT gen_random_uuid()`                       | Identificador del medicamento            |
| `patient_id` | `UUID` | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente de la prescripción              |
| `name`       | `TEXT` | NOT NULL                                              | Nombre del medicamento                   |
| `dose`       | `TEXT` |                                                       | Dosis prescrita                          |
| `unit`       | `TEXT` |                                                       | Unidad de la dosis                       |
| `frequency`  | `TEXT` |                                                       | Frecuencia de la toma                    |
| `start_date` | `DATE` |                                                       | Fecha de inicio de la prescripción       |
| `end_date`   | `DATE` |                                                       | Fecha de finalización de la prescripción |

### `adherence_events`

Eventos de toma de medicación que sustentan el cálculo de adherencia.

| Columna         | Tipo          | Restricción                                           | Descripción                      |
| --------------- | ------------- | ----------------------------------------------------- | -------------------------------- |
| `id`            | `UUID`        | PK, `DEFAULT gen_random_uuid()`                       | Identificador del evento         |
| `patient_id`    | `UUID`        | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente que registra            |
| `medication_id` | `UUID`        | NOT NULL, FK `medications(id)` ON DELETE CASCADE      | Medicamento asociado             |
| `taken_at`      | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`                             | Momento de la toma               |
| `confirmed`     | `BOOLEAN`     | NOT NULL, `DEFAULT TRUE`                              | Indica si la toma fue confirmada |

### `alerts`

Alertas estratificadas, con su estado de gestión y la validación clínica.

| Columna        | Tipo             | Restricción                                           | Descripción                                              |
| -------------- | ---------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `id`           | `UUID`           | PK, `DEFAULT gen_random_uuid()`                       | Identificador de la alerta                               |
| `patient_id`   | `UUID`           | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente de la alerta                                    |
| `type`         | `TEXT`           | NOT NULL                                              | Tipo de alerta                                           |
| `severity`     | `alert_severity` | NOT NULL                                              | Severidad: `low`, `medium`, `high`, `critical`           |
| `status`       | `alert_status`   | NOT NULL, `DEFAULT 'open'`                            | Estado: `open`, `acknowledged`, `validated`, `dismissed` |
| `note`         | `TEXT`           |                                                       | Nota de gestión                                          |
| `created_at`   | `TIMESTAMPTZ`    | NOT NULL, `DEFAULT now()`                             | Fecha de generación                                      |
| `validated_by` | `UUID`           | FK `users(id)` ON DELETE SET NULL                     | Médico que valida la alerta                              |
| `validated_at` | `TIMESTAMPTZ`    |                                                       | Fecha de validación clínica                              |

### `alert_config`

Umbrales, métricas y destinatarios de las alertas.

| Columna          | Tipo      | Restricción                                 | Descripción                                                            |
| ---------------- | --------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `id`             | `UUID`    | PK, `DEFAULT gen_random_uuid()`             | Identificador de la configuración                                      |
| `patient_id`     | `UUID`    | FK `patient_profiles(id)` ON DELETE CASCADE | Paciente; nulo para configuración general                              |
| `metric`         | `TEXT`    | NOT NULL                                    | Métrica configurada                                                    |
| `low_threshold`  | `NUMERIC` |                                             | Umbral inferior                                                        |
| `high_threshold` | `NUMERIC` |                                             | Umbral superior                                                        |
| `critical_low`   | `NUMERIC` |                                             | Umbral inferior del nivel `critical`; extensión aprobada, ver ADR 0002 |
| `critical_high`  | `NUMERIC` |                                             | Umbral superior del nivel `critical`; extensión aprobada, ver ADR 0002 |
| `recipients`     | `JSONB`   | NOT NULL, `DEFAULT '[]'`                    | Destinatarios de la alerta                                             |

### `reports`

Reportes de seguimiento generados por periodo.

| Columna        | Tipo          | Restricción                                           | Descripción                      |
| -------------- | ------------- | ----------------------------------------------------- | -------------------------------- |
| `id`           | `UUID`        | PK, `DEFAULT gen_random_uuid()`                       | Identificador del reporte        |
| `patient_id`   | `UUID`        | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente del reporte             |
| `period_start` | `DATE`        | NOT NULL                                              | Inicio del periodo               |
| `period_end`   | `DATE`        | NOT NULL                                              | Fin del periodo                  |
| `generated_at` | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`                             | Fecha de generación              |
| `content_ref`  | `TEXT`        |                                                       | Referencia al contenido generado |

### `reminders`

Recordatorios de medicación y de medición.

| Columna        | Tipo            | Restricción                                           | Descripción                        |
| -------------- | --------------- | ----------------------------------------------------- | ---------------------------------- |
| `id`           | `UUID`          | PK, `DEFAULT gen_random_uuid()`                       | Identificador del recordatorio     |
| `patient_id`   | `UUID`          | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente destinatario              |
| `kind`         | `reminder_kind` | NOT NULL                                              | Tipo: `medication` o `measurement` |
| `schedule`     | `TEXT`          |                                                       | Programación del recordatorio      |
| `enabled`      | `BOOLEAN`       | NOT NULL, `DEFAULT TRUE`                              | Indica si está habilitado          |
| `last_sent_at` | `TIMESTAMPTZ`   |                                                       | Último envío realizado             |

### `teleconsultations`

Teleconsultas síncronas y asíncronas entre paciente y médico. El manual titula la sección
`tele-consultations`; el nombre de la tabla es `teleconsultations`, sin guion.

| Columna        | Tipo                    | Restricción                                           | Descripción                      |
| -------------- | ----------------------- | ----------------------------------------------------- | -------------------------------- |
| `id`           | `UUID`                  | PK, `DEFAULT gen_random_uuid()`                       | Identificador de la teleconsulta |
| `patient_id`   | `UUID`                  | NOT NULL, FK `patient_profiles(id)` ON DELETE CASCADE | Paciente de la consulta          |
| `physician_id` | `UUID`                  | NOT NULL, FK `users(id)` ON DELETE RESTRICT           | Médico que atiende               |
| `scheduled_at` | `TIMESTAMPTZ`           |                                                       | Fecha programada                 |
| `mode`         | `teleconsultation_mode` | NOT NULL                                              | Modalidad: `sync` o `async`      |
| `status`       | `TEXT`                  | NOT NULL, `DEFAULT 'scheduled'`                       | Estado de la consulta            |
| `notes`        | `TEXT`                  |                                                       | Notas clínicas de la consulta    |

### `audit_logs`

Registro de accesos, inferencias y eventos críticos para la auditoría.

| Columna         | Tipo          | Restricción                       | Descripción                          |
| --------------- | ------------- | --------------------------------- | ------------------------------------ |
| `id`            | `UUID`        | PK, `DEFAULT gen_random_uuid()`   | Identificador del evento             |
| `actor_user_id` | `UUID`        | FK `users(id)` ON DELETE SET NULL | Usuario que ejecuta la acción        |
| `action`        | `TEXT`        | NOT NULL                          | Acción registrada                    |
| `entity`        | `TEXT`        |                                   | Entidad afectada                     |
| `entity_id`     | `UUID`        |                                   | Identificador de la entidad afectada |
| `ip`            | `TEXT`        |                                   | Dirección IP de origen               |
| `occurred_at`   | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`         | Fecha del evento                     |
| `details`       | `JSONB`       |                                   | Detalle adicional del evento         |

### `refresh_tokens`

Tokens de refresco revocables para la renovación de sesión. Solo se almacena el hash del
token.

| Columna      | Tipo          | Restricción                                | Descripción                        |
| ------------ | ------------- | ------------------------------------------ | ---------------------------------- |
| `id`         | `UUID`        | PK, `DEFAULT gen_random_uuid()`            | Identificador del token            |
| `user_id`    | `UUID`        | NOT NULL, FK `users(id)` ON DELETE CASCADE | Usuario propietario de la sesión   |
| `token_hash` | `TEXT`        | NOT NULL, UNIQUE                           | Hash SHA-256 del token de refresco |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL                                   | Fecha de expiración                |
| `revoked_at` | `TIMESTAMPTZ` |                                            | Fecha de revocación                |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, `DEFAULT now()`                  | Fecha de emisión                   |

## Relaciones y cardinalidades

| Relación                                 | Cardinalidad | Descripción                                              |
| ---------------------------------------- | ------------ | -------------------------------------------------------- |
| `users` - `patient_profiles`             | 1:1          | Cada usuario paciente posee un único perfil clínico      |
| `users` - `patient_physician`            | 1:N          | Un médico puede atender varios pacientes                 |
| `patient_profiles` - `patient_physician` | 1:N          | Un paciente puede tener varios médicos asignados         |
| `users` - `caregiver_links`              | 1:N          | Un cuidador puede acompañar a varios pacientes           |
| `patient_profiles` - `caregiver_links`   | 1:N          | Un paciente puede autorizar a varios cuidadores          |
| `patient_profiles` - `consents`          | 1:N          | Un paciente acumula una versión por cada consentimiento  |
| `patient_profiles` - `readings`          | 1:N          | Un paciente registra múltiples lecturas                  |
| `patient_profiles` - `symptoms_mood`     | 1:N          | Un paciente registra múltiples reportes de síntomas      |
| `patient_profiles` - `medications`       | 1:N          | Un paciente puede tener varios medicamentos prescritos   |
| `medications` - `adherence_events`       | 1:N          | Un medicamento origina varios eventos de toma            |
| `patient_profiles` - `adherence_events`  | 1:N          | Un paciente registra múltiples eventos de adherencia     |
| `patient_profiles` - `alerts`            | 1:N          | Un paciente puede generar múltiples alertas              |
| `users` - `alerts`                       | 1:N          | Un médico puede validar múltiples alertas                |
| `patient_profiles` - `alert_config`      | 1:N          | Un paciente puede tener varias configuraciones de alerta |
| `patient_profiles` - `reports`           | 1:N          | Un paciente acumula múltiples reportes                   |
| `patient_profiles` - `reminders`         | 1:N          | Un paciente puede tener varios recordatorios             |
| `patient_profiles` - `teleconsultations` | 1:N          | Un paciente puede agendar múltiples teleconsultas        |
| `users` - `teleconsultations`            | 1:N          | Un médico puede realizar múltiples teleconsultas         |
| `users` - `audit_logs`                   | 1:N          | Un usuario ejecuta múltiples eventos auditables          |
| `users` - `refresh_tokens`               | 1:N          | Un usuario mantiene varias sesiones                      |

## Reglas de integridad

- Integridad de entidad: cada tabla declara una clave primaria; la tabla de unión
  `patient_physician` usa clave primaria compuesta.
- Integridad referencial: toda llave foránea declara su acción de borrado. Los datos
  dependientes del paciente usan `ON DELETE CASCADE`; el vínculo entre perfil y usuario usa
  `ON DELETE RESTRICT`, de modo que el motor rechaza el borrado físico de un usuario con
  perfil clínico.
- Integridad de dominio: los valores acotados se restringen con los siete tipos enumerados.
- Integridad de unicidad: el correo de usuario es único, cada usuario tiene a lo sumo un
  perfil clínico y cada token de refresco tiene un hash único.
- Conservación del historial: la desactivación de una cuenta no elimina registros clínicos;
  la cuenta se marca inactiva y se seudonimiza, mientras el perfil y sus lecturas se
  conservan.
- Validación fisiológica: los rangos de presión y frecuencia se validan en la aplicación y
  no como restricción de la base de datos, para poder conservar valores atípicos con estado
  `out_of_range` en lugar de descartarlos.

## Índices

| Índice                          | Tabla y columnas                               | Propósito                                              |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `idx_readings_patient_measured` | `readings (patient_id, measured_at DESC)`      | Lecturas de un paciente en orden cronológico inverso   |
| `idx_alerts_patient_status`     | `alerts (patient_id, status)`                  | Alertas de un paciente filtradas por estado            |
| `idx_adherence_events_patient`  | `adherence_events (patient_id, taken_at DESC)` | Eventos de adherencia de un paciente en orden reciente |
| `idx_audit_logs_actor`          | `audit_logs (actor_user_id, occurred_at DESC)` | Eventos auditables de un actor en orden reciente       |
| `idx_refresh_tokens_user`       | `refresh_tokens (user_id)`                     | Sesiones vigentes de un usuario                        |

## Registro de migraciones

La tabla `schema_migrations` no forma parte del modelo del manual. Es el registro interno del
ejecutor de migraciones y guarda el nombre de cada archivo aplicado y su marca de tiempo; no
representa una entidad del dominio y no cuenta dentro de las dieciséis tablas.

## Decisiones de transcripción

- **Extensión de `alert_config`.** El diccionario del manual declara dos umbrales
  (`low_threshold` y `high_threshold`), insuficientes para los cuatro niveles del enum
  `alert_severity`. Se añaden las columnas nullable `critical_low` y `critical_high`; la
  decisión y su alternativa descartada están en el ADR 0002.
- **Acciones de borrado implícitas.** El diccionario del manual deja sin acción de borrado
  tres llaves foráneas. Para cumplir la convención de integridad referencial, este documento
  la hace explícita: `alerts.validated_by` y `audit_logs.actor_user_id` usan
  `ON DELETE SET NULL`, porque la alerta y el evento de auditoría deben sobrevivir al
  borrado del usuario citado; `teleconsultations.physician_id` usa `ON DELETE RESTRICT`,
  porque la teleconsulta es dato clínico y no se elimina al borrar al médico.
