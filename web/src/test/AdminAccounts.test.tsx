// @requirement RF-02
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { saveSession } from "../auth";
import { AdminAccounts } from "../components/staff/AdminAccounts";
import type { Account } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listAccounts: vi.fn(),
    setAccountRole: vi.fn(),
    deactivateAccount: vi.fn(),
    revokeSessions: vi.fn(),
    listPasswordRequests: vi.fn(),
    approvePasswordRequest: vi.fn(),
    rejectPasswordRequest: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const base = (id: string, overrides: Partial<Account> = {}): Account => ({
    id,
    email: `${id}@hta.demo`,
    full_name: `Cuenta ${id}`,
    role: "patient",
    active: true,
    consent: null,
    active_sessions: 0,
    ...overrides,
});

const accounts: Account[] = [
    base("admin", { full_name: "Administración", email: "admin@hta.demo", role: "admin", active_sessions: 1 }),
    base("medico", { full_name: "Julián Morales", email: "medico@hta.demo", role: "physician" }),
    base("cuidador", { full_name: "Marta Cuidadora", email: "cuidador@hta.demo", role: "caregiver" }),
    base("p1", { full_name: "Ana Torres", email: "ana@hta.demo", consent: "active", active_sessions: 2 }),
    base("p2", { full_name: "Carlos Pérez", email: "carlos@hta.demo", consent: "revoked" }),
    base("p3", { full_name: "Cuenta desactivada", email: "deactivated+p3", active: false, consent: "pending" }),
];

const jwt = (sub: string) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
    return `${encode({ alg: "none" })}.${encode({ sub })}.x`;
};

const row = (name: string) => screen.getByRole("listitem", { name: new RegExp(name) });
const mount = () => renderWithToasts(<AdminAccounts />);

