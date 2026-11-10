// @requirement RF-02
// @requirement RF-19
// @requirement RF-21
import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, getReadingsSummary, listConsultations, listReadings, listSymptoms } from "../api";
import { classifyReading } from "../lib/clinical";
import { ageFromBirthDate, formatShortDateTime } from "../lib/format";
import type { Consultation, Patient, Reading, ReadingsSummary, Symptom } from "../types";
import { CaregiverAccessPanel } from "./CaregiverAccessPanel";
import { ConsultationsPanel } from "./ConsultationsPanel";
import { ExportDialog } from "./ExportDialog";
import { ReadingsTrend } from "./ReadingsTrend";
import { SymptomHistory } from "./SymptomHistory";
import { CategoryBadge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

interface Detail {
    readings: Reading[] | null;
    symptoms: Symptom[] | null;
    summary: ReadingsSummary | null;
    summaryNote: string | null;
    consultations: Consultation[] | null;
}

export function PatientDetail({
    patient,
    onClose,
    showConsultations = true,
    allowExport = false,
    manageCaregivers = false,
}: {
    patient: Patient;
    onClose: () => void;
    showConsultations?: boolean;
    allowExport?: boolean;
    // Only the linked physician authorizes and revokes caregivers (ADR 0012).
    manageCaregivers?: boolean;
}) {
    const [detail, setDetail] = useState<Detail | null>(null);
    const [exportOpen, setExportOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setDetail(null);
        async function load() {
            const [readings, symptoms, summary, consultations] = await Promise.allSettled([
                listReadings({ patient_id: patient.user_id, limit: 60 }),
                listSymptoms({ patient_id: patient.user_id, limit: 10 }),
                getReadingsSummary(patient.user_id),
                showConsultations
                    ? listConsultations({ patient_id: patient.user_id, limit: 10 })
                    : Promise.resolve({ items: [] as Consultation[], total: 0 }),
            ]);
            if (cancelled) return;
            setDetail({
                readings: readings.status === "fulfilled" ? readings.value.items : null,
                symptoms: symptoms.status === "fulfilled" ? symptoms.value.items : null,
                summary: summary.status === "fulfilled" ? summary.value : null,
                consultations: consultations.status === "fulfilled" ? consultations.value.items : null,
                summaryNote:
                    summary.status === "rejected"
                        ? summary.reason instanceof ApiError && summary.reason.consentRequired
                            ? "El paciente está sin consentimiento vigente; no hay resumen."
                            : "Resumen no disponible."
                        : null,
            });
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [patient.user_id, showConsultations]);

    const latest = detail?.readings?.[0];

    return (
        <section data-testid="patient-detail" aria-label={`Detalle de ${patient.full_name}`} className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
                <Button variant="outline" size="sm" onClick={onClose} aria-label="Volver a la lista">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Volver
                </Button>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xl font-medium">{patient.full_name}</h3>
                    <p className="text-sm text-subtle">
                        {patient.birth_date ? `${ageFromBirthDate(patient.birth_date)} años` : "Edad no registrada"}
                    </p>
                </div>
                {latest ? <CategoryBadge category={classifyReading(latest.systolic, latest.diastolic)} /> : null}
            </div>
            {allowExport ? (
                <div>
                    <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Descargar historial
                    </Button>
                </div>
            ) : null}

            {detail === null ? (
                <p className="py-8 text-center text-subtle">Cargando paciente...</p>
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Tendencia</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {detail.readings ? (
                                <ReadingsTrend readings={detail.readings} height={224} />
                            ) : (
                                <p role="alert" className="text-sm text-critical">No se pudieron cargar las lecturas.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Resumen de 7 días</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {detail.summary ? (
                                detail.summary.sufficient ? (
                                    <div className="flex flex-col gap-1">
                                        <p className="text-2xl font-semibold tabular-nums">
                                            <span>{detail.summary.mean_systolic}/{detail.summary.mean_diastolic}</span>{" "}
                                            <span className="text-sm font-normal text-subtle">mmHg</span>
                                        </p>
                                        <p className="text-xs text-subtle">
                                            {detail.summary.valid_count} lecturas válidas en {detail.summary.days_with_readings} días.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-subtle">Datos insuficientes para un promedio.</p>
                                )
                            ) : (
                                <p className="text-sm text-subtle">{detail.summaryNote}</p>
                            )}
                        </CardContent>
                    </Card>

                    {latest ? (
                        <p className="text-xs text-subtle">
                            Última lectura: {latest.systolic}/{latest.diastolic} mmHg, {formatShortDateTime(latest.measured_at)}.
                        </p>
                    ) : null}

                    {showConsultations ? <ConsultationsPanel initial={detail.consultations} /> : null}

                    {manageCaregivers ? (
                        <CaregiverAccessPanel patientId={patient.user_id} patientName={patient.full_name} />
                    ) : null}

                    <div className="flex flex-col gap-2">
                        <h4 className="px-1 text-base font-medium">Síntomas recientes</h4>
                        {detail.symptoms ? (
                            <SymptomHistory symptoms={detail.symptoms} emptyMessage="El paciente no tiene síntomas registrados." />
                        ) : (
                            <p className="text-sm text-subtle">No se pudieron cargar los síntomas.</p>
                        )}
                    </div>
                </>
            )}
            {exportOpen ? (
                <ExportDialog
                    onClose={() => setExportOpen(false)}
                    patientId={patient.user_id}
                    subject={{ full_name: patient.full_name, birth_date: patient.birth_date }}
                />
            ) : null}
        </section>
    );
}
