// @requirement RF-01
// @requirement RF-03
// @requirement RF-19
import { Activity, Camera, HeartPulse, Pencil, Phone, Save, ShieldOff, Trash2, Upload, User } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ApiError, getProfile, revokeConsent, updateProfile } from "../../api";
import { cn } from "../../lib/cn";
import { ageFromBirthDate, formatLongDate } from "../../lib/format";
import { canvasRenderer, type PhotoRenderer } from "../../lib/photoRenderer";
import type { Profile, ProfileUpdate, ReadingsSummary } from "../../types";
import { PhotoEditor } from "../PhotoEditor";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";

interface PatientProfileProps {
    summary: ReadingsSummary | null;
    onOpenData: () => void;
    onConsentRevoked: () => void;
    // Called with the profile after it loads and after every save, so the header can follow.
    onProfileChange?: (profile: Profile) => void;
    photoRenderer?: PhotoRenderer;
}

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

interface Draft {
    full_name: string;
    phone: string;
    trusted_contact_phone: string;
    trusted_contact_email: string;
    hasTrusted: boolean;
}

const draftFrom = (profile: Profile): Draft => ({
    full_name: profile.full_name,
    phone: profile.phone ?? "",
    trusted_contact_phone: profile.trusted_contact_phone ?? "",
    trusted_contact_email: profile.trusted_contact_email ?? "",
    hasTrusted: Boolean(profile.trusted_contact_phone || profile.trusted_contact_email),
});

// Only the fields that differ from the saved profile; "" becomes null, which clears it.
function changesBetween(profile: Profile, draft: Draft): ProfileUpdate {
    const changes: ProfileUpdate = {};
    if (draft.full_name.trim() !== profile.full_name) changes.full_name = draft.full_name.trim();
    const optional = (key: "phone" | "trusted_contact_phone" | "trusted_contact_email", value: string) => {
        const next = value.trim() === "" ? null : value.trim();
        if (next !== profile[key]) changes[key] = next;
    };
    optional("phone", draft.phone);
    optional("trusted_contact_phone", draft.hasTrusted ? draft.trusted_contact_phone : "");
    optional("trusted_contact_email", draft.hasTrusted ? draft.trusted_contact_email : "");
    return changes;
}

