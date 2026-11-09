// @requirement RF-19
// Figures for the home widgets, computed from the patient's own readings. Only
// readings with validation_status 'valid' enter an average or a share, the same
// rule the API applies to the weekly summary. Days are local calendar days.
import { classifyReading, type ReadingCategory } from "./clinical";
import type { Reading } from "../types";

export interface Average {
    systolic: number;
    diastolic: number;
    count: number;
}

const DAY_MS = 86_400_000;

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const isValid = (reading: Reading) => reading.validation_status === "valid";

function withinDays(reading: Reading, days: number, now: Date): boolean {
    const age = now.getTime() - new Date(reading.measured_at).getTime();
    return age >= 0 && age <= days * DAY_MS;
}

function average(readings: Reading[]): Average | null {
    if (readings.length === 0) return null;
    const sum = readings.reduce(
        (total, reading) => ({ systolic: total.systolic + reading.systolic, diastolic: total.diastolic + reading.diastolic }),
        { systolic: 0, diastolic: 0 },
    );
    return {
        systolic: Math.round(sum.systolic / readings.length),
        diastolic: Math.round(sum.diastolic / readings.length),
        count: readings.length,
    };
}

export function streakDays(readings: Reading[], now: Date): number {
    const days = new Set(readings.map((reading) => dayKey(new Date(reading.measured_at))));
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // A streak is still alive when today has no reading yet but yesterday does.
    if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    while (days.has(dayKey(cursor))) {
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return count;
}

export function todayCount(readings: Reading[], now: Date): number {
    const today = dayKey(now);
    return readings.filter((reading) => dayKey(new Date(reading.measured_at)) === today).length;
}

// Share of valid readings under the 140/90 guideline line, as a whole percentage.
export function shareInRange(readings: Reading[], days: number, now: Date): number | null {
    const pool = readings.filter((reading) => isValid(reading) && withinDays(reading, days, now));
    if (pool.length === 0) return null;
    const inRange = pool.filter((reading) => reading.systolic < 140 && reading.diastolic < 90).length;
    return Math.round((inRange / pool.length) * 100);
}

export function weekComparison(readings: Reading[], now: Date): { current: Average | null; previous: Average | null } {
    const valid = readings.filter(isValid);
    const current = valid.filter((reading) => withinDays(reading, 7, now));
    const previous = valid.filter((reading) => !withinDays(reading, 7, now) && withinDays(reading, 14, now));
    return { current: average(current), previous: average(previous) };
}

export function distribution(readings: Reading[], days: number, now: Date): Record<ReadingCategory, number> {
    const counts: Record<ReadingCategory, number> = { normal: 0, elevated: 0, high: 0, crisis: 0 };
    for (const reading of readings) {
        if (isValid(reading) && withinDays(reading, days, now)) {
            counts[classifyReading(reading.systolic, reading.diastolic)] += 1;
        }
    }
    return counts;
}

export type Moment = "morning" | "afternoon" | "night";

const momentOf = (hour: number): Moment => (hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "night");

export function byTimeOfDay(readings: Reading[]): Record<Moment, Average | null> {
    const groups: Record<Moment, Reading[]> = { morning: [], afternoon: [], night: [] };
    for (const reading of readings.filter(isValid)) {
        groups[momentOf(new Date(reading.measured_at).getHours())].push(reading);
    }
    return { morning: average(groups.morning), afternoon: average(groups.afternoon), night: average(groups.night) };
}

export function heartRateStats(readings: Reading[], now: Date): { latest: number | null; average: number | null } {
    const withRate = [...readings]
        .filter((reading) => isValid(reading) && reading.heart_rate !== null)
        .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
    const week = withRate.filter((reading) => withinDays(reading, 7, now));
    return {
        latest: withRate[0]?.heart_rate ?? null,
        average: week.length ? Math.round(week.reduce((sum, reading) => sum + (reading.heart_rate ?? 0), 0) / week.length) : null,
    };
}

export interface SummaryStats {
    count: number;
    mean: Average | null;
    maxSystolic: number | null;
    minSystolic: number | null;
    maxDiastolic: number | null;
    minDiastolic: number | null;
    // Population standard deviation of the systolic values, one decimal.
    systolicSpread: number | null;
    meanPulsePressure: number | null;
    meanHeartRate: number | null;
    // Valid readings at or above the 140/90 line, including crisis values.
    highCount: number;
}

export function summaryStats(readings: Reading[]): SummaryStats {
    const valid = readings.filter(isValid);
    if (valid.length === 0) {
        return {
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
        };
    }
    const systolic = valid.map((reading) => reading.systolic);
    const diastolic = valid.map((reading) => reading.diastolic);
    const meanSystolic = systolic.reduce((sum, value) => sum + value, 0) / valid.length;
    const variance = systolic.reduce((sum, value) => sum + (value - meanSystolic) ** 2, 0) / valid.length;
    const rates = valid.map((reading) => reading.heart_rate).filter((rate): rate is number => rate !== null);
    return {
        count: valid.length,
        mean: average(valid),
        maxSystolic: Math.max(...systolic),
        minSystolic: Math.min(...systolic),
        maxDiastolic: Math.max(...diastolic),
        minDiastolic: Math.min(...diastolic),
        systolicSpread: Math.round(Math.sqrt(variance) * 10) / 10,
        meanPulsePressure: Math.round(valid.reduce((sum, reading) => sum + (reading.systolic - reading.diastolic), 0) / valid.length),
        meanHeartRate: rates.length ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length) : null,
        highCount: valid.filter((reading) => reading.systolic >= 140 || reading.diastolic >= 90).length,
    };
}

