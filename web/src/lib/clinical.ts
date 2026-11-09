// @requirement RF-19
// Reference lines for the trend chart and a descriptive category for a reading.
// These are published guideline cut-offs, not the signed thresholds stored in
// the alert_config table; they label the display and never raise or close an alert.

export interface PressureThreshold {
    label: string;
    systolic: number;
    diastolic: number;
}

export const WHO_THRESHOLD: PressureThreshold = { label: "OMS 140/90", systolic: 140, diastolic: 90 };
export const ACC_AHA_THRESHOLD: PressureThreshold = { label: "ACC/AHA 130/80", systolic: 130, diastolic: 80 };

export type ReadingCategory = "normal" | "elevated" | "high" | "crisis";

const CRISIS = { systolic: 180, diastolic: 120 };

export function classifyReading(systolic: number, diastolic: number): ReadingCategory {
    if (systolic >= CRISIS.systolic || diastolic >= CRISIS.diastolic) return "crisis";
    if (systolic >= WHO_THRESHOLD.systolic || diastolic >= WHO_THRESHOLD.diastolic) return "high";
    // The design shows 120/80 as normal, so the 80 mmHg diastolic line is exclusive.
    if (systolic >= ACC_AHA_THRESHOLD.systolic || diastolic > ACC_AHA_THRESHOLD.diastolic) return "elevated";
    return "normal";
}

export const CATEGORY_LABEL: Record<ReadingCategory, string> = {
    normal: "Normal",
    elevated: "Elevada",
    high: "Alta",
    crisis: "Crisis",
};

export type ReadingField = "systolic" | "diastolic" | "heart_rate";

// Ranges advertised by the entry form. The server accepts values outside them
// and stores those with validation_status 'out_of_range' (RF-08).
export const READING_FIELD_RANGES: Record<ReadingField, { min: number; max: number }> = {
    systolic: { min: 80, max: 200 },
    diastolic: { min: 40, max: 130 },
    heart_rate: { min: 30, max: 220 },
};

const FIELD_UNIT: Record<ReadingField, string> = { systolic: "mmHg", diastolic: "mmHg", heart_rate: "lpm" };

export function readingFieldIssue(field: ReadingField, value: number): string | null {
    const { min, max } = READING_FIELD_RANGES[field];
    if (value >= min && value <= max) return null;
    return `Valor fuera del rango habitual (${min} a ${max} ${FIELD_UNIT[field]}). Se guardará y quedará marcado.`;
}

export type RiskKey = "low" | "moderate" | "high" | "very_high" | "unknown";

export interface RiskLevel {
    key: RiskKey;
    label: string;
}

const RISK_BY_CATEGORY: Record<ReadingCategory, RiskLevel> = {
    normal: { key: "low", label: "Bajo riesgo" },
    elevated: { key: "moderate", label: "Riesgo moderado" },
    high: { key: "high", label: "Riesgo alto" },
    crisis: { key: "very_high", label: "Riesgo muy alto" },
};

// Descriptive level from the seven-day average when it is sufficient, otherwise
// from the latest reading. It is not the model's RF-09 classification: it only
// restates the guideline category of the patient's own numbers.
export function riskLevel(
    summary: { sufficient: boolean; mean_systolic: number | null; mean_diastolic: number | null } | null,
    latest: { systolic: number; diastolic: number } | null,
): RiskLevel {
    if (summary?.sufficient && summary.mean_systolic !== null && summary.mean_diastolic !== null) {
        return RISK_BY_CATEGORY[classifyReading(summary.mean_systolic, summary.mean_diastolic)];
    }
    if (latest) return RISK_BY_CATEGORY[classifyReading(latest.systolic, latest.diastolic)];
    return { key: "unknown", label: "Sin datos suficientes" };
}