function Field({
    label,
    children,
    editable = false,
    locked = false,
}: {
    label: string;
    children: ReactNode;
    editable?: boolean;
    locked?: boolean;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm text-subtle">{label}</span>
            <div
                className={cn(
                    "flex min-h-12 items-center justify-between gap-2 rounded-field border border-border/70 px-4 text-base",
                    locked ? "bg-muted" : "bg-surface",
                )}
            >
                <span className="min-w-0 truncate">{children}</span>
                {editable ? <Pencil className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" /> : null}
            </div>
        </div>
    );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
    return (
        <h3 className="flex items-center gap-2 text-lg font-normal">
            {icon}
            {children}
        </h3>
    );
}

function initials(fullName: string): string {
    return fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const NONE = <span className="text-subtle">No registrado</span>;

export function PatientProfile({ summary, onOpenData, onConsentRevoked, onProfileChange, photoRenderer }: PatientProfileProps) {
    const toast = useToast();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [pickedFile, setPickedFile] = useState<File | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [photoBusy, setPhotoBusy] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        getProfile()
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
    }, []);

    const dirty = profile !== null && draft !== null && Object.keys(changesBetween(profile, draft)).length > 0;

    function startEditing() {
        if (!profile) return;
        setDraft(draftFrom(profile));
        setNameError(null);
        setEditing(true);
    }

    function stopEditing() {
        setEditing(false);
        setDraft(null);
        setNameError(null);
    }

    async function save() {
        if (!profile || !draft) return;
        if (draft.full_name.trim() === "") {
            setNameError("El nombre no puede quedar vacío");
            return;
        }
        setNameError(null);
        setSaving(true);
        try {
            const saved = await updateProfile(changesBetween(profile, draft));
            setProfile(saved);
            onProfileChange?.(saved);
            toast.success("Perfil actualizado.");
            stopEditing();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo guardar el perfil");
        } finally {
            setSaving(false);
        }
    }

    function onPhotoPicked(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!PHOTO_TYPES.includes(file.type)) {
            setPhotoError("Elige una imagen JPEG, PNG o WebP.");
            return;
        }
        if (file.size > PHOTO_MAX_BYTES) {
            setPhotoError("La imagen pesa más de 10 MB.");
            return;
        }
        setPhotoError(null);
        setPickedFile(file);
    }

    async function savePhoto(avatar: string | null) {
        setPhotoBusy(true);
        try {
            const saved = await updateProfile({ avatar });
            setProfile(saved);
            onProfileChange?.(saved);
            setPickedFile(null);
            toast.success(avatar ? "Foto actualizada." : "Foto eliminada.");
        } catch (error) {
            setPickedFile(null);
            toast.error(error instanceof ApiError ? error.message : "No se pudo guardar la foto");
        } finally {
            setPhotoBusy(false);
        }
    }

    async function revoke() {
        setRevoking(true);
        try {
            await revokeConsent();
            toast.success("Consentimiento revocado. Tu historial se conserva.");
            onConsentRevoked();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo revocar el consentimiento");
        } finally {
            setRevoking(false);
        }
    }

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((current) => (current ? { ...current, [key]: value } : current));

    const hasTrusted = editing && draft ? draft.hasTrusted : Boolean(profile?.trusted_contact_phone || profile?.trusted_contact_email);

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <Card>
                <CardContent className="flex flex-col gap-6">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <div className="relative">
                            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-muted bg-primary-soft text-3xl font-medium text-primary">
                                {profile?.avatar ? (
                                    <img src={profile.avatar} alt="Foto de perfil" className="h-full w-full object-cover" />
                                ) : profile ? (
                                    <span aria-hidden="true">{initials(profile.full_name)}</span>
                                ) : (
                                    <User className="h-10 w-10" aria-hidden="true" />
                                )}
                            </div>
                            {profile ? (
                                <>
                                    <button
                                        type="button"
                                        aria-label="Cambiar foto"
                                        aria-haspopup="menu"
                                        aria-expanded={menuOpen}
                                        disabled={photoBusy}
                                        onClick={() => setMenuOpen((open) => !open)}
                                        className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90"
                                    >
                                        <Camera className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    {menuOpen ? (
                                        <div role="menu" className="absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-card border border-border bg-background p-1 text-left shadow-lg">
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={() => {
                                                    setMenuOpen(false);
                                                    fileInput.current?.click();
                                                }}
                                                className="flex w-full items-center gap-2 rounded-field px-3 py-2 text-sm hover:bg-muted"
                                            >
                                                <Upload className="h-4 w-4" aria-hidden="true" />
                                                {profile.avatar ? "Cambiar foto" : "Subir foto"}
                                            </button>
                                            {profile.avatar ? (
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setMenuOpen(false);
                                                        void savePhoto(null);
                                                    }}
                                                    className="flex w-full items-center gap-2 rounded-field px-3 py-2 text-sm text-critical hover:bg-muted"
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    Quitar foto
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </>
                            ) : null}
                            <input
                                ref={fileInput}
                                data-testid="avatar-file-input"
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                tabIndex={-1}
                                className="hidden"
                                aria-label="Elegir archivo de foto"
                                onChange={onPhotoPicked}
                            />
                        </div>
                        {photoError ? (
                            <p role="alert" className="text-sm text-critical">
                                {photoError}
                            </p>
                        ) : null}
                        {profile ? (
                            <h2 className="text-2xl font-medium">{profile.full_name}</h2>
                        ) : loadFailed ? (
                            <p role="alert" className="text-sm text-critical">
                                No se pudieron cargar tus datos personales.
                            </p>
                        ) : (
                            <p className="text-subtle">Cargando perfil...</p>
                        )}
                    </div>

                    {profile ? (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                {editing && draft ? (
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
                                <Field label="Edad" locked>
                                    {profile.birth_date ? `${ageFromBirthDate(profile.birth_date)} años` : NONE}
                                </Field>
                                <Field label="Sexo" locked>
                                    {profile.sex ? capitalize(profile.sex) : NONE}
                                </Field>
                                <div className="sm:col-span-2">
                                    <Field label="Documento de identidad" locked>
                                        {profile.document_number ?? NONE}
                                    </Field>
                                </div>
                            </div>

                            <section className="flex flex-col gap-4">
                                <SectionTitle icon={<Phone className="h-5 w-5 text-primary" aria-hidden="true" />}>
                                    Información de contacto
                                </SectionTitle>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {editing && draft ? (
                                        <Input
                                            label="Teléfono"
                                            type="tel"
                                            autoComplete="tel"
                                            value={draft.phone}
                                            onChange={(event) => set("phone", event.target.value)}
                                        />
                                    ) : (
                                        <Field label="Teléfono" editable>
                                            {profile.phone ?? NONE}
                                        </Field>
                                    )}
                                    <Field label="Correo electrónico">{profile.email}</Field>
                                </div>
                            </section>

                            <section className="flex flex-col gap-4">
                                <SectionTitle icon={<HeartPulse className="h-5 w-5 text-primary" aria-hidden="true" />}>
                                    Información médica
                                </SectionTitle>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Fecha de último diagnóstico">
                                        {profile.diagnosis_date ? formatLongDate(`${profile.diagnosis_date}T12:00:00`) : NONE}
                                    </Field>
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1">
                                            <Field label="Presión arterial promedio" locked>
                                                {summary?.sufficient ? (
                                                    `${summary.mean_systolic}/${summary.mean_diastolic} mmHg`
                                                ) : (
                                                    <span className="text-subtle">Datos insuficientes</span>
                                                )}
                                            </Field>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={onOpenData}
                                            aria-label="Ver tendencia"
                                            title="Ver tendencia"
                                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-field bg-muted hover:bg-border/60"
                                        >
                                            <Activity className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>
                            </section>

                            <section className="flex flex-col gap-4">
                                <label className="flex items-center gap-3 text-lg">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 rounded border-border accent-primary"
                                        checked={hasTrusted}
                                        disabled={!editing}
                                        onChange={(event) => set("hasTrusted", event.target.checked)}
                                    />
                                    Contacto de confianza
                                </label>
                                {hasTrusted ? (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {editing && draft ? (
                                            <>
                                                <Input
                                                    label="Teléfono del contacto de confianza"
                                                    type="tel"
                                                    value={draft.trusted_contact_phone}
                                                    onChange={(event) => set("trusted_contact_phone", event.target.value)}
                                                />
                                                <Input
                                                    label="Correo del contacto de confianza"
                                                    type="email"
                                                    value={draft.trusted_contact_email}
                                                    onChange={(event) => set("trusted_contact_email", event.target.value)}
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <Field label="Teléfono" editable>
                                                    {profile.trusted_contact_phone ?? NONE}
                                                </Field>
                                                <Field label="Correo electrónico" editable>
                                                    {profile.trusted_contact_email ?? NONE}
                                                </Field>
                                            </>
                                        )}
                                    </div>
                                ) : null}
                            </section>

                            <div className="flex flex-col gap-3">
                                <Button variant={editing ? "outline" : "primary"} onClick={editing ? stopEditing : startEditing}>
                                    <Pencil className="h-5 w-5" aria-hidden="true" />
                                    {editing ? "Cancelar edición" : "Editar perfil"}
                                </Button>
                                <Button
                                    variant={dirty ? "primary" : "outline"}
                                    disabled={!editing || !dirty}
                                    loading={saving}
                                    onClick={save}
                                >
                                    <Save className="h-5 w-5" aria-hidden="true" />
                                    Guardar cambios
                                </Button>
                            </div>
                        </>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Privacidad</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <p className="text-sm text-subtle">
                        Mientras el consentimiento esté revocado no podrás registrar lecturas ni síntomas, y tu resumen
                        no se analizará. Puedes volver a aceptarlo cuando quieras.
                    </p>
                    <Button variant="outline" onClick={revoke} loading={revoking}>
                        <ShieldOff className="h-5 w-5" aria-hidden="true" />
                        Revocar consentimiento
                    </Button>
                </CardContent>
            </Card>
            {pickedFile ? (
                <PhotoEditor
                    file={pickedFile}
                    renderer={photoRenderer ?? canvasRenderer}
                    onApply={(dataUrl) => void savePhoto(dataUrl)}
                    onCancel={() => setPickedFile(null)}
                />
            ) : null}
        </div>
    );
}
