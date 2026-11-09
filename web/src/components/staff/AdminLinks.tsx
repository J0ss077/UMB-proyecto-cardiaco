// @requirement RF-02
import { useCallback, useEffect, useState } from "react";
import {
    ApiError,
    assignPhysician,
    authorizeCaregiver,
    listLinks,
    removePhysician,
    revokeCaregiver,
    updateCaregiverScope,
} from "../../api";
import { fetchAllAccounts } from "../../lib/accounts";
import { formatShortDateTime } from "../../lib/format";
import type { Account, CaregiverLink, LinkDirectory } from "../../types";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { useToast } from "../ui/Toast";

type Scope = CaregiverLink["authorized_scope"];

const selectClass = "h-11 rounded-field border border-border bg-background px-3";

export function AdminLinks() {
    const toast = useToast();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [links, setLinks] = useState<LinkDirectory | null>(null);
    const [failed, setFailed] = useState(false);
    const [patientId, setPatientId] = useState("");
    const [physicianId, setPhysicianId] = useState("");
    const [caregiverId, setCaregiverId] = useState("");
    const [scope, setScope] = useState<Scope>("readings");
    const [busy, setBusy] = useState(false);
    // The link waiting for a second click before it is removed or revoked.
    const [confirming, setConfirming] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const [people, directory] = await Promise.all([fetchAllAccounts(), listLinks()]);
        setAccounts(people.filter((account) => account.active));
        setLinks(directory);
    }, []);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchAllAccounts(), listLinks()])
            .then(([people, directory]) => {
                if (cancelled) return;
                setAccounts(people.filter((account) => account.active));
                setLinks(directory);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const patients = accounts.filter((account) => account.role === "patient");
    const physicians = accounts.filter((account) => account.role === "physician");
    const caregivers = accounts.filter((account) => account.role === "caregiver");

    // Runs one change, reloads both lists and reports the outcome with the server's own message.
    async function run(action: () => Promise<unknown>, success: string, failure: string, after?: () => void) {
        setBusy(true);
        try {
            await action();
            after?.();
            await reload();
            toast.success(success);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : failure);
        } finally {
            setBusy(false);
            setConfirming(null);
        }
    }

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudieron cargar los vínculos.
            </p>
        );
    }
    if (!links) return <p className="text-subtle">Cargando vínculos...</p>;

    return (
        <section className="flex flex-col gap-6" aria-labelledby="links-heading">
            <div className="flex flex-col gap-2">
                <h2 id="links-heading" className="text-2xl font-medium">
                    Vínculos
                </h2>
                <p className="max-w-2xl text-sm text-subtle">
                    Asignas médicos y autorizas cuidadores. El alcance de lecturas abre cifras, síntomas y alertas. El mínimo solo deja el acompañamiento. Aquí no se ven las cifras.
                </p>
            </div>
            <Card>
                <CardContent className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                        Paciente
                        <select aria-label="Paciente del vínculo" value={patientId} onChange={(event) => setPatientId(event.target.value)} className={selectClass}>
                            <option value="">Elige un paciente</option>
                            {patients.map((account) => (
                                <option key={account.id} value={account.id}>
                                    {`${account.full_name} · ${account.email}`}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                            <label className="flex flex-col gap-1 text-sm">
                                Médico
                                <select aria-label="Médico a asignar" value={physicianId} onChange={(event) => setPhysicianId(event.target.value)} className={selectClass}>
                                    <option value="">Elige un médico</option>
                                    {physicians.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {account.full_name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <Button
                                size="sm"
                                loading={busy}
                                disabled={!patientId || !physicianId}
                                onClick={() =>
                                    void run(() => assignPhysician(patientId, physicianId), "Médico asignado.", "No se pudo asignar el médico", () => setPhysicianId(""))
                                }
                            >
                                Asignar médico
                            </Button>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="flex flex-col gap-1 text-sm">
                                Cuidador
                                <select aria-label="Cuidador a autorizar" value={caregiverId} onChange={(event) => setCaregiverId(event.target.value)} className={selectClass}>
                                    <option value="">Elige un cuidador</option>
                                    {caregivers.map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {account.full_name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 text-sm">
                                Alcance
                                <select aria-label="Alcance del cuidador" value={scope} onChange={(event) => setScope(event.target.value as Scope)} className={selectClass}>
                                    <option value="readings">Lecturas</option>
                                    <option value="minimal">Mínimo</option>
                                </select>
                            </label>
                            <Button
                                size="sm"
                                loading={busy}
                                disabled={!patientId || !caregiverId}
                                onClick={() =>
                                    void run(
                                        () => authorizeCaregiver(patientId, caregiverId, scope),
                                        "Cuidador autorizado.",
                                        "No se pudo autorizar al cuidador",
                                        () => setCaregiverId(""),
                                    )
                                }
                            >
                                Autorizar cuidador
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <h3 className="font-medium">Médicos asignados</h3>
                    {links.physicians.length === 0 ? <p className="text-sm text-subtle">No hay médicos asignados.</p> : null}
                    <ul aria-label="Médicos asignados" className="flex flex-col gap-2">
                        {links.physicians.map((link) => {
                            const key = `physician:${link.patient_user_id}:${link.physician_user_id}`;
                            return (
                                <li key={key} className="flex flex-col gap-2 rounded-card border border-border/70 p-3 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <span>
                                            <span className="font-medium">{link.patient_name}</span>
                                            {` · ${link.physician_name}`}
                                            <span className="block text-subtle">{formatShortDateTime(link.assigned_at)}</span>
                                        </span>
                                        {confirming === key ? null : (
                                            <Button size="sm" variant="outline" onClick={() => setConfirming(key)}>
                                                Quitar
                                            </Button>
                                        )}
                                    </div>
                                    {confirming === key ? (
                                        <div className="flex flex-col gap-2 rounded-field bg-critical-soft p-3">
                                            <p className="text-critical">{`${link.physician_name} dejará de ver las lecturas de ${link.patient_name}.`}</p>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    loading={busy}
                                                    onClick={() =>
                                                        void run(
                                                            () => removePhysician(link.patient_user_id, link.physician_user_id),
                                                            "Asignación quitada.",
                                                            "No se pudo quitar la asignación",
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
                            );
                        })}
                    </ul>
                </div>
                <div className="flex flex-col gap-2">
                    <h3 className="font-medium">Cuidadores autorizados</h3>
                    {links.caregivers.length === 0 ? <p className="text-sm text-subtle">No hay cuidadores autorizados.</p> : null}
                    <ul aria-label="Cuidadores autorizados" className="flex flex-col gap-2">
                        {links.caregivers.map((link) => {
                            const key = `caregiver:${link.id}`;
                            return (
                                <li key={link.id} className="flex flex-col gap-2 rounded-card border border-border/70 p-3 text-sm">
                                    <span>
                                        <span className="font-medium">{link.patient_name}</span>
                                        {` · ${link.caregiver_name}`}
                                    </span>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            aria-label={`Alcance de ${link.caregiver_name}`}
                                            value={link.authorized_scope}
                                            disabled={busy}
                                            onChange={(event) =>
                                                void run(
                                                    () => updateCaregiverScope(link.id, event.target.value as Scope),
                                                    "Alcance actualizado.",
                                                    "No se pudo cambiar el alcance",
                                                )
                                            }
                                            className="h-9 rounded-field border border-border bg-background px-2"
                                        >
                                            <option value="readings">Lecturas</option>
                                            <option value="minimal">Mínimo</option>
                                        </select>
                                        {confirming === key ? null : (
                                            <Button size="sm" variant="outline" onClick={() => setConfirming(key)}>
                                                Revocar
                                            </Button>
                                        )}
                                    </div>
                                    {confirming === key ? (
                                        <div className="flex flex-col gap-2 rounded-field bg-critical-soft p-3">
                                            <p className="text-critical">{`${link.caregiver_name} dejará de ver los datos de ${link.patient_name}.`}</p>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    loading={busy}
                                                    onClick={() => void run(() => revokeCaregiver(link.id), "Autorización revocada.", "No se pudo revocar la autorización")}
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
                            );
                        })}
                    </ul>
                </div>
            </div>
        </section>
    );
}
