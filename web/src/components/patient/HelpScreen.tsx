// @requirement RF-24
import { ChevronRight, ClipboardList, HeartPulse, Info, Phone, TriangleAlert, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, createConsultation, getProfile, listConsultations, listReadings, listRecipients } from "../../api";
import { buildCheckupPdf, checkupFileName, meetLink } from "../../lib/checkup";
import { downloadFile } from "../../lib/historyExport";
import { ONSETS, REASONS, STATUS_LABEL, STATUS_TONE, attentionLabel, onsetLabel, reasonLabel } from "../../lib/consultation";
import { EMERGENCY_NUMBERS } from "../../lib/emergency";
import { formatRelative } from "../../lib/format";
import type { Consultation, ConsultationInput, ConsultationOnset, ConsultationReason, Reading, Recipient } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { useToast } from "../ui/Toast";

const MESSAGE_MAX = 2000;

const dayMonth = (iso: string) => {
    const date = new Date(iso);
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
};

function ReviewRow({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
    return (
        <div className="flex flex-col gap-0.5 border-b border-border/50 pb-2 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-sm text-subtle">{label}</dt>
            <dd data-testid={testId} className="min-w-0 break-words sm:text-right">
                {children}
            </dd>
        </div>
    );
}

interface Fields {
    physicianId: string;
    reason: ConsultationReason | "";
    onset: ConsultationOnset | "";
    message: string;
    medications: string;
    wantsMeet: boolean;
    sharePhone: boolean;
}

const EMPTY: Omit<Fields, "physicianId"> = { reason: "", onset: "", message: "", medications: "", wantsMeet: false, sharePhone: false };

const selectClass = "h-12 w-full rounded-field border border-border bg-background px-3 text-base";

function ConsultationDialog({ item, onClose }: { item: Consultation; onClose: () => void }) {
    const dialog = useRef<HTMLDivElement>(null);
    const toast = useToast();
    const [preparing, setPreparing] = useState(false);
    const completed = item.status === "completed" && Boolean(item.response);
    const meeting = item.status === "pending";

    const link = meetLink(item.meet_url);
    const written =
        Boolean(item.checkup_general?.trim()) &&
        Boolean(item.checkup_pressure?.trim()) &&
        Boolean(item.checkup_symptoms?.trim()) &&
        Boolean(item.checkup_conduct?.trim());

    async function downloadCheckup() {
        setPreparing(true);
        try {
            downloadFile(buildCheckupPdf(item), checkupFileName(), "application/pdf");
        } catch {
            toast.error("No se pudo preparar el chequeo.");
        } finally {
            setPreparing(false);
        }
    }

    useEffect(() => {
        dialog.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="consultation-detail-title"
                tabIndex={-1}
                className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-[1.25rem] bg-background p-6 shadow-xl sm:rounded-[1.25rem]"
            >
                {completed ? (
                    <>
                        <h2 id="consultation-detail-title" className="flex flex-wrap items-center gap-2 text-xl font-medium">
                            <ClipboardList className="h-6 w-6 text-primary" aria-hidden="true" />
                            Indicación de tu médico
                            <Badge tone={STATUS_TONE.completed}>{STATUS_LABEL.completed}</Badge>
                        </h2>
                        <p className="text-sm text-subtle">
                            {`${item.physician_name} escribió esto para tu consulta del ${dayMonth(item.created_at)}.`}
                        </p>
                        <div className="rounded-card border border-border/70 bg-surface p-4">
                            <p className="text-sm font-medium text-subtle">Qué hacer</p>
                            <p className="mt-2 whitespace-pre-wrap text-base">{item.response}</p>
                        </div>
                        <p className="text-sm text-subtle">
                            Esta indicación la escribió tu médico. Si te sientes peor, usa los números de emergencia de esta pantalla.
                        </p>
                        {link ? (
                            <a href={link} className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                                <Video className="h-4 w-4" aria-hidden="true" />
                                Entrar a Meet
                            </a>
                        ) : null}
                        {written ? (
                            <div className="flex flex-col gap-2 rounded-card border border-border/70 bg-surface p-4">
                                <p className="text-sm font-medium">Formato de chequeo</p>
                                <p className="text-sm text-subtle">
                                    Tu médico lo llenó a mano con la indicación. No es tu historial de automonitoreo y no diagnostica.
                                </p>
                                <Button type="button" loading={preparing} onClick={() => void downloadCheckup()}>
                                    Descargar chequeo
                                </Button>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <>
                        <h2 id="consultation-detail-title" className="flex flex-wrap items-center gap-2 text-xl font-medium">
                            {meeting ? "Consulta pendiente" : "Consulta en revisión"}
                            <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                        </h2>
                        <p className="text-base">
                            {meeting
                                ? `${item.physician_name} ya envió el enlace. El formato llega cuando termine la reunión.`
                                : `${item.physician_name} está revisando tu consulta.`}
                        </p>
                        <p className="text-sm text-subtle">{item.message}</p>
                        {meeting && link ? (
                            <a href={link} className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                                <Video className="h-4 w-4" aria-hidden="true" />
                                Entrar a Meet
                            </a>
                        ) : null}
                        <p className="text-sm text-subtle">
                            {meeting
                                ? "El formato de chequeo llega cuando termine la reunión."
                                : item.wants_meet
                                  ? "El enlace de Meet llega cuando tu médico lo envíe."
                                  : "Tu médico responderá con comentarios."}
                        </p>
                    </>
                )}
                <Button variant="outline" onClick={onClose}>
                    Cerrar
                </Button>
            </div>
        </div>
    );
}

export function HelpScreen({ onConsentRequired }: { onConsentRequired: () => void }) {
    const toast = useToast();
    const [reading, setReading] = useState<Reading | null>(null);
    const [consultations, setConsultations] = useState<Consultation[] | null>(null);
    const [listFailed, setListFailed] = useState(false);
    const [recipients, setRecipients] = useState<Recipient[] | null>(null);
    const [phone, setPhone] = useState<string | null>(null);
    const [fields, setFields] = useState<Fields>({ ...EMPTY, physicianId: "" });
    const [step, setStep] = useState<"form" | "review">("form");
    const [errors, setErrors] = useState<{ reason?: string; onset?: string; message?: string }>({});
    const [sendError, setSendError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [openConsultation, setOpenConsultation] = useState<Consultation | null>(null);

    const loadConsultations = useCallback(async () => {
        try {
            setConsultations((await listConsultations({ limit: 10 })).items);
            setListFailed(false);
        } catch {
            setListFailed(true);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        listReadings({ limit: 5 })
            .then((page) => {
                if (!cancelled) setReading(page.items.find((item) => item.validation_status === "valid") ?? null);
            })
            .catch(() => undefined);
        listRecipients()
            .then((page) => {
                if (cancelled) return;
                setRecipients(page.items);
                setFields((current) => ({ ...current, physicianId: page.items[0]?.id ?? "" }));
            })
            .catch(() => {
                if (!cancelled) setRecipients([]);
            });
        getProfile()
            .then((profile) => {
                if (!cancelled) setPhone(profile?.phone ?? null);
            })
            .catch(() => undefined);
        void loadConsultations();
        return () => {
            cancelled = true;
        };
    }, [loadConsultations]);

    const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((current) => ({ ...current, [key]: value }));
    const recipient = recipients?.find((entry) => entry.id === fields.physicianId) ?? null;
    const noDoctor = recipients !== null && recipients.length === 0;

    function toReview(event: FormEvent) {
        event.preventDefault();
        const next: typeof errors = {};
        if (!fields.reason) next.reason = "Elige el motivo de tu consulta.";
        if (!fields.onset) next.onset = "Elige desde cuándo lo sientes.";
        if (!fields.message.trim()) next.message = "Escribe tu consulta antes de enviarla.";
        setErrors(next);
        if (Object.keys(next).length > 0) return;
        setSendError(null);
        setStep("review");
    }

    async function send() {
        if (!fields.reason || !fields.onset || !recipient) return;
        const input: ConsultationInput = {
            message: fields.message.trim(),
            reason: fields.reason,
            onset: fields.onset,
            wants_meet: fields.wantsMeet,
            share_phone: fields.sharePhone,
            physician_id: recipient.id,
        };
        if (fields.medications.trim()) input.medications = fields.medications.trim();
        setSendError(null);
        setBusy(true);
        try {
            await createConsultation(input);
            toast.success(`Mensaje enviado a ${recipient.full_name}.`);
            setFields((current) => ({ ...current, ...EMPTY }));
            setStep("form");
            await loadConsultations();
        } catch (failure) {
            if (failure instanceof ApiError && failure.consentRequired) {
                onConsentRequired();
            } else if (failure instanceof ApiError && (failure.status === 409 || failure.status === 403)) {
                setSendError(failure.message);
            } else {
                toast.error(failure instanceof ApiError ? failure.message : "No se pudo enviar el mensaje");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
            <Card>
                <CardContent className="flex flex-col gap-2">
                    <h2 className="flex items-center gap-3 text-xl font-medium">
                        <TriangleAlert className="h-6 w-6 text-critical" aria-hidden="true" />
                        Necesito ayuda médica
                    </h2>
                    <p className="text-subtle">Te ayudaremos a asesorarte en lo que necesites</p>
                </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
                <a
                    href={EMERGENCY_NUMBERS[0].href}
                    className="flex items-center gap-4 rounded-card bg-accent px-5 py-5 text-primary-foreground transition-colors hover:bg-accent/90"
                >
                    <Phone className="h-6 w-6 shrink-0" aria-hidden="true" />
                    <span className="flex flex-1 flex-col">
                        <span className="text-lg">Llamar a emergencias</span>
                        <span className="text-base">911 / 123</span>
                    </span>
                    <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </a>
                <a href={EMERGENCY_NUMBERS[1].href} className="self-end text-sm text-subtle underline">
                    Llamar al 911
                </a>
            </div>

            <Card data-testid="help-health-data" className="bg-surface">
                <CardHeader>
                    <CardTitle className="text-xl">Datos de salud recientes</CardTitle>
                    <HeartPulse className="h-5 w-5 text-primary" aria-hidden="true" />
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                    {reading ? (
                        <>
                            <div className="flex justify-between text-lg">
                                <span className="text-subtle">Presión arterial</span>
                                <span className="tabular-nums">{`${reading.systolic}/${reading.diastolic} mmHg`}</span>
                            </div>
                            <div className="flex justify-between text-lg">
                                <span className="text-subtle">Última medición</span>
                                <span>{formatRelative(reading.measured_at)}</span>
                            </div>
                            <p className="mt-1 flex items-center gap-2 text-sm text-subtle">
                                <Info className="h-4 w-4 text-primary" aria-hidden="true" />
                                Se enviarán automáticamente con tu solicitud
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-lg text-subtle">Sin lecturas registradas</p>
                            <p className="flex items-center gap-2 text-sm text-subtle">
                                <Info className="h-4 w-4 text-primary" aria-hidden="true" />
                                Tu solicitud se enviará sin lectura
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>

            {step === "form" ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Consulta rápida</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={toReview} noValidate className="flex flex-col gap-4">
                            {noDoctor ? (
                                <p className="rounded-field bg-warning-soft px-3 py-2 text-sm text-warning">
                                    Aún no tienes un médico asignado. Cuando te vinculen con uno podrás escribirle aquí.
                                </p>
                            ) : recipients && recipients.length > 1 ? (
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="help-physician" className="text-sm font-medium">
                                        Enviar a
                                    </label>
                                    <select
                                        id="help-physician"
                                        value={fields.physicianId}
                                        onChange={(event) => set("physicianId", event.target.value)}
                                        className={selectClass}
                                    >
                                        {recipients.map((entry) => (
                                            <option key={entry.id} value={entry.id}>
                                                {entry.full_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : recipient ? (
                                <p className="text-sm text-subtle">{`Para: ${recipient.full_name}`}</p>
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="help-reason" className="text-sm font-medium">
                                        Motivo
                                    </label>
                                    <select
                                        id="help-reason"
                                        value={fields.reason}
                                        onChange={(event) => set("reason", event.target.value as ConsultationReason | "")}
                                        className={selectClass}
                                    >
                                        <option value="">Elige una opción</option>
                                        {REASONS.map((entry) => (
                                            <option key={entry.id} value={entry.id}>
                                                {entry.label}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.reason ? (
                                        <p role="alert" className="text-sm text-critical">
                                            {errors.reason}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="help-onset" className="text-sm font-medium">
                                        Desde cuándo
                                    </label>
                                    <select
                                        id="help-onset"
                                        value={fields.onset}
                                        onChange={(event) => set("onset", event.target.value as ConsultationOnset | "")}
                                        className={selectClass}
                                    >
                                        <option value="">Elige una opción</option>
                                        {ONSETS.map((entry) => (
                                            <option key={entry.id} value={entry.id}>
                                                {entry.label}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.onset ? (
                                        <p role="alert" className="text-sm text-critical">
                                            {errors.onset}
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            {fields.reason === "chest_pain_or_breathing" ? (
                                <div data-testid="emergency-warning" className="flex flex-col gap-2 rounded-field border border-critical/30 bg-critical-soft p-3">
                                    <p className="text-sm font-medium text-critical">
                                        Esto puede ser una emergencia. Llama ahora; no esperes la respuesta de un mensaje.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {EMERGENCY_NUMBERS.map(({ number, href }) => (
                                            <a key={number} href={href} className="rounded-field bg-critical px-3 py-2 text-sm font-medium text-primary-foreground">
                                                {`Llamar al ${number}`}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <div className="flex flex-col gap-2">
                                <textarea
                                    aria-label="Consulta rápida"
                                    rows={4}
                                    maxLength={MESSAGE_MAX}
                                    value={fields.message}
                                    placeholder="Ej: 'Tengo mareos desde ayer con presión 150/95'"
                                    onChange={(event) => set("message", event.target.value)}
                                    className="w-full resize-y rounded-field border border-border bg-background px-4 py-3 text-base placeholder:text-subtle/60"
                                />
                                <span className="self-end text-xs text-subtle">{`${fields.message.length}/${MESSAGE_MAX}`}</span>
                                {errors.message ? (
                                    <p role="alert" className="text-sm text-critical">
                                        {errors.message}
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex flex-col gap-2">
                                <label htmlFor="help-medications" className="text-sm font-medium">
                                    Medicamentos que tomas (opcional)
                                </label>
                                <input
                                    id="help-medications"
                                    type="text"
                                    maxLength={500}
                                    value={fields.medications}
                                    placeholder="Ej: Losartán 50 mg"
                                    onChange={(event) => set("medications", event.target.value)}
                                    className="h-12 w-full rounded-field border border-border bg-background px-4 text-base placeholder:text-subtle/60"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label htmlFor="help-attention" className="text-sm font-medium">
                                    Atención
                                </label>
                                <select
                                    id="help-attention"
                                    value={fields.wantsMeet ? "meet" : "comments"}
                                    onChange={(event) => set("wantsMeet", event.target.value === "meet")}
                                    className={selectClass}
                                >
                                    <option value="comments">Atención por comentarios</option>
                                    <option value="meet">Atención por Meet</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="flex items-center gap-3 text-base">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 rounded border-border accent-primary"
                                        checked={fields.sharePhone}
                                        disabled={!phone}
                                        onChange={(event) => set("sharePhone", event.target.checked)}
                                    />
                                    Compartir mi teléfono con el médico
                                </label>
                                {!phone ? <p className="pl-8 text-xs text-subtle">Agrega tu teléfono en tu perfil para poder compartirlo.</p> : null}
                            </div>

                            <Button type="submit" variant="primary" disabled={noDoctor || recipients === null}>
                                Revisar y enviar
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            ) : (
                <Card data-testid="consultation-review">
                    <CardHeader>
                        <CardTitle className="text-xl">Revisa lo que se enviará</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <dl className="flex flex-col gap-3 text-base">
                            <ReviewRow label="Para">{recipient?.full_name ?? ""}</ReviewRow>
                            <ReviewRow label="Motivo">{reasonLabel(fields.reason || null) ?? ""}</ReviewRow>
                            <ReviewRow label="Desde cuándo">{onsetLabel(fields.onset || null) ?? ""}</ReviewRow>
                            <ReviewRow label="Descripción">{fields.message.trim()}</ReviewRow>
                            <ReviewRow label="Medicamentos" testId="review-medications">
                                {fields.medications.trim() || <span className="text-subtle">No indicaste</span>}
                            </ReviewRow>
                            <ReviewRow label="Atención" testId="review-attention">
                                {fields.wantsMeet ? "Atención por Meet" : "Atención por comentarios"}
                            </ReviewRow>
                            <ReviewRow label="Tu teléfono" testId="review-phone">
                                {fields.sharePhone && phone ? phone : <span className="text-subtle">No se comparte</span>}
                            </ReviewRow>
                            <ReviewRow label="Lectura adjunta" testId="review-reading">
                                {reading ? `${reading.systolic}/${reading.diastolic} mmHg, ${formatRelative(reading.measured_at).toLowerCase()}` : <span className="text-subtle">Sin lectura</span>}
                            </ReviewRow>
                        </dl>
                        <p className="text-base font-medium">¿Quieres agregar o modificar algo antes de enviar?</p>
                        {sendError ? (
                            <p role="alert" className="text-sm text-critical">
                                {sendError}
                            </p>
                        ) : null}
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button variant="outline" className="flex-1" onClick={() => setStep("form")} disabled={busy}>
                                Agregar o modificar
                            </Button>
                            <Button variant="primary" className="flex-1" onClick={send} loading={busy}>
                                Enviar al médico
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <section className="flex flex-col gap-3">
                <h3 className="px-1 text-lg">Últimas consultas</h3>
                {listFailed ? (
                    <p className="text-sm text-critical">No se pudieron cargar tus consultas.</p>
                ) : consultations === null ? (
                    <p className="text-sm text-subtle">Cargando consultas...</p>
                ) : consultations.length === 0 ? (
                    <p className="rounded-card border border-dashed border-border p-5 text-center text-sm text-subtle">
                        Aún no has enviado consultas.
                    </p>
                ) : (
                    <ul aria-label="Últimas consultas" className="flex flex-col gap-3">
                        {consultations.map((item) => {
                            const answered = item.status === "completed" && Boolean(item.response);
                            return (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => setOpenConsultation(item)}
                                        className="flex w-full flex-col gap-1 rounded-card border border-border/70 bg-background p-4 text-left transition-colors hover:bg-surface"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-base">
                                                <span className="text-subtle">{dayMonth(item.created_at)}: </span>
                                                <span>{item.message}</span>
                                            </p>
                                            <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                                            <Badge tone={item.wants_meet ? "elevated" : "neutral"}>{attentionLabel(item.wants_meet)}</Badge>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                                            <span>{`Para ${item.physician_name}`}</span>
                                            {reasonLabel(item.reason) ? <span>{reasonLabel(item.reason)}</span> : null}
                                            <span>{formatRelative(item.created_at)}</span>
                                        </div>
                                        {item.reading ? (
                                            <p className="text-xs text-subtle">{`Con tu lectura de ${item.reading.systolic}/${item.reading.diastolic} mmHg`}</p>
                                        ) : null}
                                        {answered ? <p className="text-sm text-subtle">Ver la indicación de tu médico</p> : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
            {openConsultation ? <ConsultationDialog item={openConsultation} onClose={() => setOpenConsultation(null)} /> : null}
        </div>
    );
}
