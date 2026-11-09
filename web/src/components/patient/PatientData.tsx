// @requirement RF-19
// @requirement RF-17
import { ArrowDown, ArrowUp, Download, History, Minus, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { listReadings } from "../../api";
import { cn } from "../../lib/cn";
import { classifyReading } from "../../lib/clinical";
import {
    averageSince,
    byTimeOfDay,
    dailyAverages,
    dailyDelta,
    distribution,
    heartRateSeries,
    highestReading,
    plainSummary,
    previousMonthAverage,
    readingsWithin,
    shareInRange,
    streakDays,
    summaryStats,
    type Average,
} from "../../lib/insights";
import type { Reading } from "../../types";
import { ExportDialog } from "../ExportDialog";
import { HistoryDialog } from "../HistoryDialog";
import { PressureRing } from "../PressureRing";
import { ReadingsTrend } from "../ReadingsTrend";
import { CategoryBadge } from "../ui/Badge";
import { CategoryDonut, DailyAverageChart, HeartRateChart, MomentChart, PlainSummaryCard } from "./DataCharts";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";

const RANGES = [
    { id: "day", label: "Diario", days: 1 },
    { id: "week", label: "Semanal", days: 7 },
    { id: "month", label: "Mensual", days: 30 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];


const pressure = (average: Average | null) => (average ? `${average.systolic}/${average.diastolic}` : null);

function Tile({ testId, value, label }: { testId: string; value: string; label: string }) {
    return (
        <div data-testid={testId} className="flex flex-col items-center rounded-card border border-border/70 bg-background px-2 py-4 text-center">
            <span className="text-2xl tabular-nums">{value}</span>
            <span className="text-sm text-subtle">{label}</span>
        </div>
    );
}

function Stat({ testId, label, children }: { testId: string; label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 rounded-field bg-surface px-3 py-2">
            <dt className="text-xs text-subtle">{label}</dt>
            <dd data-testid={testId} className="text-lg font-medium tabular-nums">
                {children}
            </dd>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="flex items-baseline justify-between text-lg">
            <span className="text-subtle">{label}</span>
            {value ? <span className="tabular-nums">{value}</span> : <span className="text-sm text-subtle">Sin lecturas</span>}
        </div>
    );
}

const MOBILE_ORDER = [
    "",
    "max-lg:order-1",
    "max-lg:order-2",
    "max-lg:order-3",
    "max-lg:order-4",
    "max-lg:order-5",
    "max-lg:order-6",
    "max-lg:order-7",
    "max-lg:order-8",
    "max-lg:order-9",
    "max-lg:order-10",
    "max-lg:order-11",
    "max-lg:order-12",
    "max-lg:order-13",
];

// One card of the layout. `order` is the reading order on a phone; `grow` makes it take the
// space left in its desktop column.
function Slot({ order, grow = false, children }: { order: number; grow?: boolean; children: ReactNode }) {
    return <div className={cn("flex flex-col", MOBILE_ORDER[order], grow && "lg:flex-1 lg:[&>*]:flex-1")}>{children}</div>;
}

interface PatientDataProps {
    refreshKey: number;
    onSymptoms: () => void;
}

export function PatientData({ refreshKey, onSymptoms }: PatientDataProps) {
    const [pool, setPool] = useState<Reading[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [range, setRange] = useState<RangeId>("day");
    const [historyOpen, setHistoryOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        // From the start of the previous month, so "Mes anterior" has its data.
        const now = new Date();
        const since = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        setFailed(false);
        listReadings({ since, limit: 200 })
            .then((page) => {
                if (!cancelled) {
                    setPool([...page.items].sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime()));
                }
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    const view = useMemo(() => {
        if (!pool) return null;
        const now = new Date();
        const days = RANGES.find((entry) => entry.id === range)?.days ?? 7;
        const ranged = readingsWithin(pool, days, now);
        const valid = ranged.filter((reading) => reading.validation_status === "valid");
        return {
            latest: pool.find((reading) => reading.validation_status === "valid") ?? null,
            delta: dailyDelta(pool, now),
            ranged,
            valid,
            stats: summaryStats(ranged),
            streak: streakDays(pool, now),
            share: shareInRange(pool, days, now),
            spread: distribution(pool, days, now),
            moments: byTimeOfDay(ranged),
            daily: dailyAverages(pool, days === 1 ? 7 : days, now),
            heartSeries: heartRateSeries(ranged),
            highest: highestReading(ranged),
            week: averageSince(pool, 7, now),
            month: averageSince(pool, 30, now),
            previousMonth: previousMonthAverage(pool, now),
        };
    }, [pool, range]);

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudieron cargar las lecturas.
            </p>
        );
    }
    if (!pool || !view) return <p className="p-6 text-center text-subtle">Cargando lecturas...</p>;
    if (pool.length === 0) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-subtle">
                    Aún no tienes lecturas. Registra la primera para ver tus estadísticas.
                </CardContent>
            </Card>
        );
    }

    const { latest, delta, stats } = view;
    const category = latest ? classifyReading(latest.systolic, latest.diastolic) : null;
    const DeltaIcon = delta === null ? Minus : delta < 0 ? ArrowDown : delta > 0 ? ArrowUp : Minus;

    return (
        <div className="flex flex-col gap-4">
            {/* Two fixed columns of similar height. The last card of each column grows to meet the
                other, so the bottom edge is even and no empty space is left under the shorter stack.
                On a phone the columns dissolve into one list in the order given by `order`. */}
            <div data-testid="data-layout" className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-stretch">
                <div data-testid="data-column-a" className="flex flex-col gap-4 max-lg:contents">
                    <Slot order={1}>
                        {latest && category ? (
                            <Card data-testid="data-latest">
                                <CardContent className="flex flex-col items-center gap-3">
                                    <div className="flex w-full justify-around">
                                        <PressureRing label="Sistólica" value={latest.systolic} max={200} />
                                        <PressureRing label="Diastólica" value={latest.diastolic} max={130} />
                                    </div>
                                    <p className="text-sm">mmHg</p>
                                    <CategoryBadge category={category} />
                                    {delta !== null ? (
                                        <p className="flex items-center gap-1 text-sm text-subtle">
                                            <DeltaIcon className="h-4 w-4" aria-hidden="true" />
                                            {delta === 0 ? "Sin cambio vs. ayer" : `${Math.abs(delta)} mmHg vs. ayer`}
                                        </p>
                                    ) : null}
                                </CardContent>
                            </Card>
                        ) : null}
                    </Slot>
                    <Slot order={3}>
                        <div role="tablist" aria-label="Periodo" className="flex rounded-card border border-border/70 bg-background p-1">
                            {RANGES.map((entry) => (
                                <button
                                    key={entry.id}
                                    role="tab"
                                    type="button"
                                    aria-selected={range === entry.id}
                                    onClick={() => setRange(entry.id)}
                                    className={cn(
                                        "flex-1 rounded-field py-2.5 text-base transition-colors",
                                        range === entry.id ? "bg-accent font-medium text-primary-foreground" : "text-foreground hover:bg-muted",
                                    )}
                                >
                                    {entry.label}
                                </button>
                            ))}
                        </div>
                    </Slot>
                    <Slot order={4}>
                        <PlainSummaryCard lines={plainSummary({ stats, moments: view.moments, highest: view.highest })} />
                    </Slot>
                    <Slot order={5}>
                        <Card data-testid="data-trend">
                            <CardHeader>
                                <CardTitle className="text-xl">Tendencia</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ReadingsTrend readings={view.valid} />
                            </CardContent>
                        </Card>
                    </Slot>
                    <Slot order={6}>
                        <Card data-testid="data-comparison">
                            <CardHeader>
                                <CardTitle className="text-xl">Comparativa</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3">
                                <Row label="Promedio semanal" value={pressure(view.week)} />
                                <Row label="Promedio 30 días" value={pressure(view.month)} />
                                <Row label="Mes anterior" value={pressure(view.previousMonth)} />
                            </CardContent>
                        </Card>
                    </Slot>
                    <Slot order={7}>
                        <Button variant="outline" className="h-auto min-h-14 w-full py-3" aria-haspopup="dialog" onClick={() => setHistoryOpen(true)}>
                            <History className="h-5 w-5 text-primary" aria-hidden="true" />
                            Historial
                        </Button>
                    </Slot>
                    <Slot order={8}>
                        <div className="grid grid-cols-3 gap-3">
                            <Tile testId="tile-streak" value={String(view.streak)} label="Días seguidos" />
                            <Tile testId="tile-count" value={String(view.ranged.length)} label="Mediciones" />
                            <Tile testId="tile-range" value={view.share === null ? "-" : `${view.share}%`} label="En rango" />
                        </div>
                    </Slot>
                    <Slot order={9} grow>
                        <DailyAverageChart days={view.daily} grow />
                    </Slot>
                </div>
                <div data-testid="data-column-b" className="flex flex-col gap-4 max-lg:contents">
                    <Slot order={2}>
                        {latest && category && (category === "high" || category === "crisis") ? (
                            <Card data-testid="data-warning" className="border-critical/30">
                                <CardContent className="flex flex-col gap-3">
                                    <p className="flex items-center gap-2 text-lg">
                                        <TriangleAlert className="h-5 w-5 text-critical" aria-hidden="true" />
                                        {category === "crisis" ? "¡Valor peligroso detectado!" : "Valor elevado detectado"}
                                    </p>
                                    <p className="text-base">{`${latest.systolic}/${latest.diastolic} mmHg. ¿Síntomas?`}</p>
                                    <div>
                                        <Button size="sm" onClick={onSymptoms}>
                                            Registrar síntoma
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : null}
                    </Slot>
                    <Slot order={13}>
                        <Card>
                            <CardHeader>
                                <CardTitle>Estadísticas del período</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {stats.count === 0 ? (
                                    <p className="text-sm text-subtle">Sin lecturas válidas en este período.</p>
                                ) : (
                                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        <Stat testId="stat-mean" label="Promedio">
                                            {pressure(stats.mean)}
                                        </Stat>
                                        <Stat testId="stat-max-systolic" label="Sistólica máxima">
                                            {stats.maxSystolic}
                                        </Stat>
                                        <Stat testId="stat-min-systolic" label="Sistólica mínima">
                                            {stats.minSystolic}
                                        </Stat>
                                        <Stat testId="stat-spread" label="Variabilidad sistólica">
                                            {stats.systolicSpread}
                                        </Stat>
                                        <Stat testId="stat-pulse" label="Presión de pulso">
                                            {stats.meanPulsePressure}
                                        </Stat>
                                        <Stat testId="stat-heart-rate" label="Frecuencia cardíaca">
                                            {stats.meanHeartRate ?? "-"}
                                        </Stat>
                                        <Stat testId="stat-high" label="Lecturas desde 140/90">
                                            {stats.highCount}
                                        </Stat>
                                        <Stat testId="stat-valid" label="Lecturas válidas">
                                            {stats.count}
                                        </Stat>
                                    </dl>
                                )}
                            </CardContent>
                        </Card>
                    </Slot>
                    <Slot order={11}>
                        <HeartRateChart series={view.heartSeries} />
                    </Slot>
                    <Slot order={10}>
                        <CategoryDonut spread={view.spread} share={view.share} />
                    </Slot>
                    <Slot order={12} grow>
                        <MomentChart moments={view.moments} grow />
                    </Slot>
                </div>
            </div>

            {historyOpen ? <HistoryDialog readings={pool} onClose={() => setHistoryOpen(false)} /> : null}

            <button
                type="button"
                aria-label="Descargar historial"
                title="Descargar historial"
                onClick={() => setExporting(true)}
                className="fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 lg:bottom-8 lg:right-8"
            >
                <Download className="h-6 w-6" aria-hidden="true" />
            </button>

            {exporting ? <ExportDialog onClose={() => setExporting(false)} /> : null}
        </div>
    );
}
