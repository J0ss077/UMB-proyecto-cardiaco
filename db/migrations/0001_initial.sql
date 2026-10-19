-- Migración inicial del registro clínico.
--
-- Aplica el modelo documentado en docs/manual/modelo-de-datos.md: la extensión
-- pgcrypto, los siete tipos enumerados, las dieciséis tablas con sus llaves
-- foráneas y acciones de borrado, y los índices por paciente y tiempo.
--
-- La validación fisiológica no se declara como restricción: los valores fuera
-- de rango se conservan con validation_status = 'out_of_range'.
--
-- alert_config incluye critical_low y critical_high, la extensión aprobada en
-- docs/adr/0002-alert-config-critical-thresholds.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Tipos enumerados del dominio
-- ----------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('patient', 'physician', 'caregiver', 'admin');
CREATE TYPE reading_source AS ENUM ('device', 'manual');
CREATE TYPE validation_status AS ENUM ('valid', 'out_of_range', 'flagged');
CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'validated', 'dismissed');
CREATE TYPE reminder_kind AS ENUM ('medication', 'measurement');
CREATE TYPE teleconsultation_mode AS ENUM ('sync', 'async');

-- ----------------------------------------------------------------------------
-- Usuarios, perfiles y vínculos de cuidado
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,
    full_name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patient_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    birth_date DATE,
    sex TEXT,
    diagnosis_date DATE,
    height_cm NUMERIC,
    weight_kg NUMERIC
);

CREATE TABLE patient_physician (
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    physician_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (patient_id, physician_id)
);

CREATE TABLE caregiver_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    caregiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    authorized_scope TEXT NOT NULL DEFAULT 'minimal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_ref TEXT,
    revoked_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- Datos clínicos
-- ----------------------------------------------------------------------------
CREATE TABLE readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    systolic INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    heart_rate INTEGER,
    source reading_source NOT NULL,
    device_id TEXT,
    measured_at TIMESTAMPTZ NOT NULL,
    validation_status validation_status NOT NULL DEFAULT 'valid',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE symptoms_mood (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    free_text TEXT,
    mood TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dose TEXT,
    unit TEXT,
    frequency TEXT,
    start_date DATE,
    end_date DATE
);

CREATE TABLE adherence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed BOOLEAN NOT NULL DEFAULT TRUE
);

-- ----------------------------------------------------------------------------
-- Alertas, reportes, recordatorios y teleconsulta
-- ----------------------------------------------------------------------------
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    severity alert_severity NOT NULL,
    status alert_status NOT NULL DEFAULT 'open',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    validated_at TIMESTAMPTZ
);

CREATE TABLE alert_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    low_threshold NUMERIC,
    high_threshold NUMERIC,
    critical_low NUMERIC,
    critical_high NUMERIC,
    recipients JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_ref TEXT
);

CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    kind reminder_kind NOT NULL,
    schedule TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_sent_at TIMESTAMPTZ
);

CREATE TABLE teleconsultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    physician_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMPTZ,
    mode teleconsultation_mode NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT
);

-- ----------------------------------------------------------------------------
-- Auditoría y sesiones
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id UUID,
    ip TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    details JSONB
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Índices
-- ----------------------------------------------------------------------------
CREATE INDEX idx_readings_patient_measured
       ON readings (patient_id, measured_at DESC);
CREATE INDEX idx_alerts_patient_status
       ON alerts (patient_id, status);
CREATE INDEX idx_adherence_events_patient
       ON adherence_events (patient_id, taken_at DESC);
CREATE INDEX idx_audit_logs_actor
       ON audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX idx_refresh_tokens_user
       ON refresh_tokens (user_id);

-- ----------------------------------------------------------------------------
-- Registro de migraciones
--
-- No es una tabla del dominio: guarda qué archivos se aplicaron. El ejecutor la
-- crea antes de leerla, de modo que también existe en una base vacía.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
