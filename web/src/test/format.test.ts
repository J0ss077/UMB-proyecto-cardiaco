// @requirement none
import { describe, expect, it } from "vitest";
import { ageFromBirthDate } from "../lib/format";

describe("ageFromBirthDate", () => {
    it("counts calendar days: the eve of the birthday is not the birthday yet", () => {
        // "1955-01-30" parsed as UTC midnight is 29 January in Bogotá. With the
        // calendar comparison the patient is 70 on 29 January 2026, not 71.
        expect(ageFromBirthDate("1955-01-30", new Date(2026, 0, 29, 23, 30))).toBe(70);
        expect(ageFromBirthDate("1955-01-30", new Date(2026, 0, 30, 0, 30))).toBe(71);
    });

    it("handles a leap-year birthday", () => {
        expect(ageFromBirthDate("2000-02-29", new Date(2024, 1, 28, 12))).toBe(23);
        expect(ageFromBirthDate("2000-02-29", new Date(2024, 1, 29, 12))).toBe(24);
        expect(ageFromBirthDate("2000-02-29", new Date(2025, 1, 28, 12))).toBe(24);
        expect(ageFromBirthDate("2000-02-29", new Date(2025, 2, 1, 12))).toBe(25);
    });
});
