# Mapa de trazabilidad

Generado por `scripts/build_map.py` desde las anotaciones `@requirement` del código. No se edita a mano: se regenera con `make docs`. El estado y el texto de cada requerimiento están en `docs/manual/requerimientos.md`.

Requerimientos en el catálogo: 47. Con al menos una anotación: 19. Archivos con anotación de requerimiento: 167 (144 módulos y 23 pruebas). Archivos de infraestructura (`@requirement none`): 46. Archivos sin anotación: 38.

## RF-01 Registro, autenticación y recuperación de credenciales

Módulos:

- `backend/src/hta/audit/__init__.py`
- `backend/src/hta/audit/service.py`
- `backend/src/hta/auth/deps.py`
- `backend/src/hta/auth/passwords.py`
- `backend/src/hta/auth/router.py`
- `backend/src/hta/auth/service.py`
- `backend/src/hta/auth/tokens.py`
- `backend/src/hta/profile/__init__.py`
- `backend/src/hta/profile/router.py`
- `backend/src/hta/profile/schemas.py`
- `backend/src/hta/profile/service.py`
- `backend/src/hta/staffprofile/router.py`
- `backend/src/hta/staffprofile/schemas.py`
- `backend/src/hta/staffprofile/service.py`
- `web/src/App.tsx`
- `web/src/api.ts`
- `web/src/auth.ts`
- `web/src/components/AuthForm.tsx`
- `web/src/components/AvatarPicker.tsx`
- `web/src/components/patient/PatientProfile.tsx`
- `web/src/components/staff/StaffProfile.tsx`
- `web/src/test/AuthForm.test.tsx`
- `web/src/test/PatientProfile.test.tsx`
- `web/src/test/StaffPages.test.tsx`
- `web/src/test/StaffProfile.test.tsx`
- `web/src/test/api.test.ts`
- `web/src/test/auth.test.ts`

Pruebas:

- `backend/tests/integration/auth/test_login.py`
- `backend/tests/integration/auth/test_refresh.py`
- `backend/tests/integration/profile/test_profile.py`
- `backend/tests/integration/staffprofile/test_staff_profile.py`
- `backend/tests/unit/test_profile_schemas.py`
- `backend/tests/unit/test_staff_profile_schemas.py`

## RF-02 Roles y permisos

Módulos:

- `backend/src/hta/accounts/__init__.py`
- `backend/src/hta/accounts/router.py`
- `backend/src/hta/accounts/service.py`
- `backend/src/hta/adminconsole/__init__.py`
- `backend/src/hta/adminconsole/router.py`
- `backend/src/hta/adminconsole/service.py`
- `backend/src/hta/passwordchange/router.py`
- `backend/src/hta/passwordchange/schemas.py`
- `backend/src/hta/passwordchange/service.py`
- `web/src/App.tsx`
- `web/src/api.ts`
- `web/src/components/staff/AdminAccounts.tsx`
- `web/src/components/staff/AdminLinks.tsx`
- `web/src/components/staff/AdminPasswordRequests.tsx`
- `web/src/components/staff/PasswordChangeCard.tsx`
- `web/src/components/staff/StaffApp.tsx`
- `web/src/lib/accounts.ts`
- `web/src/test/AdminAccounts.test.tsx`
- `web/src/test/AdminLinks.test.tsx`
- `web/src/test/App.test.tsx`
- `web/src/test/PasswordChange.test.tsx`
- `web/src/test/StaffApp.test.tsx`
- `web/src/test/accounts.test.ts`
- `web/src/test/apiStaff.test.ts`

Pruebas:

- `backend/tests/integration/accounts/test_deactivate.py`
- `backend/tests/integration/accounts/test_register.py`
- `backend/tests/integration/accounts/test_roles.py`
- `backend/tests/integration/adminconsole/test_adminconsole.py`
- `backend/tests/integration/passwordchange/test_password_change.py`
- `backend/tests/unit/test_password_change_schemas.py`

## RF-03 Consentimiento informado

Módulos:

