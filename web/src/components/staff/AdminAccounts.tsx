// @requirement RF-02
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, deactivateAccount, revokeSessions, setAccountRole } from "../../api";
import { currentUserId } from "../../auth";
import { fetchAllAccounts } from "../../lib/accounts";
import { cn } from "../../lib/cn";
import { CONSENT_LABEL, ROLE_LABEL } from "../../lib/staff";
import type { Account, Role } from "../../types";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { useToast } from "../ui/Toast";

const ROLES: Role[] = ["patient", "physician", "caregiver", "admin"];
const ROLE_PLURAL: Record<Role, string> = {
    patient: "Pacientes",
    physician: "Médicos",
    caregiver: "Cuidadores",
    admin: "Administradores",
};

export function AdminAccounts() {
    const toast = useToast();
    const me = currentUserId();
    const [accounts, setAccounts] = useState<Account[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [query, setQuery] = useState("");
    const [role, setRole] = useState<Role | "">("");
    const [active, setActive] = useState<"" | "true" | "false">("");
    const [pendingRole, setPendingRole] = useState<{ id: string; role: Role } | null>(null);
    const [pendingDeactivate, setPendingDeactivate] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        setAccounts(await fetchAllAccounts());
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetchAllAccounts()
            .then((all) => {
                if (!cancelled) setAccounts(all);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const visible = useMemo(() => {
        if (!accounts) return [];
        const needle = query.trim().toLowerCase();
        return accounts.filter((account) => {
            if (role && account.role !== role) return false;
            if (active === "true" && !account.active) return false;
            if (active === "false" && account.active) return false;
            if (!needle) return true;
            return account.full_name.toLowerCase().includes(needle) || account.email.toLowerCase().includes(needle);
        });
    }, [accounts, query, role, active]);

    const counts = useMemo(() => {
        const base = { patient: 0, physician: 0, caregiver: 0, admin: 0, active: 0 };
        for (const account of accounts ?? []) {
            base[account.role] += 1;
            if (account.active) base.active += 1;
        }
        return base;
    }, [accounts]);

    // Runs one action, reloads the directory and reports the outcome with the server's own message.
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
        }
    }

    if (failed) {
        return (
            <p role="alert" className="rounded-card bg-critical-soft p-4 text-critical">
                No se pudieron cargar las cuentas.
            </p>
        );
    }
    if (!accounts) return <p className="text-subtle">Cargando cuentas...</p>;

    return (
        <section className="flex flex-col gap-6" aria-labelledby="accounts-heading">
            <div className="flex flex-col gap-2">
                <h2 id="accounts-heading" className="text-2xl font-medium">
                    Cuentas
                </h2>
                <p className="max-w-2xl text-sm text-subtle">
                    Esta cuenta no ve lecturas, síntomas ni alertas clínicas. Desactivar seudonimiza el nombre y el correo, conserva el historial y revoca la sesión.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-5">
                {ROLES.map((item) => (
                    <button
                        key={item}
                        type="button"
                        aria-pressed={role === item}
                        onClick={() => setRole(role === item ? "" : item)}
                        className={cn(
                            "rounded-card border bg-background p-5 text-left transition-colors hover:bg-surface",
                            role === item ? "border-accent ring-2 ring-accent/30" : "border-border/70",
                        )}
                    >
                        <span className="block text-sm text-subtle">{ROLE_PLURAL[item]}</span>
                        <span data-testid="kpi-value" className="block text-2xl font-semibold tabular-nums">
                            {counts[item]}
                        </span>
                    </button>
                ))}
                <Card data-testid="kpi-active">
                    <CardContent>
                        <p className="text-sm text-subtle">Activas</p>
                        <p className="text-2xl font-semibold tabular-nums">{counts.active}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
                <input
                    type="search"
                    aria-label="Buscar cuenta"
                    placeholder="Buscar por nombre o correo"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-11 flex-1 rounded-field border border-border bg-background px-3 text-base"
                />
                <select
                    aria-label="Filtrar por rol"
                    value={role}
                    onChange={(event) => setRole(event.target.value as Role | "")}
                    className="h-11 rounded-field border border-border bg-background px-3"
                >
                    <option value="">Todos los roles</option>
                    {ROLES.map((item) => (
                        <option key={item} value={item}>
                            {ROLE_LABEL[item]}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Filtrar por actividad"
                    value={active}
                    onChange={(event) => setActive(event.target.value as "" | "true" | "false")}
                    className="h-11 rounded-field border border-border bg-background px-3"
                >
                    <option value="">Activas y desactivadas</option>
                    <option value="true">Activas</option>
                    <option value="false">Desactivadas</option>
                </select>
            </div>

            <p className="text-sm text-subtle">{`Mostrando ${visible.length} de ${accounts.length} cuentas`}</p>

            {visible.length === 0 ? (
                <Card>
                    <CardContent className="text-center text-subtle">Ninguna cuenta coincide con el filtro.</CardContent>
                </Card>
            ) : (
                <ul className="flex flex-col gap-3">
                    {visible.map((account) => {
                        const isMe = account.id === me;
                        const locked = isMe || !account.active;
                        const draft = pendingRole?.id === account.id ? pendingRole.role : account.role;
                        const changing = pendingRole?.id === account.id && pendingRole.role !== account.role;
                        return (
                            <li key={account.id} aria-label={account.full_name} className="rounded-card border border-border/70 bg-background p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <p className="font-medium">
                                            {account.full_name}
                                            {isMe ? <span className="ml-2 text-sm font-normal text-subtle">(tú)</span> : null}
                                        </p>
                                        <p className="text-sm text-subtle">{account.email}</p>
                                        <p className="text-sm">
                                            {`${ROLE_LABEL[account.role]} · ${account.active ? "Activa" : "Desactivada"} · ${account.active_sessions} ${account.active_sessions === 1 ? "sesión abierta" : "sesiones abiertas"}`}
                                            {account.consent ? ` · Consentimiento ${CONSENT_LABEL[account.consent].toLowerCase()}` : ""}
                                        </p>
                                        {isMe ? <p className="text-xs text-subtle">No puedes cambiar tu propio rol ni desactivarte.</p> : null}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            aria-label={`Rol de ${account.full_name}`}
                                            value={draft}
                                            disabled={locked}
                                            onChange={(event) => {
                                                const next = event.target.value as Role;
                                                setPendingRole(next === account.role ? null : { id: account.id, role: next });
                                            }}
                                            className="h-9 rounded-field border border-border bg-background px-2 text-sm disabled:opacity-60"
                                        >
                                            {ROLES.map((item) => (
                                                <option key={item} value={item}>
                                                    {ROLE_LABEL[item]}
                                                </option>
                                            ))}
                                        </select>
                                        {changing ? (
                                            <>
                                                <Button
                                                    size="sm"
                                                    loading={busy}
                                                    onClick={() =>
                                                        void run(
                                                            () => setAccountRole(account.id, draft),
                                                            "Rol actualizado.",
                                                            "No se pudo cambiar el rol",
                                                            () => setPendingRole(null),
                                                        )
                                                    }
                                                >
                                                    Confirmar rol
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setPendingRole(null)}>
                                                    Cancelar cambio
                                                </Button>
                                            </>
                                        ) : null}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            loading={busy}
                                            disabled={account.active_sessions === 0}
                                            onClick={() =>
                                                void run(() => revokeSessions(account.id), "Sesiones cerradas.", "No se pudieron cerrar las sesiones")
                                            }
                                        >
                                            Cerrar sesiones
                                        </Button>
                                        {pendingDeactivate === account.id ? null : (
                                            <Button size="sm" variant="danger" disabled={locked} onClick={() => setPendingDeactivate(account.id)}>
                                                Desactivar
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {pendingDeactivate === account.id ? (
                                    <div className="mt-3 flex flex-col gap-3 rounded-field bg-critical-soft p-3">
                                        <p className="text-sm text-critical">
                                            Se seudonimiza el nombre y el correo, se conserva el historial clínico y se revocan las sesiones. No se puede deshacer.
                                        </p>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                loading={busy}
                                                onClick={() =>
                                                    void run(
                                                        () => deactivateAccount(account.id),
                                                        "Cuenta desactivada. El historial clínico se conserva.",
                                                        "No se pudo desactivar la cuenta",
                                                        () => setPendingDeactivate(null),
                                                    )
                                                }
                                            >
                                                Confirmar desactivación
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => setPendingDeactivate(null)}>
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
