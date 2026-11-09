// @requirement RF-14
import { beforeEach, describe, expect, it } from "vitest";
import {
    DANGER_TITLE,
    buildNotifications,
    dismiss,
    dismissAll,
    loadState,
    markAllRead,
    pendingSystemNotifications,
    saveState,
    setRead,
    unreadCount,
} from "../lib/notifications";
import type { Alert, Reading, Symptom } from "../types";

const NOW = new Date(2026, 10, 9, 12, 0);
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const reading = (id: string, systolic: number, diastolic: number, hoursAgo: number, status: Reading["validation_status"] = "valid"): Reading => ({
    id,
    patient_id: "p",
    systolic,
    diastolic,
    heart_rate: null,
    source: "manual",
    measured_at: ago(hoursAgo),
    validation_status: status,
});

const symptom = (id: string, text: string | null, mood: string | null, hoursAgo: number): Symptom => ({
    id,
    patient_id: "p",
    free_text: text,
    mood,
    recorded_at: ago(hoursAgo),
});

const alert = (id: string, severity: Alert["severity"], hoursAgo: number, note: string | null = null): Alert => ({
    id,
    patient_id: "p",
    type: "crisis_hipertensiva",
    severity,
    status: "open",
    note,
    created_at: ago(hoursAgo),
    validated_by: null,
    validated_at: null,
});

describe("buildNotifications", () => {
    it("notifies a crisis reading with the symptom recorded around it", () => {
        const [first] = buildNotifications({
            readings: [reading("r1", 186, 122, 2)],
            symptoms: [symptom("s1", "dolor de cabeza", null, 2.5)],
            alerts: [],
            now: NOW,
        });

        expect(first).toMatchObject({
            id: "reading:r1",
            kind: "reading",
            title: DANGER_TITLE,
            body: "186/122 mmHg detectado. Síntomas: dolor de cabeza. Actúa ahora.",
            at: ago(2),
        });
    });

    it("uses the mood when there is no text, and asks for symptoms when there is none nearby", () => {
        const withMood = buildNotifications({ readings: [reading("r1", 190, 125, 2)], symptoms: [symptom("s", null, "ansioso", 2)], alerts: [], now: NOW });
        const without = buildNotifications({ readings: [reading("r1", 190, 125, 2)], symptoms: [symptom("s", "mareo", null, 30)], alerts: [], now: NOW });

        expect(withMood[0]?.body).toBe("190/125 mmHg detectado. Estado de ánimo: ansioso. Actúa ahora.");
        expect(without[0]?.body).toBe("190/125 mmHg detectado. ¿Tienes síntomas? Regístralos. Actúa ahora.");
    });

    it("does not notify elevated or high readings, only crisis", () => {
        expect(buildNotifications({ readings: [reading("a", 150, 100, 1), reading("b", 179, 119, 1)], symptoms: [], alerts: [], now: NOW })).toEqual([]);
    });

    it("ignores readings that are not valid, since an impossible value is not a measured crisis", () => {
        expect(buildNotifications({ readings: [reading("a", 300, 200, 1, "out_of_range")], symptoms: [], alerts: [], now: NOW })).toEqual([]);
    });

    it("ignores crisis readings older than the window", () => {
        expect(buildNotifications({ readings: [reading("a", 190, 125, 24 * 8)], symptoms: [], alerts: [], now: NOW })).toEqual([]);
    });

    it("notifies open critical alerts with their note, and not lower severities", () => {
        const result = buildNotifications({
            readings: [],
            symptoms: [],
            alerts: [alert("a1", "critical", 3, "pendiente de revisión médica"), alert("a2", "medium", 3), alert("a3", "high", 3)],
            now: NOW,
        });

        expect(result.map((entry) => entry.id)).toEqual(["alert:a1"]);
        expect(result[0]).toMatchObject({ kind: "alert", title: "Alerta crítica pendiente", body: "pendiente de revisión médica" });
    });

    it("falls back to a generic body for an alert without a note", () => {
        const [first] = buildNotifications({ readings: [], symptoms: [], alerts: [alert("a1", "critical", 3)], now: NOW });
        expect(first?.body).toBe("Un médico debe revisar tus lecturas.");
    });

    it("orders everything newest first", () => {
        const result = buildNotifications({
            readings: [reading("old", 190, 125, 10), reading("new", 188, 121, 1)],
            symptoms: [],
            alerts: [alert("mid", "critical", 5)],
            now: NOW,
        });
        expect(result.map((entry) => entry.id)).toEqual(["reading:new", "alert:mid", "reading:old"]);
    });
});

