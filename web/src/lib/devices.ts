// @requirement RF-04
// Devices the user has chosen in the browser's Bluetooth chooser. The browser
// does not let a page list nearby devices on its own, so the list is built from
// what the user picks and from devices the browser already has permission for.

export interface KnownDevice {
    id: string;
    name: string;
    linked: boolean;
}

export interface ChosenDevice {
    id: string;
    name?: string;
}

const STORAGE_KEY = "hta.devices.v1";
const UNNAMED = "Dispositivo sin nombre";

export function upsertLinked(list: KnownDevice[], device: ChosenDevice): KnownDevice[] {
    const entry: KnownDevice = { id: device.id, name: device.name || UNNAMED, linked: true };
    return list.some((known) => known.id === device.id)
        ? list.map((known) => (known.id === device.id ? entry : known))
        : [...list, entry];
}

export const setLinked = (list: KnownDevice[], id: string, linked: boolean): KnownDevice[] =>
    list.map((known) => (known.id === id ? { ...known, linked } : known));

export const forgetDevice = (list: KnownDevice[], id: string): KnownDevice[] => list.filter((known) => known.id !== id);

export const forgetAll = (): KnownDevice[] => [];

export function mergePermitted(known: KnownDevice[], permitted: ChosenDevice[]): KnownDevice[] {
    const merged = [...known];
    for (const device of permitted) {
        if (!merged.some((entry) => entry.id === device.id)) {
            merged.push({ id: device.id, name: device.name || UNNAMED, linked: false });
        }
    }
    return merged;
}

export function loadDevices(): KnownDevice[] {
    try {
        const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
        if (!Array.isArray(raw)) return [];
        return raw.filter(
            (item): item is KnownDevice =>
                typeof item?.id === "string" && typeof item?.name === "string" && typeof item?.linked === "boolean",
        );
    } catch {
        return [];
    }
}

export function saveDevices(list: KnownDevice[]): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        // Storage can be blocked; the list then lasts only for this visit.
    }
}
