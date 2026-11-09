// @requirement RF-16
// @requirement RF-19
// Labels and the three-day gap used by the physician and caregiver homes.

const DAY = 86_400_000;

export const STALE_READING_DAYS = 3;

export function readingIsStale(measuredAt: string | null, now: Date): boolean {
    if (!measuredAt) return true;
    return now.getTime() - new Date(measuredAt).getTime() > STALE_READING_DAYS * DAY;
}

export function measuredToday(measuredAt: string | null, now: Date): boolean {
    if (!measuredAt) return false;
    const at = new Date(measuredAt);
    return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
}

export const SEVERITY_LABEL = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    critical: "Crítica",
} as const;

export const STATUS_LABEL = {
    open: "Abierta",
    acknowledged: "Recibida",
    validated: "Validada",
    dismissed: "Descartada",
} as const;

export const ROLE_LABEL = {
    patient: "Paciente",
    physician: "Médico",
    caregiver: "Cuidador",
    admin: "Administrador",
} as const;

export const CONSENT_LABEL = {
    active: "Vigente",
    pending: "Pendiente",
    revoked: "Revocado",
} as const;

export const RECIPIENT_OPTIONS = [
    { id: "patient", label: "Paciente" },
    { id: "caregiver", label: "Cuidador" },
    { id: "physician", label: "Médico" },
] as const;
