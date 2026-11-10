// @requirement RF-19
// @requirement RF-16
// @requirement RF-24
import { AlertTriangle, MessageSquare, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { listAlerts, listConsultations, listPatients, listReadings } from "../api";
import { cn } from "../lib/cn";
import { CATEGORY_LABEL, classifyReading, type ReadingCategory } from "../lib/clinical";
import { ageFromBirthDate, formatShortDateTime } from "../lib/format";
import { measuredToday, readingIsStale } from "../lib/staff";
import type { Alert, Patient, Reading } from "../types";
import { PatientDetail } from "./PatientDetail";
import { CategoryBadge } from "./ui/Badge";
import { Card, CardContent } from "./ui/Card";

interface Row {
    patient: Patient;
    reading: Reading | null;
    failed: boolean;
    openAlerts: number;
}

interface Loaded {
    rows: Row[];
    totalPatients: number;
    criticalAlerts: number;
    pendingConsultations: number;
}

type CategoryFilter = "all" | ReadingCategory;
type SortKey = "name" | "pressure" | "recent" | "alerts";
type Situation = "" | "stale" | "none" | "today" | "open";

const SITUATIONS: { id: Situation; label: string }[] = [
    { id: "", label: "Cualquier situación" },
    { id: "stale", label: "Sin medición en 3 días" },
    { id: "none", label: "Sin lecturas" },
    { id: "today", label: "Con lectura de hoy" },
    { id: "open", label: "Con alerta abierta" },
];

const FILTERS: { id: CategoryFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "normal", label: CATEGORY_LABEL.normal },
    { id: "elevated", label: CATEGORY_LABEL.elevated },
    { id: "high", label: CATEGORY_LABEL.high },
    { id: "crisis", label: CATEGORY_LABEL.crisis },
];

