// @requirement RF-24
import { describe, expect, it } from "vitest";
import { buildCheckupPdf, checkupFileName, meetLink } from "../lib/checkup";
import type { Consultation } from "../types";

const text = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

const consultation = (overrides: Partial<Consultation> = {}): Consultation => ({
    id: "c1",
    patient_id: "p1",
    patient_name: "Ana Torres",
    physician_id: "d1",
    physician_name: "Dr. Morales",
    message: "Dolor de cabeza desde ayer",
    response: "Registra tus lecturas de hoy y mañana.",
    status: "completed",
    wants_meet: true,
    created_at: "2026-11-08T14:00:00Z",
    responded_at: "2026-11-08T16:00:00Z",
    reason: "dizziness_headache",
    onset: "since_yesterday",
    medications: "Losartán 50 mg",
    urgent: false,
    contact_phone: null,
    reading: { systolic: 150, diastolic: 95, measured_at: "2026-11-08T13:00:00Z" },
    meet_url: "https://meet.google.com/abc-defg-hij",
    checkup_general: "Estable, sin dolor.",
    checkup_pressure: "Revisé 150/95 de ayer.",
    checkup_symptoms: "Mareo que ya cedió.",
    checkup_conduct: "Seguir el registro diario.",
    ...overrides,
});

describe("handwritten checkup", () => {
    it("names the file with the day it is prepared", () => {
        expect(checkupFileName(new Date(2026, 10, 9))).toBe("chequeo-rutina-2026-11-09.pdf");
    });

    it("keeps only a Meet link", () => {
        expect(meetLink("  https://meet.google.com/abc-defg-hij  ")).toBe("https://meet.google.com/abc-defg-hij");
        expect(meetLink("https://example.com/sala")).toBeNull();
        expect(meetLink("https://meet.google.com")).toBeNull();
    });

    it("prints the form the physician wrote, without the home history", () => {
        const pdf = text(buildCheckupPdf(consultation({ id: "c1c1c1c1-aaaa-bbbb-cccc-ddddeeeeffff" })));

        expect(pdf.startsWith("%PDF-1.4")).toBe(true);
        expect(pdf).toContain("Formato de chequeo general");
        expect(pdf).toContain("Lo escribi");
        expect(pdf).toContain("No es el historial de automonitoreo");
        expect(pdf).toContain("Ana Torres");
        expect(pdf).toContain("Dr. Morales");
        expect(pdf).toContain("C1C1C1C1");
        expect(pdf).toContain("Atenci");
        expect(pdf).toContain("Mareos o dolor de cabeza");
        expect(pdf).toContain("Desde ayer");
        expect(pdf).toContain("No lo comparti");
        expect(pdf).toContain("Dolor de cabeza desde ayer");
        expect(pdf).toContain("Losart");
        expect(pdf).toContain("150/95 mmHg");
        expect(pdf).toContain("Estable, sin dolor.");
        expect(pdf).toContain("Revis");
        expect(pdf).toContain("Mareo que ya cedi");
        expect(pdf).toContain("Seguir el registro diario.");
        expect(pdf).toContain("Registra tus lecturas de hoy y mañana.");
        expect(pdf).toContain("https://meet.google.com/abc-defg-hij");
        expect(pdf).toContain("no es un diagn");
        expect(pdf).toContain("123");
        expect(pdf).toContain("Firma del m");
        expect(pdf).not.toContain("134.4");
        expect(pdf).not.toContain("Lecturas v");
        expect(pdf).not.toContain("Registro de automonitoreo");
    });

    it("says when the visit was comments only and no reading came with it", () => {
        const pdf = text(
            buildCheckupPdf(
                consultation({
                    wants_meet: false,
                    meet_url: null,
                    medications: null,
                    contact_phone: "3000000000",
                    reading: null,
                    message: null,
                }),
            ),
        );

        expect(pdf).toContain("Atenci");
        expect(pdf).toContain("por comentarios");
        expect(pdf).toContain("sin reuni");
        expect(pdf).toContain("No indic");
        expect(pdf).toContain("No hab");
        expect(pdf).toContain("3000000000");
        expect(pdf).toContain("No dej");
        expect(pdf).not.toContain("meet.google.com");
    });
});
