// @requirement RF-24
// The checkup is the form the physician writes by hand with the answer.
// It is not the self-monitoring history and it does not diagnose or treat.

import { onsetLabel, reasonLabel } from "./consultation";
import { formatShortDateTime } from "./format";
import { buildPdf, type PdfBlock } from "./pdf";
import type { Consultation } from "../types";

export function checkupFileName(now: Date = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `chequeo-rutina-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.pdf`;
}

export function meetLink(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "https:" || url.hostname !== "meet.google.com" || url.pathname.replaceAll("/", "") === "") return null;
        return url.toString();
    } catch {
        return null;
    }
}

const textOr = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;

function written(title: string, lead: string, body: string | null | undefined): PdfBlock[] {
    return [
        { kind: "heading", text: title },
        { kind: "paragraph", text: lead },
        { kind: "paragraph", text: textOr(body, "No consta.") },
    ];
}

function readingLine(consultation: Consultation): string {
    const reading = consultation.reading;
    if (!reading) return "No había una lectura válida al enviar la consulta.";
    return `${reading.systolic}/${reading.diastolic} mmHg, ${formatShortDateTime(reading.measured_at)}. Es la lectura que viajó con la consulta, no un resumen del historial.`;
}

function meetingLine(consultation: Consultation): string {
    const link = meetLink(consultation.meet_url);
    if (link) return `Se atendió por Meet: ${link}`;
    if (consultation.wants_meet) return "Pidió atención por Meet y el enlace no quedó en el formato.";
    return "Se atendió por comentarios, sin reunión.";
}

export function checkupBlocks(consultation: Consultation): PdfBlock[] {
    const closed = consultation.responded_at ? formatShortDateTime(consultation.responded_at) : "No consta";
    return [
        {
            kind: "masthead",
            kicker: "HipertAI · consulta de rutina",
            title: "Formato de chequeo general",
            subtitle: "Lo escribió el médico para esta consulta. No es el historial de automonitoreo.",
        },
        {
            kind: "keyValue",
            rows: [
                ["Paciente", consultation.patient_name],
                ["Médico", consultation.physician_name],
                ["Referencia", consultation.id.replaceAll("-", "").slice(0, 8).toUpperCase()],
                ["Consulta enviada", formatShortDateTime(consultation.created_at)],
                ["Formato cerrado", closed],
                ["Atención", consultation.wants_meet ? "Atención por Meet" : "Atención por comentarios"],
                ["Motivo", reasonLabel(consultation.reason) ?? "No consta"],
                ["Desde cuándo", onsetLabel(consultation.onset) ?? "No consta"],
                ["Teléfono", textOr(consultation.contact_phone, "No lo compartió")],
            ],
        },
        { kind: "heading", text: "Lo que contó el paciente" },
        { kind: "paragraph", text: textOr(consultation.message, "No dejó una descripción.") },
        {
            kind: "keyValue",
            rows: [
                ["Medicamentos que refirió", textOr(consultation.medications, "No indicó medicamentos.")],
                ["Lectura de la consulta", readingLine(consultation)],
            ],
        },
        ...written("Cómo está", "Estado general que el médico dejó por escrito.", consultation.checkup_general),
        ...written("Presión", "Lo que el médico consigna sobre la presión en esta consulta.", consultation.checkup_pressure),
        ...written("Síntomas", "Síntomas que el médico consigna para este chequeo.", consultation.checkup_symptoms),
        ...written("Conducta", "Qué seguir en casa, con las palabras del médico. No es un tratamiento.", consultation.checkup_conduct),
        ...written("Comentario para el paciente", "Indicación que el médico dejó junto con el formato.", consultation.response),
        { kind: "heading", text: "Reunión" },
        { kind: "paragraph", text: meetingLine(consultation) },
        {
            kind: "callout",
            text: "Este formato no es un diagnóstico ni un tratamiento, y no reemplaza la historia clínica. Si aparece dolor de pecho, falta de aire, confusión o desmayo, llamar al 123 o al 911.",
        },
        { kind: "heading", text: "Cierre" },
        {
            kind: "keyValue",
            rows: [
                ["Médico responsable", consultation.physician_name],
                ["Fecha del formato", closed],
            ],
        },
        { kind: "signature", label: "Firma del médico" },
    ];
}

export function buildCheckupPdf(consultation: Consultation): Uint8Array {
    return buildPdf(checkupBlocks(consultation), { footer: "Formato de chequeo - HipertAI" });
}