describe("notification state", () => {
    beforeEach(() => window.localStorage.clear());

    const list = buildNotifications({ readings: [reading("a", 190, 125, 1), reading("b", 188, 121, 2)], symptoms: [], alerts: [], now: NOW });

    it("starts with everything unread", () => {
        expect(unreadCount(list, loadState())).toBe(2);
    });

    it("marks everything read without removing it", () => {
        const state = markAllRead(loadState(), list);
        expect(unreadCount(list, state)).toBe(0);
        expect(state.dismissed).toEqual([]);
    });

    it("dismisses everything so it no longer counts", () => {
        const state = dismissAll(loadState(), list);
        expect(state.dismissed.sort()).toEqual(["reading:a", "reading:b"]);
        expect(unreadCount(list, state)).toBe(0);
    });

    it("persists across loads and survives corrupt storage", () => {
        saveState({ read: ["reading:a"], dismissed: [], notified: ["reading:b"] });
        expect(loadState()).toEqual({ read: ["reading:a"], dismissed: [], notified: ["reading:b"] });

        window.localStorage.setItem("hta.notifications.v1", "{broken");
        expect(loadState()).toEqual({ read: [], dismissed: [], notified: [] });
    });

    it("selects only notifications that were never shown to the system and are not dismissed", () => {
        const state = { read: [], dismissed: ["reading:b"], notified: [] as string[] };
        expect(pendingSystemNotifications(list, state).map((entry) => entry.id)).toEqual(["reading:a"]);
        expect(pendingSystemNotifications(list, { ...state, notified: ["reading:a"] })).toEqual([]);
    });
});


describe("marking notifications read and unread", () => {
    beforeEach(() => window.localStorage.clear());

    const list = buildNotifications({
        readings: [reading("a", 190, 125, 1), reading("b", 188, 121, 2), reading("c", 186, 120, 3)],
        symptoms: [],
        alerts: [],
        now: NOW,
    });
    const empty = { read: [], dismissed: [], notified: [] as string[] };

    it("marks some notifications read and leaves the rest unread", () => {
        const state = setRead(empty, ["reading:a", "reading:c"], true);

        expect(state.read.sort()).toEqual(["reading:a", "reading:c"]);
        expect(unreadCount(list, state)).toBe(1);
    });

    it("marks them unread again", () => {
        const read = setRead(empty, ["reading:a", "reading:b"], true);

        const state = setRead(read, ["reading:a"], false);

        expect(state.read).toEqual(["reading:b"]);
        expect(unreadCount(list, state)).toBe(2);
    });

    it("does nothing twice: marking read is idempotent and unreading an unread one is harmless", () => {
        const once = setRead(empty, ["reading:a"], true);
        expect(setRead(once, ["reading:a"], true).read).toEqual(["reading:a"]);
        expect(setRead(empty, ["reading:a"], false).read).toEqual([]);
    });

    it("can mark every notification unread by passing all of the ids", () => {
        const everything = markAllRead(empty, list);
        expect(unreadCount(list, everything)).toBe(0);

        const state = setRead(everything, list.map((entry) => entry.id), false);

        expect(unreadCount(list, state)).toBe(3);
    });

    it("keeps what was already sent to the system when a notification is marked unread", () => {
        const state = setRead({ read: ["reading:a"], dismissed: [], notified: ["reading:a"] }, ["reading:a"], false);
        expect(state.notified).toEqual(["reading:a"]);
        expect(pendingSystemNotifications(list, state).map((entry) => entry.id)).toEqual(["reading:b", "reading:c"]);
    });

    it("does not touch the original state", () => {
        const original = { read: ["reading:a"], dismissed: [], notified: [] as string[] };
        setRead(original, ["reading:b"], true);
        expect(original.read).toEqual(["reading:a"]);
    });

    it("dismisses only the chosen notifications", () => {
        const state = dismiss(empty, ["reading:b"]);

        expect(state.dismissed).toEqual(["reading:b"]);
        expect(unreadCount(list, state)).toBe(2);
        expect(pendingSystemNotifications(list, state).map((entry) => entry.id)).toEqual(["reading:a", "reading:c"]);
    });

    it("persists the read state", () => {
        saveState(setRead(empty, ["reading:a"], true));
        expect(loadState().read).toEqual(["reading:a"]);
    });
});
