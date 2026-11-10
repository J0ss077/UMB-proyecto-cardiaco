// @requirement RF-19
// @requirement RF-21
import { ArrowDown, ArrowUp, BookOpen, Bot, HeartPulse, Minus, Phone, Plus, RefreshCw } from "lucide-react";
import { CATEGORY_LABEL, type ReadingCategory } from "../../lib/clinical";
import { loadDevices } from "../../lib/devices";
import { EMERGENCY_GUIDANCE, EMERGENCY_NUMBERS } from "../../lib/emergency";
import { formatShortDateTime } from "../../lib/format";
import {
    byTimeOfDay,
    distribution,
    heartRateStats,
    shareInRange,
    streakDays,
    todayCount,
    weekComparison,
    type Average,
    type Moment,
} from "../../lib/insights";
import type { Reading, Symptom } from "../../types";
import type { WidgetDefinition } from "../DashboardGrid";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";

export type InsightWidgetId =
    | "heartRate"
    | "today"
    | "stats"
    | "comparison"
    | "distribution"
    | "timeOfDay"
    | "symptoms"
    | "emergency"
    | "devices"
    | "shortcuts";

interface InsightContext {
    history: Reading[];
    symptoms: Symptom[];
    onRegister: () => void;
    onSymptoms: () => void;
    onChatbot: () => void;
    onConnectDevice: () => void;
}

const MOMENTS: { id: Moment; label: string }[] = [
    { id: "morning", label: "Mañana" },
    { id: "afternoon", label: "Tarde" },
    { id: "night", label: "Noche" },
];

const CATEGORY_BAR: Record<ReadingCategory, string> = {
    normal: "bg-normal",
    elevated: "bg-elevated",
    high: "bg-warning",
    crisis: "bg-critical",
};

const pressure = (average: Average) => `${average.systolic}/${average.diastolic}`;

function Delta({ now, before }: { now: number; before: number }) {
    const difference = now - before;
    const Icon = difference > 0 ? ArrowUp : difference < 0 ? ArrowDown : Minus;
    return (
        <span className="inline-flex items-center gap-1 text-sm text-subtle">
            <Icon className="h-4 w-4" aria-hidden="true" />
            {difference > 0 ? "+" : ""}
            {difference} mmHg
        </span>
    );
}

function Tile({ testId, value, label }: { testId: string; value: string; label: string }) {
    return (
        <div data-testid={testId} className="flex flex-1 flex-col items-center rounded-field bg-surface px-2 py-3 text-center">
            <span className="text-2xl font-semibold tabular-nums">{value}</span>
            <span className="text-xs text-subtle">{label}</span>
        </div>
    );
}

