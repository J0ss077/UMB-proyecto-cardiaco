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

export function ageFromBirthDate(birthDate: string, now: Date = new Date()): number {
    const birth = new Date(birthDate);
    let age = now.getFullYear() - birth.getFullYear();
    const hadBirthday =
        now.getMonth() > birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    if (!hadBirthday) age -= 1;
    return age;
}

// Local offset-aware ISO string, as the API requires an explicit offset.
export function toOffsetIso(date: Date): string {
    return date.toISOString();
}
