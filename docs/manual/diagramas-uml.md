# Diagramas UML del sistema

Este documento reúne los seis diagramas que el manual técnico exige y que todavía no existían:
clases, estados por clase, colaboración por proceso, secuencia por proceso, componentes y
distribución.

Cada bloque `plantuml` es independiente: se copia tal cual en la herramienta web y se
renderiza solo. Los identificadores de los procesos son los del manual, CU-01 a CU-12, y los
de los actores son los cuatro roles que el esquema ya distingue.

Dos convenciones que valen para todo el documento. Los nombres de clase van en inglés
singular, igual que las tablas, para que el diagrama se pueda cotejar con el modelo
relacional y con el código; el texto que los rodea va en español, que es la lengua del manual.
Las clases persistentes llevan los atributos que la base guarda; las clases de dominio, que no
se guardan enteras, llevan las operaciones que el manual describe en sus casos de uso.

## 7. Diagrama de clases

Las dieciséis entidades del registro clínico, los siete tipos enumerados y las clases de
dominio que sostienen el análisis, las alertas y los reportes. Las asociaciones con
multiplicidad son las del modelo relacional; las clases de dominio no se persisten y existen
para que las operaciones del sistema tengan dueño.

```plantuml
@startuml
title Diagrama de clases del sistema

skinparam classAttributeIconSize 0

package "Identidad y acceso" {

  class User <<entidad>> {
    - id : UUID
    - email : String
    - passwordHash : String
    - role : UserRole
    - fullName : String
    - active : Boolean
    - createdAt : Timestamp
    - updatedAt : Timestamp
    + authenticate(password : String) : Boolean
    + changeRole(role : UserRole, actor : User) : void
    + deactivate(actor : User) : void
  }

  class RefreshToken <<entidad>> {
    - id : UUID
    - tokenHash : String
    - expiresAt : Timestamp
    - revokedAt : Timestamp
    - createdAt : Timestamp
    + isValid() : Boolean
    + rotate() : RefreshToken
    + revoke() : void
  }

  class AuditLog <<entidad>> {
    - id : UUID
    - action : String
    - entity : String
    - entityId : UUID
    - ip : String
    - occurredAt : Timestamp
    - details : JSON
    + describe() : String
  }

  enum UserRole {
    patient
    physician
    caregiver
    admin
  }
}

package "Paciente y seguimiento" {

  class PatientProfile <<entidad>> {
    - id : UUID
    - birthDate : Date
    - sex : String
    - diagnosisDate : Date
    - heightCm : Decimal
    - weightKg : Decimal
    + ageAt(date : Date) : Integer
    + bodyMassIndex() : Decimal
  }

  class PatientPhysician <<entidad>> {
    - assignedAt : Timestamp
  }

  class CaregiverLink <<entidad>> {
    - id : UUID
    - authorizedScope : String
    - createdAt : Timestamp
    + permits(action : String) : Boolean
  }

  class Consent <<entidad>> {
    - id : UUID
    - version : Integer
    - acceptedAt : Timestamp
    - contentRef : String
    - revokedAt : Timestamp
    + isActive() : Boolean
    + revoke() : void
  }

  class Reminder <<entidad>> {
    - id : UUID
    - kind : ReminderKind
    - schedule : String
    - enabled : Boolean
    - lastSentAt : Timestamp
    + due(at : Timestamp) : Boolean
  }

  enum ReminderKind {
    medication
    measurement
  }
}

package "Registro clínico" {

  class Reading <<entidad>> {
    - id : UUID
    - systolic : Integer
    - diastolic : Integer
    - heartRate : Integer
    - source : ReadingSource
    - deviceId : String
    - measuredAt : Timestamp
    - validationStatus : ValidationStatus
    + classify(validator : VitalSignsValidator) : ValidationStatus
    + isOutOfRange() : Boolean
  }

  class SymptomMood <<entidad>> {
    - id : UUID
    - freeText : String
    - mood : String
    - recordedAt : Timestamp
    + alarmSymptoms() : Boolean
  }

  class Medication <<entidad>> {
    - id : UUID
    - name : String
    - dose : String
    - unit : String
    - frequency : String
    - startDate : Date
    - endDate : Date
    + isActiveAt(date : Date) : Boolean
  }

  class AdherenceEvent <<entidad>> {
    - id : UUID
    - takenAt : Timestamp
    - confirmed : Boolean
  }

  enum ReadingSource {
    device
    manual
  }

  enum ValidationStatus {
    valid
    out_of_range
    flagged
  }
}

package "Análisis y alertas" {

  class VitalSignsWindow {
    - readings : Reading[]
    - from : Timestamp
    - to : Timestamp
    + validCount() : Integer
    + daysWithReadings() : Integer
    + meanSystolic() : Decimal
    + meanDiastolic() : Decimal
    + isSufficient() : Boolean
  }

  class VitalSignsValidator {
    + validate(reading : Reading) : ValidationStatus
  }

  class RiskAssessment {
    - probability : Decimal
    - severity : AlertSeverity
    - assessmentDate : Timestamp
    + explain() : RiskFactor[]
    + triggersAlert() : Boolean
  }

  class RiskFactor {
    - name : String
    - weight : Decimal
    - description : String
  }

  class ModelScorer <<interfaz>> {
    + score(window : VitalSignsWindow, history : Reading[]) : RiskAssessment
  }

  class AlertRule <<entidad>> {
    - metric : String
    - lowThreshold : Decimal
    - highThreshold : Decimal
    - criticalLow : Decimal
    - criticalHigh : Decimal
    - recipients : JSON
    + evaluate(window : VitalSignsWindow) : AlertSeverity
  }

  class Alert <<entidad>> {
    - id : UUID
    - type : String
    - severity : AlertSeverity
    - status : AlertStatus
    - note : String
    - createdAt : Timestamp
    - validatedAt : Timestamp
    + acknowledge() : void
    + validate(physician : User) : void
    + dismiss(physician : User, reason : String) : void
  }

  enum AlertSeverity {
    low
    medium
    high
    critical
  }

  enum AlertStatus {
    open
    acknowledged
    validated
    dismissed
  }
}

package "Reportes y comunicación" {

  class Report <<entidad>> {
    - id : UUID
    - periodStart : Date
    - periodEnd : Date
    - generatedAt : Timestamp
    - contentRef : String
    + toCsv() : String
    + toPdf() : Binary
  }

  class Teleconsultation <<entidad>> {
    - id : UUID
    - scheduledAt : Timestamp
    - mode : TeleconsultationMode
    - status : String
    - notes : String
    + start() : void
    + close(notes : String) : void
  }

  class AdherenceSummary {
    - taken : Integer
    - missed : Integer
    - periodDays : Integer
    + adherenceRate() : Decimal
  }

  enum TeleconsultationMode {
    sync
    async
  }
}

User "1" -- "0..1" PatientProfile : tiene perfil
User "1" -- "0..*" RefreshToken : abre sesiones
User "1" -- "0..*" AuditLog : es actor
PatientProfile "1" -- "0..*" Consent : otorga
PatientProfile "1" -- "0..*" Reading : registra
PatientProfile "1" -- "0..*" SymptomMood : reporta
PatientProfile "1" -- "0..*" Medication : recibe
PatientProfile "1" -- "0..*" Alert : recibe
PatientProfile "1" -- "0..*" AlertRule : configura
PatientProfile "1" -- "0..*" Report : acumula
PatientProfile "1" -- "0..*" Reminder : programa
PatientProfile "1" -- "0..*" Teleconsultation : agenda
PatientProfile "1" -- "0..*" CaregiverLink : autoriza
User "1" -- "0..*" CaregiverLink : cuida
PatientProfile "1" -- "0..*" PatientPhysician
User "1" -- "0..*" PatientPhysician : atiende
User "1" -- "0..*" Alert : valida
User "1" -- "0..*" Teleconsultation : atiende
Medication "1" -- "0..*" AdherenceEvent : registra
PatientProfile "1" -- "0..*" AdherenceEvent : reporta

VitalSignsValidator ..> Reading : clasifica
VitalSignsWindow "1" *-- "0..*" Reading : agrupa
AlertRule ..> VitalSignsWindow : evalúa
RiskAssessment "1" *-- "0..*" RiskFactor : explica
ModelScorer ..> RiskAssessment : produce
Alert ..> RiskAssessment : deriva
Alert ..> AlertRule : aplica
Report ..> Reading : resume
Report ..> AdherenceSummary : incluye
Report ..> Alert : incluye
AdherenceSummary ..> AdherenceEvent : calcula

@enduml
```

