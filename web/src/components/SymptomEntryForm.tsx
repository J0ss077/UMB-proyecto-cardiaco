// @requirement RF-21
import { useState, type FormEvent } from "react";
import { ApiError, createSymptom } from "../api";
import type { SymptomInput } from "../types";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { useToast } from "./ui/Toast";

export const FREE_TEXT_MAX = 2000;
export const MOOD_MAX = 100;

interface SymptomEntryFormProps {
    onSaved: () => void;
    onConsentRequired: () => void;
}

export function SymptomEntryForm({ onSaved, onConsentRequired }: SymptomEntryFormProps) {
    const toast = useToast();
    const [freeText, setFreeText] = useState("");
    const [mood, setMood] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const body: SymptomInput = {};
        if (freeText.trim()) body.free_text = freeText.trim();
        if (mood.trim()) body.mood = mood.trim();
        if (!body.free_text && !body.mood) {
            setError("El síntoma necesita un texto o un estado de ánimo");
            return;
        }
        setError(null);
        setBusy(true);
        try {
            await createSymptom(body);
            toast.success("Síntoma guardado.");
            setFreeText("");
            setMood("");
            onSaved();
        } catch (failure) {
            if (failure instanceof ApiError && failure.consentRequired) {
                onConsentRequired();
            } else {
                toast.error(failure instanceof ApiError ? failure.message : "No se pudo conectar con el servidor");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4" aria-label="Registrar síntoma">
            <div className="flex flex-col gap-2">
                <Label htmlFor="symptom-free-text">Describe tus síntomas</Label>
                <textarea
                    id="symptom-free-text"
                    rows={4}
                    maxLength={FREE_TEXT_MAX}
                    value={freeText}
                    placeholder="Ej: mareo desde la tarde"
                    onChange={(event) => setFreeText(event.target.value)}
                    className="w-full resize-y rounded-field border border-border bg-background px-4 py-3 text-base placeholder:text-subtle/60"
                />
                <span className="self-end text-xs text-subtle">{`${freeText.length}/${FREE_TEXT_MAX}`}</span>
            </div>
            <div className="flex flex-col gap-1">
                <Input
                    label="Estado de ánimo"
                    maxLength={MOOD_MAX}
                    placeholder="Ej: tranquilo, ansioso"
                    value={mood}
                    onChange={(event) => setMood(event.target.value)}
                />
                <span className="self-end text-xs text-subtle">{`${mood.length}/${MOOD_MAX}`}</span>
            </div>
            {error ? (
                <p role="alert" className="text-sm text-critical">
                    {error}
                </p>
            ) : null}
            <Button type="submit" loading={busy}>
                Guardar síntoma
            </Button>
        </form>
    );
}
