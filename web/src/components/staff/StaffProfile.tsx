// @requirement RF-01
import { Pencil, Save } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError, getStaffProfile, listAlerts, listConsultations, listPatients, updateStaffProfile } from "../../api";
import { cn } from "../../lib/cn";
import { fetchAllAccounts } from "../../lib/accounts";
import { ROLE_LABEL } from "../../lib/staff";
import type { Patient, StaffProfile as StaffProfileData, StaffProfileUpdate } from "../../types";
import { AvatarPicker } from "../AvatarPicker";
import type { PhotoRenderer } from "../../lib/photoRenderer";
import { PasswordChangeCard } from "./PasswordChangeCard";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";

type StaffRole = StaffProfileData["role"];

const COPY: Record<StaffRole, string> = {
    physician: "Ves a tus pacientes, sus lecturas y sus consultas. Las alertas solo se cierran cuando tú acusas recibo, las validas o las descartas.",
    caregiver: "Acompañas a los pacientes cuyo médico tratante te autorizó. Con alcance de lecturas ves sus cifras y sus alertas. No las cierras y no respondes consultas.",
    admin: "Gestionas cuentas, vínculos, destinatarios de alerta y el rastro. Esta sesión no abre lecturas, síntomas ni alertas clínicas.",
};

interface Draft {
    full_name: string;
    phone: string;
    license_number: string;
    specialty: string;
}

const draftFrom = (p: StaffProfileData): Draft => ({
    full_name: p.full_name,
    phone: p.phone ?? "",
    license_number: p.license_number ?? "",
    specialty: p.specialty ?? "",
});

// Only the fields that differ from the saved profile; "" becomes null, which clears it.
function changesBetween(p: StaffProfileData, d: Draft): StaffProfileUpdate {
    const changes: StaffProfileUpdate = {};
    if (d.full_name.trim() !== p.full_name) changes.full_name = d.full_name.trim();
    const optional = (key: "phone" | "license_number" | "specialty", value: string) => {
        const next = value.trim() === "" ? null : value.trim();
        if (next !== p[key]) changes[key] = next;
    };
    optional("phone", d.phone);
    if (p.role === "physician") {
        optional("license_number", d.license_number);
        optional("specialty", d.specialty);
    }
    return changes;
}

const NONE = <span className="text-subtle">No registrado</span>;

function Field({ label, children, editable = false }: { label: string; children: ReactNode; editable?: boolean }) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm text-subtle">{label}</span>
            <div className={cn("flex min-h-12 items-center justify-between gap-2 rounded-field border border-border/70 bg-surface px-4 text-base")}>
                <span className="min-w-0 truncate">{children}</span>
                {editable ? <Pencil className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" /> : null}
            </div>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number | null }) {
    return (
        <div className="rounded-card border border-border/70 p-3 sm:p-4">
            <p className="text-sm text-subtle">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value ?? "-"}</p>
        </div>
    );
}