## 8. Diagramas de estados por clase

Un diagrama por clase con ciclo de vida propio. Las clases que no aparecen aquí
(`PatientProfile`, `PatientPhysician`, `CaregiverLink`, `SymptomMood`, `AuditLog`, `Report`,
`AlertRule`, `VitalSignsWindow`, `RiskAssessment`, `RiskFactor`) son registros, asociaciones
o valores calculados: existen desde que se crean hasta que se consultan, y un diagrama de
estados sobre ellos no diría nada que el diagrama de clases no diga ya.

### 8.1 Usuario

```plantuml
@startuml
title Estados de User

[*] --> PendienteDeConsentimiento : alta del paciente
PendienteDeConsentimiento --> Activo : consentimiento aceptado
PendienteDeConsentimiento --> Activo : alta por administración
Activo --> Activo : inicio y cierre de sesión
Activo --> Inactivo : desactivación por administración
Activo --> Inactivo : cuenta suspendida por seguridad
Inactivo --> Seudonimizado : purga de identidad
Seudonimizado --> [*]
Inactivo --> Activo : reactivación por administración
note right of Seudonimizado
  email = deactivated+<id>
  fullName = "Cuenta desactivada"
  passwordHash = "!"
  el historial clínico se conserva
end note
@enduml
```

### 8.2 Consentimiento

```plantuml
@startuml
title Estados de Consent

[*] --> Vigente : aceptación de la versión publicada
Vigente --> Revocado : revocación por el paciente
Vigente --> Superado : publicación de una versión nueva
Superado --> Vigente : aceptación de la versión nueva
Revocado --> Vigente : nueva aceptación
Revocado --> [*]
note right of Superado
  existe una aceptación con revokedAt nulo,
  pero no corresponde a la versión requerida
end note
@enduml
```

### 8.3 Lectura

```plantuml
@startuml
title Estados de Reading

[*] --> Recibida : ingesta del dispositivo
[*] --> Registrada : registro manual del paciente
Recibida --> Validada : valores plausibles
Registrada --> Validada : valores plausibles
Recibida --> FueraDeRango : valor fisiológicamente implausible
Registrada --> FueraDeRango : valor fisiológicamente implausible
Validada --> Observada : marcada para revisión médica
FueraDeRango --> Observada : el médico revisa el valor atípico
Validada --> [*]
Observada --> [*]
FueraDeRango --> [*]
note right of FueraDeRango
  el valor se conserva:
  validationStatus = out_of_range
end note
@enduml
```

