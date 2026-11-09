// @requirement RF-14
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn";
import type { AppNotification } from "../lib/notifications";
import { NotificationItem } from "./NotificationItem";
import { Button } from "./ui/Button";

type Tab = "all" | "unread" | "read";
type Kind = "all" | AppNotification["kind"];

interface NotificationCenterProps {
    notifications: AppNotification[];
    readIds: string[];
    onClose: () => void;
    onSetRead: (ids: string[], read: boolean) => void;
    onDismiss: (ids: string[]) => void;
    onEmergency: () => void;
    emptyMessage?: string;
    // The reference moment for "today" and "yesterday"; the real clock by default.
    now?: Date;
}

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function dayLabel(iso: string, now: Date): string {
    const date = new Date(iso);
    if (sameDay(date, now)) return "Hoy";
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (sameDay(date, yesterday)) return "Ayer";
    return new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "long",
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    }).format(date);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function NotificationCenter({
    notifications,
    readIds,
    onClose,
    onSetRead,
    onDismiss,
    onEmergency,
    emptyMessage = "No tienes notificaciones.",
    now = new Date(),
}: NotificationCenterProps) {
    const [tab, setTab] = useState<Tab>("all");
    const [kind, setKind] = useState<Kind>("all");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<string[]>([]);
    const dialog = useRef<HTMLDivElement>(null);

    useEffect(() => {
        dialog.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const isRead = (id: string) => readIds.includes(id);
    const unread = notifications.filter((entry) => !isRead(entry.id)).length;
    const read = notifications.length - unread;

    const visible = useMemo(() => {
        const needle = normalize(query.trim());
        return notifications.filter((entry) => {
            if (tab === "unread" && readIds.includes(entry.id)) return false;
            if (tab === "read" && !readIds.includes(entry.id)) return false;
            if (kind !== "all" && entry.kind !== kind) return false;
            return !needle || normalize(`${entry.title} ${entry.body}`).includes(needle);
        });
    }, [notifications, readIds, tab, kind, query]);

    // A selection never keeps notifications the current filter hides.
    useEffect(() => {
        setSelected((current) => {
            const next = current.filter((id) => visible.some((entry) => entry.id === id));
            return next.length === current.length ? current : next;
        });
    }, [visible]);

    const groups = useMemo(() => {
        const sorted = [...visible].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        const out: { label: string; items: AppNotification[] }[] = [];
        for (const entry of sorted) {
            const label = dayLabel(entry.at, now);
            const last = out[out.length - 1];
            if (last && last.label === label) last.items.push(entry);
            else out.push({ label, items: [entry] });
        }
        return out;
    }, [visible, now]);

    const selectedIds = visible.filter((entry) => selected.includes(entry.id)).map((entry) => entry.id);
    const allIds = notifications.map((entry) => entry.id);
    const allSelected = visible.length > 0 && selectedIds.length === visible.length;

    const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    const afterBulk = () => setSelected([]);

    const TABS: { id: Tab; label: string; count: number }[] = [
        { id: "all", label: "Todas", count: notifications.length },
        { id: "unread", label: "Sin leer", count: unread },
        { id: "read", label: "Leídas", count: read },
    ];

    return (
        <div className="fixed inset-0 z-50 flex bg-black/40 sm:p-6">
            <div
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-label="Todas las notificaciones"
                tabIndex={-1}
                className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-background shadow-xl sm:rounded-[1.25rem]"
            >
                <header className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-8 sm:py-6">
                    <div>
                        <h2 className="text-2xl font-medium">Todas las notificaciones</h2>
                        <p className="text-sm text-subtle">{`${plural(notifications.length, "notificación", "notificaciones")} · ${unread} sin leer`}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 sm:px-8">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div role="tablist" aria-label="Estado" className="flex rounded-card border border-border/70 bg-surface p-1">
                            {TABS.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === entry.id}
                                    onClick={() => setTab(entry.id)}
                                    className={cn(
                                        "flex items-center gap-2 rounded-field px-4 py-2 text-sm transition-colors",
                                        tab === entry.id ? "bg-background font-medium shadow-sm" : "text-subtle hover:text-foreground",
                                    )}
                                >
                                    {entry.label}
                                    <span className="tabular-nums text-xs">{entry.count}</span>
                                </button>
                            ))}
                        </div>
                        <select
                            aria-label="Tipo"
                            value={kind}
                            onChange={(event) => setKind(event.target.value as Kind)}
                            className="h-11 rounded-field border border-border bg-background px-3 text-base"
                        >
                            <option value="all">Todos los tipos</option>
                            <option value="reading">Lecturas</option>
                            <option value="alert">Alertas</option>
                        </select>
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                            <input
                                type="search"
                                aria-label="Buscar notificaciones"
                                placeholder="Buscar notificaciones"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                className="h-11 w-full rounded-field border border-border bg-background pl-10 pr-3 text-base"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                aria-label="Seleccionar todas las visibles"
                                checked={allSelected}
                                disabled={visible.length === 0}
                                onChange={() => setSelected(allSelected ? [] : visible.map((entry) => entry.id))}
                                className="h-4 w-4 rounded border-border accent-primary"
                            />
                            Seleccionar
                        </label>
                        {selectedIds.length > 0 ? (
                            <>
                                <span className="text-sm font-medium">{plural(selectedIds.length, "seleccionada", "seleccionadas")}</span>
                                <Button size="sm" variant="outline" onClick={() => { onSetRead(selectedIds, true); afterBulk(); }}>
                                    Marcar como leídas
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { onSetRead(selectedIds, false); afterBulk(); }}>
                                    Marcar como no leídas
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => { onDismiss(selectedIds); afterBulk(); }}>
                                    Borrar seleccionadas
                                </Button>
                            </>
                        ) : (
                            <div className="ml-auto flex flex-wrap gap-2">
                                <Button size="sm" variant="ghost" disabled={unread === 0} onClick={() => onSetRead(allIds, true)}>
                                    Marcar todas como leídas
                                </Button>
                                <Button size="sm" variant="ghost" disabled={read === 0} onClick={() => onSetRead(allIds, false)}>
                                    Marcar todas como no leídas
                                </Button>
                                <Button size="sm" variant="ghost" disabled={notifications.length === 0} onClick={() => onDismiss(allIds)}>
                                    Borrar todas
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-8">
                    {notifications.length === 0 ? (
                        <p className="py-16 text-center text-subtle">{emptyMessage}</p>
                    ) : visible.length === 0 ? (
                        <p className="py-16 text-center text-subtle">Ninguna notificación coincide con el filtro.</p>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {groups.map((group) => (
                                <section key={group.label} className="flex flex-col gap-3">
                                    <h3 className="text-sm font-medium uppercase tracking-wide text-subtle">{group.label}</h3>
                                    <ul className="flex flex-col gap-3">
                                        {group.items.map((entry) => (
                                            <NotificationItem
                                                key={entry.id}
                                                entry={entry}
                                                read={isRead(entry.id)}
                                                roomy
                                                onSetRead={onSetRead}
                                                onDismiss={onDismiss}
                                                onEmergency={onEmergency}
                                                selection={{ checked: selected.includes(entry.id), onToggle: () => toggle(entry.id) }}
                                            />
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
