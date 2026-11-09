// @requirement RF-24
import { useEffect, useState } from "react";
import { ApiError, completeConsultation, listReadings, listSymptoms, sendMeetLink } from "../api";
import { meetLink } from "../lib/checkup";
import { STATUS_LABEL, STATUS_TONE, attentionLabel, onsetLabel, reasonLabel } from "../lib/consultation";
import { formatShortDateTime } from "../lib/format";
import type { Consultation, Reading, Symptom } from "../types";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { useToast } from "./ui/Toast";

const RESPONSE_MAX = 2000;

const fieldClass = "w-full resize-y rounded-field border border-border bg-background px-3 py-2 text-sm";

function RecentHistory({ patientId }: { patientId: string }) {
    const [readings, setReadings] = useState<Reading[] | null>(null);
    const [symptoms, setSymptoms] = useState<Symptom[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let live = true;
        Promise.all([listReadings({ patient_id: patientId, limit: 6 }), listSymptoms({ patient_id: patientId, limit: 4 })])
            .then(([readingsPage, symptomsPage]) => {
                if (!live) return;
                setReadings(readingsPage.items);
                setSymptoms(symptomsPage.items);
            })
            .catch(() => {
                if (live) setFailed(true);
            });
        return () => {
            live = false;
        };
    }, [patientId]);

    return (
        <div className="flex flex-col gap-2 rounded-field bg-background p-3 text-sm">
            <p className="font-medium">Historial reciente de automonitoreo</p>
            {failed ? <p className="text-subtle">No se pudo cargar el historial.</p> : null}
            {!failed && readings === null ? <p className="text-subtle">Cargando historial...</p> : null}
            {readings ? (
                readings.length === 0 ? (
                    <p className="text-subtle">Sin lecturas recientes.</p>
                ) : (
                    <ul className="flex flex-col gap-1">
                        {readings.map((reading) => (
                            <li key={reading.id} className="text-subtle">
                                {`${formatShortDateTime(reading.measured_at)} · ${reading.systolic}/${reading.diastolic}`}
                            </li>
                        ))}
                    </ul>
                )
            ) : null}
            {symptoms && symptoms.length > 0 ? (
                <ul className="flex flex-col gap-1">
                    {symptoms.map((symptom) => (
                        <li key={symptom.id} className="text-subtle">
                            {`${formatShortDateTime(symptom.recorded_at)} · ${symptom.free_text}`}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

function Item({ item, onAnswered, showPatient }: { item: Consultation; onAnswered: (updated: Consultation) => void; showPatient: boolean }) {
    const toast = useToast();
    const [text, setText] = useState("");
    const [general, setGeneral] = useState("");
    const [pressure, setPressure] = useState("");
    const [symptoms, setSymptoms] = useState("");
    const [conduct, setConduct] = useState("");
    const [meet, setMeet] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const waitingForMeet = item.status === "in_review" && item.wants_meet;
    const closed = item.status === "completed" || Boolean(item.response);

    async function sendMeet() {
        const link = meetLink(meet);
        if (!link) {
            setError("El enlace tiene que ser de Meet.");
            return;
        }
        setError(null);
        setBusy(true);
        try {
            onAnswered(await sendMeetLink(item.id, { meet_url: link }));
            toast.success("Enlace enviado. La consulta queda pendiente.");
        } catch (failure) {
            toast.error(failure instanceof ApiError ? failure.message : "No se pudo enviar el enlace");
        } finally {
            setBusy(false);
        }
    }

    async function complete() {
        const response = text.trim();
        const checkupGeneral = general.trim();
        const checkupPressure = pressure.trim();
        const checkupSymptoms = symptoms.trim();
        const checkupConduct = conduct.trim();
        if (!response) {
            setError("Escribe una respuesta antes de enviarla.");
            return;
        }
        if (!checkupGeneral) {
            setError("Escribe cómo está el paciente.");
            return;
        }
        if (!checkupPressure) {
            setError("Escribe la presión del chequeo.");
            return;
        }
        if (!checkupSymptoms) {
            setError("Escribe los síntomas del chequeo.");
            return;
        }
        if (!checkupConduct) {
            setError("Escribe la conducta del chequeo.");
            return;
        }
        setError(null);
        setBusy(true);
        try {
            onAnswered(
                await completeConsultation(item.id, {
                    response,
                    checkup_general: checkupGeneral,
                    checkup_pressure: checkupPressure,
                    checkup_symptoms: checkupSymptoms,
                    checkup_conduct: checkupConduct,
                }),
            );
            toast.success("Consulta completada. El paciente recibe el formato de chequeo.");
        } catch (failure) {
            toast.error(failure instanceof ApiError ? failure.message : "No se pudo completar la consulta");
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className="flex flex-col gap-2 rounded-field border border-border/70 bg-surface p-3">
            {showPatient ? <p className="font-medium">{item.patient_name}</p> : null}
            <div className="flex items-center justify-between gap-2">
                <time dateTime={item.created_at} className="text-xs text-subtle">
                    {formatShortDateTime(item.created_at)}
                </time>
                <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                    <Badge tone={item.wants_meet ? "elevated" : "neutral"}>{attentionLabel(item.wants_meet)}</Badge>
                </div>
            </div>
            {reasonLabel(item.reason) || onsetLabel(item.onset) ? (
                <div className="flex flex-wrap gap-2">
                    {reasonLabel(item.reason) ? <Badge tone="elevated">{reasonLabel(item.reason)}</Badge> : null}
                    {onsetLabel(item.onset) ? <Badge tone="neutral">{onsetLabel(item.onset)}</Badge> : null}
                </div>
            ) : null}
            <p className="text-sm">{item.message}</p>
            {item.medications ? <p className="text-xs text-subtle">{`Medicamentos: ${item.medications}`}</p> : null}
            {item.contact_phone ? (
                <a
                    href={`tel:${item.contact_phone.replace(/[^\d+]/g, "")}`}
                    className="self-start rounded-field bg-accent px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                    {`Llamar al paciente: ${item.contact_phone}`}
                </a>
            ) : null}
            {item.reading ? (
                <p className="text-xs text-subtle">{`Lectura adjunta: ${item.reading.systolic}/${item.reading.diastolic} mmHg`}</p>
            ) : null}
            {closed ? (
                <div className="flex flex-col gap-2">
                    {item.response ? <p className="rounded-field bg-background p-2 text-sm">{`Respuesta: ${item.response}`}</p> : null}
                    {meetLink(item.meet_url) ? (
                        <a href={meetLink(item.meet_url) ?? undefined} className="self-start text-sm font-medium text-primary">
                            Enlace de Meet
                        </a>
                    ) : null}
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <RecentHistory patientId={item.patient_id} />
                    {waitingForMeet ? (
                        <label className="flex flex-col gap-1 text-sm">
                            Enlace de Meet
                            <input
                                aria-label="Enlace de Meet"
                                type="url"
                                value={meet}
                                placeholder="https://meet.google.com/..."
                                onChange={(event) => setMeet(event.target.value)}
                                className="h-12 w-full rounded-field border border-border bg-background px-3 text-sm"
                            />
                        </label>
                    ) : (
                        <>
                            {meetLink(item.meet_url) ? (
                                <a href={meetLink(item.meet_url) ?? undefined} className="self-start text-sm font-medium text-primary">
                                    Enlace de Meet
                                </a>
                            ) : null}
                            <label className="flex flex-col gap-1 text-sm">
                                Cómo está el paciente
                                <textarea aria-label="Cómo está el paciente" rows={2} maxLength={RESPONSE_MAX} value={general} onChange={(event) => setGeneral(event.target.value)} className={fieldClass} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm">
                                Presión del chequeo
                                <textarea aria-label="Presión del chequeo" rows={2} maxLength={RESPONSE_MAX} value={pressure} onChange={(event) => setPressure(event.target.value)} className={fieldClass} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm">
                                Síntomas del chequeo
                                <textarea aria-label="Síntomas del chequeo" rows={2} maxLength={RESPONSE_MAX} value={symptoms} onChange={(event) => setSymptoms(event.target.value)} className={fieldClass} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm">
                                Conducta del chequeo
                                <textarea aria-label="Conducta del chequeo" rows={2} maxLength={RESPONSE_MAX} value={conduct} onChange={(event) => setConduct(event.target.value)} className={fieldClass} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm">
                                Comentario para el paciente
                                <textarea
                                    aria-label="Respuesta a la consulta"
                                    rows={3}
                                    maxLength={RESPONSE_MAX}
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    className={fieldClass}
                                />
                            </label>
                        </>
                    )}
                    {error ? (
                        <p role="alert" className="text-sm text-critical">
                            {error}
                        </p>
                    ) : null}
                    <p className="text-xs text-subtle">
                        {waitingForMeet
                            ? "Al enviar el enlace, la consulta queda pendiente. El formato se llena después de la reunión y no es un diagnóstico."
                            : "Este formato lo escribes a mano. Al enviarlo, la consulta queda completada. No es un diagnóstico."}
                    </p>
                    <div>
                        <Button size="sm" loading={busy} onClick={waitingForMeet ? sendMeet : complete}>
                            {waitingForMeet ? "Enviar enlace" : "Completar"}
                        </Button>
                    </div>
                </div>
            )}
        </li>
    );
}

export function ConsultationsPanel({
    initial,
    title = "Consultas",
    showPatient = false,
    emptyMessage = "El paciente no ha enviado consultas.",
    onAnswered,
}: {
    initial: Consultation[] | null;
    title?: string | null;
    // Name the patient on each item, for lists that mix several patients.
    showPatient?: boolean;
    emptyMessage?: string;
    onAnswered?: (updated: Consultation) => void;
}) {
    const [items, setItems] = useState<Consultation[] | null>(initial);

    useEffect(() => {
        setItems(initial);
    }, [initial]);

    return (
        <Card data-testid="detail-consultations">
            {title ? (
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                </CardHeader>
            ) : null}
            <CardContent>
                {items === null ? (
                    <p className="text-sm text-subtle">No se pudieron cargar las consultas.</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-subtle">{emptyMessage}</p>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {items.map((item) => (
                            <Item
                                key={item.id}
                                item={item}
                                showPatient={showPatient}
                                onAnswered={(updated) => {
                                    setItems((current) => current?.map((entry) => (entry.id === updated.id ? updated : entry)) ?? current);
                                    onAnswered?.(updated);
                                }}
                            />
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