### 8.4 Alerta

```plantuml
@startuml
title Estados de Alert

[*] --> Abierta : la regla de umbrales dispara la alerta
Abierta --> Reconocida : el médico acusa recibo
Abierta --> Validada : el médico valida
Abierta --> Descartada : el médico descarta con motivo
Reconocida --> Validada : el médico valida
Reconocida --> Descartada : el médico descarta con motivo
Validada --> [*]
Descartada --> [*]
note right of Validada
  validatedBy y validatedAt quedan escritos;
  ninguna alerta se cierra sin una persona
end note
@enduml
```

### 8.5 Token de refresco

```plantuml
@startuml
title Estados de RefreshToken

[*] --> Vigente : inicio de sesión
Vigente --> Rotado : el cliente refresca la sesión
Vigente --> Revocado : cierre de sesión
Vigente --> Expirado : vence el plazo
Vigente --> Revocado : reutilización detectada en la cuenta
Rotado --> Vigente : el token nuevo ocupa el lugar
Rotado --> [*]
Revocado --> [*]
Expirado --> [*]
note right of Rotado
  la reutilización de un token rotado
  revoca todos los refrescos de la cuenta
end note
@enduml
```

### 8.6 Medicamento

```plantuml
@startuml
title Estados de Medication

[*] --> Indicado : el médico prescribe
Indicado --> Activo : inicia el tratamiento
Activo --> Suspendido : suspensión temporal
Suspendido --> Activo : reanudación
Activo --> Finalizado : fin del tratamiento
Suspendido --> Finalizado : fin del tratamiento
Activo --> Finalizado : cambio de medicamento
Finalizado --> [*]
@enduml
```

### 8.7 Evento de adherencia

```plantuml
@startuml
title Estados de AdherenceEvent

[*] --> Pendiente : llega la hora de la dosis
Pendiente --> Confirmado : el paciente confirma
Pendiente --> Omitido : vence la ventana sin confirmación
Confirmado --> [*]
Omitido --> [*]
@enduml
```

### 8.8 Recordatorio

```plantuml
@startuml
title Estados de Reminder

[*] --> Programado : el paciente o el médico lo crea
Programado --> Enviado : llega la hora y se notifica
Enviado --> Programado : se reprograma la siguiente
Programado --> Deshabilitado : el paciente lo desactiva
Enviado --> Deshabilitado : el paciente lo desactiva
Deshabilitado --> Programado : el paciente lo reactiva
Deshabilitado --> [*] : se retira
@enduml
```

### 8.9 Teleconsulta

```plantuml
@startuml
title Estados de Teleconsultation

[*] --> Agendada : el médico la programa
Agendada --> EnCurso : se inicia la sesión
Agendada --> Cancelada : se cancela antes de empezar
EnCurso --> Finalizada : se cierra con notas
EnCurso --> Interrumpida : se pierde la conexión
Interrumpida --> EnCurso : se reanuda
Interrumpida --> Finalizada : se cierra con notas
Finalizada --> [*]
Cancelada --> [*]
@enduml
```

### 8.10 Modelo de clasificación

```plantuml
@startuml
title Estados del modelo de apoyo a la decisión

[*] --> Entrenado : se entrena con el conjunto publicado
Entrenado --> Evaluado : se miden discriminación y calibración
Evaluado --> Desplegado : supera el umbral de AUROC acordado
Evaluado --> Entrenado : no lo supera
Desplegado --> EnServicio : recibe ventanas de medición
EnServicio --> EnServicio : estima probabilidad de descontrol
EnServicio --> Retirado : se retira por deriva o por decisión clínica
Retirado --> Entrenado : se reentrena
Retirado --> [*]
@enduml
```

## 9. Diagramas de colaboración por proceso

Un diagrama de colaboración muestra los mismos objetos que la secuencia, pero ordenados por
sus enlaces en lugar de por el tiempo: los mensajes van numerados y esa numeración es el
orden. PlantUML no tiene una notación propia para este diagrama, así que se dibuja con
objetos y mensajes numerados, que es la forma habitual de representarlo.

### 9.1 CU-01 Autenticación y acceso al sistema

```plantuml
@startuml
title CU-01 Autenticación y acceso: colaboración

object "Interfaz web" as ui
object "Controlador de sesión" as ctrl
object "Servicio de autenticación" as svc
object "Repositorio de usuarios" as users
object "Repositorio de tokens" as tokens
object "Auditoría" as audit

ui --> ctrl : 1: iniciarSesion(email, password)
ctrl --> svc : 2: authenticate(email, password)
svc --> users : 3: findByEmail(email)
users --> svc : 4: user
svc --> svc : 5: verifyPassword(password)
svc --> tokens : 6: issueRefreshToken(user)
svc --> audit : 7: record("auth.login")
svc --> ctrl : 8: accessToken + refreshToken
ctrl --> ui : 9: sesión iniciada
@enduml
```

### 9.2 CU-02 Gestión del consentimiento informado

```plantuml
@startuml
title CU-02 Consentimiento informado: colaboración

object "Interfaz del paciente" as ui
object "Controlador de consentimiento" as ctrl
object "Servicio de consentimiento" as svc
object "Repositorio de consentimientos" as repo
object "Resolvedor de perfil" as profile
object "Auditoría" as audit

ui --> ctrl : 1: aceptar(version, contentRef)
ctrl --> profile : 2: resolve(authToken)
profile --> ctrl : 3: patientProfile
ctrl --> svc : 4: accept(patientId, version, contentRef)
svc --> repo : 5: append(consent)
svc --> audit : 6: record("consent.accepted")
svc --> ctrl : 7: consentId
ctrl --> ui : 8: consentimiento vigente
@enduml
```