function Kpi({
    testId,
    icon,
    label,
    value,
    onOpen,
}: {
    testId: string;
    icon: ReactNode;
    label: string;
    value: number;
    // When given, the whole indicator is a shortcut to the page it counts.
    onOpen?: () => void;
}) {
    const card = (
        <Card data-testid={testId} className={cn(onOpen && "transition-colors hover:bg-surface")}>
            <CardContent className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div>
                <div className="text-left">
                    <p className="text-sm text-subtle">{label}</p>
                    <p className="text-3xl font-semibold tabular-nums">{value}</p>
                </div>
            </CardContent>
        </Card>
    );
    return onOpen ? (
        <button type="button" onClick={onOpen} className="block w-full rounded-card text-left">
            {card}
        </button>
    ) : (
        card
    );
}

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function PhysicianView({
    heading = "Pacientes asignados",
    includeConsultations = true,
    manageCaregivers = false,
    notice,
    emptyMessage = "No tienes pacientes vinculados.",
    patientsLabel = "Pacientes asignados",
    onOpenAlerts,
    onOpenConsultations,
}: {
    heading?: string;
    includeConsultations?: boolean;
    // The linked physician authorizes caregivers; the caregiver's own view never does.
    manageCaregivers?: boolean;
    notice?: string;
    emptyMessage?: string;
    patientsLabel?: string;
    // Make the alert and consultation indicators shortcuts to their pages.
    onOpenAlerts?: () => void;
    onOpenConsultations?: () => void;
}) {
    const [data, setData] = useState<Loaded | null>(null);
    const [failed, setFailed] = useState(false);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<CategoryFilter>("all");
    const [situation, setSituation] = useState<Situation>("");
    const [sort, setSort] = useState<SortKey>("name");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const [patients, critical, review, waiting, openPage] = await Promise.all([
                    listPatients({ limit: 200 }),
                    listAlerts({ status: "open", severity: "critical", limit: 1 }),
                    includeConsultations
                        ? listConsultations({ status: "in_review", limit: 1 })
                        : Promise.resolve({ items: [], total: 0 }),
                    includeConsultations
                        ? listConsultations({ status: "pending", limit: 1 })
                        : Promise.resolve({ items: [], total: 0 }),
                    listAlerts({ status: "open", limit: 200 }).catch(() => ({ items: [] as Alert[], total: 0 })),
                ]);
                const openCounts = new Map<string, number>();
                for (const alert of openPage.items) {
                    openCounts.set(alert.patient_id, (openCounts.get(alert.patient_id) ?? 0) + 1);
                }
                // One request per patient: the API has no "latest reading per patient" listing.
                const latest = await Promise.allSettled(
                    patients.items.map((patient) => listReadings({ patient_id: patient.user_id, limit: 1 })),
                );
                if (cancelled) return;
                setData({
                    totalPatients: patients.total,
                    criticalAlerts: critical.total,
                    pendingConsultations: review.total + waiting.total,
                    rows: patients.items.map((patient, index) => {
                        const result = latest[index];
                        return {
                            patient,
                            reading: result?.status === "fulfilled" ? (result.value.items[0] ?? null) : null,
                            failed: result?.status === "rejected",
                            openAlerts: openCounts.get(patient.user_id) ?? 0,
                        };
                    }),
                });
            } catch {
                if (!cancelled) setFailed(true);
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [includeConsultations]);

    const visibleRows = useMemo(() => {
        if (!data) return [];
        const now = new Date();
        const needle = normalize(query.trim());
        const rows = data.rows.filter(({ patient, reading, openAlerts }) => {
            if (needle) {
                const categoryLabel = reading ? CATEGORY_LABEL[classifyReading(reading.systolic, reading.diastolic)] : "";
                const readingText = reading
                    ? `${reading.systolic}/${reading.diastolic} ${reading.systolic} ${reading.diastolic} ${reading.heart_rate ?? ""}`
                    : "";
                if (!normalize(`${patient.full_name} ${readingText} ${categoryLabel}`).includes(needle)) return false;
            }
            if (situation === "stale" && !readingIsStale(reading?.measured_at ?? null, now)) return false;
            if (situation === "none" && reading !== null) return false;
            if (situation === "today" && !measuredToday(reading?.measured_at ?? null, now)) return false;
            if (situation === "open" && openAlerts === 0) return false;
            if (category === "all") return true;
            return reading !== null && classifyReading(reading.systolic, reading.diastolic) === category;
        });
        if (sort === "pressure") {
            rows.sort((a, b) => (b.reading?.systolic ?? -1) - (a.reading?.systolic ?? -1));
        } else if (sort === "recent") {
            rows.sort(
                (a, b) =>
                    (b.reading ? Date.parse(b.reading.measured_at) : 0) - (a.reading ? Date.parse(a.reading.measured_at) : 0),
            );
        } else if (sort === "alerts") {
            rows.sort((a, b) => b.openAlerts - a.openAlerts || a.patient.full_name.localeCompare(b.patient.full_name, "es"));
        }
        return rows;
    }, [data, query, category, situation, sort]);

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudo cargar la información de pacientes.
            </p>
        );
    }
    if (!data) return <p className="p-6 text-subtle">Cargando pacientes...</p>;

    const selected = data.rows.find((row) => row.patient.user_id === selectedId)?.patient ?? null;

    return (
        <section className="flex flex-col gap-6" aria-labelledby="physician-heading">
            <h2 id="physician-heading" className="text-2xl font-medium">
                {heading}
            </h2>
            {notice ? <p className="max-w-2xl text-sm text-subtle">{notice}</p> : null}
            <div className={cn("grid gap-4", includeConsultations ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                <Kpi
                    testId="kpi-patients"
                    icon={<Users className="h-5 w-5" aria-hidden="true" />}
                    label={patientsLabel}
                    value={data.totalPatients}
                />
                <Kpi
                    testId="kpi-critical-alerts"
                    icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
                    label="Alertas críticas pendientes"
                    value={data.criticalAlerts}
                    onOpen={onOpenAlerts}
                />
                {includeConsultations ? (
                    <Kpi
                        testId="kpi-consultations"
                        icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
                        label="Consultas pendientes"
                        value={data.pendingConsultations}
                        onOpen={onOpenConsultations}
                    />
                ) : null}
            </div>

            {data.rows.length === 0 ? (
                <Card>
                    <CardContent className="text-center text-subtle">{emptyMessage}</CardContent>
                </Card>
            ) : (
                <div className={cn("grid gap-6", selected && "xl:grid-cols-[minmax(0,1fr)_26rem]")}>
                    <div className={cn("flex min-w-0 flex-col gap-4", selected && "hidden xl:flex")}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                                <input
                                    type="search"
                                    role="searchbox"
                                    aria-label="Buscar paciente por nombre o lectura"
                                    placeholder="Nombre o lectura"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    className="h-11 w-full rounded-field border border-border bg-background pl-10 pr-3 text-base"
                                />
                            </div>
                            <select
                                aria-label="Ordenar por"
                                value={sort}
                                onChange={(event) => setSort(event.target.value as SortKey)}
                                className="h-11 rounded-field border border-border bg-background px-3 text-base"
                            >
                                <option value="name">Nombre</option>
                                <option value="pressure">Mayor presión primero</option>
                                <option value="recent">Lectura más reciente</option>
                                <option value="alerts">Más alertas abiertas</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situación">
                                {SITUATIONS.map((item) => (
                                    <button
                                        key={item.id || "any"}
                                        type="button"
                                        aria-pressed={situation === item.id}
                                        onClick={() => setSituation(item.id)}
                                        className={cn(
                                            "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                            situation === item.id
                                                ? "border-accent bg-accent text-primary-foreground"
                                                : "border-border bg-background text-foreground hover:bg-muted",
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                                {FILTERS.map((filter) => (
                                    <button
                                        key={filter.id}
                                        type="button"
                                        aria-pressed={category === filter.id}
                                        onClick={() => setCategory(filter.id)}
                                        className={cn(
                                            "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                            category === filter.id
                                                ? "border-accent bg-accent text-primary-foreground"
                                                : "border-border bg-background text-foreground hover:bg-muted",
                                        )}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                            {query || category !== "all" || situation || sort !== "name" ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuery("");
                                        setCategory("all");
                                        setSituation("");
                                        setSort("name");
                                    }}
                                    className="text-sm text-primary hover:underline"
                                >
                                    Limpiar filtros
                                </button>
                            ) : null}
                        </div>
                        </div>
                        <p className="text-sm text-subtle">
                            {visibleRows.length === data.rows.length
                                ? `${data.rows.length} ${data.rows.length === 1 ? "paciente" : "pacientes"}`
                                : `${visibleRows.length} de ${data.rows.length}`}
                        </p>

                        {visibleRows.length === 0 ? (
                            <Card>
                                <CardContent className="text-center text-subtle">Ningún paciente coincide con el filtro.</CardContent>
                            </Card>
                        ) : (
                            <Card className="overflow-hidden">
                                <table className="block w-full text-left text-sm md:table" role="table">
                                    <thead
                                        className="hidden border-b border-border/70 bg-surface text-xs uppercase tracking-wide text-subtle md:table-header-group"
                                        role="rowgroup"
                                    >
                                        <tr role="row">
                                            <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Paciente</th>
                                            <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Edad</th>
                                            <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Última lectura</th>
                                            <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Fecha</th>
                                            <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Estado</th>
                                            <th role="columnheader" scope="col" className="px-4 py-3 font-medium">Alertas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="block divide-y divide-border/50 md:table-row-group" role="rowgroup">
                                        {visibleRows.map(({ patient, reading, failed: rowFailed, openAlerts }) => (
                                            <tr
                                                key={patient.user_id}
                                                role="row"
                                                onClick={() => setSelectedId(patient.user_id)}
                                                className={cn(
                                                    "grid cursor-pointer grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-surface md:table-row md:p-0",
                                                    patient.user_id === selectedId && "bg-primary-soft/40",
                                                )}
                                            >
                                                <th role="rowheader" scope="row" className="col-span-2 font-medium md:table-cell md:px-4 md:py-3">
                                                    <button type="button" className="text-left text-base hover:text-primary md:text-sm">
                                                        {patient.full_name}
                                                    </button>
                                                </th>
                                                <td role="cell" className="tabular-nums md:table-cell md:px-4 md:py-3">
                                                    <span className="mr-1 text-xs text-subtle md:hidden">Edad</span>
                                                    <span>{patient.birth_date ? ageFromBirthDate(patient.birth_date) : "No registrada"}</span>
                                                </td>
                                                <td role="cell" className="tabular-nums md:table-cell md:px-4 md:py-3">
                                                    <span>
                                                        {reading ? `${reading.systolic}/${reading.diastolic}` : rowFailed ? "No disponible" : "Sin lecturas"}
                                                    </span>
                                                </td>
                                                <td role="cell" className="text-subtle md:table-cell md:px-4 md:py-3">
                                                    <span>{reading ? formatShortDateTime(reading.measured_at) : "-"}</span>
                                                </td>
                                                <td role="cell" className="justify-self-end md:table-cell md:px-4 md:py-3">
                                                    {reading ? <CategoryBadge category={classifyReading(reading.systolic, reading.diastolic)} /> : null}
                                                </td>
                                                <td role="cell" className="tabular-nums md:table-cell md:px-4 md:py-3">
                                                    <span className="mr-1 text-xs text-subtle md:hidden">Alertas</span>
                                                    <span>{openAlerts}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        )}
                    </div>

                    {selected ? (
                        <aside className="min-w-0">
                            <PatientDetail
                                patient={selected}
                                onClose={() => setSelectedId(null)}
                                showConsultations={includeConsultations}
                                allowExport={includeConsultations}
                                manageCaregivers={manageCaregivers}
                            />
                        </aside>
                    ) : null}
                </div>
            )}
        </section>
    );
}
