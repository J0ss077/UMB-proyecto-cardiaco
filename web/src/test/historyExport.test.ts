// @requirement RF-18
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildBlocks,
    buildFile,
    buildSheets,
    collectHistory,
    exportFileName,
    PERIODS,
    type HistoryData,
} from "../lib/historyExport";
import type { Alert, Profile, Reading, Symptom } from "../types";

const mocks = vi.hoisted(() => ({ listReadings: vi.fn(), listSymptoms: vi.fn(), listAlerts: vi.fn() }));

vi.mock("../api", () => ({
    listReadings: mocks.listReadings,
    listSymptoms: mocks.listSymptoms,
    listAlerts: mocks.listAlerts,
}));

const profile: Profile = {
    user_id: "u1",
    email: "ana@hta.demo",
    full_name: "Ana María Torres",
    birth_date: "1955-01-30",
    sex: "femenino",
    document_number: "10.000.004",
    phone: "+57 300 000 0004",
    diagnosis_date: "2012-04-18",
    trusted_contact_phone: null,
    trusted_contact_email: null,
    avatar: null,
};

const readings: Reading[] = [
    { id: "r1", patient_id: "u1", systolic: 150, diastolic: 95, heart_rate: 83, source: "manual", measured_at: "2026-11-07T20:00:00Z", validation_status: "valid" },
    { id: "r2", patient_id: "u1", systolic: 118, diastolic: 76, heart_rate: null, source: "device", measured_at: "2026-11-06T08:00:00Z", validation_status: "valid" },
    { id: "r3", patient_id: "u1", systolic: 300, diastolic: 200, heart_rate: null, source: "manual", measured_at: "2026-11-05T08:00:00Z", validation_status: "out_of_range" },
];

const symptoms: Symptom[] = [
    { id: "s1", patient_id: "u1", free_text: "mareo y dolor de cabeza", mood: "ansioso", recorded_at: "2026-11-07T21:30:00Z" },
    { id: "s2", patient_id: "u1", free_text: null, mood: "bien", recorded_at: "2026-11-06T10:00:00Z" },
];

const alerts: Alert[] = [
    { id: "a1", patient_id: "u1", type: "crisis_hipertensiva", severity: "critical", status: "open", note: "pendiente de revisión médica", created_at: "2026-11-07T21:00:00Z", validated_by: null, validated_at: null },
];

const data = (overrides: Partial<HistoryData> = {}): HistoryData => ({
    patient: profile,
    generatedAt: new Date(2026, 10, 9, 15, 30),
    periodLabel: "Últimos 30 días",
    readings,
    symptoms,
    alerts,
    include: { summary: true, readings: true, symptoms: true, alerts: true },
    ...overrides,
});

describe("exportFileName", () => {
    it("is dated and carries the extension", () => {
        expect(exportFileName("xlsx", new Date(2026, 10, 9))).toBe("historial-hipertai-2026-11-09.xlsx");
        expect(exportFileName("pdf", new Date(2026, 0, 5))).toBe("historial-hipertai-2026-01-05.pdf");
    });
});

describe("PERIODS", () => {
    it("offers 7, 30 and 90 days and the whole history", () => {
        expect(PERIODS.map((period) => period.days)).toEqual([7, 30, 90, null]);
    });
});

describe("buildSheets", () => {
    it("creates one sheet per included section, in clinical-history order", () => {
        expect(buildSheets(data()).map((sheet) => sheet.name)).toEqual(["Resumen", "Lecturas", "Síntomas", "Alertas"]);
        expect(buildSheets(data({ include: { summary: false, readings: true, symptoms: false, alerts: false } })).map((s) => s.name)).toEqual(["Lecturas"]);
    });

    it("writes the readings as numbers, newest first, with Spanish labels", () => {
        const sheet = buildSheets(data()).find((entry) => entry.name === "Lecturas")!;

        expect(sheet.rows[0]).toEqual([
            "Fecha y hora",
            "Sistólica (mmHg)",
            "Diastólica (mmHg)",
            "Frecuencia cardíaca (lpm)",
            "Categoría",
            "Validación",
            "Origen",
        ]);
        expect(sheet.rows[1]).toEqual([expect.stringMatching(/^2026-11-0\d \d\d:\d\d$/), 150, 95, 83, "Alta", "Válida", "Manual"]);
        expect(sheet.rows[2]![3]).toBeNull();
        expect(sheet.rows[2]![6]).toBe("Dispositivo");
        expect(sheet.rows[3]![5]).toBe("Fuera de rango");
        expect(sheet.rows[3]![4]).toBe("Crisis");
    });

    it("writes the symptoms with their mood and text, tolerating nulls", () => {
        const sheet = buildSheets(data()).find((entry) => entry.name === "Síntomas")!;
        expect(sheet.rows[1]).toEqual([expect.any(String), "ansioso", "mareo y dolor de cabeza"]);
        expect(sheet.rows[2]).toEqual([expect.any(String), "bien", ""]);
    });

    it("writes the alerts with Spanish severity and status", () => {
        const sheet = buildSheets(data()).find((entry) => entry.name === "Alertas")!;
        expect(sheet.rows[1]).toEqual([expect.any(String), "crisis_hipertensiva", "Crítica", "Abierta", "pendiente de revisión médica"]);
    });

    it("summarizes the patient, the period and the statistics of the valid readings only", () => {
        const rows = buildSheets(data()).find((entry) => entry.name === "Resumen")!.rows;
        const value = (label: string) => rows.find((row) => row[0] === label)?.[1];

        expect(value("Nombre")).toBe("Ana María Torres");
        expect(value("Documento")).toBe("10.000.004");
        expect(value("Período")).toBe("Últimos 30 días");
        expect(value("Lecturas válidas")).toBe(2);
        expect(value("Presión promedio (mmHg)")).toBe("134/86");
        expect(value("Sistólica máxima (mmHg)")).toBe(150);
        expect(value("Sistólica mínima (mmHg)")).toBe(118);
        expect(value("Lecturas fuera de rango o marcadas")).toBe(1);
        expect(value("Lecturas en categoría Normal")).toBe(1);
        expect(value("Lecturas en categoría Alta")).toBe(1);
    });

    it("works without the profile", () => {
        const rows = buildSheets(data({ patient: null })).find((entry) => entry.name === "Resumen")!.rows;
        expect(rows.find((row) => row[0] === "Nombre")?.[1]).toBe("No disponible");
    });

    it("labels the file as the patient's own monitoring record, not a clinical record", () => {
        const rows = buildSheets(data()).find((entry) => entry.name === "Resumen")!.rows;
        expect(JSON.stringify(rows)).toMatch(/automonitoreo/i);
        expect(JSON.stringify(rows)).toMatch(/no sustituye la historia clínica/i);
    });
});

