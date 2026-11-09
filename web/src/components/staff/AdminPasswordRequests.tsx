// @requirement RF-02
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, approvePasswordRequest, listPasswordRequests, rejectPasswordRequest } from "../../api";
import { formatShortDateTime } from "../../lib/format";
import { ROLE_LABEL } from "../../lib/staff";
import type { PasswordRequest } from "../../types";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { useToast } from "../ui/Toast";

// Pending password changes of physicians and caregivers. Hidden when there are none.
export function AdminPasswordRequests({ onChanged }: { onChanged?: () => void }) {
    const toast = useToast();
    const [items, setItems] = useState<PasswordRequest[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        listPasswordRequests()
            .then((page) => {
                if (!cancelled) setItems(page.items);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    async function decide(request: PasswordRequest, approve: boolean) {
        setBusyId(request.user_id);
        try {
            await (approve ? approvePasswordRequest : rejectPasswordRequest)(request.user_id);
            setItems((current) => (current ?? []).filter((item) => item.user_id !== request.user_id));
            toast.success(approve ? "Cambio aprobado. Se cerraron sus sesiones." : "Solicitud rechazada.");
            onChanged?.();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo registrar la decisión");
        } finally {
            setBusyId(null);
        }
    }

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudieron cargar las solicitudes de contraseña.
            </p>
        );
    }
    if (!items || items.length === 0) return null;

    return (
        <Card aria-labelledby="password-requests-heading">
            <CardHeader>
                <CardTitle id="password-requests-heading">Solicitudes de cambio de contraseña</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <ul className="flex flex-col divide-y divide-border/60">
                    {items.map((item) => (
                        <li key={item.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="font-medium">{item.full_name}</p>
                                <p className="truncate text-sm text-subtle">
                                    {ROLE_LABEL[item.role]} · {item.email} · {formatShortDateTime(item.requested_at)}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    loading={busyId === item.user_id}
                                    aria-label={`Aprobar a ${item.full_name}`}
                                    onClick={() => void decide(item, true)}
                                >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                    Aprobar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === item.user_id}
                                    aria-label={`Rechazar a ${item.full_name}`}
                                    onClick={() => void decide(item, false)}
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                    Rechazar
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-subtle">Aprobar cierra las sesiones abiertas de esa cuenta. No ves la contraseña pedida.</p>
            </CardContent>
        </Card>
    );
}
