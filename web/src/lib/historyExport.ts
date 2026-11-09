// @requirement RF-17
// @requirement RF-18
// Builds the downloadable monitoring history (Excel or PDF) from the patient's
// own readings, symptoms and alerts. Everything is generated in the browser: the
// file never passes through a server. It is a self-monitoring record, not a
// clinical history, and the file says so.
import { listAlerts, listReadings, listSymptoms } from "../api";
import type { Alert, AlertSeverity, AlertStatus, Profile, Reading, Symptom, ValidationStatus } from "../types";
import { CATEGORY_LABEL, classifyReading, type ReadingCategory } from "./clinical";
import { ageFromBirthDate } from "./format";
import { summaryStats } from "./insights";
import { buildPdf, type PdfBlock } from "./pdf";
import { buildXlsx, type Cell, type SheetData } from "./xlsx";

export type ExportFormat = "xlsx" | "pdf";

export interface IncludeOptions {
    summary: boolean;
    readings: boolean;
    symptoms: boolean;
    alerts: boolean;
}

export interface HistoryData {
    patient: Profile | null;
    generatedAt: Date;
    periodLabel: string;
    readings: Reading[];
    symptoms: Symptom[];
    alerts: Alert[];
    include: IncludeOptions;
}

export const PERIODS: { id: string; label: string; days: number | null }[] = [
    { id: "7", label: "Últimos 7 días", days: 7 },
    { id: "30", label: "Últimos 30 días", days: 30 },
    { id: "90", label: "Últimos 90 días", days: 90 },
    { id: "all", label: "Todo el historial", days: null },
];

export const RECORD_NOTE =
    "Registro de automonitoreo generado por el paciente desde HipertAI. No sustituye la historia clínica ni constituye un diagnóstico.";

const VALIDATION_LABEL: Record<ValidationStatus, string> = {
    valid: "Válida",
    out_of_range: "Fuera de rango",
    flagged: "Marcada",
};
const SOURCE_LABEL = { manual: "Manual", device: "Dispositivo" } as const;
const SEVERITY_LABEL: Record<AlertSeverity, string> = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" };
const STATUS_LABEL: Record<AlertStatus, string> = {
    open: "Abierta",
    acknowledged: "Con acuse",
    validated: "Validada",
    dismissed: "Descartada",
};

const pad = (value: number) => String(value).padStart(2, "0");

