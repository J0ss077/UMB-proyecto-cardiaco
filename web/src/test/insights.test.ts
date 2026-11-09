// @requirement RF-19
import { describe, expect, it } from "vitest";
import {
    dailyAverages,
    heartRateSeries,
    highestReading,
    plainSummary,
    averageSince,
    dailyDelta,
    previousMonthAverage,
    summaryStats,
    byTimeOfDay,
    distribution,
    heartRateStats,
    shareInRange,
    streakDays,
    todayCount,
    weekComparison,
} from "../lib/insights";
import type { Reading } from "../types";

// Local-time dates so the tests do not depend on the machine's time zone.
const NOW = new Date(2026, 10, 9, 15, 0);
const at = (daysAgo: number, hour = 9) => new Date(2026, 10, 9 - daysAgo, hour, 0).toISOString();

let counter = 0;
const reading = (
    daysAgo: number,
    systolic: number,
    diastolic: number,
    extra: Partial<Reading> = {},
    hour = 9,
): Reading => ({
    id: `r${counter++}`,
    patient_id: "p",
    systolic,
    diastolic,
    heart_rate: null,
    source: "manual",
    measured_at: at(daysAgo, hour),
    validation_status: "valid",
    ...extra,
});

describe("streakDays", () => {
    it("counts consecutive days ending today", () => {
        expect(streakDays([reading(0, 120, 80), reading(1, 120, 80), reading(2, 120, 80), reading(4, 120, 80)], NOW)).toBe(3);
    });

    it("keeps the streak alive when today has no reading yet", () => {
        expect(streakDays([reading(1, 120, 80), reading(2, 120, 80)], NOW)).toBe(2);
    });

    it("is zero when neither today nor yesterday has a reading", () => {
        expect(streakDays([reading(3, 120, 80)], NOW)).toBe(0);
        expect(streakDays([], NOW)).toBe(0);
    });

    it("counts a day once however many readings it has", () => {
        expect(streakDays([reading(0, 120, 80), reading(0, 125, 82, {}, 20)], NOW)).toBe(1);
    });
});

describe("todayCount", () => {
    it("counts only the readings of the current day", () => {
        expect(todayCount([reading(0, 120, 80), reading(0, 120, 80, {}, 20), reading(1, 120, 80)], NOW)).toBe(2);
    });
});

describe("shareInRange", () => {
    it("is the share of valid readings under 140/90 in the window", () => {
        const readings = [reading(1, 120, 80), reading(2, 150, 95), reading(3, 130, 85), reading(4, 139, 89)];
        expect(shareInRange(readings, 30, NOW)).toBe(75);
    });

    it("ignores out-of-range and flagged readings and readings outside the window", () => {
        const readings = [
            reading(1, 120, 80),
            reading(2, 300, 200, { validation_status: "out_of_range" }),
            reading(3, 120, 80, { validation_status: "flagged" }),
            reading(40, 190, 120),
        ];
        expect(shareInRange(readings, 30, NOW)).toBe(100);
    });

    it("is null without valid readings", () => {
        expect(shareInRange([], 30, NOW)).toBeNull();
    });
});

describe("weekComparison", () => {
    it("averages the last seven days against the seven before them", () => {
        const readings = [
            reading(1, 140, 90),
            reading(2, 130, 80),
            reading(8, 120, 70),
            reading(9, 124, 74),
        ];
        expect(weekComparison(readings, NOW)).toEqual({
            current: { systolic: 135, diastolic: 85, count: 2 },
            previous: { systolic: 122, diastolic: 72, count: 2 },
        });
    });

    it("returns null for a week without valid readings", () => {
        expect(weekComparison([reading(1, 140, 90)], NOW)).toEqual({
            current: { systolic: 140, diastolic: 90, count: 1 },
            previous: null,
        });
    });
});

describe("distribution", () => {
    it("counts valid readings of the last 30 days by guideline category", () => {
        const readings = [
            reading(1, 118, 76),
            reading(2, 135, 85),
            reading(3, 150, 95),
            reading(4, 186, 122),
            reading(5, 119, 79),
            reading(6, 300, 200, { validation_status: "out_of_range" }),
            reading(45, 150, 95),
        ];
        expect(distribution(readings, 30, NOW)).toEqual({ normal: 2, elevated: 1, high: 1, crisis: 1 });
    });
});

