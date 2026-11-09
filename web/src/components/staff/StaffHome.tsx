// @requirement RF-16
// @requirement RF-19
// @requirement RF-24
import { useEffect, useState } from "react";
import { listAlerts, listConsultations, listPatients, listReadings } from "../../api";
import { STATUS_LABEL, attentionLabel } from "../../lib/consultation";
import { CATEGORY_LABEL, classifyReading, type ReadingCategory } from "../../lib/clinical";
import { formatShortDateTime } from "../../lib/format";
import { measuredToday, readingIsStale, SEVERITY_LABEL } from "../../lib/staff";
import type { Alert, Consultation, Patient, Reading, Role } from "../../types";
import { CategoryBadge } from "../ui/Badge";
import { Card, CardContent } from "../ui/Card";
import { RankBars, type RankRow } from "./RankBars";

interface Row {
    patient: Patient;
    reading: Reading | null;
    openAlerts: number;
}

interface HomeData {
    rows: Row[];
    openAlerts: Alert[];
    openAlertTotal: number;
    criticalTotal: number;
    pending: Consultation[];
    pendingTotal: number;
    patientsTotal: number;
}

const BAR_COLOR: Record<ReadingCategory | "none", string> = {
    normal: "rgb(var(--status-normal))",
    elevated: "rgb(var(--status-elevated))",
    high: "rgb(var(--status-warning))",
    crisis: "rgb(var(--status-critical))",
    none: "rgb(var(--subtle))",
};

async function loadHome(role: "physician" | "caregiver"): Promise<HomeData> {
    const [patients, alerts, critical, review, waiting] = await Promise.all([
        listPatients({ limit: 200 }),
        listAlerts({ status: "open", limit: 50 }),
        role === "physician"
            ? listAlerts({ status: "open", severity: "critical", limit: 1 })
            : Promise.resolve({ items: [] as Alert[], total: 0 }),
        role === "physician" ? listConsultations({ status: "in_review", limit: 20 }) : Promise.resolve({ items: [], total: 0 }),
        role === "physician" ? listConsultations({ status: "pending", limit: 20 }) : Promise.resolve({ items: [], total: 0 }),
    ]);
    const latest = await Promise.all(
        patients.items.map(async (patient) => {
            try {
                const page = await listReadings({ patient_id: patient.user_id, limit: 1 });
                return page.items[0] ?? null;
            } catch {
                return null;
            }
        }),
    );
    return {
        openAlerts: alerts.items,
        openAlertTotal: alerts.total,
        criticalTotal: critical.total,
        pending: [...review.items, ...waiting.items],
        pendingTotal: review.total + waiting.total,
        patientsTotal: patients.total,
        rows: patients.items.map((patient, index) => ({
            patient,
            reading: latest[index] ?? null,
            openAlerts: alerts.items.filter((alert) => alert.patient_id === patient.user_id).length,
        })),
    };
}

function patientName(rows: Row[], patientId: string): string {
    return rows.find((row) => row.patient.user_id === patientId)?.patient.full_name ?? "Paciente";
}

function Figure({
    testId,
    label,
    value,
    onOpen,
}: {
    testId: string;
    label: string;
    value: number;
    onOpen?: () => void;
}) {
    const className = "rounded-card border border-border/70 bg-background px-4 py-3 text-left";
    const body = (
        <>
            <p className="text-sm text-subtle">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </>
    );
    if (!onOpen) {
        return (
            <div data-testid={testId} className={className}>
                {body}
            </div>
        );
    }
    return (
        <button type="button" data-testid={testId} onClick={onOpen} className={`${className} transition-colors hover:bg-surface`}>
            {body}
        </button>
    );
}