function PhysicianSummary() {
    const [stats, setStats] = useState<{ patients: number; consultations: number; alerts: number } | null | "failed">(null);
    useEffect(() => {
        let cancelled = false;
        Promise.all([
            listPatients({ limit: 1 }),
            listConsultations({ status: "in_review", limit: 1 }),
            listConsultations({ status: "pending", limit: 1 }),
            listAlerts({ status: "open", severity: "critical", limit: 1 }),
        ])
            .then(([patients, inReview, pending, alerts]) => {
                // Same definition as the navigation badge: waiting for the physician is in review plus pending.
                if (!cancelled) setStats({ patients: patients.total, consultations: inReview.total + pending.total, alerts: alerts.total });
            })
            .catch(() => {
                if (!cancelled) setStats("failed");
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return (
        <Card>
            <CardHeader>
                <CardTitle>Tu consulta</CardTitle>
            </CardHeader>
            <CardContent>
                {stats === "failed" ? (
                    <p role="alert" className="text-sm text-critical">No se pudo cargar el resumen.</p>
                ) : (
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <Stat label="Pacientes asignados" value={stats ? stats.patients : null} />
                        <Stat label="Consultas por atender" value={stats ? stats.consultations : null} />
                        <Stat label="Alertas críticas abiertas" value={stats ? stats.alerts : null} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function CaregiverSummary() {
    const [patients, setPatients] = useState<Patient[] | null | "failed">(null);
    useEffect(() => {
        let cancelled = false;
        listPatients({ limit: 200 })
            .then((page) => {
                if (!cancelled) setPatients(page.items);
            })
            .catch(() => {
                if (!cancelled) setPatients("failed");
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return (
        <Card>
            <CardHeader>
                <CardTitle>Personas a tu cargo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {patients === "failed" ? (
                    <p role="alert" className="text-sm text-critical">No se pudo cargar la lista.</p>
                ) : patients === null ? (
                    <p className="text-sm text-subtle">Cargando...</p>
                ) : patients.length === 0 ? (
                    <p className="text-sm text-subtle">Todavía ningún médico te autorizó a acompañar a un paciente.</p>
                ) : (
                    <ul className="flex flex-col gap-1 text-base">
                        {patients.map((patient) => (
                            <li key={patient.user_id}>{patient.full_name}</li>
                        ))}
                    </ul>
                )}
                <p className="text-sm text-subtle">El alcance de cada vínculo lo decide el médico tratante y puede cambiarlo cuando quiera.</p>
            </CardContent>
        </Card>
    );
}

function AdminSummary() {
    const [stats, setStats] = useState<{ total: number; active: number; sessions: number } | null | "failed">(null);
    useEffect(() => {
        let cancelled = false;
        fetchAllAccounts()
            .then((accounts) => {
                if (cancelled) return;
                setStats({
                    total: accounts.length,
                    active: accounts.filter((a) => a.active).length,
                    sessions: accounts.reduce((sum, a) => sum + a.active_sessions, 0),
                });
            })
            .catch(() => {
                if (!cancelled) setStats("failed");
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return (
        <Card>
            <CardHeader>
                <CardTitle>La plataforma</CardTitle>
            </CardHeader>
            <CardContent>
                {stats === "failed" ? (
                    <p role="alert" className="text-sm text-critical">No se pudo cargar el resumen.</p>
                ) : (
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <Stat label="Cuentas" value={stats ? stats.total : null} />
                        <Stat label="Cuentas activas" value={stats ? stats.active : null} />
                        <Stat label="Sesiones abiertas" value={stats ? stats.sessions : null} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function StaffProfile({
    role,
    onProfileChange,
    photoRenderer,
    onPasswordChangedNow,
}: {
    role: StaffRole;
    // The administrator's own password change is immediate and closes the sessions.
    onPasswordChangedNow?: () => void;
    // Called with the profile after it loads and after every save, so the header can follow.
    onProfileChange?: (profile: StaffProfileData) => void;
    photoRenderer?: PhotoRenderer;
}) {
    const toast = useToast();
    const [profile, setProfile] = useState<StaffProfileData | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [photoBusy, setPhotoBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        getStaffProfile()
            .then((loaded) => {
                if (cancelled) return;
                setProfile(loaded);
                onProfileChange?.(loaded);
            })
            .catch(() => {
                if (!cancelled) setLoadFailed(true);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const editing = draft !== null;
    const dirty = profile !== null && draft !== null && Object.keys(changesBetween(profile, draft)).length > 0;
    const set = <K extends keyof Draft>(key: K, value: string) =>
        setDraft((current) => (current ? { ...current, [key]: value } : current));

    async function save() {
        if (!profile || !draft) return;
        if (draft.full_name.trim() === "") {
            setNameError("El nombre no puede quedar vacío");
            return;
        }
        setNameError(null);
        setSaving(true);
        try {
            const saved = await updateStaffProfile(changesBetween(profile, draft));
            setProfile(saved);
            onProfileChange?.(saved);
            toast.success("Perfil actualizado.");
            setDraft(null);
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo guardar el perfil");
        } finally {
            setSaving(false);
        }
    }

    async function savePhoto(avatar: string | null) {
        setPhotoBusy(true);
        try {
            const saved = await updateStaffProfile({ avatar });
            setProfile(saved);
            onProfileChange?.(saved);
            toast.success(avatar ? "Foto actualizada." : "Foto eliminada.");
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo guardar la foto");
        } finally {
            setPhotoBusy(false);
        }
    }

    return (
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-4" aria-labelledby="staff-profile-heading">
            <h2 id="staff-profile-heading" className="text-2xl font-medium">
                Perfil
            </h2>
            <Card>
                <CardContent className="flex flex-col gap-6">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <AvatarPicker
                            fullName={profile?.full_name ?? ""}
                            avatar={profile?.avatar ?? null}
                            busy={photoBusy || !profile}
                            onChange={savePhoto}
                            renderer={photoRenderer}
                        />
                        {profile ? (
                            <div>
                                <p className="text-xl font-medium">{profile.full_name}</p>
                                <p className="text-sm text-subtle">{ROLE_LABEL[role]}</p>
                            </div>
                        ) : loadFailed ? (
                            <p role="alert" className="text-sm text-critical">
                                No se pudieron cargar tus datos.
                            </p>
                        ) : (
                            <p className="text-subtle">Cargando perfil...</p>
                        )}
                        <p className="max-w-2xl text-base leading-relaxed">{COPY[role]}</p>
                    </div>

                    {profile ? (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {draft ? (
                                    <Input
                                        wrapperClassName="sm:col-span-2"
                                        label="Nombre completo"
                                        value={draft.full_name}
                                        error={nameError}
                                        autoComplete="name"
                                        onChange={(event) => set("full_name", event.target.value)}
                                    />
                                ) : (
                                    <div className="sm:col-span-2">
                                        <Field label="Nombre completo" editable>
                                            {profile.full_name}
                                        </Field>
                                    </div>
                                )}
                                {draft ? (
                                    <Input label="Teléfono" type="tel" autoComplete="tel" value={draft.phone} onChange={(event) => set("phone", event.target.value)} />
                                ) : (
                                    <Field label="Teléfono" editable>
                                        {profile.phone ?? NONE}
                                    </Field>
                                )}
                                <Field label="Correo electrónico">{profile.email}</Field>
                                {role === "physician" ? (
                                    draft ? (
                                        <>
                                            <Input label="Registro profesional" value={draft.license_number} onChange={(event) => set("license_number", event.target.value)} />
                                            <Input label="Especialidad" value={draft.specialty} onChange={(event) => set("specialty", event.target.value)} />
                                        </>
                                    ) : (
                                        <>
                                            <Field label="Registro profesional" editable>
                                                {profile.license_number ?? NONE}
                                            </Field>
                                            <Field label="Especialidad" editable>
                                                {profile.specialty ?? NONE}
                                            </Field>
                                        </>
                                    )
                                ) : null}
                            </div>
                            <div className="flex flex-col gap-3">
                                <Button
                                    variant={editing ? "outline" : "primary"}
                                    onClick={() => {
                                        setNameError(null);
                                        setDraft(editing ? null : draftFrom(profile));
                                    }}
                                >
                                    <Pencil className="h-5 w-5" aria-hidden="true" />
                                    {editing ? "Cancelar edición" : "Editar perfil"}
                                </Button>
                                <Button variant={dirty ? "primary" : "outline"} disabled={!editing || !dirty} loading={saving} onClick={save}>
                                    <Save className="h-5 w-5" aria-hidden="true" />
                                    Guardar cambios
                                </Button>
                            </div>
                        </>
                    ) : null}
                </CardContent>
            </Card>
            <PasswordChangeCard role={role} onChangedNow={onPasswordChangedNow} />
            {role === "physician" ? <PhysicianSummary /> : role === "caregiver" ? <CaregiverSummary /> : <AdminSummary />}
        </section>
    );
}
