// @requirement RF-19
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORY_LABEL, type ReadingCategory } from "../../lib/clinical";
import { formatShortDateTime } from "../../lib/format";
import type { Average, DayAverage, Moment } from "../../lib/insights";
import { cn } from "../../lib/cn";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";

// Same palette everywhere: green for normal up to red for crisis.
export const CATEGORY_COLOR: Record<ReadingCategory, string> = {
    normal: "rgb(var(--status-normal))",
    elevated: "rgb(var(--status-elevated))",
    high: "rgb(var(--status-warning))",
    crisis: "rgb(var(--status-critical))",
};

const CATEGORIES: ReadingCategory[] = ["normal", "elevated", "high", "crisis"];
const MOMENT_LABEL: Record<Moment, string> = { morning: "Mañana", afternoon: "Tarde", night: "Noche" };
const MOMENTS: Moment[] = ["morning", "afternoon", "night"];
const pressure = (average: Average | null) => (average ? `${average.systolic}/${average.diastolic}` : "-");

function CategoryLegend() {
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
            {CATEGORIES.map((category) => (
                <li key={category} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLOR[category] }} />
                    {CATEGORY_LABEL[category]}
                </li>
            ))}
        </ul>
    );
}

export function PlainSummaryCard({ lines }: { lines: string[] }) {
    return (
        <Card data-testid="data-plain-summary">
            <CardHeader>
                <CardTitle>Resumen en palabras</CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="flex flex-col gap-2 text-base">
                    {lines.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}

export function DailyAverageChart({ days, grow = false }: { days: DayAverage[]; grow?: boolean }) {
    const withData = days.filter((day) => day.systolic !== null);
    const top = Math.max(150, ...withData.map((day) => day.systolic ?? 0));
    return (
        <Card data-testid="data-daily-chart" className={cn(grow && "flex flex-col")}>
            <CardHeader>
                <CardTitle>Promedio por día</CardTitle>
            </CardHeader>
            <CardContent className={cn("flex flex-col gap-3", grow && "lg:flex-1")}>
                {withData.length === 0 ? (
                    <p className="py-6 text-center text-sm text-subtle">Sin lecturas válidas para graficar.</p>
                ) : (
                    <div
                        role="img"
                        aria-label={`Promedio de presión por día, con lecturas en ${withData.length} de ${days.length} días`}
                        className={cn("w-full h-56", grow && "lg:h-auto lg:min-h-56 lg:flex-1")}
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                                <YAxis domain={[60, Math.ceil(top / 10) * 10 + 10]} tick={{ fontSize: 11 }} />
                                <Tooltip
                                    cursor={{ fill: "rgb(var(--muted))" }}
                                    content={({ active, payload }) => {
                                        const day = payload?.[0]?.payload as DayAverage | undefined;
                                        if (!active || !day || day.systolic === null) return null;
                                        return (
                                            <div className="rounded-field border border-border bg-background px-3 py-2 text-sm shadow">
                                                <p className="font-medium">{day.label}</p>
                                                <p>{`${day.systolic}/${day.diastolic} mmHg`}</p>
                                                <p className="text-xs text-subtle">{`${day.count} ${day.count === 1 ? "lectura" : "lecturas"}`}</p>
                                            </div>
                                        );
                                    }}
                                />
                                <ReferenceLine y={140} stroke={CATEGORY_COLOR.crisis} strokeDasharray="6 4" />
                                <Bar dataKey="systolic" radius={[6, 6, 0, 0]}>
                                    {days.map((day) => (
                                        <Cell key={day.key} fill={day.category ? CATEGORY_COLOR[day.category] : "transparent"} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
                <CategoryLegend />
                <p className="text-sm text-subtle">
                    Cada barra es el promedio de un día (presión sistólica, la de arriba). La línea punteada marca 140: las
                    barras que la pasan estuvieron altas.
                </p>
            </CardContent>
        </Card>
    );
}

export function CategoryDonut({ spread, share }: { spread: Record<ReadingCategory, number>; share: number | null }) {
    const total = CATEGORIES.reduce((sum, category) => sum + spread[category], 0);
    const slices = CATEGORIES.filter((category) => spread[category] > 0).map((category) => ({
        category,
        value: spread[category],
    }));
    return (
        <Card data-testid="data-distribution">
            <CardHeader>
                <CardTitle>Cómo estuvieron tus lecturas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {total === 0 ? (
                    <p className="text-sm text-subtle">Sin lecturas válidas en este período.</p>
                ) : (
                    <div
                        role="img"
                        aria-label={`Distribución de las lecturas por estado: ${slices.map((slice) => `${CATEGORY_LABEL[slice.category]} ${slice.value}`).join(", ")}`}
                        className="relative mx-auto h-44 w-44"
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={slices} dataKey="value" nameKey="category" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                                    {slices.map((slice) => (
                                        <Cell key={slice.category} fill={CATEGORY_COLOR[slice.category]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value, name) => [`${value}`, CATEGORY_LABEL[name as ReadingCategory]]} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div
                            data-testid="donut-center"
                            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
                        >
                            <span className="text-2xl font-semibold tabular-nums">{share === null ? "-" : `${share}%`}</span>
                            <span className="text-xs text-subtle">bajo 140/90</span>
                        </div>
                    </div>
                )}
                <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
                    {CATEGORIES.map((category) => (
                        <li key={category} className="flex items-center gap-2">
                            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLOR[category] }} />
                            {`${CATEGORY_LABEL[category]}: ${spread[category]}`}
                        </li>
                    ))}
                </ul>
                <p className="text-sm text-subtle">Cada color es una lectura. Mientras más verde, mejor.</p>
            </CardContent>
        </Card>
    );
}

export function MomentChart({ moments, grow = false }: { moments: Record<Moment, Average | null>; grow?: boolean }) {
    const data = MOMENTS.map((moment) => ({ label: MOMENT_LABEL[moment], systolic: moments[moment]?.systolic ?? null, average: moments[moment] }));
    const withData = data.filter((entry) => entry.systolic !== null);
    return (
        <Card data-testid="data-time-of-day" className={cn(grow && "flex flex-col")}>
            <CardHeader>
                <CardTitle>Por momento del día</CardTitle>
            </CardHeader>
            <CardContent className={cn("flex flex-col gap-3", grow && "lg:flex-1")}>
                {withData.length > 0 ? (
                    <div role="img" aria-label="Presión por momento del día, mañana, tarde y noche" className={cn("w-full h-40", grow && "lg:h-auto lg:min-h-40 lg:flex-1")}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis domain={[60, "dataMax + 10"]} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(value) => [`${value} mmHg`, "Sistólica"]} />
                                <ReferenceLine y={140} stroke={CATEGORY_COLOR.crisis} strokeDasharray="6 4" />
                                <Bar dataKey="systolic" radius={[6, 6, 0, 0]} fill="rgb(var(--chart-systolic))" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : null}
                <div className="flex flex-col gap-2">
                    {MOMENTS.map((moment) => (
                        <div key={moment} className="flex items-baseline justify-between">
                            <span className="text-subtle">{MOMENT_LABEL[moment]}</span>
                            <span className="tabular-nums">{pressure(moments[moment])}</span>
                        </div>
                    ))}
                </div>
                <p className="text-sm text-subtle">
                    Así cambia tu presión entre la mañana (5 a 11), la tarde (12 a 17) y la noche (18 a 4).
                </p>
            </CardContent>
        </Card>
    );
}

export function HeartRateChart({ series }: { series: { measured_at: string; heart_rate: number }[] }) {
    const mean = series.length ? Math.round(series.reduce((sum, point) => sum + point.heart_rate, 0) / series.length) : null;
    return (
        <Card data-testid="data-heart-chart">
            <CardHeader>
                <CardTitle>Frecuencia cardíaca</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {series.length === 0 ? (
                    <p className="py-4 text-center text-sm text-subtle">Sin frecuencia cardíaca registrada en este período.</p>
                ) : (
                    <>
                        <div role="img" aria-label={`Frecuencia cardíaca en ${series.length} lecturas, promedio ${mean} latidos por minuto`} className="h-44 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                                    <XAxis dataKey="measured_at" tickFormatter={formatShortDateTime} tick={{ fontSize: 11 }} minTickGap={32} />
                                    <YAxis domain={[40, "dataMax + 10"]} tick={{ fontSize: 11 }} />
                                    <Tooltip labelFormatter={(label) => formatShortDateTime(String(label))} formatter={(value) => [`${value} lpm`, "Frecuencia"]} />
                                    <ReferenceArea y1={60} y2={100} fill="rgb(var(--status-normal))" fillOpacity={0.12} />
                                    <Line type="monotone" dataKey="heart_rate" stroke="rgb(var(--status-critical))" strokeWidth={2} dot={{ r: 3 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-sm">
                            <span className="text-2xl font-semibold tabular-nums">{mean}</span> <span className="text-subtle">lpm de promedio</span>
                        </p>
                    </>
                )}
                <p className="text-sm text-subtle">La franja verde (60 a 100 lpm) es lo habitual en reposo en adultos.</p>
            </CardContent>
        </Card>
    );
}