export const readingsWithin = (readings: Reading[], days: number, now: Date): Reading[] =>
    readings.filter((reading) => withinDays(reading, days, now));

export function averageSince(readings: Reading[], days: number, now: Date): Average | null {
    return average(readings.filter((reading) => isValid(reading) && withinDays(reading, days, now)));
}

export function previousMonthAverage(readings: Reading[], now: Date): Average | null {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return average(
        readings.filter((reading) => {
            const date = new Date(reading.measured_at);
            return isValid(reading) && date.getFullYear() === first.getFullYear() && date.getMonth() === first.getMonth();
        }),
    );
}

// Systolic of the latest valid reading minus the average of the day before it.
export function dailyDelta(readings: Reading[], now: Date): number | null {
    void now;
    const valid = readings
        .filter(isValid)
        .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
    const latest = valid[0];
    if (!latest) return null;
    const day = new Date(latest.measured_at);
    const previous = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
    const sameDay = valid.filter((reading) => dayKey(new Date(reading.measured_at)) === dayKey(previous));
    const mean = average(sameDay);
    return mean ? latest.systolic - mean.systolic : null;
}

export interface DayAverage {
    key: string;
    label: string;
    systolic: number | null;
    diastolic: number | null;
    count: number;
    category: ReadingCategory | null;
}

const weekday = new Intl.DateTimeFormat("es-CO", { weekday: "short" });

// One entry per local day of the window, oldest first; days without readings
// stay in the list with null values so the chart shows the gap.
export function dailyAverages(readings: Reading[], days: number, now: Date): DayAverage[] {
    const valid = readings.filter(isValid);
    const result: DayAverage[] = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
        const sameDay = valid.filter((reading) => dayKey(new Date(reading.measured_at)) === dayKey(day));
        const mean = average(sameDay);
        result.push({
            key: dayKey(day),
            label: `${weekday.format(day)} ${day.getDate()}`,
            systolic: mean?.systolic ?? null,
            diastolic: mean?.diastolic ?? null,
            count: sameDay.length,
            category: mean ? classifyReading(mean.systolic, mean.diastolic) : null,
        });
    }
    return result;
}

export function highestReading(readings: Reading[]): Reading | null {
    return readings.filter(isValid).reduce<Reading | null>((best, reading) => (best === null || reading.systolic > best.systolic ? reading : best), null);
}

export function heartRateSeries(readings: Reading[]): { measured_at: string; heart_rate: number }[] {
    return readings
        .filter((reading) => isValid(reading) && reading.heart_rate !== null)
        .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime())
        .map((reading) => ({ measured_at: reading.measured_at, heart_rate: reading.heart_rate as number }));
}

const longDay = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long" });

// A few sentences that restate the period's numbers without jargon.
export function plainSummary({
    stats,
    moments,
    highest,
}: {
    stats: Pick<SummaryStats, "count" | "highCount">;
    moments: Record<Moment, Average | null>;
    highest: Reading | null;
}): string[] {
    if (stats.count === 0) return ["Aún no hay lecturas válidas en este período."];
    const share = Math.round(((stats.count - stats.highCount) / stats.count) * 100);
    const one = stats.count === 1;
    const lines = [`Tuviste ${stats.count} ${one ? "medición válida" : "mediciones válidas"} y ${share}% ${one ? "estuvo" : "estuvieron"} bajo 140/90.`];

    const withData = (Object.keys(moments) as Moment[]).filter((moment) => moments[moment] !== null);
    if (withData.length >= 2) {
        const top = withData.sort((a, b) => (moments[b]?.systolic ?? 0) - (moments[a]?.systolic ?? 0))[0]!;
        const name = { morning: "mañana", afternoon: "tarde", night: "noche" }[top];
        lines.push(`Tu presión suele ser más alta por la ${name}.`);
    }
    if (highest) {
        lines.push(`Tu lectura más alta fue ${highest.systolic}/${highest.diastolic} mmHg el ${longDay.format(new Date(highest.measured_at))}.`);
    }
    return lines;
}
