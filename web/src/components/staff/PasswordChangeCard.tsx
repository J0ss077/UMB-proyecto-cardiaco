// @requirement RF-02
import { KeyRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, cancelPasswordChange, getPasswordChange, requestPasswordChange } from "../../api";
import { formatShortDateTime } from "../../lib/format";
import type { PasswordChangeStatus, Role } from "../../types";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { PasswordInput } from "../ui/PasswordInput";
import { useToast } from "../ui/Toast";

export const PASSWORD_MIN = 8;

// Client-side checks mirror the API so the person sees the problem before sending.
export function validatePasswordChange(current: string, next: string, confirm: string): Record<string, string> {
    const errors: Record<string, string> = {};
    if (current === "") errors.current = "Escribe tu contraseña actual";
    if (next.length < PASSWORD_MIN) errors.next = `Usa al menos ${PASSWORD_MIN} caracteres`;
    else if (next === current) errors.next = "La contraseña nueva debe ser distinta de la actual";
    if (confirm !== next) errors.confirm = "Las contraseñas no coinciden";
    return errors;
}

export function PasswordChangeCard({
    role,
    onChangedNow,
}: {
    role: Exclude<Role, "patient">;
    // The administrator's own change is immediate and closes the sessions, so the app signs out.
    onChangedNow?: () => void;
}) {
    const toast = useToast();
    const [status, setStatus] = useState<PasswordChangeStatus | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const needsApproval = role !== "admin";

    useEffect(() => {
        let cancelled = false;
        getPasswordChange()
            .then((loaded) => {
                if (!cancelled) setStatus(loaded);
            })
            .catch(() => {
                if (!cancelled) setLoadFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    async function submit(event: FormEvent) {
        event.preventDefault();
        const found = validatePasswordChange(current, next, confirm);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        setBusy(true);
        try {
            const result = await requestPasswordChange({ current_password: current, new_password: next });
            setCurrent("");
            setNext("");
            setConfirm("");
            if (result.status === "changed") {
                toast.success("Contraseña cambiada. Vuelve a iniciar sesión.");
                onChangedNow?.();
            } else {
                setStatus(result);
                toast.success("Solicitud enviada. Un administrador debe aprobarla.");
            }
        } catch (error) {
            if (error instanceof ApiError && error.status === 400) setErrors({ current: error.message });
            else toast.error(error instanceof ApiError ? error.message : "No se pudo enviar la solicitud");
        } finally {
            setBusy(false);
        }
    }

    async function cancel() {
        setBusy(true);
        try {
            await cancelPasswordChange();
            setStatus({ status: "none", requested_at: null });
            toast.success("Solicitud retirada.");
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo retirar la solicitud");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Contraseña</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {loadFailed ? (
                    <p role="alert" className="text-sm text-critical">
                        No se pudo consultar el estado de tu solicitud.
                    </p>
                ) : null}
                {status?.status === "pending" ? (
                    <div className="flex flex-col gap-3">
                        <p className="text-base">
                            Pediste cambiar tu contraseña
                            {status.requested_at ? ` (${formatShortDateTime(status.requested_at)})` : ""}. Un administrador debe
                            aprobarla; mientras tanto sigue valiendo la actual.
                        </p>
                        <Button variant="outline" onClick={cancel} loading={busy}>
                            Cancelar solicitud
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
                        <p className="text-sm text-subtle">
                            {needsApproval
                                ? "El cambio no se aplica hasta que un administrador lo apruebe. Al aprobarse se cierran tus sesiones."
                                : "El cambio se aplica al momento y se cierran tus sesiones."}
                        </p>
                        <PasswordInput
                            label="Contraseña actual"
                            autoComplete="current-password"
                            value={current}
                            error={errors.current ?? null}
                            onChange={(event) => setCurrent(event.target.value)}
                        />
                        <PasswordInput
                            label="Contraseña nueva"
                            autoComplete="new-password"
                            hint={`Al menos ${PASSWORD_MIN} caracteres.`}
                            value={next}
                            error={errors.next ?? null}
                            onChange={(event) => setNext(event.target.value)}
                        />
                        <PasswordInput
                            label="Repite la contraseña nueva"
                            autoComplete="new-password"
                            value={confirm}
                            error={errors.confirm ?? null}
                            onChange={(event) => setConfirm(event.target.value)}
                        />
                        <Button type="submit" loading={busy}>
                            <KeyRound className="h-5 w-5" aria-hidden="true" />
                            {needsApproval ? "Pedir cambio de contraseña" : "Cambiar contraseña"}
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}