describe("byTimeOfDay", () => {
    it("groups the valid readings into morning, afternoon and night", () => {
        const readings = [
            reading(1, 150, 95, {}, 7),
            reading(2, 140, 90, {}, 10),
            reading(1, 120, 80, {}, 15),
            reading(1, 110, 70, {}, 22),
            reading(2, 130, 80, {}, 3),
        ];
        expect(byTimeOfDay(readings)).toEqual({
            morning: { systolic: 145, diastolic: 93, count: 2 },
            afternoon: { systolic: 120, diastolic: 80, count: 1 },
            night: { systolic: 120, diastolic: 75, count: 2 },
        });
    });

    it("leaves an empty moment as null", () => {
        expect(byTimeOfDay([reading(1, 120, 80, {}, 9)]).night).toBeNull();
    });
});

describe("heartRateStats", () => {
    it("takes the latest rate and the average of the last seven days", () => {
        const readings = [
            reading(0, 120, 80, { heart_rate: 80 }),
            reading(1, 120, 80, { heart_rate: null }),
            reading(2, 120, 80, { heart_rate: 70 }),
            reading(20, 120, 80, { heart_rate: 100 }),
        ];
        expect(heartRateStats(readings, NOW)).toEqual({ latest: 80, average: 75 });
    });

    it("is empty without any rate", () => {
        expect(heartRateStats([reading(0, 120, 80)], NOW)).toEqual({ latest: null, average: null });
    });
});

describe("summaryStats", () => {
    it("summarizes the valid readings", () => {
        const readings = [
            reading(1, 120, 80, { heart_rate: 70 }),
            reading(2, 140, 90, { heart_rate: 80 }),
            reading(3, 160, 100),
            reading(4, 300, 200, { validation_status: "out_of_range" }),
        ];
        expect(summaryStats(readings)).toEqual({
            count: 3,
            mean: { systolic: 140, diastolic: 90, count: 3 },
            maxSystolic: 160,
            minSystolic: 120,
            maxDiastolic: 100,
            minDiastolic: 80,
            systolicSpread: 16.3,
            meanPulsePressure: 50,
            meanHeartRate: 75,
            highCount: 2,
        });
    });

    it("is empty without valid readings", () => {
        expect(summaryStats([])).toEqual({
            count: 0,
            mean: null,
            maxSystolic: null,
            minSystolic: null,
            maxDiastolic: null,
            minDiastolic: null,
            systolicSpread: null,
            meanPulsePressure: null,
            meanHeartRate: null,
            highCount: 0,
        });
    });
});

describe("averageSince", () => {
    it("averages the valid readings of the last days", () => {
        const readings = [reading(1, 140, 90), reading(2, 130, 80), reading(20, 100, 60), reading(3, 300, 200, { validation_status: "out_of_range" })];
        expect(averageSince(readings, 7, NOW)).toEqual({ systolic: 135, diastolic: 85, count: 2 });
        expect(averageSince(readings, 30, NOW)?.count).toBe(3);
        expect(averageSince([], 7, NOW)).toBeNull();
    });
});

describe("previousMonthAverage", () => {
    it("averages the valid readings of the previous calendar month", () => {
        const inOctober = (day: number, systolic: number, diastolic: number) => ({
            ...reading(0, systolic, diastolic),
            measured_at: new Date(2026, 9, day, 12, 0).toISOString(),
        });
        const readings = [inOctober(3, 120, 80), inOctober(20, 130, 90), reading(1, 160, 100), { ...inOctober(10, 300, 200), validation_status: "out_of_range" as const }];
        expect(previousMonthAverage(readings, NOW)).toEqual({ systolic: 125, diastolic: 85, count: 2 });
    });

    it("is null when the previous month has no readings", () => {
        expect(previousMonthAverage([reading(1, 120, 80)], NOW)).toBeNull();
    });
});

