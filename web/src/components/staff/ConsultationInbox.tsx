// @requirement RF-24
import { useEffect, useMemo, useState } from "react";
import { listConsultations } from "../../api";
import { cn } from "../../lib/cn";
import type { Consultation } from "../../types";
import { ConsultationsPanel } from "../ConsultationsPanel";
import { Button } from "../ui/Button";

const PAGE = 50;

type Filter = "in_review" | "pending" | "completed" | "all";

export function ConsultationInbox({ onChanged }: { onChanged?: () => void }) {
    const [items, setItems] = useState<Consultation[] | null>(null);
    const [total, setTotal] = useState(0);
    const [failed, setFailed] = useState(false);
    const [filter, setFilter] = useState<Filter>("in_review");
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        let cancelled = false;
        listConsultations({ limit: PAGE, offset: 0 })
            .then((page) => {
                if (cancelled) return;
                setItems(page.items);
                setTotal(page.total);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const counts = useMemo(() => {
        const list = items ?? [];
        return {
            in_review: list.filter((item) => item.status === "in_review").length,
            pending: list.filter((item) => item.status === "pending").length,
            completed: list.filter((item) => item.status === "completed").length,
            all: list.length,
        };
    }, [items]);

    const visible = useMemo(() => {
        const list = items ?? [];
        const inReview = list.filter((item) => item.status === "in_review");
        const pending = list.filter((item) => item.status === "pending");
        const completed = list.filter((item) => item.status === "completed");
        if (filter === "in_review") return inReview;
        if (filter === "pending") return pending;
        if (filter === "completed") return completed;
        return [...inReview, ...pending, ...completed];
    }, [items, filter]);

    async function loadMore() {
        setLoadingMore(true);
        try {
            const page = await listConsultations({ limit: PAGE, offset: items?.length ?? 0 });
            setItems((current) => [...(current ?? []), ...page.items]);
            setTotal(page.total);
        } catch {
            setFailed(true);
        } finally {
            setLoadingMore(false);
        }
    }

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudieron cargar las consultas.
            </p>
        );
    }

    const FILTERS: { id: Filter; label: string; count: number }[] = [
        { id: "in_review", label: "En revisión", count: counts.in_review },
        { id: "pending", label: "Pendientes", count: counts.pending },
        { id: "completed", label: "Completadas", count: counts.completed },
        { id: "all", label: "Todas", count: counts.all },
    ];
    const emptyMessage =
        counts.all === 0
            ? "Todavía no te llegó ninguna consulta."
            : filter === "in_review"
              ? "No hay consultas en revisión."
              : filter === "pending"
                ? "No hay consultas pendientes."
                : "No hay consultas completadas en esta página.";

    return (
        <section className="flex flex-col gap-4" aria-labelledby="consultations-heading">
            <div className="flex flex-col gap-2">
                <h2 id="consultations-heading" className="text-2xl font-medium">
                    Consultas
                </h2>
                <p className="max-w-2xl text-sm text-subtle">
                    Las que están en revisión van primero. El enlace de Meet deja la consulta pendiente. El formato y el comentario la completan.
                </p>
            </div>
            {items === null ? (
                <p className="text-subtle">Cargando consultas...</p>
            ) : (
                <>
                    <div role="group" aria-label="Filtrar consultas" className="flex flex-wrap gap-2">
                        {FILTERS.map((entry) => (
                            <button
                                key={entry.id}
                                type="button"
                                aria-pressed={filter === entry.id}
                                onClick={() => setFilter(entry.id)}
                                className={cn(
                                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                                    filter === entry.id ? "border-accent bg-accent text-primary-foreground" : "border-border bg-background hover:bg-muted",
                                )}
                            >
                                {entry.label}
                                <span className="tabular-nums">{entry.count}</span>
                            </button>
                        ))}
                    </div>
                    <ConsultationsPanel
                        initial={visible}
                        title={null}
                        showPatient
                        emptyMessage={emptyMessage}
                        onAnswered={(updated) => {
                            setItems((current) => current?.map((entry) => (entry.id === updated.id ? updated : entry)) ?? current);
                            onChanged?.();
                        }}
                    />
                    {items.length < total ? (
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-subtle">{`Mostrando ${items.length} de ${total}`}</p>
                            <Button variant="outline" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                                Ver más
                            </Button>
                        </div>
                    ) : null}
                </>
            )}
        </section>
    );
}
