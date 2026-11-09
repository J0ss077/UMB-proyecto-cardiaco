// @requirement RF-19
import { describe, expect, it } from "vitest";
import { classifyReading, READING_FIELD_RANGES, readingFieldIssue, riskLevel } from "../lib/clinical";

describe("classifyReading", () => {
    it("labels 118/76 as normal", () => {
        expect(classifyReading(118, 76)).toBe("normal");
    });

    it("labels 120/80 as normal, as the design shows it", () => {
        expect(classifyReading(120, 80)).toBe("normal");
    });

    it("labels 135/85 as elevated, between the ACC/AHA and WHO lines", () => {
        expect(classifyReading(135, 85)).toBe("elevated");
    });

    it("labels 150/95 as high", () => {
        expect(classifyReading(150, 95)).toBe("high");
    });

    it("uses the higher of the two values", () => {
        expect(classifyReading(118, 92)).toBe("high");
    });

    it("labels 186/122 as crisis", () => {
        expect(classifyReading(186, 122)).toBe("crisis");
    });
});

describe("readingFieldIssue", () => {
    it("exposes the ranges the form advertises", () => {
        expect(READING_FIELD_RANGES.systolic).toEqual({ min: 80, max: 200 });
        expect(READING_FIELD_RANGES.diastolic).toEqual({ min: 40, max: 130 });
        expect(READING_FIELD_RANGES.heart_rate).toEqual({ min: 30, max: 220 });
    });

    it("returns null inside the range", () => {
        expect(readingFieldIssue("systolic", 120)).toBeNull();
    });

    it("warns, but does not block, outside the range", () => {
        expect(readingFieldIssue("systolic", 300)).toMatch(/fuera del rango/i);
    });
});

describe("riskLevel", () => {
    it("derives a descriptive level from the weekly average when it is sufficient", () => {
        const summary = {
            window_start: "",
            window_end: "",
            sufficient: true,
            valid_count: 9,
            days_with_readings: 5,
            mean_systolic: 118,
            mean_diastolic: 76,
        };
        expect(riskLevel(summary, null)).toEqual({ key: "low", label: "Bajo riesgo" });
    });

    it("falls back to the latest reading when the summary is insufficient", () => {
        const insufficient = {
            window_start: "",
            window_end: "",
            sufficient: false,
            valid_count: 2,
            days_with_readings: 1,
            mean_systolic: null,
            mean_diastolic: null,
        };
        const reading = { systolic: 150, diastolic: 95 };
        expect(riskLevel(insufficient, reading)).toEqual({ key: "high", label: "Riesgo alto" });
    });

    it("reports unknown without any data", () => {
        expect(riskLevel(null, null)).toEqual({ key: "unknown", label: "Sin datos suficientes" });
    });

    it("maps a crisis reading to the highest level", () => {
        expect(riskLevel(null, { systolic: 186, diastolic: 122 }).key).toBe("very_high");
    });
});