### 9.3 CU-03 Captura automática de signos vitales

```plantuml
@startuml
title CU-03 Captura automática desde tensiómetros: colaboración

object "Tensiómetro" as device
object "Broker MQTT" as broker
object "Servicio de ingesta" as ingest
object "Flujo crudo" as mongo
object "Validador fisiológico" as validator
object "Repositorio de lecturas" as readings
object "Motor de alertas" as alerts

device --> broker : 1: publicar(medicion)
broker --> ingest : 2: entregar(medicion)
ingest --> ingest : 3: validateSignature()
ingest --> mongo : 4: append(rawReading)
ingest --> validator : 5: validate(reading)
validator --> ingest : 6: validationStatus
ingest --> readings : 7: save(reading)
ingest --> alerts : 8: evaluate(reading)
@enduml
```

### 9.4 CU-04 Registro manual de presión arterial y síntomas

```plantuml
@startuml
title CU-04 Registro manual de presión y síntomas: colaboración

object "Interfaz del paciente" as ui
object "Controlador de lecturas" as ctrl
object "Compuerta de consentimiento" as gate
object "Validador fisiológico" as validator
object "Repositorio de lecturas" as readings
object "Repositorio de síntomas" as symptoms
object "Motor de alertas" as alerts

ui --> ctrl : 1: registrar(systolic, diastolic, symptoms)
ctrl --> gate : 2: isActive(patientId, version)
gate --> ctrl : 3: consentimiento vigente
ctrl --> validator : 4: validate(reading)
validator --> ctrl : 5: validationStatus
ctrl --> readings : 6: save(reading)
ctrl --> symptoms : 7: save(symptomMood)
ctrl --> alerts : 8: evaluate(reading)
ctrl --> ui : 9: lectura registrada
@enduml
```

### 9.5 CU-05 Análisis y clasificación de riesgo

```plantuml
@startuml
title CU-05 Análisis y clasificación de riesgo: colaboración

object "Disparador del análisis" as trigger
object "Servicio de riesgo" as risk
object "Repositorio de lecturas" as readings
object "Ventana domiciliaria" as window
object "Clasificador por reglas" as rules
object "Modelo de apoyo" as model
object "Explicador" as explain
object "Auditoría" as audit

trigger --> risk : 1: assess(patientId)
risk --> readings : 2: lastSevenDays(patientId)
readings --> risk : 3: readings
risk --> window : 4: build(readings)
window --> risk : 5: suficiente / media
risk --> rules : 6: classify(window)
risk --> model : 7: score(window)
model --> risk : 8: probability
risk --> explain : 9: factors(assessment)
explain --> risk : 10: riskFactors
risk --> audit : 11: record("risk.assessed")
@enduml
```

### 9.6 CU-06 Generación y gestión de alertas

```plantuml
@startuml
title CU-06 Generación y gestión de alertas: colaboración

object "Motor de alertas" as engine
object "Repositorio de umbrales" as config
object "Repositorio de alertas" as alerts
object "Destinatarios" as notify
object "Tablero del médico" as dashboard
object "Auditoría" as audit

engine --> config : 1: thresholds(patientId, metric)
config --> engine : 2: alertRule
engine --> engine : 3: severityOf(window)
engine --> alerts : 4: open(alert)
engine --> notify : 5: deliver(alert, recipients)
dashboard --> alerts : 6: listByStatus(open)
dashboard --> alerts : 7: validate(alertId, physicianId)
alerts --> audit : 8: record("alert.validated")
@enduml
```

### 9.7 CU-07 Generación de reportes de seguimiento

```plantuml
@startuml
title CU-07 Reportes de seguimiento: colaboración

object "Tablero del médico" as dashboard
object "Controlador de reportes" as ctrl
object "Servicio de reportes" as svc
object "Repositorio de lecturas" as readings
object "Calculadora de adherencia" as adherence
object "Repositorio de alertas" as alerts
object "Exportador" as exporter
object "Repositorio de reportes" as reports

dashboard --> ctrl : 1: generar(patientId, periodo)
ctrl --> svc : 2: build(patientId, periodStart, periodEnd)
svc --> readings : 3: between(patientId, periodo)
svc --> alerts : 4: between(patientId, periodo)
svc --> adherence : 5: summary(patientId, periodo)
adherence --> svc : 6: adherenceSummary
svc --> reports : 7: save(report)
ctrl --> exporter : 8: toCsv(report)
exporter --> dashboard : 9: archivo
@enduml
```

### 9.8 CU-08 Interacción por chat con el modelo

```plantuml
@startuml
title CU-08 Chat con el modelo de apoyo: colaboración

object "Interfaz web" as ui
object "Controlador de chat" as ctrl
object "Servicio de chat" as svc
object "Proveedor de contexto clínico" as context
object "Pasarela del modelo" as gateway
object "Auditoría" as audit

ui --> ctrl : 1: preguntar(texto)
ctrl --> svc : 2: answer(patientId, texto)
svc --> context : 3: clinicalContext(patientId)
context --> svc : 4: lecturas y alertas recientes
svc --> gateway : 5: complete(prompt, contexto)
gateway --> svc : 6: respuesta
svc --> audit : 7: record("chat.answered")
svc --> ctrl : 8: respuesta con fuentes
ctrl --> ui : 9: mensaje
@enduml
```

