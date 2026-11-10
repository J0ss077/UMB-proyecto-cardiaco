// @requirement RF-16
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { acknowledgeAlert, ApiError, dismissAlert, getAlert, listAlerts, listPatients, listReadings, validateAlert } from "../../api";
import { classifyReading } from "../../lib/clinical";
import { cn } from "../../lib/cn";
import { EMERGENCY_NUMBERS } from "../../lib/emergency";
import { formatShortDateTime } from "../../lib/format";
import { measuredToday, SEVERITY_LABEL, STATUS_LABEL } from "../../lib/staff";
import type { Alert, AlertDetail, AlertSeverity, AlertStatus, Patient, Reading } from "../../types";
import { Badge, CategoryBadge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { useToast } from "../ui/Toast";
import { RankBars } from "./RankBars";

const SEVERITIES: AlertSeverity[] = ["low", "medium", "high", "critical"];
const STATUSES: AlertStatus[] = ["open", "acknowledged", "validated", "dismissed"];
const DAY = 86_400_000;

type When = "" | "today" | "three" | "week";
type NoteFilter = "" | "with" | "without";

const WHEN: { id: When; label: string }[] = [
    { id: "", label: "Cualquier fecha" },
    { id: "today", label: "Hoy" },
    { id: "three", label: "Últimos 3 días" },
    { id: "week", label: "Última semana" },
];

const NOTES: { id: NoteFilter; label: string }[] = [
    { id: "", label: "Con o sin nota" },
    { id: "with", label: "Con nota" },
    { id: "without", label: "Sin nota" },
];

function matchesWhen(createdAt: string, when: When, now: Date): boolean {
    if (!when) return true;
    if (when === "today") return measuredToday(createdAt, now);
    const age = now.getTime() - new Date(createdAt).getTime();
    return age >= 0 && age <= (when === "three" ? 3 : 7) * DAY;
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            onClick={onClick}
            className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                pressed ? "border-accent bg-accent text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
            )}
        >
            {children}
        </button>
    );
}

