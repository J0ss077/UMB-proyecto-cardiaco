// @requirement RF-24
import type { ConsultationOnset, ConsultationReason, ConsultationStatus } from "../types";

export const REASONS: { id: ConsultationReason; label: string }[] = [
    { id: "high_pressure", label: "Presión alta" },
    { id: "dizziness_headache", label: "Mareos o dolor de cabeza" },
    { id: "chest_pain_or_breathing", label: "Dolor de pecho o falta de aire" },
    { id: "medication", label: "Medicamentos" },
    { id: "other", label: "Otro motivo" },
];

export const ONSETS: { id: ConsultationOnset; label: string }[] = [
    { id: "today", label: "Hoy" },
    { id: "since_yesterday", label: "Desde ayer" },
    { id: "few_days", label: "Hace varios días" },
    { id: "over_a_week", label: "Hace más de una semana" },
];

export const reasonLabel = (id: ConsultationReason | null): string | null => REASONS.find((entry) => entry.id === id)?.label ?? null;
export const onsetLabel = (id: ConsultationOnset | null): string | null => ONSETS.find((entry) => entry.id === id)?.label ?? null;

export const STATUS_LABEL: Record<ConsultationStatus, string> = {
    in_review: "En revisión",
    pending: "Pendiente",
    completed: "Completada",
};

export const STATUS_TONE: Record<ConsultationStatus, "warning" | "elevated" | "normal"> = {
    in_review: "warning",
    pending: "elevated",
    completed: "normal",
};

export const attentionLabel = (wantsMeet: boolean) => (wantsMeet ? "Atención por Meet" : "Atención por comentarios");