function formatStamp(iso: string): string {
    const date = new Date(iso);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const newestFirst = <T,>(items: T[], pick: (item: T) => string) =>
    [...items].sort((a, b) => new Date(pick(b)).getTime() - new Date(pick(a)).getTime());

export function exportFileName(format: ExportFormat, date: Date): string {
    return `historial-hipertai-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.${format}`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const NOT_AVAILABLE = "No disponible";

function patientRows(data: HistoryData): [string, string][] {
    const { patient } = data;
    return [
        ["Nombre", patient?.full_name ?? NOT_AVAILABLE],
        [
            "Fecha de nacimiento",
            patient?.birth_date ? `${patient.birth_date} (${ageFromBirthDate(patient.birth_date)} años)` : NOT_AVAILABLE,
        ],
        ["Sexo", patient?.sex ? capitalize(patient.sex) : NOT_AVAILABLE],
        ["Documento", patient?.document_number ?? NOT_AVAILABLE],
        ["Diagnóstico de hipertensión", patient?.diagnosis_date ?? NOT_AVAILABLE],
        ["Período", data.periodLabel],
        ["Generado", formatStamp(data.generatedAt.toISOString())],
    ];
}

type Statistic = [string, string | number];

function statisticRows(readings: Reading[]): Statistic[] {
    const stats = summaryStats(readings);
    const counts: Record<ReadingCategory, number> = { normal: 0, elevated: 0, high: 0, crisis: 0 };
    for (const reading of readings) {
        if (reading.validation_status === "valid") counts[classifyReading(reading.systolic, reading.diastolic)] += 1;
    }
    const excluded = readings.length - stats.count;
    const rows: Statistic[] = [
        ["Lecturas válidas", stats.count],
        ["Lecturas fuera de rango o marcadas", excluded],
        ["Presión promedio (mmHg)", stats.mean ? `${stats.mean.systolic}/${stats.mean.diastolic}` : "-"],
        ["Sistólica máxima (mmHg)", stats.maxSystolic ?? "-"],
        ["Sistólica mínima (mmHg)", stats.minSystolic ?? "-"],
        ["Diastólica máxima (mmHg)", stats.maxDiastolic ?? "-"],
        ["Diastólica mínima (mmHg)", stats.minDiastolic ?? "-"],
        ["Variabilidad sistólica (desviación estándar)", stats.systolicSpread ?? "-"],
        ["Presión de pulso promedio (mmHg)", stats.meanPulsePressure ?? "-"],
        ["Frecuencia cardíaca promedio (lpm)", stats.meanHeartRate ?? "-"],
        ["Lecturas desde 140/90", stats.highCount],
    ];
    for (const category of Object.keys(counts) as ReadingCategory[]) {
        rows.push([`Lecturas en categoría ${CATEGORY_LABEL[category]}`, counts[category]]);
    }
    return rows;
}

const READING_HEADER = [
    "Fecha y hora",
    "Sistólica (mmHg)",
    "Diastólica (mmHg)",
    "Frecuencia cardíaca (lpm)",
    "Categoría",
    "Validación",
    "Origen",
];

export function buildSheets(data: HistoryData): SheetData[] {
    const sheets: SheetData[] = [];
    const { include } = data;

    if (include.summary) {
        const rows: Cell[][] = [
            ["Historial de automonitoreo - HipertAI", null],
            [RECORD_NOTE, null],
            [null, null],
            ...patientRows(data),
            [null, null],
            ["Resumen estadístico", null],
            ...statisticRows(data.readings),
        ];
        sheets.push({ name: "Resumen", rows, columnWidths: [48, 40] });
    }
    if (include.readings) {
        sheets.push({
            name: "Lecturas",
            columnWidths: [18, 18, 18, 24, 12, 16, 14],
            rows: [
                READING_HEADER,
                ...newestFirst(data.readings, (reading) => reading.measured_at).map((reading): Cell[] => [
                    formatStamp(reading.measured_at),
                    reading.systolic,
                    reading.diastolic,
                    reading.heart_rate,
                    CATEGORY_LABEL[classifyReading(reading.systolic, reading.diastolic)],
                    VALIDATION_LABEL[reading.validation_status],
                    SOURCE_LABEL[reading.source],
                ]),
            ],
        });
    }
    if (include.symptoms) {
        sheets.push({
            name: "Síntomas",
            columnWidths: [18, 22, 70],
            rows: [
                ["Fecha y hora", "Estado de ánimo", "Descripción"],
                ...newestFirst(data.symptoms, (symptom) => symptom.recorded_at).map((symptom): Cell[] => [
                    formatStamp(symptom.recorded_at),
                    symptom.mood ?? "",
                    symptom.free_text ?? "",
                ]),
            ],
        });
    }
    if (include.alerts) {
        sheets.push({
            name: "Alertas",
            columnWidths: [18, 26, 12, 14, 60],
            rows: [
                ["Fecha y hora", "Tipo", "Severidad", "Estado", "Nota"],
                ...newestFirst(data.alerts, (alert) => alert.created_at).map((alert): Cell[] => [
                    formatStamp(alert.created_at),
                    alert.type,
                    SEVERITY_LABEL[alert.severity],
                    STATUS_LABEL[alert.status],
                    alert.note ?? "",
                ]),
            ],
        });
    }
    return sheets;
}

export function buildBlocks(data: HistoryData): PdfBlock[] {
    const { include } = data;
    const blocks: PdfBlock[] = [
        { kind: "title", text: "Historial de automonitoreo" },
        { kind: "paragraph", text: RECORD_NOTE },
        { kind: "heading", text: "Datos del paciente" },
        { kind: "keyValue", rows: patientRows(data) },
    ];
    if (include.summary) {
        blocks.push(
            { kind: "heading", text: "Resumen estadístico" },
            { kind: "keyValue", rows: statisticRows(data.readings).map(([label, value]) => [label, String(value)]) },
        );
    }
    if (include.readings) {
        blocks.push(
            { kind: "heading", text: "Lecturas" },
            {
                kind: "table",
                columns: [
                    { title: "Fecha y hora", width: 100 },
                    { title: "Sist.", width: 45 },
                    { title: "Diast.", width: 45 },
                    { title: "FC", width: 40 },
                    { title: "Categoría", width: 70 },
                    { title: "Validación", width: 85 },
                    { title: "Origen", width: 70 },
                ],
                rows: newestFirst(data.readings, (reading) => reading.measured_at).map((reading) => [
                    formatStamp(reading.measured_at),
                    String(reading.systolic),
                    String(reading.diastolic),
                    reading.heart_rate === null ? "-" : String(reading.heart_rate),
                    CATEGORY_LABEL[classifyReading(reading.systolic, reading.diastolic)],
                    VALIDATION_LABEL[reading.validation_status],
                    SOURCE_LABEL[reading.source],
                ]),
            },
        );
    }
    if (include.symptoms) {
        blocks.push(
            { kind: "heading", text: "Síntomas" },
            {
                kind: "table",
                columns: [
                    { title: "Fecha y hora", width: 100 },
                    { title: "Estado de ánimo", width: 100 },
                    { title: "Descripción", width: 315 },
                ],
                rows: newestFirst(data.symptoms, (symptom) => symptom.recorded_at).map((symptom) => [
                    formatStamp(symptom.recorded_at),
                    symptom.mood ?? "-",
                    symptom.free_text ?? "-",
                ]),
            },
        );
    }
    if (include.alerts) {
        blocks.push(
            { kind: "heading", text: "Alertas" },
            {
                kind: "table",
                columns: [
                    { title: "Fecha y hora", width: 100 },
                    { title: "Severidad", width: 70 },
                    { title: "Estado", width: 80 },
                    { title: "Nota", width: 265 },
                ],
                rows: newestFirst(data.alerts, (alert) => alert.created_at).map((alert) => [
                    formatStamp(alert.created_at),
                    SEVERITY_LABEL[alert.severity],
                    STATUS_LABEL[alert.status],
                    alert.note ?? "-",
                ]),
            },
        );
    }
    return blocks;
}

export const MEDIA_TYPE: Record<ExportFormat, string> = {
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pdf: "application/pdf",
};

export function buildFile(format: ExportFormat, data: HistoryData): { bytes: Uint8Array; mime: string } {
    const bytes =
        format === "xlsx"
            ? buildXlsx(buildSheets(data))
            : buildPdf(buildBlocks(data), { footer: "Registro de automonitoreo - HipertAI" });
    return { bytes, mime: MEDIA_TYPE[format] };
}

const PAGE_SIZE = 200;

async function allPages<T>(fetchPage: (offset: number) => Promise<{ items: T[]; total: number }>): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await fetchPage(offset);
        all.push(...page.items);
        if (page.items.length === 0 || all.length >= page.total) return all;
    }
}

