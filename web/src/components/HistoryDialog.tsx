// @requirement RF-19
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { CATEGORY_LABEL, classifyReading, type ReadingCategory } from "../lib/clinical";
import { formatShortDateTime } from "../lib/format";
import type { Reading } from "../types";
import { CategoryBadge } from "./ui/Badge";
import { Button } from "./ui/Button";

type Filter = "all" | ReadingCategory | "invalid";

const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "normal", label: CATEGORY_LABEL.normal },
    { id: "elevated", label: CATEGORY_LABEL.elevated },
    { id: "high", label: CATEGORY_LABEL.high },
    { id: "crisis", label: CATEGORY_LABEL.crisis },
    { id: "invalid", label: "Fuera de rango" },
];

const STEP = 10;

const matches = (reading: Reading, filter: Filter): boolean => {
    if (filter === "all") return true;
    if (filter === "invalid") return reading.validation_status !== "valid";
    return reading.validation_status === "valid" && classifyReading(reading.systolic, reading.diastolic) === filter;
};

export function HistoryDialog({ readings, onClose }: { readings: Reading[]; onClose: () => void }) {
    const [filter, setFilter] = useState<Filter>("all");
    const [shown, setShown] = useState(STEP);
    const dialog = useRef<HTMLDivElement>(null);

    useEffect(() => {
        dialog.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const filtered = useMemo(() => readings.filter((reading) => matches(reading, filter)), [readings, filter]);

    return (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
            <div
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="history-title"
                tabIndex={-1}
                className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 rounded-t-[1.25rem] bg-background p-6 shadow-xl sm:rounded-[1.25rem]"
            >
                <header className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <h2 id="history-title" className="text-xl font-medium">
                            Lecturas desde el inicio del mes anterior
                        </h2>
                        <p className="text-sm text-subtle">
                            Hasta hoy. No es tu historial completo: esta ventana cubre el mes anterior y el actual.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </header>

                <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
                    {FILTERS.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            aria-pressed={filter === entry.id}
                            onClick={() => {
                                setFilter(entry.id);
                                setShown(STEP);
                            }}
                            className={cn(
                                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                filter === entry.id
                                    ? "border-accent bg-accent text-primary-foreground"
                                    : "border-border bg-background hover:bg-muted",
                            )}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                    {filtered.length === 0 ? (
                        <p className="py-8 text-center text-sm text-subtle">Ninguna lectura coincide con el filtro.</p>
                    ) : (
                        <table className="w-full min-w-[28rem] text-left text-sm">
                            <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-subtle">
                                <tr>
                                    <th className="py-2 font-medium">Fecha</th>
                                    <th className="py-2 font-medium">Presión</th>
                                    <th className="py-2 font-medium">FC</th>
                                    <th className="py-2 font-medium">Estado</th>
                                    <th className="py-2 font-medium">Origen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filtered.slice(0, shown).map((reading) => (
                                    <tr key={reading.id}>
                                        <td className="py-2 text-subtle">{formatShortDateTime(reading.measured_at)}</td>
                                        <td className="py-2 tabular-nums">{`${reading.systolic}/${reading.diastolic}`}</td>
                                        <td className="py-2 tabular-nums">{reading.heart_rate ?? "-"}</td>
                                        <td className="py-2">
                                            {reading.validation_status === "valid" ? (
                                                <CategoryBadge category={classifyReading(reading.systolic, reading.diastolic)} />
                                            ) : (
                                                <span className="text-xs text-subtle">Fuera de rango</span>
                                            )}
                                        </td>
                                        <td className="py-2">{reading.source === "device" ? "Dispositivo" : "Manual"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <footer className="flex items-center justify-between gap-3">
                    <p className="text-xs text-subtle">{`${Math.min(shown, filtered.length)} de ${filtered.length} lecturas`}</p>
                    <div className="flex gap-2">
                        {shown < filtered.length ? (
                            <Button variant="outline" size="sm" onClick={() => setShown((count) => count + STEP)}>
                                Ver más
                            </Button>
                        ) : null}
                        <Button size="sm" onClick={onClose}>
                            Listo
                        </Button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
