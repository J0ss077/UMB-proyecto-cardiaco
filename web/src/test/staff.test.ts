// @requirement RF-19
import { describe, expect, it } from "vitest";
import { measuredToday, readingIsStale } from "../lib/staff";

const now = new Date("2026-11-09T12:00:00Z");

describe("staff home rules", () => {
    it("treats a missing reading and a four-day-old reading as stale", () => {
        expect(readingIsStale(null, now)).toBe(true);
        expect(readingIsStale("2026-11-05T11:00:00Z", now)).toBe(true);
        expect(readingIsStale("2026-11-08T12:00:00Z", now)).toBe(false);
    });

    it("recognizes a reading from the same local day", () => {
        const local = new Date(2026, 10, 9, 15, 0, 0);
        const sameDay = new Date(2026, 10, 9, 8, 0, 0).toISOString();
        const yesterday = new Date(2026, 10, 8, 23, 0, 0).toISOString();
        expect(measuredToday(sameDay, local)).toBe(true);
        expect(measuredToday(yesterday, local)).toBe(false);
        expect(measuredToday(null, local)).toBe(false);
    });
});