### 9.9 CU-09 Gestión de recordatorios y adherencia

```plantuml
@startuml
title CU-09 Recordatorios y adherencia: colaboración

object "Planificador" as scheduler
object "Servicio de recordatorios" as reminders
object "Repositorio de recordatorios" as repo
object "Servicio de notificaciones" as notify
object "Interfaz del paciente" as ui
object "Servicio de adherencia" as adherence
object "Repositorio de adherencia" as events

scheduler --> reminders : 1: dueReminders(now)
reminders --> repo : 2: enabledByKind()
repo --> reminders : 3: recordatorios
reminders --> notify : 4: send(reminder)
notify --> ui : 5: aviso en la aplicación
ui --> adherence : 6: confirm(medicationId)
adherence --> events : 7: append(event, confirmed)
adherence --> reminders : 8: reprogramar siguiente
@enduml
```

### 9.10 CU-10 Teleconsulta

```plantuml
@startuml
title CU-10 Teleconsulta: colaboración

object "Interfaz del paciente" as patient
object "Tablero del médico" as physician
object "Controlador de teleconsulta" as ctrl
object "Servicio de teleconsulta" as svc
object "Servicio de señalización" as signaling
object "Repositorio de teleconsultas" as repo

physician --> ctrl : 1: agendar(patientId, scheduledAt, mode)
ctrl --> svc : 2: schedule(...)
svc --> repo : 3: save(teleconsultation)
patient --> ctrl : 4: unirse(id)
ctrl --> svc : 5: start(id)
svc --> signaling : 6: openRoom(id)
signaling --> patient : 7: sesión de audio y vídeo
physician --> ctrl : 8: cerrar(id, notes)
ctrl --> svc : 9: close(id, notes)
svc --> repo : 10: save(notes)
@enduml
```

### 9.11 CU-11 Gestión de usuarios, roles y desactivación

```plantuml
@startuml
title CU-11 Gestión de usuarios y roles: colaboración

object "Tablero de administración" as ui
object "Guarda de autorización" as guard
object "Controlador de cuentas" as ctrl
object "Servicio de cuentas" as svc
object "Repositorio de usuarios" as users
object "Repositorio de tokens" as tokens
object "Auditoría" as audit

ui --> guard : 1: requireRole(admin)
guard --> ctrl : 2: autorizado
ctrl --> svc : 3: deactivate(userId, actor)
svc --> users : 4: pseudonymize(userId)
svc --> tokens : 5: revokeAll(userId)
svc --> audit : 6: record("accounts.deactivated")
svc --> ctrl : 7: confirmación
ctrl --> ui : 8: cuenta desactivada
@enduml
```

### 9.12 CU-12 Auditoría y trazabilidad

```plantuml
@startuml
title CU-12 Auditoría y trazabilidad: colaboración

object "Tablero de administración" as ui
object "Controlador de auditoría" as ctrl
object "Servicio de auditoría" as svc
object "Repositorio de auditoría" as repo

ui --> ctrl : 1: consultar(filtros)
ctrl --> svc : 2: search(actor, action, desde, hasta)
svc --> repo : 3: find(criteria)
repo --> svc : 4: eventos
svc --> svc : 5: orderByOccurredAt()
svc --> ctrl : 6: página de eventos
ctrl --> ui : 7: tabla filtrada
@enduml
```

## 10. Diagramas de secuencia por proceso

El mismo recorrido de la sección anterior, ahora ordenado en el tiempo y con los flujos
alternos que el manual describe en sus casos de uso extendidos. Los actores humanos se
dibujan como actores y las dependencias como participantes.

### 10.1 CU-01 Autenticación y acceso al sistema

```plantuml
@startuml
title CU-01 Autenticación y acceso al sistema
autonumber

actor "Usuario" as u
participant "Interfaz web" as ui
participant "API de sesión" as api
database "PostgreSQL" as pg

u -> ui : correo y contraseña
ui -> api : POST /api/auth/login
api -> pg : select user by email
alt correo desconocido o contraseña incorrecta
  api -> pg : insert audit_logs (login_failed, actor nulo)
  api --> ui : 401 Credenciales inválidas
  ui --> u : error genérico
else credenciales válidas
  api -> api : verifyPassword()
  api -> pg : insert refresh_tokens (solo el hash)
  api -> pg : insert audit_logs (login)
  api --> ui : 200 access, refresh, role
  ui --> u : sesión iniciada
end

u -> ui : refrescar
ui -> api : POST /api/auth/refresh
api -> pg : update refresh_tokens set revoked_at where revoked_at is null
alt token ya revocado
  api -> pg : revoke all refresh_tokens of the account
  api -> pg : insert audit_logs (refresh_reuse)
  api --> ui : 401 Sesión inválida o expirada
else token vigente y cuenta activa
  api -> pg : insert refresh_tokens (nuevo)
  api -> pg : insert audit_logs (refresh)
  api --> ui : 200 par nuevo
end
@enduml
```

### 10.2 CU-02 Gestión del consentimiento informado

