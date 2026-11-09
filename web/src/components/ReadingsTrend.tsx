// @requirement RF-19
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "../lib/cn";
import { ACC_AHA_THRESHOLD, WHO_THRESHOLD } from "../lib/clinical";
import { formatShortDateTime } from "../lib/format";
import type { Reading } from "../types";

const SYSTOLIC = "rgb(var(--chart-systolic))";
const DIASTOLIC = "rgb(var(--chart-diastolic))";
const WHO_COLOR = "rgb(var(--status-critical))";
const ACC_COLOR = "rgb(var(--status-warning))";

type SeriesId = "systolic" | "diastolic" | "who" | "acc";

function LegendToggle({
    color,
    label,
    dashed = false,
    pressed,
    onToggle,
}: {
    color: string;
    label: string;
    dashed?: boolean;
    pressed: boolean;
    onToggle: () => void;
}) {
    return (
        <li>
            <button
                type="button"
                aria-pressed={pressed}
                onClick={onToggle}
                className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors",
                    pressed ? "border-border bg-background text-foreground" : "border-transparent bg-muted text-subtle line-through",
                )}
            >
                <span
                    aria-hidden="true"
                    className="inline-block w-5 border-t-2"
                    style={{ borderColor: color, borderTopStyle: dashed ? "dashed" : "solid" }}
                />
                {label}
            </button>
        </li>
    );
}

export function ReadingsTrend({ readings, height = 256 }: { readings: Reading[]; height?: number }) {
    const [visible, setVisible] = useState<Record<SeriesId, boolean>>({
        systolic: true,
        diastolic: true,
        who: true,
        acc: true,
    });
    const toggle = (id: SeriesId) => setVisible((current) => ({ ...current, [id]: !current[id] }));

    if (readings.length === 0) {
        return <p className="py-10 text-center text-sm text-subtle">Sin lecturas para graficar.</p>;
    }

    const data = [...readings]
        .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime())
        .map((reading) => ({
            measured_at: reading.measured_at,
            systolic: reading.systolic,
            diastolic: reading.diastolic,
        }));

    const lowest = Math.min(...data.map((point) => point.diastolic), 60);
    const highest = Math.max(...data.map((point) => point.systolic), 150);

    return (
        <div data-testid="readings-trend">
            <ul className="mb-3 flex flex-wrap gap-2">
                <LegendToggle color={SYSTOLIC} label="Sistólica" pressed={visible.systolic} onToggle={() => toggle("systolic")} />
                <LegendToggle color={DIASTOLIC} label="Diastólica" pressed={visible.diastolic} onToggle={() => toggle("diastolic")} />
                <LegendToggle color={WHO_COLOR} label={WHO_THRESHOLD.label} dashed pressed={visible.who} onToggle={() => toggle("who")} />
                <LegendToggle color={ACC_COLOR} label={ACC_AHA_THRESHOLD.label} dashed pressed={visible.acc} onToggle={() => toggle("acc")} />
            </ul>
            <div
                role="img"
                aria-label={`Tendencia de presión arterial con ${data.length} lecturas, sistólica y diastólica en mmHg`}
                style={{ height }}
                className="w-full"
            >
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                        <XAxis dataKey="measured_at" tickFormatter={formatShortDateTime} tick={{ fontSize: 11 }} minTickGap={32} />
                        <YAxis domain={[Math.floor(lowest / 10) * 10 - 10, Math.ceil(highest / 10) * 10 + 10]} tick={{ fontSize: 11 }} />
                        <Tooltip
                            labelFormatter={(label) => formatShortDateTime(String(label))}
                            formatter={(value, name) => [`${value} mmHg`, name === "systolic" ? "Sistólica" : "Diastólica"]}
                        />
                        {visible.who ? (
                            <>
                                <ReferenceLine y={WHO_THRESHOLD.systolic} stroke={WHO_COLOR} strokeDasharray="6 4" />
                                <ReferenceLine y={WHO_THRESHOLD.diastolic} stroke={WHO_COLOR} strokeDasharray="6 4" />
                            </>
                        ) : null}
                        {visible.acc ? (
                            <>
                                <ReferenceLine y={ACC_AHA_THRESHOLD.systolic} stroke={ACC_COLOR} strokeDasharray="2 4" />
                                <ReferenceLine y={ACC_AHA_THRESHOLD.diastolic} stroke={ACC_COLOR} strokeDasharray="2 4" />
                            </>
                        ) : null}
                        <Line type="monotone" dataKey="systolic" stroke={SYSTOLIC} strokeWidth={2} dot={{ r: 3 }} hide={!visible.systolic} />
                        <Line type="monotone" dataKey="diastolic" stroke={DIASTOLIC} strokeWidth={2} dot={{ r: 3 }} hide={!visible.diastolic} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
