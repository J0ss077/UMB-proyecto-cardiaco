// @requirement RF-14
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import type { AppNotification } from "../lib/notifications";
import { NotificationCenter } from "./NotificationCenter";
import { NotificationItem } from "./NotificationItem";
import type { BrowserPermission } from "./useNotifications";
import { Button } from "./ui/Button";

interface NotificationBellProps {
    notifications: AppNotification[];
    readIds?: string[];
    unread: number;
    permission: BrowserPermission;
    // Marks the given notifications read (true) or unread (false).
    onSetRead: (ids: string[], read: boolean) => void;
    onDismiss: (ids: string[]) => void;
    onEmergency: () => void;
    onRequestPermission: () => void;
    emptyMessage?: string;
}

type Tab = "all" | "unread";

export function NotificationBell({
    notifications,
    readIds = [],
    unread,
    permission,
    onSetRead,
    onDismiss,
    onEmergency,
    onRequestPermission,
    emptyMessage = "No tienes notificaciones.",
}: NotificationBellProps) {
    const [open, setOpen] = useState(false);
    const [centerOpen, setCenterOpen] = useState(false);
    const [tab, setTab] = useState<Tab>("all");
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        const onPointer = (event: MouseEvent) => {
            if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onPointer);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onPointer);
        };
    }, [open]);

    const isRead = (id: string) => readIds.includes(id);
    const readCount = notifications.filter((entry) => isRead(entry.id)).length;
    const shown = tab === "unread" ? notifications.filter((entry) => !isRead(entry.id)) : notifications;
    const allIds = notifications.map((entry) => entry.id);

    return (
        <div ref={root} className="relative">
            <button
                type="button"
                aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen((current) => !current)}
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
            >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {unread > 0 ? (
                    <span
                        aria-hidden="true"
                        className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-medium text-primary-foreground"
                    >
                        {unread > 99 ? "99+" : unread}
                    </span>
                ) : null}
            </button>

            {open ? (
                <div
                    role="dialog"
                    aria-label="Notificaciones"
                    className="fixed inset-x-3 top-16 z-40 flex max-h-[80vh] flex-col gap-3 overflow-y-auto rounded-card border border-border bg-background p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem]"
                >
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-base font-medium">Notificaciones</h2>
                        <div role="tablist" aria-label="Estado" className="flex rounded-field bg-surface p-0.5">
                            {(
                                [
                                    ["all", "Todas"],
                                    ["unread", "Sin leer"],
                                ] as const
                            ).map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === id}
                                    onClick={() => setTab(id)}
                                    className={cn(
                                        "flex items-center gap-1.5 rounded-[0.4rem] px-3 py-1 text-sm transition-colors",
                                        tab === id ? "bg-background font-medium shadow-sm" : "text-subtle hover:text-foreground",
                                    )}
                                >
                                    {label}
                                    {id === "unread" && unread > 0 ? (
                                        <span className="rounded-full bg-critical px-1.5 text-[10px] font-medium text-primary-foreground">{unread}</span>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onSetRead(allIds, true)} disabled={unread === 0}>
                            Marcar todas como leídas
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onSetRead(allIds, false)} disabled={readCount === 0}>
                            Marcar todas como no leídas
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onDismiss(allIds)} disabled={notifications.length === 0}>
                            Borrar todas
                        </Button>
                    </div>

                    {permission === "default" ? (
                        <div className="flex flex-col gap-2 rounded-field bg-surface p-3 text-sm">
                            <p>Recibe un aviso en este dispositivo cuando se detecte una presión peligrosamente alta.</p>
                            <Button size="sm" variant="outline" onClick={onRequestPermission}>
                                Activar avisos del navegador
                            </Button>
                        </div>
                    ) : null}
                    {permission === "denied" ? (
                        <p className="rounded-field bg-surface p-3 text-sm text-subtle">
                            Bloqueaste los avisos del navegador. Puedes activarlos desde los permisos del sitio.
                        </p>
                    ) : null}

                    {shown.length === 0 ? (
                        <p className="py-6 text-center text-sm text-subtle">
                            {tab === "unread" && notifications.length > 0 ? "No tienes notificaciones sin leer." : emptyMessage}
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {shown.map((entry) => (
                                <NotificationItem
                                    key={entry.id}
                                    entry={entry}
                                    read={isRead(entry.id)}
                                    onSetRead={onSetRead}
                                    onDismiss={onDismiss}
                                    onEmergency={() => {
                                        setOpen(false);
                                        onEmergency();
                                    }}
                                />
                            ))}
                        </ul>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                            setOpen(false);
                            setCenterOpen(true);
                        }}
                    >
                        Ver todas las notificaciones
                    </Button>
                </div>
            ) : null}

            {centerOpen ? (
                <NotificationCenter
                    notifications={notifications}
                    readIds={readIds}
                    emptyMessage={emptyMessage}
                    onClose={() => setCenterOpen(false)}
                    onSetRead={onSetRead}
                    onDismiss={onDismiss}
                    onEmergency={() => {
                        setCenterOpen(false);
                        onEmergency();
                    }}
                />
            ) : null}
        </div>
    );
}