```plantuml
@startuml
title CU-02 Gestión del consentimiento informado
autonumber

actor "Paciente" as p
participant "Interfaz web" as ui
participant "API de consentimiento" as api
database "PostgreSQL" as pg

p -> ui : lee el documento de la versión publicada
p -> ui : acepta
ui -> api : POST /api/consent
api -> pg : select patient_profiles by user
api -> pg : insert consents (version, acceptedAt)
api -> pg : insert audit_logs (consent.accepted)
api --> ui : 201 consentimiento vigente

p -> ui : revoca
ui -> api : POST /api/consent/revoke
api -> pg : update consents set revokedAt where revokedAt is null
api -> pg : insert audit_logs (consent.revoked)
api --> ui : 204

ui -> api : GET /api/consent?required_version=2
api -> pg : select consents where version = 2 and revokedAt is null
api --> ui : 200 active false, requires_acceptance_of_version 2
note right of api
  la aceptación es aditiva y nunca se reescribe;
  la revocación solo agrega la marca de tiempo
end note
@enduml
```

### 10.3 CU-03 Captura automática de signos vitales

```plantuml
@startuml
title CU-03 Captura automática de signos vitales
autonumber

participant "Tensiómetro" as dev
participant "Broker MQTT" as mq
participant "Servicio de ingesta" as ing
collections "MongoDB" as mongo
participant "Validador fisiológico" as val
database "PostgreSQL" as pg
participant "Motor de alertas" as alertas

dev -> mq : publica medición firmada
mq -> ing : entrega lote
ing -> ing : verifica firma y dispositivo
alt firma inválida o dispositivo desconocido
  ing -> pg : insert audit_logs (ingest_rejected)
  ing --> mq : rechazo
else mensaje válido
  ing -> mongo : append raw_readings
  ing -> pg : resuelve paciente del dispositivo
  ing -> val : validate(reading)
  val --> ing : validationStatus
  ing -> pg : insert readings
  ing -> alertas : evaluate(reading)
  alertas -> pg : insert alerts when the rule fires
end
@enduml
```

### 10.4 CU-04 Registro manual de presión arterial y síntomas

```plantuml
@startuml
title CU-04 Registro manual de presión y síntomas
autonumber

actor "Paciente" as p
participant "Interfaz web" as ui
participant "API de lecturas" as api
participant "Compuerta de consentimiento" as gate
participant "Validador fisiológico" as val
database "PostgreSQL" as pg
participant "Motor de alertas" as alertas

p -> ui : sistólica, diastólica, pulso y síntomas
ui -> api : POST /api/readings
api -> gate : isActive(patient, version)
alt sin consentimiento vigente
  gate --> api : false
  api --> ui : 403 Consentimiento requerido
  ui --> p : no se registran datos clínicos
else consentimiento vigente
  api -> val : validate(reading)
  val --> api : valid u out_of_range
  api -> pg : insert readings
  api -> pg : insert symptoms_mood
  api -> alertas : evaluate(reading)
  api -> pg : insert audit_logs (reading.created)
  api --> ui : 201 lectura registrada
  note right of api
    un valor implausible se guarda con
    validationStatus out_of_range
  end note
end
@enduml
```

### 10.5 CU-05 Análisis y clasificación de riesgo

```plantuml
@startuml
title CU-05 Análisis y clasificación de riesgo
autonumber

participant "Disparador" as trig
participant "Servicio de riesgo" as risk
database "PostgreSQL" as pg
participant "Clasificador por reglas" as rules
participant "Modelo de apoyo" as model
participant "Explicador" as expl

trig -> risk : assess(patient)
risk -> pg : lecturas de los últimos siete días
pg --> risk : lecturas
risk -> risk : construir ventana y descartar el primer día
alt menos de ocho lecturas válidas en dos días
  risk -> rules : insufficientData()
  rules --> risk : medium por datos insuficientes
else ventana suficiente
  risk -> rules : classify(window)
  rules --> risk : severidad por umbrales
  risk -> model : score(window)
  model --> risk : probabilidad de descontrol
  risk -> expl : factors(assessment)
  expl --> risk : factores y su peso
end
risk -> pg : insert audit_logs (risk.assessed)
risk --> trig : evaluación con explicación
@enduml
```

### 10.6 CU-06 Generación y gestión de alertas

```plantuml
@startuml
title CU-06 Generación y gestión de alertas
autonumber

participant "Motor de alertas" as eng
database "PostgreSQL" as pg
participant "Notificador" as noti
actor "Médico" as m
participant "Interfaz web" as ui

eng -> pg : select alert_config for the patient or global
pg --> eng : umbrales
eng -> eng : severityOf(window)
alt severidad distinta de low
  eng -> pg : insert alerts (open)
  eng -> noti : deliver to recipients
  noti -> m : alerta en la aplicación
else lectura dentro de rango
  eng -> pg : sin alerta; solo auditoría
end

m -> ui : abre la alerta
ui -> pg : select alerts where status = open
m -> ui : valida con nota
ui -> pg : update alerts set status validated, validatedBy, validatedAt
ui -> pg : insert audit_logs (alert.validated)
note right of pg
  ninguna alerta se cierra sin una persona
end note
@enduml
```

### 10.7 CU-07 Generación de reportes de seguimiento

```plantuml
@startuml
title CU-07 Reportes de seguimiento
autonumber

actor "Médico" as m
participant "Interfaz web" as ui
participant "API de reportes" as api
database "PostgreSQL" as pg
participant "Exportador" as exp

m -> ui : paciente y periodo
ui -> api : POST /api/reports
api -> pg : lecturas del periodo
api -> pg : alertas del periodo
api -> pg : eventos de adherencia
api -> api : calcula medias y adherencia
api -> pg : insert reports
api --> ui : 201 reporte
m -> ui : exportar
ui -> api : GET /api/reports/{id}?format=csv
api -> exp : toCsv(report)
exp --> api : archivo
api --> ui : 200 text/csv
note right of exp
  el PDF se declara pendiente en el manual;
  el CSV es la exportación entregada
end note
@enduml
```