- `backend/src/hta/consent/__init__.py`
- `backend/src/hta/consent/router.py`
- `backend/src/hta/consent/service.py`
- `web/src/components/ConsentGate.tsx`
- `web/src/components/PatientApp.tsx`
- `web/src/components/patient/PatientProfile.tsx`
- `web/src/test/App.test.tsx`
- `web/src/test/PatientProfile.test.tsx`

Pruebas:

- `backend/tests/integration/consent/test_consent.py`

## RF-04 Captura automática desde tensiómetros

Módulos:

- `backend/src/hta/ingest/__init__.py`
- `backend/src/hta/ingest/router.py`
- `backend/src/hta/ingest/service.py`
- `iot/simulator.py`
- `web/src/components/ConnectDeviceScreen.tsx`
- `web/src/lib/devices.ts`
- `web/src/test/ConnectDeviceScreen.test.tsx`
- `web/src/test/devices.test.ts`

Pruebas:

- `backend/tests/integration/ingest/test_ingest.py`
- `backend/tests/unit/test_ingest.py`

## RF-05 Registro manual de lecturas

Módulos:

- `backend/src/hta/clinical/__init__.py`
- `backend/src/hta/clinical/readings.py`
- `backend/src/hta/clinical/router.py`
- `web/src/api.ts`
- `web/src/components/PatientApp.tsx`
- `web/src/components/ReadingEntryForm.tsx`
- `web/src/components/patient/PatientLog.tsx`
- `web/src/test/ReadingEntryForm.test.tsx`

Pruebas:

- `backend/tests/integration/clinical/test_readings.py`

## RF-08 Validación de rangos fisiológicos

Módulos:

- `backend/src/hta/clinical/validation.py`
- `web/src/components/ReadingEntryForm.tsx`
- `web/src/test/ReadingEntryForm.test.tsx`

Pruebas:

- `backend/tests/unit/test_validation.py`

## RF-09 Clasificación del nivel de riesgo

Módulos:

- `web/src/lib/recommendation.ts`

Pruebas:

Ninguno.

## RF-14 Alertas estratificadas

Módulos:

- `web/src/components/NotificationBell.tsx`
- `web/src/components/NotificationCenter.tsx`
- `web/src/components/NotificationItem.tsx`
- `web/src/components/staff/StaffApp.tsx`
- `web/src/components/useNotifications.ts`
- `web/src/lib/notifications.ts`
- `web/src/test/NotificationBell.test.tsx`
- `web/src/test/NotificationCenter.test.tsx`
- `web/src/test/Notifications.test.tsx`
- `web/src/test/StaffApp.test.tsx`
- `web/src/test/notifications.test.ts`

Pruebas:

Ninguno.

## RF-15 Configuración de umbrales y destinatarios

Módulos:

- `backend/src/hta/adminconsole/thresholds.py`
- `web/src/api.ts`
- `web/src/components/staff/AdminThresholds.tsx`
- `web/src/lib/thresholds.ts`
- `web/src/test/AdminThresholds.test.tsx`
- `web/src/test/apiStaff.test.ts`

Pruebas:

- `backend/tests/unit/test_thresholds.py`

## RF-16 Historial de alertas

Módulos:

- `backend/src/hta/clinical/alerts.py`
- `backend/src/hta/clinical/router.py`
- `web/src/api.ts`
- `web/src/components/PhysicianView.tsx`
- `web/src/components/patient/PatientHome.tsx`
- `web/src/components/staff/AlertInbox.tsx`
- `web/src/components/staff/RankBars.tsx`
- `web/src/components/staff/StaffApp.tsx`
- `web/src/components/staff/StaffHome.tsx`
- `web/src/lib/staff.ts`
- `web/src/test/AlertInbox.test.tsx`
- `web/src/test/PhysicianRoles.test.tsx`
- `web/src/test/PhysicianView.test.tsx`
- `web/src/test/StaffApp.test.tsx`
- `web/src/test/StaffHome.test.tsx`
- `web/src/test/apiStaff.test.ts`
- `web/src/test/staffLib.test.ts`