export async function collectHistory(
    days: number | null,
    now: Date = new Date(),
    include: IncludeOptions = { summary: true, readings: true, symptoms: true, alerts: true },
    patientId?: string,
): Promise<{ readings: Reading[]; symptoms: Symptom[]; alerts: Alert[] }> {
    const since = days === null ? null : new Date(now.getTime() - days * 86_400_000).toISOString();
    const range = since === null ? {} : { since };
    const scope = patientId ? { patient_id: patientId } : {};
    // The statistical summary is computed from the readings, so it needs them too.
    const [readings, symptoms, alerts] = await Promise.all([
        include.readings || include.summary
            ? allPages((offset) => listReadings({ ...scope, ...range, limit: PAGE_SIZE, offset }))
            : Promise.resolve([] as Reading[]),
        include.symptoms
            ? allPages((offset) => listSymptoms({ ...scope, ...range, limit: PAGE_SIZE, offset }))
            : Promise.resolve([] as Symptom[]),
        include.alerts ? allPages((offset) => listAlerts({ ...scope, limit: PAGE_SIZE, offset })) : Promise.resolve([] as Alert[]),
    ]);
    return {
        readings,
        symptoms,
        // The alerts list has no date filter, so the period is applied here.
        alerts: since === null ? alerts : alerts.filter((alert) => new Date(alert.created_at).getTime() >= new Date(since).getTime()),
    };
}

export function downloadFile(bytes: Uint8Array, name: string, mime: string): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