function readingBars(rows: Row[]): RankRow[] {
    const counts = new Map<string, number>();
    for (const row of rows) {
        const key = row.reading ? classifyReading(row.reading.systolic, row.reading.diastolic) : "none";
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const order: { id: ReadingCategory | "none"; label: string }[] = [
        { id: "crisis", label: CATEGORY_LABEL.crisis },
        { id: "high", label: CATEGORY_LABEL.high },
        { id: "elevated", label: CATEGORY_LABEL.elevated },
        { id: "normal", label: CATEGORY_LABEL.normal },
        { id: "none", label: "Sin lectura" },
    ];
    return order.map((item) => ({
        id: item.id,
        label: item.label,
        count: counts.get(item.id) ?? 0,
        color: BAR_COLOR[item.id],
    }));
}

export function StaffHome({
    role,
    onOpenPatients,
    onOpenAlerts,
    onOpenConsultations,
}: {
    role: Extract<Role, "physician" | "caregiver">;
    onOpenPatients?: () => void;
    onOpenAlerts?: () => void;
    onOpenConsultations?: () => void;
}) {
    const [data, setData] = useState<HomeData | null>(null);
    const [failed, setFailed] = useState(false);
    const now = new Date();

    useEffect(() => {
        let cancelled = false;
        loadHome(role)
            .then((loaded) => {
                if (!cancelled) setData(loaded);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [role]);

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudo cargar el inicio.
            </p>
        );
    }
    if (!data) return <p className="p-6 text-subtle">Cargando...</p>;

    const stale = data.rows.filter((row) => readingIsStale(row.reading?.measured_at ?? null, now));
    const today = data.rows.filter((row) => measuredToday(row.reading?.measured_at ?? null, now));
    const heading = role === "physician" ? "Por atender" : "Personas a tu cargo";
    const ranks: RankRow[] = [];
    const seen = new Map<string, number>();
    for (const alert of data.openAlerts) {
        seen.set(alert.patient_id, (seen.get(alert.patient_id) ?? 0) + 1);
    }
    for (const [id, count] of seen) ranks.push({ id, label: patientName(data.rows, id), count });

    return (
        <section className="flex flex-col gap-6" aria-labelledby="staff-home-heading">
            <div className="flex flex-col gap-2">
                <h2 id="staff-home-heading" className="text-2xl font-medium">
                    {heading}
                </h2>
                {role === "caregiver" ? (
                    <p className="max-w-2xl text-sm text-subtle">
                        Estas cifras las revisa el médico. Tú no cierras alertas ni respondes consultas.
                    </p>
                ) : (
                    <p className="max-w-2xl text-sm text-subtle">
                        Cifras de quienes tienes a cargo y el trabajo que sigue abierto. Ninguna alerta se cierra desde aquí.
                    </p>
                )}
            </div>

            {role === "caregiver" ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Figure testId="home-people" label="Personas a tu cargo" value={data.patientsTotal} onOpen={onOpenPatients} />
                        <Figure testId="home-today" label="Con lectura de hoy" value={today.length} onOpen={onOpenPatients} />
                        <Figure testId="home-stale" label="Sin medición reciente" value={stale.length} onOpen={onOpenPatients} />
                        <Figure testId="home-open-alerts" label="Alertas abiertas" value={data.openAlertTotal} onOpen={onOpenAlerts} />
                    </div>
                    {data.rows.length === 0 ? (
                        <Card>
                            <CardContent className="text-center text-subtle">
                                Todavía nadie te autorizó a acompañar a un paciente.
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <RankBars
                                    title="Quién tiene más alertas abiertas"
                                    caption="Las cierra el médico."
                                    rows={ranks}
                                    emptyText="Sin alertas para graficar."
                                />
                                <RankBars
                                    title="Cómo está la última lectura"
                                    rows={readingBars(data.rows)}
                                    emptyText="Sin pacientes a cargo."
                                />
                            </div>
                            <ul className="grid gap-4 md:grid-cols-2">
                                {data.rows.map((row) => {
                                    const category = row.reading ? classifyReading(row.reading.systolic, row.reading.diastolic) : null;
                                    const measured = measuredToday(row.reading?.measured_at ?? null, now);
                                    return (
                                        <li key={row.patient.user_id}>
                                            <Card className="overflow-hidden">
                                                <div
                                                    className="h-1.5"
                                                    style={{ background: category ? BAR_COLOR[category] : "rgb(var(--subtle))" }}
                                                />
                                                <CardContent className="flex flex-col gap-3">
                                                    <h3 className="text-lg font-medium">{row.patient.full_name}</h3>
                                                    {row.reading && category ? (
                                                        <p className="flex flex-wrap items-center gap-2 text-2xl font-semibold tabular-nums">
                                                            {row.reading.systolic}/{row.reading.diastolic}
                                                            <span className="text-sm font-normal text-subtle">mmHg</span>
                                                            <CategoryBadge category={category} />
                                                        </p>
                                                    ) : (
                                                        <p className="text-sm text-subtle">Sin lecturas compartidas.</p>
                                                    )}
                                                    {category ? (
                                                        <div className="grid grid-cols-4 gap-1" aria-hidden="true">
                                                            {(["normal", "elevated", "high", "crisis"] as const).map((level) => (
                                                                <div
                                                                    key={level}
                                                                    className="h-2 rounded-full"
                                                                    style={{
                                                                        background: BAR_COLOR[level],
                                                                        opacity: level === category ? 1 : 0.25,
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                    <p className="text-sm text-subtle">
                                                        {measured ? "Hay una lectura de hoy." : "Hoy no hay lectura."}
                                                    </p>
                                                    <p className="text-sm">
                                                        {row.openAlerts === 0
                                                            ? "Sin alertas abiertas."
                                                            : `${row.openAlerts} ${row.openAlerts === 1 ? "alerta abierta" : "alertas abiertas"}. Las cierra el médico.`}
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <Figure testId="home-patients" label="Pacientes a cargo" value={data.patientsTotal} onOpen={onOpenPatients} />
                        <Figure testId="home-open-alerts" label="Alertas abiertas" value={data.openAlertTotal} onOpen={onOpenAlerts} />
                        <Figure testId="home-critical" label="Alertas críticas" value={data.criticalTotal} onOpen={onOpenAlerts} />
                        <Figure testId="home-consultations" label="Consultas pendientes" value={data.pendingTotal} onOpen={onOpenConsultations} />
                        <Figure testId="home-today" label="Con lectura de hoy" value={today.length} onOpen={onOpenPatients} />
                        <Figure testId="home-stale" label="Sin medición reciente" value={stale.length} onOpen={onOpenPatients} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <RankBars
                            title="Pacientes con más alertas abiertas"
                            caption={
                                data.openAlertTotal > data.openAlerts.length
                                    ? `Sobre las ${data.openAlerts.length} más recientes.`
                                    : undefined
                            }
                            rows={ranks}
                            emptyText="Sin alertas para graficar."
                        />
                        <RankBars
                            title="Estado de la última lectura"
                            caption="Según la lectura más reciente de cada paciente."
                            rows={readingBars(data.rows)}
                            emptyText="Sin pacientes a cargo."
                        />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card>
                            <CardContent className="flex flex-col gap-3">
                                <h3 className="font-medium">Alertas abiertas</h3>
                                {data.openAlerts.length === 0 ? (
                                    <p className="text-sm text-subtle">No hay alertas abiertas.</p>
                                ) : (
                                    <ul className="flex flex-col gap-2 text-sm">
                                        {data.openAlerts.slice(0, 5).map((alert) => (
                                            <li key={alert.id}>
                                                <span className="font-medium">{patientName(data.rows, alert.patient_id)}</span>
                                                {` · ${SEVERITY_LABEL[alert.severity]}`}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="flex flex-col gap-3">
                                <h3 className="font-medium">Consultas sin responder</h3>
                                {data.pending.length === 0 ? (
                                    <p className="text-sm text-subtle">No hay consultas pendientes.</p>
                                ) : (
                                    <ul className="flex flex-col gap-2 text-sm">
                                        {data.pending.slice(0, 5).map((item) => (
                                            <li key={item.id}>
                                                <span className="font-medium">{item.patient_name}</span>
                                                {` · ${STATUS_LABEL[item.status]}`}
                                                {` · ${attentionLabel(item.wants_meet)}`}
                                                <span className="block text-subtle">{formatShortDateTime(item.created_at)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="flex flex-col gap-3">
                                <h3 className="font-medium">Sin medición en 3 días</h3>
                                {stale.length === 0 ? (
                                    <p className="text-sm text-subtle">Todos tienen una lectura reciente.</p>
                                ) : (
                                    <ul className="flex flex-col gap-2 text-sm">
                                        {stale.map((row) => (
                                            <li key={row.patient.user_id}>
                                                <span className="font-medium">{row.patient.full_name}</span>
                                                <span className="block text-subtle">
                                                    {row.reading
                                                        ? formatShortDateTime(row.reading.measured_at)
                                                        : "Sin lecturas"}
                                                    {row.reading
                                                        ? ` · ${CATEGORY_LABEL[classifyReading(row.reading.systolic, row.reading.diastolic)]}`
                                                        : ""}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </section>
    );
}
