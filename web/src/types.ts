// @requirement none
// Types mirror the JSON bodies published in docs/api/openapi.json.

export type Role = "patient" | "physician" | "caregiver" | "admin";
export type ReadingSource = "manual" | "device";
export type ValidationStatus = "valid" | "out_of_range" | "flagged";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "validated" | "dismissed";

export interface TokenPair {
    access_token: string;
    refresh_token: string;
    role: Role;
}

export interface Page<T> {
    items: T[];
    total: number;
}

export interface LoginBody {
    email: string;
    password: string;
}

export interface RegisterBody {
    email: string;
    password: string;
    full_name: string;
    birth_date: string;
}

export interface CreatedId {
    id: string;
}

export interface ConsentStatus {
    active: boolean;
    requires_acceptance_of_version: number | null;
}

export interface Patient {
    user_id: string;
    full_name: string;
    birth_date: string | null;
}

export interface Reading {
    id: string;
    patient_id: string;
    systolic: number;
    diastolic: number;
    heart_rate: number | null;
    source: ReadingSource;
    measured_at: string;
    validation_status: ValidationStatus;
}

export interface SymptomInput {
    free_text?: string | null;
    mood?: string | null;
}

export interface ReadingInput {
    systolic: number;
    diastolic: number;
    heart_rate?: number;
    measured_at?: string;
    symptom?: SymptomInput;
}

export interface Symptom {
    id: string;
    patient_id: string;
    free_text: string | null;
    mood: string | null;
    recorded_at: string;
}

export interface ReadingsSummary {
    window_start: string;
    window_end: string;
    sufficient: boolean;
    valid_count: number;
    days_with_readings: number;
    mean_systolic: number | null;
    mean_diastolic: number | null;
}

export interface Alert {
    id: string;
    patient_id: string;
    type: string;
    severity: AlertSeverity;
    status: AlertStatus;
    note: string | null;
    created_at: string;
    validated_by: string | null;
    validated_at: string | null;
}

export interface AlertDetail extends Alert {
    validated_by_name: string | null;
    dismissal_reason: string | null;
}

export interface ListParams {
    patient_id?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
}

export interface AlertListParams {
    patient_id?: string;
    status?: AlertStatus;
    severity?: AlertSeverity;
    limit?: number;
    offset?: number;
}

export interface Profile {
    user_id: string;
    email: string;
    full_name: string;
    birth_date: string | null;
    sex: string | null;
    document_number: string | null;
    phone: string | null;
    diagnosis_date: string | null;
    trusted_contact_phone: string | null;
    trusted_contact_email: string | null;
    // Profile photo as a data URL, or null to show the initials.
    avatar: string | null;
}

// Partial update: a missing key is left alone, null clears an optional field.
export interface ProfileUpdate {
    full_name?: string;
    phone?: string | null;
    trusted_contact_phone?: string | null;
    trusted_contact_email?: string | null;
    avatar?: string | null;
}

export interface StaffProfile {
    user_id: string;
    email: string;
    full_name: string;
    role: Exclude<Role, "patient">;
    phone: string | null;
    // Profile photo as a data URL, or null to show the initials.
    avatar: string | null;
    // Only a physician has these two; they are null for the other roles.
    license_number: string | null;
    specialty: string | null;
}

// Partial update: a missing key is left alone, null clears an optional field.
// The license and the specialty are accepted only from a physician.
export interface StaffProfileUpdate {
    full_name?: string;
    phone?: string | null;
    avatar?: string | null;
    license_number?: string | null;
    specialty?: string | null;
}

export type ConsultationStatus = "in_review" | "pending" | "completed";
export type ConsultationReason = "high_pressure" | "dizziness_headache" | "chest_pain_or_breathing" | "medication" | "other";
export type ConsultationOnset = "today" | "since_yesterday" | "few_days" | "over_a_week";

export interface ConsultationInput {
    message: string;
    reason: ConsultationReason;
    onset: ConsultationOnset;
    medications?: string;
    wants_meet?: boolean;
    share_phone?: boolean;
    physician_id?: string;
}

export interface Recipient {
    id: string;
    full_name: string;
}

export interface MeetLink {
    meet_url: string;
}

export interface CheckupReply {
    response: string;
    checkup_general: string;
    checkup_pressure: string;
    checkup_symptoms: string;
    checkup_conduct: string;
}

export interface Consultation {
    id: string;
    patient_id: string;
    patient_name: string;
    physician_id: string;
    physician_name: string;
    message: string | null;
    response: string | null;
    status: ConsultationStatus;
    created_at: string;
    responded_at: string | null;
    // Null on consultations sent before these fields existed.
    reason: ConsultationReason | null;
    onset: ConsultationOnset | null;
    medications: string | null;
    urgent: boolean;
    wants_meet: boolean;
    // Only when the patient chose to share it.
    contact_phone: string | null;
    // Latest valid reading when the message was sent.
    reading: { systolic: number; diastolic: number; measured_at: string } | null;
    // Null until the physician answers. Older answers stay null.
    meet_url?: string | null;
    checkup_general?: string | null;
    checkup_pressure?: string | null;
    checkup_symptoms?: string | null;
    checkup_conduct?: string | null;
}

export interface ConsultationListParams {
    patient_id?: string;
    status?: ConsultationStatus;
    limit?: number;
    offset?: number;
}

export type ConsentFlag = "active" | "pending" | "revoked";

export interface Account {
    id: string;
    email: string;
    full_name: string;
    role: Role;
    active: boolean;
    consent: ConsentFlag | null;
    active_sessions: number;
}

export interface PhysicianLink {
    patient_user_id: string;
    patient_name: string;
    physician_user_id: string;
    physician_name: string;
    assigned_at: string;
}

export interface CaregiverLink {
    id: string;
    patient_user_id: string;
    patient_name: string;
    caregiver_user_id: string;
    caregiver_name: string;
    authorized_scope: "minimal" | "readings";
    created_at: string;
}

export interface LinkDirectory {
    physicians: PhysicianLink[];
    caregivers: CaregiverLink[];
}

export interface AlertConfigRow {
    id: string;
    patient_user_id: string | null;
    patient_name: string | null;
    metric: string;
    low_threshold: number | null;
    high_threshold: number | null;
    critical_low: number | null;
    critical_high: number | null;
    recipients: string[];
}

export interface AuditEvent {
    id: string;
    actor_user_id: string | null;
    actor_name: string | null;
    action: string;
    entity: string | null;
    entity_id: string | null;
    ip: string | null;
    occurred_at: string;
    details: Record<string, unknown> | null;
    details_withheld: boolean;
}

export interface ThresholdUpdate {
    low_threshold: number | null;
    high_threshold: number | null;
    critical_low: number | null;
    critical_high: number | null;
}

export interface AuditListParams {
    action?: string;
    topic?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
}
