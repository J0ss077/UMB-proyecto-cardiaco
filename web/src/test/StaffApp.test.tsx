// @requirement RF-02
// @requirement RF-14
// @requirement RF-16
// @requirement RF-24
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApp } from "../components/staff/StaffApp";
import { ToastProvider } from "../components/ui/Toast";

const mocks = vi.hoisted(() => ({
    listPatients: vi.fn(),
    listAlerts: vi.fn(),
    listReadings: vi.fn(),
    listSymptoms: vi.fn(),
    getReadingsSummary: vi.fn(),
    listConsultations: vi.fn(),
    respondConsultation: vi.fn(),
    getAlert: vi.fn(),
    acknowledgeAlert: vi.fn(),
    listAccounts: vi.fn(),
    listLinks: vi.fn(),
    listAlertConfig: vi.fn(),
    listAudit: vi.fn(),
    getStaffProfile: vi.fn(),
    updateStaffProfile: vi.fn(),
    getPasswordChange: vi.fn(),
    requestPasswordChange: vi.fn(),
    cancelPasswordChange: vi.fn(),
    listPasswordRequests: vi.fn(),
    approvePasswordRequest: vi.fn(),
    rejectPasswordRequest: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const empty = { items: [], total: 0 };
const recentCritical = {
    id: "a1",
    patient_id: "p1",
    type: "crisis_hipertensiva",
    severity: "critical",
    status: "open",
    note: "Lecturas de 186/122; pendiente de revisión médica.",
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    validated_by: null,
    validated_at: null,
};

let currentRole: "physician" | "caregiver" | "admin" = "physician";
const staffProfileFor = (role: "physician" | "caregiver" | "admin") => ({
    user_id: "s1",
    email: "staff@hta.demo",
    full_name: "Julián Morales",
    role,
    phone: null,
    avatar: null,
    license_number: null,
    specialty: null,
});

const mount = (role: "physician" | "caregiver" | "admin", onLogout = vi.fn()) => {
    currentRole = role;
    render(
        <ToastProvider>
            <StaffApp role={role} onLogout={onLogout} />
        </ToastProvider>,
    );
    return onLogout;
};

const go = (name: string) => userEvent.click(screen.getByRole("button", { name }));

describe("StaffApp", () => {
    beforeEach(() => {
        window.localStorage.clear();
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listPatients.mockResolvedValue({ items: [{ user_id: "p1", full_name: "Ana Torres", birth_date: null }], total: 1 });
        mocks.listAlerts.mockImplementation((params: { status?: string; severity?: string; limit?: number }) => {
            if (params.limit === 1) return Promise.resolve({ items: [], total: 3 });
            if (params.severity === "critical") return Promise.resolve({ items: [recentCritical], total: 1 });
            return Promise.resolve({ items: [recentCritical], total: 1 });
        });
        mocks.listReadings.mockResolvedValue(empty);
        mocks.listSymptoms.mockResolvedValue(empty);
        mocks.getReadingsSummary.mockRejectedValue(new Error("none"));
        mocks.listConsultations.mockImplementation((params: { limit?: number }) =>
            Promise.resolve(params.limit === 1 ? { items: [], total: 2 } : empty),
        );
        mocks.listAccounts.mockResolvedValue({ items: [{ id: "u1", email: "a@hta.demo", full_name: "Ana", role: "patient", active: true, consent: null, active_sessions: 0 }], total: 1 });
        mocks.listLinks.mockResolvedValue({ physicians: [], caregivers: [] });
        mocks.listAlertConfig.mockResolvedValue(empty);
        mocks.listAudit.mockResolvedValue(empty);
        mocks.listPasswordRequests.mockResolvedValue({ items: [] });
        mocks.getPasswordChange.mockResolvedValue({ status: "none", requested_at: null });
        mocks.getStaffProfile.mockImplementation(() => Promise.resolve(staffProfileFor(currentRole)));
        mocks.getAlert.mockResolvedValue({ ...recentCritical, validated_by_name: null, dismissal_reason: null });
        mocks.acknowledgeAlert.mockResolvedValue(undefined);
    });

    describe("navigation by role", () => {
        it.each([
            ["physician", ["Inicio", "Pacientes", "Alertas", "Consultas"]],
            ["caregiver", ["Inicio", "Pacientes", "Alertas", "Guía"]],
            ["admin", ["Cuentas", "Vínculos", "Umbrales", "Auditoría"]],
        ] as const)("offers the %s only its own destinations", (role, labels) => {
            mount(role);
            const nav = within(screen.getByRole("navigation", { name: /navegación principal/i }));
            for (const label of labels) expect(nav.getByRole("button", { name: label })).toBeInTheDocument();
            expect(nav.getAllByRole("button").filter((button) => !/menú/i.test(button.getAttribute("aria-label") ?? ""))).toHaveLength(labels.length);
        });

        it.each([
            ["physician", "Por atender"],
            ["caregiver", "Personas a tu cargo"],
            ["admin", "Cuentas"],
        ] as const)("starts the %s on its first page", async (role, heading) => {
            mount(role);
            expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
        });

        it("walks a physician through every page", async () => {
            mount("physician");
            await screen.findByRole("heading", { name: "Por atender" });

            await go("Pacientes");
            expect(await screen.findByRole("heading", { name: "Pacientes asignados" })).toBeInTheDocument();
            await go("Alertas");
            expect(await screen.findByRole("heading", { name: "Alertas" })).toBeInTheDocument();
            await go("Consultas");
            expect(await screen.findByRole("heading", { name: "Consultas" })).toBeInTheDocument();
            await go("Inicio");
            expect(await screen.findByRole("heading", { name: "Por atender" })).toBeInTheDocument();
        });

        it("walks a caregiver through every page, read-only", async () => {
            mount("caregiver");
            await screen.findByRole("heading", { name: "Personas a tu cargo" });

            await go("Pacientes");
            expect(await screen.findByRole("heading", { name: "Pacientes autorizados" })).toBeInTheDocument();
            expect(screen.getByText(/tú no cierras alertas ni respondes consultas/i)).toBeInTheDocument();
            await go("Alertas");
            expect(await screen.findByText(/quien las cierra es el médico/i)).toBeInTheDocument();
            await go("Guía");
            expect(await screen.findByRole("heading", { name: "Cómo acompañar" })).toBeInTheDocument();
        });

        it("walks an administrator through every page", async () => {
            mount("admin");
            await screen.findByRole("heading", { name: "Cuentas" });

            await go("Vínculos");
            expect(await screen.findByRole("heading", { name: "Vínculos" })).toBeInTheDocument();
            await go("Umbrales");
            expect(await screen.findByRole("heading", { name: "Umbrales" })).toBeInTheDocument();
            await go("Auditoría");
            expect(await screen.findByRole("heading", { name: "Auditoría" })).toBeInTheDocument();
            await go("Cuentas");
            expect(await screen.findByRole("heading", { name: "Cuentas" })).toBeInTheDocument();
        });
    });

    describe("what each role may ask for", () => {
        it("never lets an administrator reach clinical data", async () => {
            mount("admin");
            for (const label of ["Vínculos", "Umbrales", "Auditoría", "Cuentas"]) {
                await go(label);
                await screen.findByRole("heading", { name: label });
            }

            for (const name of ["listPatients", "listAlerts", "listReadings", "listSymptoms", "listConsultations", "getReadingsSummary"] as const) {
                expect(mocks[name]).not.toHaveBeenCalled();
            }
        });

        it("never lets a caregiver ask for consultations", async () => {
            mount("caregiver");
            await screen.findByRole("heading", { name: "Personas a tu cargo" });
            await go("Pacientes");
            await screen.findByRole("heading", { name: "Pacientes autorizados" });
            await go("Alertas");
            await screen.findByRole("heading", { name: "Alertas" });

            expect(mocks.listConsultations).not.toHaveBeenCalled();
        });
    });

    describe("pending counts", () => {
        it("shows the open alerts and the pending consultations on their destinations", async () => {
            mount("physician");

            await waitFor(() => expect(screen.getByRole("button", { name: "Alertas" })).toHaveAccessibleDescription("3 pendientes"));
            expect(screen.getByRole("button", { name: "Consultas" })).toHaveAccessibleDescription("4 pendientes");
            expect(mocks.listAlerts).toHaveBeenCalledWith({ status: "open", limit: 1 });
            expect(mocks.listConsultations).toHaveBeenCalledWith({ status: "in_review", limit: 1 });
            expect(mocks.listConsultations).toHaveBeenCalledWith({ status: "pending", limit: 1 });
        });

        it("shows only the alerts for a caregiver", async () => {
            mount("caregiver");

            await waitFor(() => expect(screen.getByRole("button", { name: "Alertas" })).toHaveAccessibleDescription("3 pendientes"));
            expect(screen.getByRole("button", { name: "Guía" })).not.toHaveAccessibleDescription();
        });

        it("shows no count when there is nothing pending or the counts cannot be loaded", async () => {
            mocks.listAlerts.mockImplementation((params: { limit?: number }) => Promise.resolve(params.limit === 1 ? empty : { items: [], total: 0 }));
            // Only the count request fails; the home still loads its own list.
            mocks.listConsultations.mockImplementation((params: { limit?: number }) =>
                params.limit === 1 ? Promise.reject(new Error("boom")) : Promise.resolve(empty),
            );
            mount("physician");
            await screen.findByRole("heading", { name: "Por atender" });

            expect(screen.getByRole("button", { name: "Alertas" })).not.toHaveAccessibleDescription();
            expect(screen.getByRole("button", { name: "Consultas" })).not.toHaveAccessibleDescription();
        });

        it("refreshes the counts after the physician acts on an alert", async () => {
            mount("physician");
            await go("Alertas");
            await userEvent.click(await screen.findByRole("button", { name: /Ana Torres/ }));
            const detail = await screen.findByRole("region", { name: /detalle de la alerta/i });
            const before = mocks.listAlerts.mock.calls.filter((call) => (call[0] as { limit?: number }).limit === 1).length;

            await userEvent.click(within(detail).getByRole("button", { name: "Acusar recibo" }));

            await waitFor(() =>
                expect(mocks.listAlerts.mock.calls.filter((call) => (call[0] as { limit?: number }).limit === 1).length).toBeGreaterThan(before),
            );
        });
    });

    describe("shortcuts", () => {
        it("opens the alerts page from the critical alerts indicator of the patient list", async () => {
            mount("physician");
            await go("Pacientes");
            await userEvent.click(await screen.findByRole("button", { name: /alertas críticas pendientes/i }));
            expect(await screen.findByRole("heading", { name: "Alertas" })).toBeInTheDocument();
        });

        it("opens the consultations page from the pending consultations indicator", async () => {
            mount("physician");
            await go("Pacientes");
            await userEvent.click(await screen.findByRole("button", { name: /consultas pendientes/i }));
            expect(await screen.findByRole("heading", { name: "Consultas" })).toBeInTheDocument();
        });
    });

    describe("the header", () => {
        it.each([
            ["physician", "Médico"],
            ["caregiver", "Cuidador"],
            ["admin", "Administrador"],
        ] as const)("opens the %s profile from the avatar, shows the initials, and leaves it from the navigation", async (role, label) => {
            mount(role);
            expect(screen.getByRole("button", { name: /ir al perfil/i })).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: /ir al perfil/i }));
            expect(await screen.findByRole("heading", { name: "Perfil" })).toBeInTheDocument();
            expect(screen.getByText(label)).toBeInTheDocument();

            const first = { physician: "Inicio", caregiver: "Inicio", admin: "Cuentas" }[role];
            await go(first);
            expect(screen.queryByRole("heading", { name: "Perfil" })).not.toBeInTheDocument();
        });

        it("signs out", async () => {
            const onLogout = mount("physician");
            await userEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));
            expect(onLogout).toHaveBeenCalledTimes(1);
        });
    });

    describe("the header follows the profile", () => {
        it("shows the photo of the loaded profile", async () => {
            mocks.getStaffProfile.mockResolvedValue({ ...staffProfileFor("physician"), avatar: "data:image/jpeg;base64,/9j/AA==" });
            mount("physician");
            const button = screen.getByRole("button", { name: "Ir al perfil" });
            await waitFor(() => expect(button.querySelector("img")?.getAttribute("src")).toContain("data:image/jpeg"));
        });

        it("shows the initials of the loaded name, and the role initials when it does not load", async () => {
            mount("physician");
            await waitFor(() => expect(screen.getByRole("button", { name: "Ir al perfil" })).toHaveTextContent("JM"));
        });

        it("keeps the role initials when the profile does not load", async () => {
            mocks.getStaffProfile.mockRejectedValue(new Error("down"));
            mount("caregiver");
            expect(screen.getByRole("button", { name: "Ir al perfil" })).toHaveTextContent("Cu");
        });
    });

    describe("password changes", () => {
        it("shows the administrator how many requests wait, on Cuentas", async () => {
            mocks.listPasswordRequests.mockResolvedValue({
                items: [{ user_id: "m1", email: "m@hta.demo", full_name: "Julián Morales", role: "physician", requested_at: new Date().toISOString() }],
            });
            mount("admin");
            await waitFor(() => expect(screen.getByRole("button", { name: "Cuentas" })).toHaveAccessibleDescription("1 pendientes"));
            expect(await screen.findByRole("heading", { name: "Solicitudes de cambio de contraseña" })).toBeInTheDocument();
        });

        it("signs the administrator out after changing their own password", async () => {
            mocks.requestPasswordChange.mockResolvedValue({ status: "changed", requested_at: null });
            const onLogout = mount("admin");
            await userEvent.click(screen.getByRole("button", { name: /configuración y perfil/i }));
            await userEvent.type(await screen.findByLabelText("Contraseña actual"), "actual-1");
            await userEvent.type(screen.getByLabelText("Contraseña nueva"), "nueva-clave-9");
            await userEvent.type(screen.getByLabelText("Repite la contraseña nueva"), "nueva-clave-9");
            await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
            await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
        });

        it("keeps the physician signed in after asking for a change", async () => {
            mocks.requestPasswordChange.mockResolvedValue({ status: "pending", requested_at: new Date().toISOString() });
            const onLogout = mount("physician");
            await userEvent.click(screen.getByRole("button", { name: /configuración y perfil/i }));
            await userEvent.type(await screen.findByLabelText("Contraseña actual"), "actual-1");
            await userEvent.type(screen.getByLabelText("Contraseña nueva"), "nueva-clave-9");
            await userEvent.type(screen.getByLabelText("Repite la contraseña nueva"), "nueva-clave-9");
            await userEvent.click(screen.getByRole("button", { name: "Pedir cambio de contraseña" }));
            expect(await screen.findByText(/pediste cambiar tu contraseña/i)).toBeInTheDocument();
            expect(onLogout).not.toHaveBeenCalled();
        });
    });

    describe("notifications", () => {
        it("announces an open critical alert to a physician and a caregiver", async () => {
            const { unmount } = render(
                <ToastProvider>
                    <StaffApp role="physician" onLogout={vi.fn()} />
                </ToastProvider>,
            );
            expect(await screen.findByRole("button", { name: /notificaciones, 1 sin leer/i })).toBeInTheDocument();
            unmount();

            window.localStorage.clear();
            mount("caregiver");
            expect(await screen.findByRole("button", { name: /notificaciones, 1 sin leer/i })).toBeInTheDocument();
        });

        it("lists it in the bell with the emergency guide", async () => {
            mount("physician");
            await userEvent.click(await screen.findByRole("button", { name: /notificaciones/i }));

            const panel = screen.getByRole("dialog", { name: "Notificaciones" });
            expect(within(panel).getByText(/alerta crítica pendiente/i)).toBeInTheDocument();
            await userEvent.click(within(panel).getByRole("button", { name: "Guía de emergencia" }));
            expect(screen.getByRole("dialog", { name: "Guía de emergencia" })).toBeInTheDocument();
        });

        it("tells an administrator the account gets no clinical notices and asks for nothing clinical", async () => {
            mount("admin");
            await userEvent.click(screen.getByRole("button", { name: "Notificaciones" }));

            expect(screen.getByText(/esta cuenta no recibe avisos clínicos/i)).toBeInTheDocument();
        });

        it("still renders when the notification data cannot be loaded", async () => {
            mocks.listAlerts.mockRejectedValue(new Error("boom"));
            mocks.listPatients.mockRejectedValue(new Error("boom"));
            mount("physician");

            expect(await screen.findByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
        });
    });
});