describe("AdminAccounts", () => {
    beforeEach(() => {
        window.localStorage.clear();
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listPasswordRequests.mockResolvedValue({ items: [] });
        mocks.listAccounts.mockResolvedValue({ items: accounts, total: accounts.length });
        mocks.setAccountRole.mockResolvedValue(undefined);
        mocks.deactivateAccount.mockResolvedValue(undefined);
        mocks.revokeSessions.mockResolvedValue(undefined);
        saveSession({ access_token: jwt("admin"), refresh_token: "r", role: "admin" });
    });

    describe("the directory", () => {
        it("explains what this account can and cannot see", async () => {
            mount();
            expect(await screen.findByRole("heading", { name: "Cuentas" })).toBeInTheDocument();
            expect(screen.getByText(/no ve lecturas, síntomas ni alertas clínicas/i)).toBeInTheDocument();
        });

        it("lists every account with its role, state, sessions and consent", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });

            const ana = within(row("Ana Torres"));
            expect(ana.getByText("ana@hta.demo")).toBeInTheDocument();
            expect(ana.getByText(/paciente · activa · 2 sesiones abiertas · consentimiento vigente/i)).toBeInTheDocument();
            expect(within(row("Carlos Pérez")).getByText(/consentimiento revocado/i)).toBeInTheDocument();
            expect(within(row("Administración")).getByText(/1 sesión abierta/i)).toBeInTheDocument();
            expect(within(row("Cuenta desactivada")).getByText(/paciente · desactivada · 0 sesiones abiertas/i)).toBeInTheDocument();
        });

        it("counts the accounts by role and the active ones", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });

            const kpi = (name: string) => within(screen.getByRole("button", { name: new RegExp(`^${name}`) })).getByTestId("kpi-value");
            expect(kpi("Pacientes")).toHaveTextContent("3");
            expect(kpi("Médicos")).toHaveTextContent("1");
            expect(kpi("Cuidadores")).toHaveTextContent("1");
            expect(kpi("Administradores")).toHaveTextContent("1");
            expect(screen.getByTestId("kpi-active")).toHaveTextContent("5");
        });

        it("loads every page of the directory", async () => {
            const many = Array.from({ length: 230 }, (_, index) => base(`m${index}`, { full_name: `Persona ${index}` }));
            mocks.listAccounts.mockImplementation(({ offset = 0, limit }: { offset?: number; limit: number }) =>
                Promise.resolve({ items: many.slice(offset, offset + limit), total: 230 }),
            );
            mount();

            expect(await screen.findByText(/230 de 230 cuentas/i)).toBeInTheDocument();
            expect(mocks.listAccounts).toHaveBeenCalledTimes(2);
        });

        it("says it is loading and reports a failure", async () => {
            mocks.listAccounts.mockRejectedValue(new Error("boom"));
            mount();

            expect(screen.getByText(/cargando cuentas/i)).toBeInTheDocument();
            expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar las cuentas/i);
        });
    });

    describe("filters", () => {
        it("searches by name or email, ignoring case", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });

            await userEvent.type(screen.getByRole("searchbox", { name: /buscar cuenta/i }), "CARLOS@");

            expect(screen.getByRole("listitem", { name: /Carlos Pérez/ })).toBeInTheDocument();
            expect(screen.queryByRole("listitem", { name: /Ana Torres/ })).not.toBeInTheDocument();
            expect(screen.getByText(/1 de 6 cuentas/i)).toBeInTheDocument();
        });

        it("filters by role and by activity, and combines them", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por rol/i }), "patient");
            expect(screen.getAllByRole("listitem")).toHaveLength(3);

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por actividad/i }), "false");
            expect(screen.getAllByRole("listitem")).toHaveLength(1);
            expect(screen.getByRole("listitem", { name: /Cuenta desactivada/ })).toBeInTheDocument();
        });

        it("filters by role from the role indicators and clears it on a second click", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const medicos = screen.getByRole("button", { name: /^Médicos/ });

            await userEvent.click(medicos);
            expect(medicos).toHaveAttribute("aria-pressed", "true");
            expect(screen.getAllByRole("listitem")).toHaveLength(1);

            await userEvent.click(medicos);
            expect(medicos).toHaveAttribute("aria-pressed", "false");
            expect(screen.getAllByRole("listitem")).toHaveLength(6);
        });

        it("says when no account matches", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });

            await userEvent.type(screen.getByRole("searchbox", { name: /buscar cuenta/i }), "zzzz");

            expect(screen.getByText(/ninguna cuenta coincide/i)).toBeInTheDocument();
            expect(screen.queryAllByRole("listitem")).toHaveLength(0);
        });
    });

    describe("changing a role", () => {
        it("asks to confirm and then saves the new role and reloads", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const ana = within(row("Ana Torres"));

            expect(ana.queryByRole("button", { name: /confirmar rol/i })).not.toBeInTheDocument();
            await userEvent.selectOptions(ana.getByRole("combobox", { name: /rol de ana torres/i }), "caregiver");
            await userEvent.click(ana.getByRole("button", { name: /confirmar rol/i }));

            await waitFor(() => expect(mocks.setAccountRole).toHaveBeenCalledWith("p1", "caregiver"));
            expect(await screen.findByRole("status")).toHaveTextContent(/rol actualizado/i);
            expect(mocks.listAccounts.mock.calls.length).toBeGreaterThan(1);
        });

        it("lets the admin drop a pending change", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const ana = within(row("Ana Torres"));

            await userEvent.selectOptions(ana.getByRole("combobox", { name: /rol de ana torres/i }), "physician");
            await userEvent.click(ana.getByRole("button", { name: /cancelar cambio/i }));

            expect(ana.getByRole("combobox", { name: /rol de ana torres/i })).toHaveValue("patient");
            expect(ana.queryByRole("button", { name: /confirmar rol/i })).not.toBeInTheDocument();
            expect(mocks.setAccountRole).not.toHaveBeenCalled();
        });

        it("hides the confirmation again when the original role is chosen back", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const ana = within(row("Ana Torres"));
            const select = ana.getByRole("combobox", { name: /rol de ana torres/i });

            await userEvent.selectOptions(select, "physician");
            await userEvent.selectOptions(select, "patient");

            expect(ana.queryByRole("button", { name: /confirmar rol/i })).not.toBeInTheDocument();
        });

        it("shows the server's message when it refuses", async () => {
            mocks.setAccountRole.mockRejectedValue(new ApiError(422, "Rol desconocido"));
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const ana = within(row("Ana Torres"));

            await userEvent.selectOptions(ana.getByRole("combobox", { name: /rol de ana torres/i }), "caregiver");
            await userEvent.click(ana.getByRole("button", { name: /confirmar rol/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent("Rol desconocido");
        });
    });

    describe("deactivating", () => {
        it("explains what it does and needs a confirmation", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const ana = within(row("Ana Torres"));

            await userEvent.click(ana.getByRole("button", { name: /^desactivar$/i }));

            expect(ana.getByText(/seudonimiza el nombre y el correo/i)).toBeInTheDocument();
            expect(ana.getByText(/no se puede deshacer/i)).toBeInTheDocument();
            expect(mocks.deactivateAccount).not.toHaveBeenCalled();
        });

        it("deactivates after the confirmation, reloads and says the history is kept", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const ana = within(row("Ana Torres"));

            await userEvent.click(ana.getByRole("button", { name: /^desactivar$/i }));
            await userEvent.click(ana.getByRole("button", { name: /confirmar desactivación/i }));

            await waitFor(() => expect(mocks.deactivateAccount).toHaveBeenCalledWith("p1"));
            expect(await screen.findByRole("status")).toHaveTextContent(/historial clínico se conserva/i);
            expect(mocks.listAccounts.mock.calls.length).toBeGreaterThan(1);
        });

        it("backs out on Cancel", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const ana = within(row("Ana Torres"));

            await userEvent.click(ana.getByRole("button", { name: /^desactivar$/i }));
            await userEvent.click(ana.getByRole("button", { name: /^cancelar$/i }));

            expect(ana.getByRole("button", { name: /^desactivar$/i })).toBeInTheDocument();
            expect(mocks.deactivateAccount).not.toHaveBeenCalled();
        });

        it("does not offer it for an account that is already deactivated", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const old = within(row("Cuenta desactivada"));

            expect(old.getByRole("button", { name: /^desactivar$/i })).toBeDisabled();
            expect(old.getByRole("combobox", { name: /rol de cuenta desactivada/i })).toBeDisabled();
        });

        it("shows the server's message when it refuses", async () => {
            mocks.deactivateAccount.mockRejectedValue(new ApiError(409, "No puedes desactivar tu propia cuenta"));
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const ana = within(row("Ana Torres"));

            await userEvent.click(ana.getByRole("button", { name: /^desactivar$/i }));
            await userEvent.click(ana.getByRole("button", { name: /confirmar desactivación/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent(/no puedes desactivar tu propia cuenta/i);
        });
    });

    describe("the signed-in administrator", () => {
        it("is marked as the user and cannot change its own role or deactivate itself", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            const me = within(row("Administración"));

            expect(me.getByText(/\(tú\)/i)).toBeInTheDocument();
            expect(me.getByRole("combobox", { name: /rol de administración/i })).toBeDisabled();
            expect(me.getByRole("button", { name: /^desactivar$/i })).toBeDisabled();
            expect(me.getByText(/no puedes cambiar tu propio rol ni desactivarte/i)).toBeInTheDocument();
        });

        it("does not mark anybody when the session carries no id", async () => {
            window.localStorage.clear();
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            expect(screen.queryByText(/\(tú\)/i)).not.toBeInTheDocument();
        });
    });

    describe("closing sessions", () => {
        it("revokes the sessions of an account and reloads the count", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });

            await userEvent.click(within(row("Ana Torres")).getByRole("button", { name: /cerrar sesiones/i }));

            await waitFor(() => expect(mocks.revokeSessions).toHaveBeenCalledWith("p1"));
            expect(await screen.findByRole("status")).toHaveTextContent(/sesiones cerradas/i);
        });

        it("is disabled when the account has no open session", async () => {
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });
            expect(within(row("Carlos Pérez")).getByRole("button", { name: /cerrar sesiones/i })).toBeDisabled();
        });

        it("shows the server's message when it fails", async () => {
            mocks.revokeSessions.mockRejectedValue(new ApiError(404, "La cuenta no existe"));
            mount();
            await screen.findByRole("heading", { name: "Cuentas" });

            await userEvent.click(within(row("Ana Torres")).getByRole("button", { name: /cerrar sesiones/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta no existe");
        });
    });
});