### 10.8 CU-08 Interacción por chat con el modelo

```plantuml
@startuml
title CU-08 Interacción por chat con el modelo de apoyo
autonumber

actor "Paciente" as p
participant "Interfaz web" as ui
participant "API de chat" as api
participant "Proveedor de contexto" as ctx
database "PostgreSQL" as pg
participant "Pasarela del modelo" as gw

p -> ui : escribe una pregunta
ui -> api : POST /api/chat
api -> ctx : contexto clínico del paciente
ctx -> pg : lecturas y alertas recientes
ctx --> api : resumen con cifras
api -> gw : complete(prompt, contexto)
alt el modelo no responde
  api --> ui : 503 Servicio no disponible
  ui --> p : intenta de nuevo más tarde
else respuesta disponible
  api -> pg : insert audit_logs (chat.answered)
  api --> ui : 200 respuesta con fuentes
  ui --> p : mensaje
end
note right of api
  el chat no diagnostica ni prescribe:
  responde sobre los datos registrados
end note
@enduml
```

### 10.9 CU-09 Gestión de recordatorios y adherencia

```plantuml
@startuml
title CU-09 Recordatorios y adherencia
autonumber

participant "Planificador" as sch
participant "Servicio de recordatorios" as rem
database "PostgreSQL" as pg
participant "Notificador" as noti
actor "Paciente" as p
participant "Servicio de adherencia" as adh

loop cada minuto
  sch -> rem : dueReminders(now)
  rem -> pg : select reminders where enabled
  rem -> noti : send(reminder)
  noti -> p : aviso en la aplicación
  rem -> pg : update lastSentAt
end

p -> pg : confirma la dosis
pg --> adh : evento pendiente
adh -> pg : update adherence_events set confirmed
adh -> adh : recalcula tasa del periodo
alt la ventana venció sin confirmación
  adh -> pg : registra el evento como omitido
end
@enduml
```

### 10.10 CU-10 Teleconsulta

```plantuml
@startuml
title CU-10 Teleconsulta
autonumber

actor "Médico" as m
actor "Paciente" as p
participant "Interfaz web" as ui
participant "API de teleconsulta" as api
participant "Señalización" as sig
database "PostgreSQL" as pg

m -> ui : agenda la teleconsulta
ui -> api : POST /api/teleconsultations
api -> pg : insert teleconsultations (scheduled)
api --> ui : 201 con identificador

m -> ui : inicia la sesión
p -> ui : se une
ui -> api : POST /api/teleconsultations/{id}/join
api -> sig : openRoom(id)
sig --> m : audio y vídeo
sig --> p : audio y vídeo
alt la conexión se pierde
  sig --> api : sesión interrumpida
  api -> pg : update status interrupted
  p -> ui : reintenta
  ui -> api : join de nuevo
else sesión estable
  m -> ui : cierra con notas
  ui -> api : POST /api/teleconsultations/{id}/close
  api -> pg : update status finished, notes
end
@enduml
```

### 10.11 CU-11 Gestión de usuarios, roles y desactivación

```plantuml
@startuml
title CU-11 Gestión de usuarios, roles y desactivación
autonumber

actor "Administrador" as a
participant "Interfaz web" as ui
participant "API de cuentas" as api
participant "Guarda de autorización" as guard
database "PostgreSQL" as pg

a -> ui : abre la lista de cuentas
ui -> api : GET /api/accounts
api -> guard : currentUser(token)
guard -> pg : select role y active del actor
alt el actor no es administrador
  guard --> api : 403 Permiso denegado
  api --> ui : 403
else administrador activo
  api -> pg : select users order by email
  api --> ui : 200 lista de cuentas
end

a -> ui : cambia el rol de una cuenta
ui -> api : PATCH /api/accounts/{id}/role
api -> pg : update users set role, updatedAt
api -> pg : insert audit_logs (accounts.role_changed)

a -> ui : desactiva una cuenta
ui -> api : POST /api/accounts/{id}/deactivate
alt la cuenta es la del propio administrador
  api --> ui : 409 no se puede desactivar a sí mismo
else otra cuenta
  api -> pg : pseudonimiza email, nombre y contraseña; active false
  api -> pg : revoca los refresh_tokens vigentes
  api -> pg : insert audit_logs (accounts.deactivated)
  api --> ui : 204
end
@enduml
```

### 10.12 CU-12 Auditoría y trazabilidad

```plantuml
@startuml
title CU-12 Auditoría y trazabilidad
autonumber

actor "Administrador" as a
participant "Interfaz web" as ui
participant "API de auditoría" as api
participant "Guarda de autorización" as guard
database "PostgreSQL" as pg

a -> ui : filtra por actor, acción y fechas
ui -> api : GET /api/audit?action=...&from=...&to=...
api -> guard : currentUser(token)
guard --> api : administrador
api -> pg : select audit_logs with filters, order by occurredAt desc
api --> ui : 200 página de eventos
ui --> a : tabla con actor, acción, entidad, IP y detalle
note right of pg
  el detalle de una cuenta desactivada no guarda
  la identidad anterior: la seudonimización la borra
end note
@enduml
```

## 11. Diagrama de componentes

