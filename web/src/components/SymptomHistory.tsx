// @requirement RF-21
import { formatShortDateTime } from "../lib/format";
import type { Symptom } from "../types";
import { Badge } from "./ui/Badge";

export function SymptomHistory({
    symptoms,
    emptyMessage = "Aún no has registrado síntomas.",
}: {
    symptoms: Symptom[];
    emptyMessage?: string;
}) {
    if (symptoms.length === 0) {
        return <p className="py-6 text-center text-sm text-subtle">{emptyMessage}</p>;
    }
    return (
        <ul className="flex flex-col gap-3">
            {symptoms.map((symptom) => (
                <li key={symptom.id} className="rounded-card border border-border/70 bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                        <time dateTime={symptom.recorded_at} className="text-sm text-subtle">
                            {formatShortDateTime(symptom.recorded_at)}
                        </time>
                        {symptom.mood ? <Badge tone="elevated">{symptom.mood}</Badge> : null}
                    </div>
                    {symptom.free_text ? <p className="mt-2 whitespace-pre-line text-base">{symptom.free_text}</p> : null}
                </li>
            ))}
        </ul>
    );
}
