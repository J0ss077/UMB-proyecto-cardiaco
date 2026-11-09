// @requirement RF-14
import { HeartPulse, Mail, MailOpen, Trash2, TriangleAlert } from "lucide-react";
import type { MouseEvent } from "react";
import { cn } from "../lib/cn";
import type { AppNotification } from "../lib/notifications";
import { Button } from "./ui/Button";

const time = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });

interface NotificationItemProps {
    entry: AppNotification;
    read: boolean;
    onSetRead: (ids: string[], read: boolean) => void;
    onDismiss: (ids: string[]) => void;
    onEmergency: () => void;
    // Present only where notifications can be picked in bulk.
    selection?: { checked: boolean; onToggle: () => void };
    roomy?: boolean;
}

export function NotificationItem({ entry, read, onSetRead, onDismiss, onEmergency, selection, roomy = false }: NotificationItemProps) {
    // Tapping the text of an unread notification marks it read, as in a mail inbox;
    // a button inside the card does its own thing and never marks it as a side effect.
    function onCardClick(event: MouseEvent) {
        if ((event.target as HTMLElement).closest("button, a, input, label")) return;
        if (!read) onSetRead([entry.id], true);
    }

    return (
        <li
            data-id={entry.id}
            data-unread={!read}
            onClick={onCardClick}
            className={cn(
                "flex flex-col gap-2 rounded-card border p-3",
                read ? "border-border/70 bg-surface" : "border-primary/30 bg-background shadow-sm",
                roomy && "p-4",
            )}
        >
            <div className="flex items-start gap-2">
                {selection ? (
                    <input
                        type="checkbox"
                        aria-label={`Seleccionar: ${entry.title}`}
                        checked={selection.checked}
                        onChange={selection.onToggle}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                ) : null}
                <span
                    aria-hidden="true"
                    className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", read ? "bg-transparent" : "bg-critical")}
                />
                {entry.kind === "alert" ? (
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-critical" aria-hidden="true" />
                ) : (
                    <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-critical" aria-hidden="true" />
                )}
                <p className={cn("flex-1 leading-snug", roomy ? "text-lg" : "text-base", read ? "font-normal" : "font-semibold")}>{entry.title}</p>
                <time dateTime={entry.at} className="shrink-0 text-sm text-subtle">
                    {time.format(new Date(entry.at))}
                </time>
            </div>
            <p className={cn("text-sm", selection ? "pl-[3.75rem]" : "pl-[2.75rem]")}>{entry.body}</p>
            <div className={cn("flex flex-wrap items-center gap-2", selection ? "pl-[3.75rem]" : "pl-[2.75rem]")}>
                <Button variant="accent" size="sm" onClick={onEmergency}>
                    <HeartPulse className="h-4 w-4" aria-hidden="true" />
                    Guía de emergencia
                </Button>
                <button
                    type="button"
                    aria-label={read ? `Marcar como no leída: ${entry.title}` : `Marcar como leída: ${entry.title}`}
                    title={read ? "Marcar como no leída" : "Marcar como leída"}
                    onClick={() => onSetRead([entry.id], !read)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-subtle hover:bg-muted hover:text-foreground"
                >
                    {read ? <Mail className="h-4 w-4" aria-hidden="true" /> : <MailOpen className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button
                    type="button"
                    aria-label={`Borrar: ${entry.title}`}
                    title="Borrar"
                    onClick={() => onDismiss([entry.id])}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-subtle hover:bg-muted hover:text-critical"
                >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </li>
    );
}
