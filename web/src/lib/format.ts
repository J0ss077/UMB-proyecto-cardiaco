// @requirement none
const shortDateTime = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
});

const longDate = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" });

export function formatShortDateTime(iso: string): string {
    return shortDateTime.format(new Date(iso));
}

export function formatLongDate(iso: string): string {
    return longDate.format(new Date(iso));
}

export function formatRelative(iso: string, now: Date = new Date()): string {
    const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
    if (minutes < 1) return "Hace un momento";
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    const days = Math.round(hours / 24);
    return `Hace ${days} ${days === 1 ? "día" : "días"}`;
}

interface CalendarDate {
    year: number;
    month: number;
    day: number;
}

// "1955-01-30" is a calendar date, not an instant. Parsing it with new Date()
// reads it as UTC midnight, which in Bogotá is still 29 January; the age then
// turns one day early. Keep the three numbers and compare them as they are.
function calendarDate(value: string): CalendarDate | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

export function ageFromBirthDate(birthDate: string, now: Date = new Date()): number {
    const birth = calendarDate(birthDate);
    if (!birth) return Number.NaN;
    let age = now.getFullYear() - birth.year;
    const hadBirthday =
        now.getMonth() > birth.month ||
        (now.getMonth() === birth.month && now.getDate() >= birth.day);
    if (!hadBirthday) age -= 1;
    return age;
}
