// @requirement RF-05
// @requirement RF-08
import { useState, type FormEvent } from "react";
import { ApiError, createReading } from "../api";
import { READING_FIELD_RANGES, readingFieldIssue, type ReadingField } from "../lib/clinical";
import type { Reading, ReadingInput } from "../types";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useToast } from "./ui/Toast";

interface ReadingEntryFormProps {
    onSaved: (reading: Reading) => void;
    onConsentRequired: () => void;
}

const FIELDS: { name: ReadingField; label: string; unit: string; placeholder: string; required: boolean }[] = [
    { name: "systolic", label: "Presión sistólica", unit: "mmHg", placeholder: "120", required: true },
    { name: "diastolic", label: "Presión diastólica", unit: "mmHg", placeholder: "80", required: true },
    { name: "heart_rate", label: "Frecuencia cardíaca", unit: "lpm", placeholder: "72", required: false },
];

type Values = Record<ReadingField, string>;

function parse(raw: string): number | null {
    if (raw.trim() === "") return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : Number.NaN;
}

export function ReadingEntryForm({ onSaved, onConsentRequired }: ReadingEntryFormProps) {
    const toast = useToast();
    const [values, setValues] = useState<Values>({ systolic: "", diastolic: "", heart_rate: "" });
    const [submitted, setSubmitted] = useState(false);
    const [busy, setBusy] = useState(false);

    const errorFor = (field: (typeof FIELDS)[number]): string | null => {
        const value = parse(values[field.name]);
        if (value === null) return field.required && submitted ? `La ${field.label.toLowerCase()} es obligatoria` : null;
        if (Number.isNaN(value)) return "Ingresa un número entero";
        return null;
    };

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitted(true);
        const systolic = parse(values.systolic);
        const diastolic = parse(values.diastolic);
        const heartRate = parse(values.heart_rate);
        if (systolic === null || diastolic === null || Number.isNaN(systolic) || Number.isNaN(diastolic)) return;
        if (Number.isNaN(heartRate)) return;

        const body: ReadingInput = { systolic, diastolic };
        if (heartRate !== null) body.heart_rate = heartRate;

        setBusy(true);
        try {
            const saved = await createReading(body);
            toast.success(
                saved.validation_status === "out_of_range"
                    ? "Lectura guardada. Quedó marcada como fuera de rango."
                    : "Lectura guardada.",
            );
            setValues({ systolic: "", diastolic: "", heart_rate: "" });
            setSubmitted(false);
            onSaved(saved);
        } catch (error) {
            if (error instanceof ApiError && error.consentRequired) {
                onConsentRequired();
            } else {
                toast.error(error instanceof ApiError ? error.message : "No se pudo conectar con el servidor");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" aria-label="Registrar lectura">
            {FIELDS.map((field) => {
                const parsed = parse(values[field.name]);
                const hard = errorFor(field);
                const range = READING_FIELD_RANGES[field.name];
                const warning =
                    parsed !== null && !Number.isNaN(parsed) ? readingFieldIssue(field.name, parsed) : null;
                return (
                    <Input
                        key={field.name}
                        label={field.label}
                        suffix={field.unit}
                        type="number"
                        inputMode="numeric"
                        min={range.min}
                        max={range.max}
                        step={1}
                        placeholder={field.placeholder}
                        value={values[field.name]}
                        error={hard}
                        hint={warning ? <span className="text-warning">{warning}</span> : `Rango habitual: ${range.min} a ${range.max}`}
                        onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                    />
                );
            })}
            <Button type="submit" loading={busy}>
                Guardar lectura
            </Button>
        </form>
    );
}
