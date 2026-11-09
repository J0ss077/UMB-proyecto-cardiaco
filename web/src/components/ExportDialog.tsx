// @requirement RF-17
// @requirement RF-18
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Profile } from "../types";
import { getProfile } from "../api";
import { cn } from "../lib/cn";
import {
    PERIODS,
    buildFile,
    collectHistory,
    downloadFile,
    exportFileName,
    type ExportFormat,
    type IncludeOptions,
} from "../lib/historyExport";
import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

const SECTIONS: { id: keyof IncludeOptions; label: string }[] = [
    { id: "summary", label: "Resumen estadístico" },
    { id: "readings", label: "Lecturas" },
    { id: "symptoms", label: "Síntomas" },
    { id: "alerts", label: "Alertas" },
];

const FORMATS: { id: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
    { id: "xlsx", label: "Excel (.xlsx)", hint: "Para analizar los datos", icon: FileSpreadsheet },
    { id: "pdf", label: "PDF", hint: "Para llevar al médico", icon: FileText },
];

export function ExportDialog({
    onClose,
    patientId,
    subject,
}: {
    onClose: () => void;
    patientId?: string;
    subject?: { full_name: string; birth_date: string | null };
}) {
    const toast = useToast();
    const [format, setFormat] = useState<ExportFormat | null>(null);
    const [periodId, setPeriodId] = useState("30");
    const [include, setInclude] = useState<IncludeOptions>({ summary: true, readings: true, symptoms: true, alerts: true });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dialog = useRef<HTMLDivElement>(null);

    useEffect(() => {
        dialog.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const anySection = Object.values(include).some(Boolean);

    async function download() {
        if (!format || !anySection) return;
        const period = PERIODS.find((entry) => entry.id === periodId) ?? PERIODS[1]!;
        setError(null);
        setBusy(true);
        try {
            const now = new Date();
            const named: Profile | null = subject
                ? {
                      user_id: patientId ?? "",
                      email: "",
                      full_name: subject.full_name,
                      birth_date: subject.birth_date,
                      sex: null,
                      document_number: null,
                      phone: null,
                      diagnosis_date: null,
                      trusted_contact_phone: null,
                      trusted_contact_email: null,
                      avatar: null,
                  }
                : await getProfile().catch(() => null);
            const collected = await collectHistory(period.days, now, include, patientId);
            const file = buildFile(format, { patient: named, generatedAt: now, periodLabel: period.label, include, ...collected });
            downloadFile(file.bytes, exportFileName(format, now), file.mime);
            toast.success("Historial descargado.");
            onClose();
        } catch {
            setError("No se pudo generar el archivo. Intenta de nuevo.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
            <div
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-title"
                tabIndex={-1}
                className="flex max-h-[90vh] w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-t-[1.25rem] bg-background p-6 shadow-xl sm:rounded-[1.25rem]"
            >
                <header className="flex flex-col gap-1">
                    <h2 id="export-title" className="text-xl font-medium">
                        Descargar historial
                    </h2>
                    <p className="text-sm text-subtle">
                        Registro de automonitoreo con tus lecturas, síntomas y alertas. No sustituye la historia clínica.
                    </p>
                </header>

                <fieldset className="flex flex-col gap-3">
                    <legend className="mb-2 text-base">¿En qué formato quieres tus datos?</legend>
                    <div role="radiogroup" aria-label="Formato" className="grid gap-3 sm:grid-cols-2">
                        {FORMATS.map(({ id, label, hint, icon: Icon }) => (
                            <label
                                key={id}
                                className={cn(
                                    "flex cursor-pointer items-center gap-3 rounded-card border p-4 transition-colors",
                                    format === id ? "border-accent bg-primary-soft/40" : "border-border hover:bg-surface",
                                )}
                            >
                                <input
                                    type="radio"
                                    name="export-format"
                                    className="sr-only"
                                    checked={format === id}
                                    onChange={() => setFormat(id)}
                                />
                                <Icon className="h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
                                <span className="flex flex-col">
                                    <span className="font-medium">{label}</span>
                                    <span className="text-xs text-subtle">{hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="flex flex-col gap-2">
                    <label htmlFor="export-period" className="text-sm font-medium">
                        Período
                    </label>
                    <select
                        id="export-period"
                        value={periodId}
                        onChange={(event) => setPeriodId(event.target.value)}
                        className="h-11 rounded-field border border-border bg-background px-3 text-base"
                    >
                        {PERIODS.map((period) => (
                            <option key={period.id} value={period.id}>
                                {period.label}
                            </option>
                        ))}
                    </select>
                </div>

                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium">Qué incluir</legend>
                    {SECTIONS.map((section) => (
                        <label key={section.id} className="flex items-center gap-3 text-base">
                            <input
                                type="checkbox"
                                className="h-5 w-5 rounded border-border accent-primary"
                                checked={include[section.id]}
                                onChange={(event) => setInclude((current) => ({ ...current, [section.id]: event.target.checked }))}
                            />
                            {section.label}
                        </label>
                    ))}
                </fieldset>

                <p className="rounded-field bg-warning-soft px-3 py-2 text-xs text-warning">
                    El archivo contiene datos de salud. Se genera en tu navegador y no se envía a ningún servidor; guárdalo en
                    un lugar seguro.
                </p>

                {error ? (
                    <p role="alert" className="text-sm text-critical">
                        {error}
                    </p>
                ) : null}

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={download} loading={busy} disabled={!format || !anySection}>
                        {busy ? null : <Download className="h-5 w-5" aria-hidden="true" />}
                        Descargar
                    </Button>
                </div>
            </div>
        </div>
    );
}
