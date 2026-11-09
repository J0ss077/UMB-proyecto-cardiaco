// @requirement RF-16
import { describe, expect, it } from "vitest";
import {
    CONSENT_LABEL,
    RECIPIENT_OPTIONS,
    ROLE_LABEL,
    SEVERITY_LABEL,
    STALE_READING_DAYS,
    STATUS_LABEL,
    measuredToday,
    readingIsStale,
} from "../lib/staff";

const NOW = new Date(2026, 10, 9, 15, 0);
const DAY = 86_400_000;

describe("readingIsStale", () => {
    it("is stale without any reading", () => {
        expect(readingIsStale(null, NOW)).toBe(true);
    });

    it("is fresh up to three days and stale after", () => {
        expect(STALE_READING_DAYS).toBe(3);
        expect(readingIsStale(new Date(NOW.getTime() - 3 * DAY).toISOString(), NOW)).toBe(false);
        expect(readingIsStale(new Date(NOW.getTime() - 3 * DAY - 60_000).toISOString(), NOW)).toBe(true);
        expect(readingIsStale(NOW.toISOString(), NOW)).toBe(false);
    });
});

describe("measuredToday", () => {
    it("is true for any time of the same local day", () => {
        expect(measuredToday(new Date(2026, 10, 9, 0, 1).toISOString(), NOW)).toBe(true);
        expect(measuredToday(new Date(2026, 10, 9, 23, 59).toISOString(), NOW)).toBe(true);
    });

    it("is false for another day, month or year, and for no reading", () => {
        expect(measuredToday(new Date(2026, 10, 8, 23, 59).toISOString(), NOW)).toBe(false);
        expect(measuredToday(new Date(2026, 9, 9, 15, 0).toISOString(), NOW)).toBe(false);
        expect(measuredToday(new Date(2025, 10, 9, 15, 0).toISOString(), NOW)).toBe(false);
        expect(measuredToday(null, NOW)).toBe(false);
    });
});

describe("labels", () => {
    it("names every severity, status, role and consent state in Spanish", () => {
        expect(SEVERITY_LABEL).toEqual({ low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" });
        expect(STATUS_LABEL).toEqual({ open: "Abierta", acknowledged: "Recibida", validated: "Validada", dismissed: "Descartada" });
        expect(ROLE_LABEL).toEqual({ patient: "Paciente", physician: "Médico", caregiver: "Cuidador", admin: "Administrador" });
        expect(CONSENT_LABEL).toEqual({ active: "Vigente", pending: "Pendiente", revoked: "Revocado" });
    });

    it("offers the three recipients of an alert", () => {
        expect(RECIPIENT_OPTIONS.map((option) => option.id)).toEqual(["patient", "caregiver", "physician"]);
    });
});
