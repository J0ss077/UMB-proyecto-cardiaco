// @requirement RF-27
import { useEffect, useState } from "react";
import { listAudit } from "../../api";
import { AUDIT_TOPICS, actionLabel, actionsFor, detailText, entityLabel } from "../../lib/audit";
import { formatShortDateTime } from "../../lib/format";
import type { AuditEvent } from "../../types";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";

function dayStart(value: string): string | undefined {
    if (!value) return undefined;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day, 0, 0, 0).toISOString();
}

function dayEnd(value: string): string | undefined {
    if (!value) return undefined;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day, 23, 59, 59).toISOString();
}

const PAGE = 50;

const fieldClass = "h-11 rounded-field border border-border bg-background px-3 text-base";

function query(filters: { topic: string; action: string; since: string; until: string }, offset: number) {
    return {
        topic: filters.topic || undefined,
        action: filters.action || undefined,
        since: dayStart(filters.since),
        until: dayEnd(filters.until),
        limit: PAGE,
        offset,
    };
}

export function AdminAudit() {
    const [events, setEvents] = useState<AuditEvent[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [topic, setTopic] = useState("");
    const [action, setAction] = useState("");
    const [since, setSince] = useState("");
    const [until, setUntil] = useState("");
    const [total, setTotal] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);

    const applied = { topic, action, since, until };
    const activities = actionsFor(topic);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        setEvents(null);
        listAudit(query(applied, 0))
            .then((page) => {
                if (cancelled) return;
                setEvents(page.items);
                setTotal(page.total);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [applied.topic, applied.action, applied.since, applied.until]);

    async function loadMore() {
        setLoadingMore(true);
        try {
            const page = await listAudit(query(applied, events?.length ?? 0));
            setEvents((current) => [...(current ?? []), ...page.items]);
            setTotal(page.total);
        } catch {
            setFailed(true);
        } finally {
            setLoadingMore(false);
        }
    }

    function chooseTopic(value: string) {
        setTopic(value);
        if (action && !actionsFor(value).some((item) => item.id === action)) setAction("");
    }

    function clear() {
        setTopic("");
        setAction("");
        setSince("");
        setUntil("");
    }

    return (
        <section className="flex flex-col gap-4" aria-labelledby="audit-heading">
            <div className="flex flex-col gap-2">
                <h2 id="audit-heading" className="text-2xl font-medium">
                    Auditoría
                </h2>
                <p className="max-w-2xl text-sm text-subtle">
                    Quién hizo qué, sobre qué y cuándo. El detalle de una lectura, un síntoma, una alerta o una consulta no se muestra.
                </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
                    Tipo
                    <select aria-label="Filtrar por tipo" value={topic} onChange={(event) => chooseTopic(event.target.value)} className={fieldClass}>
                        <option value="">Todas las actividades</option>
                        {AUDIT_TOPICS.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
                    Actividad
                    <select aria-label="Filtrar por actividad" value={action} onChange={(event) => setAction(event.target.value)} className={fieldClass}>
                        <option value="">Cualquier actividad</option>
                        {activities.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                    Desde
                    <input aria-label="Desde" type="date" value={since} onChange={(event) => setSince(event.target.value)} className={fieldClass} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                    Hasta
                    <input aria-label="Hasta" type="date" value={until} onChange={(event) => setUntil(event.target.value)} className={fieldClass} />
                </label>
                <Button type="button" size="sm" variant="ghost" onClick={clear}>
                    Limpiar filtros
                </Button>
            </div>
            {failed ? (
                <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                    No se pudo cargar el rastro.
                </p>
            ) : events === null ? (
                <p className="text-subtle">Cargando el rastro...</p>
            ) : events.length === 0 ? (
                <Card>
                    <CardContent className="text-center text-subtle">No hay eventos con ese filtro.</CardContent>
                </Card>
            ) : (
                <ul className="flex flex-col gap-2">
                    {events.map((event) => (
                        <li key={event.id} className="rounded-card border border-border/70 bg-background p-3 text-sm">
                            <p className="font-medium">{actionLabel(event.action)}</p>
                            <p className="text-subtle">
                                {`${event.actor_name ?? "Sin actor"} · ${entityLabel(event.entity)} · ${event.ip ?? "sin IP"} · ${formatShortDateTime(event.occurred_at)}`}
                            </p>
                            <p>{detailText(event.details, event.details_withheld)}</p>
                        </li>
                    ))}
                </ul>
            )}
            {events && events.length > 0 && events.length < total ? (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-subtle">{`Mostrando ${events.length} de ${total}`}</p>
                    <Button variant="outline" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                        Ver más
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
