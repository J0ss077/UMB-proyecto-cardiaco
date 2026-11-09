// @requirement RF-14
// Danger notifications for the patient: a valid reading in the crisis range and
// open critical alerts. They are computed from the data the app already loaded
// and announce something a person must act on; they never close or validate an
// alert. Whether a notification was read, cleared or already sent to the system
// is remembered in this browser.
import type { Alert, Reading, Symptom } from "../types";
import { classifyReading } from "./clinical";

export const DANGER_TITLE = "¡Presión peligrosamente alta!";
const ALERT_TITLE = "Alerta crítica pendiente";
const ALERT_FALLBACK = "Un médico debe revisar tus lecturas.";

const HOUR = 3_600_000;
const WINDOW_DAYS = 7;
// A symptom counts as accompanying a reading when it was recorded this close to it.
const SYMPTOM_WINDOW_HOURS = 6;

export interface AppNotification {
    id: string;
    kind: "reading" | "alert";
    title: string;
    body: string;
    at: string;
}

interface Source {
    readings: Reading[];
    symptoms: Symptom[];
    alerts: Alert[];
    now: Date;
}

function symptomNote(reading: Reading, symptoms: Symptom[]): string {
    const at = new Date(reading.measured_at).getTime();
    const near = symptoms
        .filter((symptom) => Math.abs(new Date(symptom.recorded_at).getTime() - at) <= SYMPTOM_WINDOW_HOURS * HOUR)
        .sort(
            (a, b) =>
                Math.abs(new Date(a.recorded_at).getTime() - at) - Math.abs(new Date(b.recorded_at).getTime() - at),
        )[0];
    if (near?.free_text) return `Síntomas: ${near.free_text}.`;
    if (near?.mood) return `Estado de ánimo: ${near.mood}.`;
    return "¿Tienes síntomas? Regístralos.";
}

export function buildNotifications({ readings, symptoms, alerts, now }: Source): AppNotification[] {
    const cutoff = now.getTime() - WINDOW_DAYS * 24 * HOUR;
    const fromReadings = readings
        .filter(
            (reading) =>
                reading.validation_status === "valid" &&
                classifyReading(reading.systolic, reading.diastolic) === "crisis" &&
                new Date(reading.measured_at).getTime() >= cutoff,
        )
        .map(
            (reading): AppNotification => ({
                id: `reading:${reading.id}`,
                kind: "reading",
                title: DANGER_TITLE,
                body: `${reading.systolic}/${reading.diastolic} mmHg detectado. ${symptomNote(reading, symptoms)} Actúa ahora.`,
                at: reading.measured_at,
            }),
        );
    const fromAlerts = alerts
        .filter((alert) => alert.status === "open" && alert.severity === "critical" && new Date(alert.created_at).getTime() >= cutoff)
        .map(
            (alert): AppNotification => ({
                id: `alert:${alert.id}`,
                kind: "alert",
                title: ALERT_TITLE,
                body: alert.note ?? ALERT_FALLBACK,
                at: alert.created_at,
            }),
        );
    return [...fromReadings, ...fromAlerts].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export interface NotificationState {
    read: string[];
    dismissed: string[];
    notified: string[];
}

const STORAGE_KEY = "hta.notifications.v1";
const EMPTY: NotificationState = { read: [], dismissed: [], notified: [] };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export function loadState(): NotificationState {
    try {
        const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<NotificationState> | null;
        return raw ? { read: strings(raw.read), dismissed: strings(raw.dismissed), notified: strings(raw.notified) } : { ...EMPTY };
    } catch {
        return { ...EMPTY };
    }
}

export function saveState(state: NotificationState): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Storage can be blocked; the state then lasts only for this visit.
    }
}

const union = (current: string[], ids: string[]) => [...new Set([...current, ...ids])];

export const markAllRead = (state: NotificationState, list: AppNotification[]): NotificationState => ({
    ...state,
    read: union(state.read, list.map((entry) => entry.id)),
});

export const dismissAll = (state: NotificationState, list: AppNotification[]): NotificationState => ({
    ...state,
    dismissed: union(state.dismissed, list.map((entry) => entry.id)),
});

export const unreadCount = (list: AppNotification[], state: NotificationState): number =>
    list.filter((entry) => !state.dismissed.includes(entry.id) && !state.read.includes(entry.id)).length;

export const pendingSystemNotifications = (list: AppNotification[], state: NotificationState): AppNotification[] =>
    list.filter((entry) => !state.dismissed.includes(entry.id) && !state.notified.includes(entry.id));

// Marks the given notifications read, or unread again. Works on any set of ids, so
// one notification, a selection or every notification all use the same function.
export function setRead(state: NotificationState, ids: string[], read: boolean): NotificationState {
    return { ...state, read: read ? union(state.read, ids) : state.read.filter((id) => !ids.includes(id)) };
}

export const dismiss = (state: NotificationState, ids: string[]): NotificationState => ({
    ...state,
    dismissed: union(state.dismissed, ids),
});
