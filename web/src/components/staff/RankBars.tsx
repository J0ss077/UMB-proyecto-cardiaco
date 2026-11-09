// @requirement RF-16
import { Card, CardContent } from "../ui/Card";

export interface RankRow {
    id: string;
    label: string;
    count: number;
    color?: string;
}

// A short bar list. Recharts measures zero width in jsdom, and these ranks are
// a handful of names, so the bars are plain CSS.
export function RankBars({
    title,
    caption,
    rows,
    emptyText,
}: {
    title: string;
    caption?: string;
    rows: RankRow[];
    emptyText: string;
}) {
    const top = [...rows]
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"))
        .slice(0, 8);
    const max = top[0]?.count ?? 1;

    return (
        <Card>
            <CardContent className="flex flex-col gap-3">
                <h3 className="font-medium">{title}</h3>
                {caption ? <p className="text-sm text-subtle">{caption}</p> : null}
                {top.length === 0 ? (
                    <p className="text-sm text-subtle">{emptyText}</p>
                ) : (
                    <ul className="flex flex-col gap-3" aria-label={title}>
                        {top.map((row) => (
                            <li key={row.id}>
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="font-medium">{row.label}</span>
                                    <span className="tabular-nums">{row.count}</span>
                                </div>
                                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                    <div
                                        className="h-2 rounded-full"
                                        style={{
                                            width: `${Math.max(8, Math.round((row.count / max) * 100))}%`,
                                            background: row.color ?? "rgb(var(--primary))",
                                        }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