describe("buildBlocks", () => {
    it("builds the document sections in order", () => {
        const headings = buildBlocks(data()).filter((block) => block.kind === "heading").map((block) => (block as { text: string }).text);
        expect(headings).toEqual(["Datos del paciente", "Resumen estadístico", "Lecturas", "Síntomas", "Alertas"]);
    });

    it("omits the sections the user did not include", () => {
        const headings = buildBlocks(data({ include: { summary: false, readings: false, symptoms: true, alerts: false } }))
            .filter((block) => block.kind === "heading")
            .map((block) => (block as { text: string }).text);
        expect(headings).toEqual(["Datos del paciente", "Síntomas"]);
    });

    it("states that the record is not a clinical history", () => {
        const text = JSON.stringify(buildBlocks(data()));
        expect(text).toMatch(/no sustituye la historia clínica/i);
    });
});

describe("buildFile", () => {
    it("returns a real spreadsheet and a real PDF with their media types", () => {
        const xlsx = buildFile("xlsx", data());
        const pdf = buildFile("pdf", data());

        expect(xlsx.mime).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        expect(new DataView(xlsx.bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
        expect(pdf.mime).toBe("application/pdf");
        expect(String.fromCharCode(...pdf.bytes.slice(0, 5))).toBe("%PDF-");
    });
});

describe("collectHistory", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
    });

    it("pages through every list until the total is reached", async () => {
        const many = Array.from({ length: 250 }, (_, index) => ({ ...readings[0]!, id: `r${index}` }));
        mocks.listReadings.mockImplementation(({ offset = 0, limit }: { offset?: number; limit: number }) =>
            Promise.resolve({ items: many.slice(offset, offset + limit), total: 250 }),
        );
        mocks.listSymptoms.mockResolvedValue({ items: symptoms, total: 2 });
        mocks.listAlerts.mockResolvedValue({ items: alerts, total: 1 });

        const result = await collectHistory(null);

        expect(result.readings).toHaveLength(250);
        expect(mocks.listReadings).toHaveBeenCalledTimes(2);
        expect(mocks.listReadings).toHaveBeenNthCalledWith(1, { limit: 200, offset: 0 });
        expect(mocks.listReadings).toHaveBeenNthCalledWith(2, { limit: 200, offset: 200 });
        expect(result.symptoms).toEqual(symptoms);
    });

    it("limits readings and symptoms to the period with a since filter and alerts by date", async () => {
        const now = new Date(2026, 10, 9, 12, 0);
        mocks.listReadings.mockResolvedValue({ items: [], total: 0 });
        mocks.listSymptoms.mockResolvedValue({ items: [], total: 0 });
        mocks.listAlerts.mockResolvedValue({
            items: [
                { ...alerts[0]!, id: "recent", created_at: new Date(2026, 10, 5).toISOString() },
                { ...alerts[0]!, id: "old", created_at: new Date(2026, 8, 1).toISOString() },
            ],
            total: 2,
        });

        const result = await collectHistory(30, now);

        const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
        expect(mocks.listReadings).toHaveBeenCalledWith({ since, limit: 200, offset: 0 });
        expect(mocks.listSymptoms).toHaveBeenCalledWith({ since, limit: 200, offset: 0 });
        expect(result.alerts.map((alert) => alert.id)).toEqual(["recent"]);
    });
});