Pruebas:

- `backend/tests/integration/clinical/test_alerts.py`

## RF-17 Reportes de seguimiento

Módulos:

- `web/src/components/ExportDialog.tsx`
- `web/src/components/patient/PatientData.tsx`
- `web/src/lib/historyExport.ts`
- `web/src/test/ExportDialog.test.tsx`
- `web/src/test/PatientData.test.tsx`

Pruebas:

Ninguno.

## RF-18 Exportación de reportes

Módulos:

- `web/src/components/ExportDialog.tsx`
- `web/src/lib/historyExport.ts`
- `web/src/lib/pdf.ts`
- `web/src/lib/xlsx.ts`
- `web/src/lib/zip.ts`
- `web/src/test/ExportDialog.test.tsx`
- `web/src/test/historyExport.test.ts`
- `web/src/test/pdf.test.ts`
- `web/src/test/xlsx.test.ts`
- `web/src/test/zip.test.ts`

Pruebas:

Ninguno.

## RF-19 Visualización de datos y tendencias

Módulos:

- `backend/src/hta/clinical/patients.py`
- `backend/src/hta/clinical/readings.py`
- `backend/src/hta/clinical/router.py`
- `web/src/api.ts`
- `web/src/components/HistoryDialog.tsx`
- `web/src/components/PatientApp.tsx`
- `web/src/components/PatientDetail.tsx`
- `web/src/components/PhysicianView.tsx`
- `web/src/components/PressureRing.tsx`
- `web/src/components/ReadingsTrend.tsx`
- `web/src/components/patient/DataCharts.tsx`
- `web/src/components/patient/InsightWidgets.tsx`
- `web/src/components/patient/PatientData.tsx`
- `web/src/components/patient/PatientHome.tsx`
- `web/src/components/patient/PatientProfile.tsx`
- `web/src/components/staff/StaffApp.tsx`
- `web/src/components/staff/StaffHome.tsx`
- `web/src/lib/clinical.ts`
- `web/src/lib/insights.ts`
- `web/src/lib/staff.ts`
- `web/src/test/App.test.tsx`
- `web/src/test/InsightWidgets.test.tsx`
- `web/src/test/PatientData.test.tsx`
- `web/src/test/PhysicianRoles.test.tsx`
- `web/src/test/PhysicianView.test.tsx`
- `web/src/test/ReadingsTrend.test.tsx`
- `web/src/test/StaffHome.test.tsx`
- `web/src/test/clinical.test.ts`
- `web/src/test/insights.test.ts`
- `web/src/test/staff.test.ts`

Pruebas:

- `backend/tests/integration/clinical/test_patients.py`
- `backend/tests/integration/clinical/test_readings.py`

## RF-20 Chat con el modelo de IA

Módulos:

- `web/src/components/ChatbotPanel.tsx`
- `web/src/test/Chatbot.test.tsx`

Pruebas:

Ninguno.

## RF-21 Síntomas y estado de ánimo

Módulos:

- `backend/src/hta/clinical/router.py`
- `backend/src/hta/clinical/symptoms.py`
- `web/src/api.ts`
- `web/src/components/PatientApp.tsx`
- `web/src/components/PatientDetail.tsx`
- `web/src/components/SymptomEntryForm.tsx`
- `web/src/components/SymptomHistory.tsx`
- `web/src/components/patient/InsightWidgets.tsx`
- `web/src/components/patient/PatientLog.tsx`
- `web/src/test/InsightWidgets.test.tsx`
- `web/src/test/SymptomForms.test.tsx`

Pruebas:

- `backend/tests/unit/test_symptoms.py`

## RF-22 Contenido educativo

Módulos:

- `web/src/components/staff/CaregiverGuide.tsx`
- `web/src/test/StaffPages.test.tsx`

Pruebas:

Ninguno.

## RF-24 Teleconsulta

Módulos:

- `backend/src/hta/consultations/__init__.py`
- `backend/src/hta/consultations/router.py`
- `backend/src/hta/consultations/schemas.py`
- `backend/src/hta/consultations/service.py`
- `web/src/api.ts`
- `web/src/components/ConsultationsPanel.tsx`
- `web/src/components/PhysicianView.tsx`
- `web/src/components/patient/HelpScreen.tsx`
- `web/src/components/staff/ConsultationInbox.tsx`
- `web/src/components/staff/StaffApp.tsx`
- `web/src/components/staff/StaffHome.tsx`
- `web/src/lib/checkup.ts`
- `web/src/lib/consultation.ts`
- `web/src/test/ConsultationInbox.test.tsx`
- `web/src/test/HelpScreen.test.tsx`
- `web/src/test/PhysicianRoles.test.tsx`
- `web/src/test/StaffApp.test.tsx`
- `web/src/test/StaffHome.test.tsx`
- `web/src/test/checkup.test.ts`

Pruebas:

- `backend/tests/integration/consultations/test_consultations.py`
- `backend/tests/unit/test_consultation_schemas.py`

## RF-27 Auditoría y trazabilidad

Módulos:

- `web/src/api.ts`
- `web/src/components/staff/AdminAudit.tsx`
- `web/src/lib/audit.ts`
- `web/src/test/AdminAudit.test.tsx`
- `web/src/test/apiStaff.test.ts`

Pruebas:

Ninguno.

## RNF-09 Control de acceso por roles y trazabilidad

Módulos:

- `backend/src/hta/clinical/access.py`

Pruebas:

Ninguno.

## Requerimientos sin anotación

Ninguna anotación del código cubre estos requerimientos: RF-06, RF-07, RF-10, RF-11, RF-12, RF-13, RF-23, RF-25, RF-26, RNF-01, RNF-02, RNF-03, RNF-04, RNF-05, RNF-06, RNF-07, RNF-08, RNF-10, RNF-11, RNF-12, RNF-13, RNF-14, RNF-15, RNF-16, RNF-17, RNF-18, RNF-19, RNF-20.

## Módulos sin anotación

Estos archivos no declaran ningún requerimiento; el hueco queda a la vista para cerrarlo en el siguiente incremento.

- `backend/src/hta/__init__.py`
- `backend/src/hta/api/__init__.py`
- `backend/src/hta/api/health.py`
- `backend/src/hta/app.py`
- `backend/src/hta/auth/__init__.py`
- `backend/src/hta/config.py`
- `backend/src/hta/db/__init__.py`
- `backend/src/hta/db/migrate.py`
- `backend/src/hta/db/mongo.py`
- `backend/src/hta/db/pool.py`
- `backend/src/hta/passwordchange/__init__.py`
- `backend/src/hta/staffprofile/__init__.py`
- `backend/tests/__init__.py`
- `backend/tests/integration/__init__.py`
- `backend/tests/integration/conftest.py`
- `backend/tests/integration/test_health.py`
- `backend/tests/integration/test_mongo.py`
- `backend/tests/integration/test_schema.py`
- `backend/tests/unit/__init__.py`
- `backend/tests/unit/auth/__init__.py`
- `backend/tests/unit/auth/test_passwords.py`
- `backend/tests/unit/auth/test_tokens.py`
- `backend/tests/unit/test_config.py`
- `backend/tests/unit/test_health.py`
- `backend/tests/unit/test_migrate.py`
- `backend/tests/unit/test_mongo.py`
- `db/migrations/0001_initial.sql`
- `db/migrations/0002_patient_contact.sql`
- `db/migrations/0003_patient_avatar.sql`
- `db/migrations/0004_consultation_messages.sql`
- `db/migrations/0005_consultation_details.sql`
- `db/migrations/0006_staff_profile.sql`
- `db/migrations/0007_consultation_checkup.sql`
- `db/migrations/0008_consultation_flow.sql`
- `db/migrations/0009_password_change_request.sql`
- `web/src/test/setup.ts`
- `web/src/vite-env.d.ts`
- `web/vite.config.ts`
