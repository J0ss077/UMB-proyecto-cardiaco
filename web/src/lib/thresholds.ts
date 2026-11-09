// @requirement RF-15
// Same band rule as hta.adminconsole.thresholds. A null edge means no notice there.

const BOUNDS: Record<string, [number, number]> = {
    systolic: [40, 260],
    diastolic: [20, 180],
};
const DEFAULT_BOUNDS: [number, number] = [0, 500];

export const METRIC_LABEL: Record<string, string> = {
    systolic: "Presión sistólica",
    diastolic: "Presión diastólica",
    heart_rate: "Frecuencia cardíaca",
};

export interface ThresholdDraft {
    low: string;
    high: string;
    criticalLow: string;
    criticalHigh: string;
}

export interface ThresholdPayload {
    low_threshold: number | null;
    high_threshold: number | null;
    critical_low: number | null;
    critical_high: number | null;
}

export function metricLabel(metric: string): string {
    return METRIC_LABEL[metric] ?? metric;
}

export function metricUnit(metric: string): string {
    if (metric === "heart_rate") return "lpm";
    if (metric === "systolic" || metric === "diastolic") return "mmHg";
    return "";
}

export function boundText(value: number | null): string {
    return value === null ? "" : String(value);
}

function parseBound(value: string): number | null | "invalid" {
    const text = value.trim();
    if (!text) return null;
    if (!/^\d+(\.\d+)?$/.test(text)) return "invalid";
    const number = Number(text);
    return Number.isFinite(number) ? number : "invalid";
}

export function thresholdProblem(metric: string, draft: ThresholdDraft): string | null {
    const low = parseBound(draft.low);
    const high = parseBound(draft.high);
    const criticalLow = parseBound(draft.criticalLow);
    const criticalHigh = parseBound(draft.criticalHigh);
    if (low === "invalid") return "El aviso desde tiene que ser un número.";
    if (high === "invalid") return "El aviso hasta tiene que ser un número.";
    if (criticalLow === "invalid") return "El crítico desde tiene que ser un número.";
    if (criticalHigh === "invalid") return "El crítico hasta tiene que ser un número.";

    const [floor, ceiling] = BOUNDS[metric] ?? DEFAULT_BOUNDS;
    const named: Array<[string, number | null]> = [
        ["El aviso desde", low],
        ["El aviso hasta", high],
        ["El crítico desde", criticalLow],
        ["El crítico hasta", criticalHigh],
    ];
    for (const [name, value] of named) {
        if (value !== null && (value < floor || value > ceiling)) {
            return `${name} tiene que estar entre ${floor} y ${ceiling}.`;
        }
    }
    if (low !== null && high !== null && low >= high) return "El aviso desde tiene que ser menor que el aviso hasta.";
    if (criticalLow !== null && criticalHigh !== null && criticalLow >= criticalHigh) {
        return "El crítico desde tiene que ser menor que el crítico hasta.";
    }
    if (criticalLow !== null && low !== null && criticalLow >= low) {
        return "El crítico desde tiene que ser menor que el aviso desde.";
    }
    if (criticalHigh !== null && high !== null && criticalHigh <= high) {
        return "El crítico hasta tiene que ser mayor que el aviso hasta.";
    }
    if (criticalLow !== null && high !== null && criticalLow >= high) {
        return "El crítico desde tiene que ser menor que el aviso hasta.";
    }
    if (criticalHigh !== null && low !== null && criticalHigh <= low) {
        return "El crítico hasta tiene que ser mayor que el aviso desde.";
    }
    return null;
}

export function thresholdPayload(draft: ThresholdDraft): ThresholdPayload {
    const low = parseBound(draft.low);
    const high = parseBound(draft.high);
    const criticalLow = parseBound(draft.criticalLow);
    const criticalHigh = parseBound(draft.criticalHigh);
    return {
        low_threshold: typeof low === "number" ? low : null,
        high_threshold: typeof high === "number" ? high : null,
        critical_low: typeof criticalLow === "number" ? criticalLow : null,
        critical_high: typeof criticalHigh === "number" ? criticalHigh : null,
    };
}
