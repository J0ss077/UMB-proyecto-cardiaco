// @requirement RF-19
interface PressureRingProps {
    label: string;
    value: number;
    max: number;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PressureRing({ label, value, max }: PressureRingProps) {
    const filled = Math.min(Math.max(value / max, 0), 1) * CIRCUMFERENCE;
    return (
        <div className="flex flex-col items-center gap-1">
            <span className="text-sm text-foreground">{label}</span>
            <div className="relative h-28 w-28">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgb(var(--primary-soft))" strokeWidth="12" />
                    <circle
                        cx="50"
                        cy="50"
                        r={RADIUS}
                        fill="none"
                        stroke="rgb(var(--primary))"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold text-primary tabular-nums">
                    {value}
                </span>
            </div>
        </div>
    );
}