export function AlertInbox({ canAct, onChanged }: { canAct: boolean; onChanged?: () => void }) {
    const toast = useToast();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [alerts, setAlerts] = useState<Alert[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [status, setStatus] = useState<AlertStatus | "">("open");
    const [severity, setSeverity] = useState<AlertSeverity | "">("");
    const [patientId, setPatientId] = useState("");
    const [query, setQuery] = useState("");
    const [when, setWhen] = useState<When>("");
    const [noteFilter, setNoteFilter] = useState<NoteFilter>("");
    const [ranked, setRanked] = useState<Alert[] | null>(null);
    const [rankedTotal, setRankedTotal] = useState(0);
    const [total, setTotal] = useState(0);
    const [selected, setSelected] = useState<AlertDetail | null>(null);
    const [context, setContext] = useState<Reading[] | "failed" | null>(null);
    const [note, setNote] = useState("");
    const [noteError, setNoteError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        listPatients({ limit: 200 })
            .then((page) => {
                if (!cancelled) setPatients(page.items);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        setAlerts(null);
        // The ranking request goes first so the filtered page stays the last call.
        listAlerts({ limit: 200 })
            .then((ranking) => {
                if (cancelled) return;
                setRanked(ranking.items);
                setRankedTotal(ranking.total);
                return listAlerts({
                    status: status || undefined,
                    severity: severity || undefined,
                    ...(patientId ? { patient_id: patientId } : {}),
                    limit: 50,
                });
            })
            .then((page) => {
                if (cancelled || !page) return;
                setAlerts(page.items);
                setTotal(page.total);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [status, severity, patientId]);

    // The patient's latest readings give the decision some context.
    useEffect(() => {
        if (!selected) {
            setContext(null);
            return;
        }
        let cancelled = false;
        setContext(null);
        listReadings({ patient_id: selected.patient_id, limit: 3 })
            .then((page) => {
                if (!cancelled) setContext(page.items);
            })
            .catch(() => {
                if (!cancelled) setContext("failed");
            });
        return () => {
            cancelled = true;
        };
    }, [selected]);

    const nameOf = (id: string) => patients.find((patient) => patient.user_id === id)?.full_name ?? "Paciente";
    const directory = [...patients].sort((a, b) => a.full_name.localeCompare(b.full_name, "es"));
    const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const now = new Date();
    const needle = fold(query.trim());
    const shown = (alerts ?? []).filter((alert) => {
        if (needle && !fold(`${nameOf(alert.patient_id)} ${alert.note ?? ""}`).includes(needle)) return false;
        if (!matchesWhen(alert.created_at, when, now)) return false;
        if (noteFilter === "with" && !alert.note?.trim()) return false;
        if (noteFilter === "without" && alert.note?.trim()) return false;
        return true;
    });
    const narrowed = Boolean(needle || when || noteFilter);
    const rankCounts = new Map<string, number>();
    for (const alert of ranked ?? []) rankCounts.set(alert.patient_id, (rankCounts.get(alert.patient_id) ?? 0) + 1);
    const ranks = [...rankCounts.entries()].map(([id, count]) => ({ id, label: nameOf(id), count }));

    async function open(alert: Alert) {
        setNote("");
        setNoteError(null);
        try {
            setSelected(await getAlert(alert.id));
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo abrir la alerta");
        }
    }

    async function run(action: "acknowledge" | "validate" | "dismiss") {
        if (!selected) return;
        if (action === "dismiss" && !note.trim()) {
            setNoteError("Escribe el motivo del descarte.");
            return;
        }
        setNoteError(null);
        setBusy(true);
        try {
            if (action === "acknowledge") await acknowledgeAlert(selected.id, note.trim() || undefined);
            if (action === "validate") await validateAlert(selected.id, note.trim() || undefined);
            if (action === "dismiss") await dismissAlert(selected.id, note.trim());
            toast.success(action === "dismiss" ? "Alerta descartada." : action === "validate" ? "Alerta validada." : "Recibo registrado.");
            setSelected(null);
            setAlerts(null);
            const ranking = await listAlerts({ limit: 200 });
            setRanked(ranking.items);
            setRankedTotal(ranking.total);
            const page = await listAlerts({
                status: status || undefined,
                severity: severity || undefined,
                ...(patientId ? { patient_id: patientId } : {}),
                limit: 50,
            });
            setAlerts(page.items);
            setTotal(page.total);
            onChanged?.();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo actualizar la alerta");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="flex flex-col gap-6" aria-labelledby="alerts-heading">
            <div className="flex flex-col gap-2">
                <h2 id="alerts-heading" className="text-2xl font-medium">
                    Alertas
                </h2>
                {canAct ? (
                    <p className="max-w-2xl text-sm text-subtle">Ninguna alerta se cierra sola. Acusar recibo, validar o descartar queda en el rastro.</p>
                ) : (
                    <p className="max-w-2xl text-sm text-subtle">Puedes leer las alertas de los pacientes cuyo médico tratante te autorizó a acompañar. Quien las cierra es el médico.</p>
                )}
            </div>
            <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-sm">
                    Estado
                    <select
                        aria-label="Filtrar por estado de la alerta"
                        value={status}
                        onChange={(event) => setStatus(event.target.value as AlertStatus | "")}
                        className="h-11 rounded-field border border-border bg-background px-3 text-base"
                    >
                        <option value="">Todos</option>
                        {STATUSES.map((item) => (
                            <option key={item} value={item}>
                                {STATUS_LABEL[item]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                    Severidad
                    <select
                        aria-label="Filtrar por severidad"
                        value={severity}
                        onChange={(event) => setSeverity(event.target.value as AlertSeverity | "")}
                        className="h-11 rounded-field border border-border bg-background px-3 text-base"
                    >
                        <option value="">Todas</option>
                        {SEVERITIES.map((item) => (
                            <option key={item} value={item}>
                                {SEVERITY_LABEL[item]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                    Paciente
                    <select
                        aria-label="Filtrar por paciente"
                        value={patientId}
                        onChange={(event) => setPatientId(event.target.value)}
                        className="h-11 rounded-field border border-border bg-background px-3 text-base"
                    >
                        <option value="">Todos</option>
                        {directory.map((patient) => (
                            <option key={patient.user_id} value={patient.user_id}>
                                {patient.full_name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <input
                type="search"
                role="searchbox"
                aria-label="Buscar en las alertas"
                placeholder="Nombre o nota"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 w-full rounded-field border border-border bg-background px-3 text-base"
            />
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por fecha">
                    {WHEN.map((item) => (
                        <FilterChip key={item.id || "any-date"} pressed={when === item.id} onClick={() => setWhen(item.id)}>
                            {item.label}
                        </FilterChip>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por nota">
                    {NOTES.map((item) => (
                        <FilterChip key={item.id || "any-note"} pressed={noteFilter === item.id} onClick={() => setNoteFilter(item.id)}>
                            {item.label}
                        </FilterChip>
                    ))}
                </div>
            </div>

            {failed ? (
                <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                    No se pudieron cargar las alertas.
                </p>
            ) : alerts === null || ranked === null ? (
                <p className="text-subtle">Cargando alertas...</p>
            ) : (
                <>
                <RankBars
                    title="Pacientes con más alertas"
                    caption={
                        !canAct
                            ? "Quién ha tenido más. Las cierra el médico."
                            : rankedTotal > ranked.length
                              ? `Sobre las ${ranked.length} más recientes, abiertas y cerradas.`
                              : "Abiertas y cerradas. No sigue el filtro de la lista."
                    }
                    rows={ranks}
                    emptyText="Sin alertas para graficar."
                />
                {shown.length === 0 ? (
                <Card>
                    <CardContent className="text-center text-subtle">
                        {alerts.length === 0
                            ? "No hay alertas con ese filtro."
                            : needle
                              ? "Ninguna alerta coincide con la búsqueda."
                              : "Ninguna alerta coincide con el filtro."}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
                    <div className="flex flex-col gap-3">
                    <p className="text-sm text-subtle">
                        {narrowed ? `${shown.length} de ${total}` : `${total} ${total === 1 ? "alerta" : "alertas"}`}
                    </p>
                    <ul className="flex flex-col gap-3">
                        {shown.map((alert) => (
                            <li key={alert.id}>
                                <button
                                    type="button"
                                    onClick={() => void open(alert)}
                                    aria-current={selected?.id === alert.id ? "true" : undefined}
                                    className={cn(
                                        "flex w-full flex-col gap-1 rounded-card border bg-background p-4 text-left hover:bg-surface",
                                        selected?.id === alert.id ? "border-accent ring-2 ring-accent/30" : "border-border/70",
                                    )}
                                >
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{nameOf(alert.patient_id)}</span>
                                        <Badge tone={alert.severity === "critical" ? "critical" : alert.severity === "high" ? "warning" : "neutral"}>
                                            {SEVERITY_LABEL[alert.severity]}
                                        </Badge>
                                        <Badge tone="neutral">{STATUS_LABEL[alert.status]}</Badge>
                                    </span>
                                    <span className="text-sm text-subtle">{formatShortDateTime(alert.created_at)}</span>
                                    {alert.note ? <span className="text-sm">{alert.note}</span> : null}
                                </button>
                            </li>
                        ))}
                    </ul>
                    </div>
                    {selected ? (
                        <section
                            role="region"
                            aria-label="Detalle de la alerta"
                            className="fixed inset-x-0 bottom-0 top-16 z-30 overflow-y-auto bg-background p-4 xl:static xl:z-auto xl:bg-transparent xl:p-0"
                        >
                        <Card>
                            <CardContent className="flex flex-col gap-3">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-lg font-medium">{nameOf(selected.patient_id)}</h3>
                                    <button
                                        type="button"
                                        aria-label="Cerrar detalle"
                                        onClick={() => setSelected(null)}
                                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
                                    >
                                        <X className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                                <p className="text-sm text-subtle">{`${SEVERITY_LABEL[selected.severity]} · ${STATUS_LABEL[selected.status]}`}</p>
                                {selected.note ? <p className="text-sm">{selected.note}</p> : null}
                                {selected.validated_by_name ? (
                                    <p className="text-sm text-subtle">{`Validada por ${selected.validated_by_name}`}</p>
                                ) : null}
                                {selected.dismissal_reason ? (
                                    <p className="text-sm">{`Motivo del descarte: ${selected.dismissal_reason}`}</p>
                                ) : null}
                                {selected.severity === "critical" ? (
                                    <div className="flex flex-col gap-2 rounded-field bg-critical-soft p-3 text-sm">
                                        <p>Presión en rango de crisis. Si hay dolor de pecho, falta de aire o confusión, llama a emergencias.</p>
                                        <div className="flex gap-2">
                                            {EMERGENCY_NUMBERS.map((entry) => (
                                                <a key={entry.number} href={entry.href} className="font-medium text-critical">
                                                    {`Llamar al ${entry.number}`}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-medium">Últimas lecturas</p>
                                    {context === null ? (
                                        <p className="text-sm text-subtle">Cargando lecturas...</p>
                                    ) : context === "failed" ? (
                                        <p className="text-sm text-subtle">No se pudieron cargar las lecturas.</p>
                                    ) : context.length === 0 ? (
                                        <p className="text-sm text-subtle">Sin lecturas.</p>
                                    ) : (
                                        <ul className="flex flex-col gap-1">
                                            {context.map((reading) => (
                                                <li key={reading.id} className="flex flex-wrap items-center gap-2 text-sm">
                                                    <span className="font-medium tabular-nums">{`${reading.systolic}/${reading.diastolic}`}</span>
                                                    <CategoryBadge category={classifyReading(reading.systolic, reading.diastolic)} />
                                                    <span className="text-subtle">{formatShortDateTime(reading.measured_at)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                {!canAct ? <p className="text-sm text-subtle">Las alertas las cierra el médico.</p> : null}
                                {canAct && (selected.status === "open" || selected.status === "acknowledged") ? (
                                    <>
                                        <label className="flex flex-col gap-1 text-sm" htmlFor="alert-note">
                                            Nota
                                            <textarea
                                                id="alert-note"
                                                rows={3}
                                                value={note}
                                                aria-invalid={noteError ? true : undefined}
                                                onChange={(event) => {
                                                    setNote(event.target.value);
                                                    setNoteError(null);
                                                }}
                                                className={cn("rounded-field border bg-background px-3 py-2 text-base", noteError ? "border-critical" : "border-border")}
                                            />
                                        </label>
                                        {noteError ? (
                                            <p role="alert" className="text-sm text-critical">
                                                {noteError}
                                            </p>
                                        ) : null}
                                        <p className="text-xs text-subtle">El descarte exige un motivo. Acusar recibo y validar pueden ir sin nota.</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selected.status === "open" ? (
                                                <Button size="sm" variant="outline" loading={busy} onClick={() => void run("acknowledge")}>
                                                    Acusar recibo
                                                </Button>
                                            ) : null}
                                            <Button size="sm" loading={busy} onClick={() => void run("validate")}>
                                                Validar
                                            </Button>
                                            <Button size="sm" variant="danger" loading={busy} onClick={() => void run("dismiss")}>
                                                Descartar
                                            </Button>
                                        </div>
                                    </>
                                ) : null}
                            </CardContent>
                        </Card>
                        </section>
                    ) : null}
                </div>
            )}
                </>
            )}
        </section>
    );
}
