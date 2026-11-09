// @requirement RF-15
import { useEffect, useState } from "react";
import { ApiError, listAlertConfig, updateAlertRecipients, updateAlertThresholds } from "../../api";
import { RECIPIENT_OPTIONS } from "../../lib/staff";
import { boundText, metricLabel, metricUnit, thresholdPayload, thresholdProblem, type ThresholdDraft } from "../../lib/thresholds";
import type { AlertConfigRow } from "../../types";
import { Button } from "../ui/Button";
import { Card, CardContent, CardTitle } from "../ui/Card";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";

function draftFrom(row: AlertConfigRow): ThresholdDraft {
    return {
        low: boundText(row.low_threshold),
        high: boundText(row.high_threshold),
        criticalLow: boundText(row.critical_low),
        criticalHigh: boundText(row.critical_high),
    };
}

function sameDraft(a: ThresholdDraft, b: ThresholdDraft): boolean {
    return a.low === b.low && a.high === b.high && a.criticalLow === b.criticalLow && a.criticalHigh === b.criticalHigh;
}

function sameSet(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((item) => b.includes(item));
}

export function AdminThresholds() {
    const toast = useToast();
    const [rows, setRows] = useState<AlertConfigRow[] | null>(null);
    const [bounds, setBounds] = useState<Record<string, ThresholdDraft>>({});
    const [savedBounds, setSavedBounds] = useState<Record<string, ThresholdDraft>>({});
    const [drafts, setDrafts] = useState<Record<string, string[]>>({});
    const [saved, setSaved] = useState<Record<string, string[]>>({});
    const [failed, setFailed] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listAlertConfig()
            .then((page) => {
                if (cancelled) return;
                setRows(page.items);
                setBounds(Object.fromEntries(page.items.map((row) => [row.id, draftFrom(row)])));
                setSavedBounds(Object.fromEntries(page.items.map((row) => [row.id, draftFrom(row)])));
                const current = Object.fromEntries(page.items.map((row) => [row.id, row.recipients]));
                setDrafts(current);
                setSaved(current);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    function edit(id: string, key: keyof ThresholdDraft, value: string) {
        setBounds((current) => ({ ...current, [id]: { ...current[id]!, [key]: value } }));
    }

    function toggle(id: string, recipient: string) {
        setDrafts((current) => {
            const selected = current[id] ?? [];
            const next = selected.includes(recipient) ? selected.filter((item) => item !== recipient) : [...selected, recipient];
            return { ...current, [id]: next };
        });
    }

    async function save(row: AlertConfigRow) {
        const draft = bounds[row.id] ?? draftFrom(row);
        const problem = thresholdProblem(row.metric, draft);
        if (problem) return;
        const boundsChanged = !sameDraft(draft, savedBounds[row.id] ?? draftFrom(row));
        const recipientsChanged = !sameSet(drafts[row.id] ?? [], saved[row.id] ?? []);
        setBusyId(row.id);
        try {
            if (boundsChanged) {
                await updateAlertThresholds(row.id, thresholdPayload(draft));
                setSavedBounds((current) => ({ ...current, [row.id]: draft }));
            }
            if (recipientsChanged) {
                await updateAlertRecipients(row.id, drafts[row.id] ?? []);
                setSaved((current) => ({ ...current, [row.id]: drafts[row.id] ?? [] }));
            }
            toast.success(boundsChanged && recipientsChanged ? "Cambios guardados." : boundsChanged ? "Umbrales guardados." : "Destinatarios guardados.");
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudieron guardar los cambios");
        } finally {
            setBusyId(null);
        }
    }

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudieron cargar los umbrales.
            </p>
        );
    }
    if (!rows) return <p className="text-subtle">Cargando umbrales...</p>;

    return (
        <section className="flex flex-col gap-4" aria-labelledby="thresholds-heading">
            <div className="flex flex-col gap-2">
                <h2 id="thresholds-heading" className="text-2xl font-medium">
                    Umbrales
                </h2>
                <p className="max-w-2xl text-sm text-subtle">
                    Define desde dónde y hasta dónde va el aviso de cada medición, y quién lo recibe. Un campo vacío no marca esa orilla. Estos números no cuentan como evidencia hasta la firma clínica.
                </p>
            </div>
            {rows.length === 0 ? (
                <Card>
                    <CardContent className="text-center text-subtle">No hay umbrales configurados.</CardContent>
                </Card>
            ) : (
                <ul className="flex flex-col gap-3">
                    {rows.map((row) => {
                        const draft = bounds[row.id] ?? draftFrom(row);
                        const unit = metricUnit(row.metric);
                        const problem = thresholdProblem(row.metric, draft);
                        const unchanged =
                            sameDraft(draft, savedBounds[row.id] ?? draftFrom(row)) && sameSet(drafts[row.id] ?? [], saved[row.id] ?? []);
                        return (
                            <li key={row.id} aria-label={metricLabel(row.metric)}>
                                <Card>
                                    <CardContent className="flex flex-col gap-4">
                                        <div>
                                            <CardTitle>{metricLabel(row.metric)}</CardTitle>
                                            <p className="mt-1 text-sm text-subtle">{row.patient_name ?? "Configuración general"}</p>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <Input
                                                label="Aviso desde"
                                                type="number"
                                                inputMode="decimal"
                                                suffix={unit || undefined}
                                                placeholder="Sin límite"
                                                value={draft.low}
                                                onChange={(event) => edit(row.id, "low", event.target.value)}
                                            />
                                            <Input
                                                label="Aviso hasta"
                                                type="number"
                                                inputMode="decimal"
                                                suffix={unit || undefined}
                                                placeholder="Sin límite"
                                                value={draft.high}
                                                onChange={(event) => edit(row.id, "high", event.target.value)}
                                            />
                                            <Input
                                                label="Crítico desde"
                                                type="number"
                                                inputMode="decimal"
                                                suffix={unit || undefined}
                                                placeholder="Sin límite"
                                                value={draft.criticalLow}
                                                onChange={(event) => edit(row.id, "criticalLow", event.target.value)}
                                            />
                                            <Input
                                                label="Crítico hasta"
                                                type="number"
                                                inputMode="decimal"
                                                suffix={unit || undefined}
                                                placeholder="Sin límite"
                                                value={draft.criticalHigh}
                                                onChange={(event) => edit(row.id, "criticalHigh", event.target.value)}
                                            />
                                        </div>
                                        {problem ? <p className="text-sm text-critical">{problem}</p> : null}
                                        {!problem && !draft.low && !draft.high && !draft.criticalLow && !draft.criticalHigh ? (
                                            <p className="text-sm text-warning">Sin números, esta medición no marca ningún aviso por umbral.</p>
                                        ) : null}
                                        <p className="text-sm font-medium">Quién recibe el aviso</p>
                                        <fieldset className="flex flex-wrap gap-4">
                                            <legend className="sr-only">{`Destinatarios de ${metricLabel(row.metric)}`}</legend>
                                            {RECIPIENT_OPTIONS.map((option) => (
                                                <label key={option.id} className="flex items-center gap-2 text-sm">
                                                    <input
                                                        type="checkbox"
                                                        checked={(drafts[row.id] ?? []).includes(option.id)}
                                                        onChange={() => toggle(row.id, option.id)}
                                                    />
                                                    {option.label}
                                                </label>
                                            ))}
                                        </fieldset>
                                        {(drafts[row.id] ?? []).length === 0 ? (
                                            <p className="text-sm text-warning">Sin destinatarios, nadie recibirá el aviso de esta medición.</p>
                                        ) : null}
                                        <Button size="sm" className="self-start" loading={busyId === row.id} disabled={unchanged || problem !== null} onClick={() => void save(row)}>
                                            Guardar cambios
                                        </Button>
                                    </CardContent>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