El sistema se organiza en una aplicación web, un servicio de API con módulos por dominio, dos
adaptadores de persistencia, el servicio de ingesta y el servicio del modelo. Los componentes
se comunican por HTTP con JSON, por el protocolo de PostgreSQL, por el protocolo de MongoDB y
por MQTT con los dispositivos.

```plantuml
@startuml
title Diagrama de componentes del sistema

skinparam componentStyle rectangle

package "Cliente" {
  [Aplicación web\n(React)] as web <<componente>>
  [Aplicación móvil\n(responsiva)] as mobile <<componente>>
}

package "Servicios del sistema" {
  [API de la plataforma\n(FastAPI)] as api <<componente>>

  package "Módulos de la API" {
    [Autenticación y sesión] as mod_auth <<módulo>>
    [Cuentas y roles] as mod_acc <<módulo>>
    [Consentimiento] as mod_cons <<módulo>>
    [Registro clínico] as mod_clin <<módulo>>
    [Riesgo y alertas] as mod_risk <<módulo>>
    [Reportes] as mod_rep <<módulo>>
    [Chat] as mod_chat <<módulo>>
    [Auditoría] as mod_aud <<módulo>>
  }

  [Servicio de ingesta\nMQTT] as ingest <<componente>>
  [Servicio del modelo\n(inferencia)] as model <<componente>>
  [Notificador en la aplicación] as notify <<componente>>
  [Exportador CSV y PDF] as export <<componente>>
}

package "Persistencia" {
  database "PostgreSQL 16\nregistro clínico" as pg
  database "MongoDB 7\nflujo crudo" as mongo
}

package "Dispositivos e integraciones" {
  [Tensiómetro] as device <<dispositivo>>
  [Broker MQTT] as broker <<infraestructura>>
  [Sistema externo\nHL7 FHIR] as fhir <<externo>>
}

package "Analítica fuera de línea" {
  [Cuaderno de entrenamiento] as train <<componente>>
  [Registro de modelos] as registry <<componente>>
}

web --> api : HTTPS, JSON
mobile --> api : HTTPS, JSON

api --> mod_auth
api --> mod_acc
api --> mod_cons
api --> mod_clin
api --> mod_risk
api --> mod_rep
api --> mod_chat
api --> mod_aud

mod_auth --> pg
mod_acc --> pg
mod_cons --> pg
mod_clin --> pg
mod_risk --> pg
mod_rep --> pg
mod_aud --> pg

mod_clin --> notify
mod_risk --> notify
mod_rep --> export

device --> broker : MQTT
broker --> ingest : MQTT
ingest --> mongo : lecturas crudas
ingest --> pg : lecturas validadas
ingest --> mod_risk : evaluación

mod_risk --> model : HTTP
mod_chat --> model : HTTP

train --> registry : artefacto
registry --> model : versión desplegada
model --> pg : lee variables clínicas

api --> fhir : FHIR R4

note bottom of mongo
  conserva el mensaje original del dispositivo
  aunque la lectura se rechace
end note
@enduml
```

## 12. Diagrama de distribución

Los contenedores corren en el servidor de aplicación; el navegador del paciente solo consume
la API por HTTPS. El entrenamiento del modelo ocurre fuera de línea y su artefacto se publica
como imagen para el servicio de inferencia.

```plantuml
@startuml
title Diagrama de distribución

node "Equipo del paciente o del médico" as cliente {
  artifact "Navegador" as browser
}

node "Servidor de aplicación" as app <<servidor>> {
  node "Contenedor web" as webc {
    artifact "Node 20: estáticos y proxy" as webart
  }
  node "Contenedor del backend" as apic {
    artifact "Python 3.12: uvicorn + FastAPI" as apiart
  }
  node "Contenedor de base de datos" as dbc {
    database "PostgreSQL 16" as pgart
    artifact "Volumen db_data" as pgvol
  }
  node "Contenedor del flujo crudo" as mongoc {
    database "MongoDB 7" as mongoart
    artifact "Volumen mongo_data" as mongovol
  }
  node "Contenedor del broker" as brokerc {
    artifact "Broker MQTT" as brokerart
  }
}

node "Red doméstica" as home {
  node "Tensiómetro" as dev <<dispositivo>> {
    artifact "Firmware de medición" as fw
  }
}

node "Estación de analítica" as ml <<servidor>> {
  artifact "Python 3.12: entrenamiento y evaluación" as mlart
  artifact "Modelo serializado" as model_art
}

cloud "Registro de imágenes" as registry

browser --> webart : HTTPS 443
webart --> apiart : HTTP 8000, red interna
apiart --> pgart : 5432, red interna
apiart --> mongoart : 27017, red interna
fw --> brokerart : MQTT 1883
brokerart --> apiart : HTTP, red interna
mlart --> registry : publica la imagen del modelo
registry --> apiart : descarga la versión
model_art --> apiart : inferencia por HTTP

note right of dbc
  solo el puerto publicado del compose
  es alcanzable desde el equipo del socio
end note
note bottom of ml
  el entrenamiento no corre dentro de la pila:
  usa el mismo repositorio y produce el artefacto
end note
@enduml
```

## Cómo renderizar

Cada bloque `plantuml` se copia completo, desde `@startuml` hasta `@enduml`, en la
herramienta web. Si prefieres la línea de comandos, con el archivo guardado:

```bash
plantuml -tpng docs/manual/diagramas-uml.md
```

El comando genera una imagen por bloque, en el mismo directorio que el archivo. Para revisar
el documento sin instalar nada, el servidor de PlantUML también acepta el archivo completo y
devuelve las imágenes en orden.
