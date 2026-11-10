// @requirement RF-02
import { useCallback, useEffect, useId, useState } from "react";
import {
    ApiError,
    authorizePatientCaregiver,
    changePatientCaregiverScope,
    listPatientCaregivers,
    revokePatientCaregiver,
} from "../api";
import { CAREGIVER_SCOPE_OPTIONS } from "../lib/caregivers";
import { formatShortDateTime } from "../lib/format";
import type { CaregiverScope, PatientCaregiver } from "../types";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Input } from "./ui/Input";
import { useToast } from "./ui/Toast";

const selectClass = "h-11 rounded-field border border-border bg-background px-3";

// The linked physician authorizes, changes the scope and revokes the caregiver.
// The patient sees the same list without these controls (ADR 0012).
export function CaregiverAccessPanel({ patientId, patientName }: { patientId: string; patientName: string }) {
    const toast = useToast();
    const titleId = useId();
    const [links, setLinks] = useState<PatientCaregiver[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [email, setEmail] = useState("");
    const [scope, setScope] = useState<CaregiverScope>("readings");
    const [busy, setBusy] = useState(false);
    // The link waiting for a second click before it is revoked.
    const [confirming, setConfirming] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const page = await listPatientCaregivers(patientId);
        setLinks(page.items);
    }, [patientId]);

    useEffect(() => {
        let cancelled = false;
        listPatientCaregivers(patientId)
            .then((page) => {
                if (!cancelled) setLinks(page.items);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [patientId]);

    // Runs one change, reloads the list and reports the outcome with the server's own message.
    async function run(action: () => Promise<unknown>, success: string, failure: string, after?: () => void) {
        setBusy(true);
        try {
            await action();
            after?.();
            await reload();
            toast.success(success);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : failure);
            // The list may be stale after a refused change; read it again.
            await reload().catch(() => setFailed(true));
        } finally {
            setBusy(false);
            setConfirming(null);
        }
    }

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudieron cargar los cuidadores.
            </p>
        );
    }

    return (
        <Card>
            <section aria-labelledby={titleId}>
                <CardHeader>
                    <CardTitle id={titleId}>Cuidadores autorizados</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <p className="text-sm text-subtle">
                        Tú autorizas, cambias el alcance y revocas el acceso del cuidador de este paciente. El alcance
                        de lecturas abre cifras, síntomas y alertas; el mínimo solo deja el acompañamiento.
                    </p>

                    <div className="flex flex-wrap items-end gap-3">
                        <Input
                            wrapperClassName="min-w-56 flex-1"
                            label="Correo del cuidador"
                            type="email"
                            autoComplete="email"
                            value={email}
                            disabled={busy}
                            onChange={(event) => setEmail(event.target.value)}
                        />
                        <label className="flex flex-col gap-1 text-sm">
                            Alcance
                            <select
                                aria-label="Alcance del nuevo cuidador"
                                value={scope}
                                disabled={busy}
                                onChange={(event) => setScope(event.target.value as CaregiverScope)}
                                className={selectClass}
                            >
                                {CAREGIVER_SCOPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Button
                            size="sm"
                            loading={busy}
                            disabled={email.trim() === ""}
                            onClick={() =>
                                void run(
                                    () => authorizePatientCaregiver(patientId, email.trim(), scope),
                                    "Cuidador autorizado.",
                                    "No se pudo autorizar al cuidador",
                                    () => setEmail(""),
                                )
                            }
                        >
                            Autorizar cuidador
                        </Button>
                    </div>

                    {links === null ? (
                        <p className="text-subtle">Cargando cuidadores...</p>
                    ) : links.length === 0 ? (
                        <p className="text-sm text-subtle">
                            Aquí autorizas a los cuidadores que acompañan a este paciente; tú fijas su alcance y puedes
                            revocarlo.
                        </p>
                    ) : (
                        <ul aria-label="Cuidadores del paciente" className="flex flex-col gap-2">
                            {links.map((link) => (
                                <li key={link.id} className="flex flex-col gap-2 rounded-card border border-border/70 p-3 text-sm">
                                    <span>
                                        <span className="block font-medium">{link.caregiver_name}</span>
                                        <span className="block text-subtle">{link.caregiver_email}</span>
                                        <span className="block text-subtle">{formatShortDateTime(link.created_at)}</span>
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            aria-label={`Alcance de ${link.caregiver_name}`}
                                            value={link.authorized_scope}
                                            disabled={busy}
                                            onChange={(event) =>
                                                void run(
                                                    () => changePatientCaregiverScope(patientId, link.id, event.target.value as CaregiverScope),
                                                    "Alcance actualizado.",
                                                    "No se pudo cambiar el alcance",
                                                )
                                            }
                                            className="h-9 rounded-field border border-border bg-background px-2"
                                        >
                                            {CAREGIVER_SCOPE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                        {confirming === link.id ? null : (
                                            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(link.id)}>
                                                Revocar
                                            </Button>
                                        )}
                                    </div>
                                    {confirming === link.id ? (
                                        <div className="flex flex-col gap-2 rounded-field bg-critical-soft p-3">
                                            <p className="text-critical">{`${link.caregiver_name} dejará de ver los datos de ${patientName}.`}</p>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    loading={busy}
                                                    onClick={() =>
                                                        void run(
                                                            () => revokePatientCaregiver(patientId, link.id),
                                                            "Autorización revocada.",
                                                            "No se pudo revocar la autorización",
                                                        )
                                                    }
                                                >
                                                    Confirmar
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                                                    Cancelar
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-xs text-subtle">
                        El cuidador deja de ver los datos del paciente en la petición siguiente a la revocación.
                    </p>
                </CardContent>
            </section>
        </Card>
    );
}