export function buildInsightWidgets(context: InsightContext): Record<InsightWidgetId, WidgetDefinition> {
    const { history, symptoms } = context;
    const now = new Date();

    const heart = heartRateStats(history, now);
    const today = todayCount(history, now);
    const streak = streakDays(history, now);
    const measurements = history.filter((reading) => now.getTime() - new Date(reading.measured_at).getTime() <= 30 * 86_400_000).length;
    const share = shareInRange(history, 30, now);
    const weeks = weekComparison(history, now);
    const spread = distribution(history, 30, now);
    const spreadTotal = Object.values(spread).reduce((sum, count) => sum + count, 0);
    const moments = byTimeOfDay(history);
    const highest = MOMENTS.filter((moment) => moments[moment.id] !== null).sort(
        (a, b) => (moments[b.id]?.systolic ?? 0) - (moments[a.id]?.systolic ?? 0),
    )[0];

    return {
        heartRate: {
            title: "Frecuencia cardíaca",
            render: () => (
                <Card>
                    <CardHeader>
                        <CardTitle>Frecuencia cardíaca</CardTitle>
                        <HeartPulse className="h-5 w-5 text-critical" aria-hidden="true" />
                    </CardHeader>
                    <CardContent>
                        {heart.latest !== null ? (
                            <div className="flex flex-col gap-1">
                                <p className="text-4xl font-semibold tabular-nums">
                                    <span>{heart.latest}</span> <span className="text-base font-normal text-subtle">lpm</span>
                                </p>
                                {heart.average !== null ? (
                                    <p className="text-sm text-subtle">Promedio de 7 días: {heart.average} lpm</p>
                                ) : null}
                            </div>
                        ) : (
                            <p className="text-sm text-subtle">Aún no hay frecuencia cardíaca registrada.</p>
                        )}
                    </CardContent>
                </Card>
            ),
        },
        today: {
            title: "Hoy",
            render: () => (
                <Card>
                    <CardHeader>
                        <CardTitle>Hoy</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <p className="text-base">
                            {today > 0
                                ? `Registraste ${today} ${today === 1 ? "lectura" : "lecturas"} hoy.`
                                : "Aún no has registrado una lectura hoy."}
                        </p>
                        <p className="text-sm text-subtle">
                            {streak > 0 ? `${streak} ${streak === 1 ? "día seguido" : "días seguidos"} midiendo.` : "Sin racha activa."}
                        </p>
                        {today === 0 ? (
                            <Button size="sm" onClick={context.onRegister}>
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                Registrar lectura
                            </Button>
                        ) : null}
                    </CardContent>
                </Card>
            ),
        },
        stats: {
            title: "Tu actividad",
            render: () => (
                <Card>
                    <CardHeader>
                        <CardTitle>Tu actividad</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="flex gap-3">
                            <Tile testId="stat-streak" value={String(streak)} label="Días seguidos" />
                            <Tile testId="stat-count" value={String(measurements)} label="Mediciones (30 días)" />
                            <Tile testId="stat-range" value={share === null ? "-" : `${share}%`} label="Bajo 140/90" />
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        // Deliberate choice: this widget keeps the local rolling window of
        // lib/insights.ts (whole millimetres of mercury, local days) instead of
        // /api/readings/summary (UTC grouping, one decimal). Its labels therefore say
        // "7 días móviles" and never "Promedio de 7 días", so the two numbers cannot
        // be read as the same figure.
        comparison: {
            title: "Comparativa de 7 días móviles",
            render: () => (
                <Card>
                    <CardHeader>
                        <CardTitle>Comparativa de 7 días móviles</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="flex items-baseline justify-between">
                            <span className="text-subtle">Últimos 7 días</span>
                            {weeks.current ? (
                                <span className="text-xl font-semibold tabular-nums">{pressure(weeks.current)}</span>
                            ) : (
                                <span className="text-sm text-subtle">Sin lecturas en los últimos 7 días</span>
                            )}
                        </div>
                        <div className="flex items-baseline justify-between">
                            <span className="text-subtle">Los 7 días anteriores</span>
                            {weeks.previous ? (
                                <span className="text-xl font-semibold tabular-nums">{pressure(weeks.previous)}</span>
                            ) : (
                                <span className="text-sm text-subtle">Sin lecturas en los 7 días anteriores</span>
                            )}
                        </div>
                        {weeks.current && weeks.previous ? (
                            <div className="flex justify-end gap-4">
                                <Delta now={weeks.current.systolic} before={weeks.previous.systolic} />
                            </div>
                        ) : null}
                        <p className="text-xs text-subtle">
                            Ventana móvil de siete días por días locales, con lecturas válidas. No es el
                            "Promedio de 7 días" del resumen, que usa otro corte.
                        </p>
                    </CardContent>
                </Card>
            ),
        },
        distribution: {
            title: "Distribución de lecturas",
            render: () => (
                <Card>
                    <CardHeader>
                        <CardTitle>Distribución de lecturas</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {spreadTotal === 0 ? (
                            <p className="text-sm text-subtle">Sin lecturas válidas en los últimos 30 días.</p>
                        ) : (
                            <>
                                <div
                                    role="img"
                                    aria-label={`Distribución de ${spreadTotal} lecturas de los últimos 30 días`}
                                    className="flex h-4 w-full overflow-hidden rounded-full bg-muted"
                                >
                                    {(Object.keys(spread) as ReadingCategory[]).map((category) =>
                                        spread[category] > 0 ? (
                                            <span
                                                key={category}
                                                className={CATEGORY_BAR[category]}
                                                style={{ width: `${(spread[category] / spreadTotal) * 100}%` }}
                                            />
                                        ) : null,
                                    )}
                                </div>
                                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                    {(Object.keys(spread) as ReadingCategory[]).map((category) => (
                                        <li key={category} className="flex items-center gap-2">
                                            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${CATEGORY_BAR[category]}`} />
                                            {`${CATEGORY_LABEL[category]}: ${spread[category]}`}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </CardContent>
                </Card>
            ),
        },
        timeOfDay: {
            title: "Por momento del día",
            render: () => (
                <Card>
                    <CardHeader>
                        <CardTitle>Por momento del día</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {highest ? null : <p className="text-sm text-subtle">Sin lecturas válidas para comparar.</p>}
                        {MOMENTS.map((moment) => {
                            const value = moments[moment.id];
                            return (
                                <div key={moment.id} className="flex items-baseline justify-between">
                                    <span className="text-subtle">{moment.label}</span>
                                    {value ? (
                                        <span className="tabular-nums">
                                            <span className="text-lg font-semibold">{pressure(value)}</span>{" "}
                                            <span className="text-xs text-subtle">({value.count})</span>
                                        </span>
                                    ) : (
                                        <span className="text-sm text-subtle">-</span>
                                    )}
                                </div>
                            );
                        })}
                        {highest ? (
                            <p className="text-xs text-subtle">{`Promedio más alto: ${highest.label.toLowerCase()}.`}</p>
                        ) : null}
                    </CardContent>
                </Card>
            ),
        },
        symptoms: {
            title: "Síntomas recientes",
            render: () => (
                <Card>
                    <CardHeader>
                        <CardTitle>Síntomas recientes</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {symptoms.length === 0 ? (
                            <p className="text-sm text-subtle">Aún no has registrado síntomas.</p>
                        ) : (
                            <ul className="flex flex-col gap-3">
                                {symptoms.slice(0, 3).map((symptom) => (
                                    <li key={symptom.id} className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <time dateTime={symptom.recorded_at} className="text-xs text-subtle">
                                                {formatShortDateTime(symptom.recorded_at)}
                                            </time>
                                            {symptom.mood ? <Badge tone="elevated">{symptom.mood}</Badge> : null}
                                        </div>
                                        {symptom.free_text ? <p className="text-sm">{symptom.free_text}</p> : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Button size="sm" variant="outline" onClick={context.onSymptoms}>
                            <BookOpen className="h-4 w-4" aria-hidden="true" />
                            Registrar síntoma
                        </Button>
                    </CardContent>
                </Card>
            ),
        },
        emergency: {
            title: "Ayuda en emergencias",
            render: () => (
                <Card className="border-critical/30">
                    <CardHeader>
                        <CardTitle className="text-critical">Ayuda en emergencias</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <p className="text-sm">{EMERGENCY_GUIDANCE}</p>
                        <div className="flex flex-wrap gap-2">
                            {EMERGENCY_NUMBERS.map(({ number, href }) => (
                                <a
                                    key={number}
                                    href={href}
                                    className="flex items-center gap-2 rounded-field bg-critical px-4 py-2 text-sm font-medium text-primary-foreground"
                                >
                                    <Phone className="h-4 w-4" aria-hidden="true" />
                                    {`Llamar al ${number}`}
                                </a>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        devices: {
            title: "Dispositivos",
            render: () => {
                const linked = loadDevices().filter((device) => device.linked);
                return (
                    <Card>
                        <CardHeader>
                            <CardTitle>Dispositivos</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            {linked.length === 0 ? (
                                <p className="text-sm text-subtle">Sin dispositivos permitidos en este navegador.</p>
                            ) : (
                                <ul className="flex flex-col gap-1">
                                    {linked.map((device) => (
                                        <li key={device.id} className="flex flex-wrap items-center gap-2">
                                            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
                                            <span>{device.name}</span>
                                            <span className="text-xs text-subtle">Permitido en este navegador</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <Button size="sm" variant="outline" onClick={context.onConnectDevice}>
                                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                Conectar dispositivo
                            </Button>
                        </CardContent>
                    </Card>
                );
            },
        },
        shortcuts: {
            title: "Accesos rápidos",
            render: () => (
                <Card>
                    <CardHeader>
                        <CardTitle>Accesos rápidos</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3">
                        {[
                            { label: "Registrar lectura", icon: Plus, action: context.onRegister },
                            { label: "Diario de síntomas", icon: BookOpen, action: context.onSymptoms },
                            { label: "Chatbot", icon: Bot, action: context.onChatbot },
                            { label: "Conectar dispositivo", icon: RefreshCw, action: context.onConnectDevice },
                        ].map(({ label, icon: Icon, action }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={action}
                                className="flex flex-col items-center gap-2 rounded-field border border-border/70 bg-surface px-2 py-4 text-center text-sm hover:bg-muted"
                            >
                                <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                                {label}
                            </button>
                        ))}
                    </CardContent>
                </Card>
            ),
        },
    };
}
