// @requirement RF-14
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    buildNotifications,
    dismiss,
    loadState,
    pendingSystemNotifications,
    saveState,
    setRead,
    unreadCount,
    type AppNotification,
    type NotificationState,
} from "../lib/notifications";
import type { Alert, Reading, Symptom } from "../types";

export type BrowserPermission = NotificationPermission | "unsupported";

const currentPermission = (): BrowserPermission =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission;

// Prefers the service worker, which is the only way phones show a notification;
// falls back to the page constructor where that is allowed.
async function showSystemNotification(entry: AppNotification): Promise<void> {
    const options = { body: entry.body, tag: entry.id, icon: "/icon.svg" };
    try {
        const registration = await navigator.serviceWorker?.getRegistration?.();
        if (registration) {
            await registration.showNotification(entry.title, options);
            return;
        }
    } catch {
        // Fall through to the page constructor.
    }
    try {
        new Notification(entry.title, options);
    } catch {
        // Some browsers refuse the constructor outside a service worker.
    }
}

export function useNotifications(source: { readings: Reading[]; symptoms: Symptom[]; alerts: Alert[] }) {
    const [state, setState] = useState<NotificationState>(loadState);
    const [permission, setPermission] = useState<BrowserPermission>(currentPermission);
    const sentThisSession = useRef(new Set<string>());

    const all = useMemo(
        () => buildNotifications({ ...source, now: new Date() }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [source.readings, source.symptoms, source.alerts],
    );
    const visible = useMemo(() => all.filter((entry) => !state.dismissed.includes(entry.id)), [all, state.dismissed]);

    const update = useCallback((next: NotificationState) => {
        setState(next);
        saveState(next);
    }, []);

    useEffect(() => {
        if (permission !== "granted") return;
        const pending = pendingSystemNotifications(all, state).filter((entry) => !sentThisSession.current.has(entry.id));
        if (pending.length === 0) return;
        pending.forEach((entry) => sentThisSession.current.add(entry.id));
        void Promise.all(pending.map(showSystemNotification));
        update({ ...state, notified: [...new Set([...state.notified, ...pending.map((entry) => entry.id)])] });
    }, [all, permission, state, update]);

    const requestPermission = useCallback(async () => {
        if (typeof Notification === "undefined") return;
        setPermission(await Notification.requestPermission());
    }, []);

    return {
        notifications: visible,
        readIds: state.read,
        unread: unreadCount(all, state),
        permission,
        setRead: (ids: string[], read: boolean) => update(setRead(state, ids, read)),
        dismiss: (ids: string[]) => update(dismiss(state, ids)),
        requestPermission,
    };
}
