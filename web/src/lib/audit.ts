// @requirement RF-27
// Names shown in the audit screen. The stored action stays the English identifier.

export interface AuditAction {
    id: string;
    label: string;
}

export interface AuditTopic {
    id: string;
    label: string;
    actions: AuditAction[];
}

export const AUDIT_TOPICS: AuditTopic[] = [
    {
        id: "auth",
        label: "Sesión",
        actions: [
            { id: "auth.login", label: "Inicio de sesión" },
            { id: "auth.login_failed", label: "Intento de acceso fallido" },
            { id: "auth.logout", label: "Cierre de sesión" },
            { id: "auth.refresh", label: "Renovación de la sesión" },
            { id: "auth.refresh_reuse", label: "Reutilización de una sesión vencida" },
        ],
    },
    {
        id: "accounts",
        label: "Cuentas",
        actions: [
            { id: "accounts.register", label: "Registro de una cuenta" },
            { id: "accounts.role_changed", label: "Cambio de rol" },
            { id: "accounts.deactivated", label: "Desactivación de una cuenta" },
            { id: "accounts.sessions_revoked", label: "Cierre de sesiones" },
        ],
    },
    {
        id: "profile",
        label: "Perfil del paciente",
        actions: [{ id: "profile.updated", label: "Actualización del perfil" }],
    },
    {
        id: "staff",
        label: "Perfil del personal",
        actions: [{ id: "staff.profile_updated", label: "Actualización del perfil profesional" }],
    },
    {
        id: "links",
        label: "Vínculos",
        actions: [
            { id: "links.physician_assigned", label: "Médico asignado" },
            { id: "links.physician_removed", label: "Médico retirado" },
        ],
    },
    {
        id: "caregiver",
        label: "Cuidadores",
        actions: [
            { id: "caregiver.linked", label: "Cuidador vinculado por el médico" },
            { id: "caregiver.scope_changed", label: "Cambio de alcance del cuidador" },
            { id: "caregiver.unlinked", label: "Vínculo de cuidador revocado" },
        ],
    },
    {
        id: "consent",
        label: "Consentimiento",
        actions: [
            { id: "consent.accepted", label: "Consentimiento aceptado" },
            { id: "consent.revoked", label: "Consentimiento revocado" },
        ],
    },
    {
        id: "reading",
        label: "Lecturas",
        actions: [
            { id: "reading.created", label: "Lectura registrada" },
            { id: "reading.ingested", label: "Lectura recibida de un dispositivo" },
        ],
    },
    {
        id: "symptom",
        label: "Síntomas",
        actions: [{ id: "symptom.created", label: "Síntoma registrado" }],
    },
    {
        id: "alert",
        label: "Alertas",
        actions: [
            { id: "alert.acknowledged", label: "Alerta recibida por el médico" },
            { id: "alert.validated", label: "Alerta validada" },
            { id: "alert.dismissed", label: "Alerta descartada" },
        ],
    },
    {
        id: "consultation",
        label: "Consultas",
        actions: [
            { id: "consultation.created", label: "Consulta enviada" },
            { id: "consultation.meet_sent", label: "Enlace de Meet enviado" },
            { id: "consultation.completed", label: "Consulta completada" },
            { id: "consultation.answered", label: "Consulta respondida" },
        ],
    },
    {
        id: "alert_config",
        label: "Umbrales",
        actions: [
            { id: "alert_config.recipients_updated", label: "Cambio de quién recibe el aviso" },
            { id: "alert_config.thresholds_updated", label: "Cambio de los umbrales" },
        ],
    },
];

const ACTION_LABEL = new Map(AUDIT_TOPICS.flatMap((topic) => topic.actions.map((action) => [action.id, action.label])));

const ENTITY_LABEL: Record<string, string> = {
    users: "Cuenta",
    refresh_tokens: "Sesión",
    patient_profiles: "Perfil",
    readings: "Lectura",
    symptoms: "Síntoma",
    alerts: "Alerta",
    teleconsultations: "Consulta",
    alert_config: "Umbral",
    caregiver_links: "Vínculo de cuidador",
    patient_physician: "Vínculo de médico",
};

const ROLE_LABEL: Record<string, string> = {
    patient: "Paciente",
    physician: "Médico",
    caregiver: "Cuidador",
    admin: "Administrador",
};

const SCOPE_LABEL: Record<string, string> = {
    minimal: "Datos mínimos",
    readings: "Lecturas",
};

const FIELD_LABEL: Record<string, string> = {
    full_name: "nombre",
    phone: "teléfono",
    avatar: "foto",
    license_number: "registro profesional",
    specialty: "especialidad",
    trusted_contact_phone: "teléfono de confianza",
    trusted_contact_email: "correo de confianza",
};

const DETAIL_LABEL: Record<string, string> = {
    previous: "Antes",
    new: "Ahora",
    fields: "Campos",
    recipients: "Destinatarios",
    authorized_scope: "Alcance",
    previous_scope: "Alcance anterior",
    version: "Versión",
    email: "Correo",
    patient_user_id: "Paciente",
    caregiver_user_id: "Cuidador",
    note: "Nota",
    low_threshold: "Aviso desde",
    high_threshold: "Aviso hasta",
    critical_low: "Crítico desde",
    critical_high: "Crítico hasta",
};

export function actionsFor(topic: string): AuditAction[] {
    if (!topic) return AUDIT_TOPICS.flatMap((item) => item.actions);
    return AUDIT_TOPICS.find((item) => item.id === topic)?.actions ?? [];
}

export function actionLabel(action: string): string {
    return ACTION_LABEL.get(action) ?? action;
}

export function entityLabel(entity: string | null): string {
    if (!entity) return "sin registro asociado";
    return ENTITY_LABEL[entity] ?? entity;
}

function named(value: unknown, table: Record<string, string>): string {
    const text = String(value);
    return table[text] ?? text;
}

function detailValue(key: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (key === "previous" || key === "new") return named(value, ROLE_LABEL);
    if (key === "authorized_scope" || key === "previous_scope") return named(value, SCOPE_LABEL);
    if (key === "recipients" && Array.isArray(value)) {
        return value.length === 0 ? "nadie" : value.map((item) => named(item, ROLE_LABEL)).join(", ");
    }
    if (key === "fields" && Array.isArray(value)) {
        return value.map((item) => named(item, FIELD_LABEL)).join(", ");
    }
    if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
            .map(([inner, innerValue]) => `${DETAIL_LABEL[inner] ?? inner}: ${innerValue === null ? "—" : String(innerValue)}`)
            .join("; ");
    }
    return String(value);
}

export function detailText(details: Record<string, unknown> | null, withheld: boolean): string {
    if (withheld) return "Detalle clínico omitido";
    if (!details || Object.keys(details).length === 0) return "—";
    return Object.entries(details)
        .map(([key, value]) => `${DETAIL_LABEL[key] ?? key}: ${detailValue(key, value)}`)
        .join(", ");
}