describe("dailyDelta", () => {
    it("compares the latest systolic with the previous day's average", () => {
        const readings = [reading(0, 150, 95, {}, 14), reading(1, 152, 98, {}, 9), reading(1, 154, 98, {}, 20)];
        expect(dailyDelta(readings, NOW)).toBe(-3);
    });

    it("is null without a previous day or without readings", () => {
        expect(dailyDelta([reading(0, 150, 95)], NOW)).toBeNull();
        expect(dailyDelta([], NOW)).toBeNull();
    });
});

describe("dailyAverages", () => {
    it("lists every day of the window oldest first, with the day's average and category", () => {
        const readings = [
            reading(0, 150, 95, {}, 8),
            reading(0, 154, 99, {}, 10),
            reading(2, 118, 76),
            reading(2, 300, 200, { validation_status: "out_of_range" }),
        ];
        const days = dailyAverages(readings, 3, NOW);

        expect(days).toHaveLength(3);
        expect(days[0]).toMatchObject({ systolic: 118, diastolic: 76, count: 1, category: "normal" });
        expect(days[1]).toMatchObject({ systolic: null, diastolic: null, count: 0, category: null });
        expect(days[2]).toMatchObject({ systolic: 152, diastolic: 97, count: 2, category: "high" });
    });

    it("labels each day with its weekday and number in Spanish", () => {
        const days = dailyAverages([], 2, NOW);
        expect(days[1]!.label).toMatch(/^[a-záéíóú]+\.? 9$/i);
    });
});

describe("highestReading", () => {
    it("is the valid reading with the highest systolic", () => {
        const high = reading(2, 160, 100);
        expect(highestReading([reading(1, 140, 90), high, reading(3, 300, 200, { validation_status: "out_of_range" })])).toBe(high);
    });

    it("is null without valid readings", () => {
        expect(highestReading([])).toBeNull();
    });
});

describe("heartRateSeries", () => {
    it("keeps the valid readings that have a heart rate, oldest first", () => {
        const series = heartRateSeries([
            reading(1, 120, 80, { heart_rate: 70 }),
            reading(3, 120, 80, { heart_rate: 90 }),
            reading(2, 120, 80, { heart_rate: null }),
            reading(4, 120, 80, { heart_rate: 66, validation_status: "out_of_range" }),
        ]);
        expect(series.map((point) => point.heart_rate)).toEqual([90, 70]);
    });
});

describe("plainSummary", () => {
    const stats = (count: number, highCount: number) =>
        ({ count, highCount }) as Parameters<typeof plainSummary>[0]["stats"];
    const moments = (morning: number | null, afternoon: number | null, night: number | null) => ({
        morning: morning === null ? null : { systolic: morning, diastolic: 80, count: 1 },
        afternoon: afternoon === null ? null : { systolic: afternoon, diastolic: 80, count: 1 },
        night: night === null ? null : { systolic: night, diastolic: 80, count: 1 },
    });

    it("explains the share under 140/90, the highest moment and the highest reading in plain words", () => {
        const lines = plainSummary({ stats: stats(4, 1), moments: moments(150, 120, 110), highest: reading(1, 152, 98) });

        expect(lines[0]).toBe("Tuviste 4 mediciones válidas y 75% estuvieron bajo 140/90.");
        expect(lines).toContain("Tu presión suele ser más alta por la mañana.");
        expect(lines[2]).toMatch(/^Tu lectura más alta fue 152\/98 mmHg el /);
    });

    it("uses the singular and skips the moment with a single moment of data", () => {
        const lines = plainSummary({ stats: stats(1, 0), moments: moments(null, 120, null), highest: reading(1, 120, 80) });
        expect(lines[0]).toBe("Tuviste 1 medición válida y 100% estuvo bajo 140/90.");
        expect(lines.some((line) => line.includes("más alta por la"))).toBe(false);
    });

    it("says there is nothing to explain without readings", () => {
        expect(plainSummary({ stats: stats(0, 0), moments: moments(null, null, null), highest: null })).toEqual([
            "Aún no hay lecturas válidas en este período.",
        ]);
    });
});
