// @requirement RF-01
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffProfile } from "../components/staff/StaffProfile";
import { ToastProvider } from "../components/ui/Toast";
import type { StaffProfile as Data } from "../types";

const mocks = vi.hoisted(() => ({
    getStaffProfile: vi.fn(),
    updateStaffProfile: vi.fn(),
    listPatients: vi.fn(),
    listAlerts: vi.fn(),
    listConsultations: vi.fn(),
    listAccounts: vi.fn(),
    getPasswordChange: vi.fn(),
    requestPasswordChange: vi.fn(),
    cancelPasswordChange: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const base: Data = {
    user_id: "s1",
    email: "medico@hta.demo",
    full_name: "Julián Morales",
    role: "physician",
    phone: "+57 300 000 0200",
    avatar: null,
    license_number: "RM-10020",
    specialty: "Medicina interna",
};

const mount = (role: Data["role"], onProfileChange = vi.fn()) => {
    render(
        <ToastProvider>
            <StaffProfile role={role} onProfileChange={onProfileChange} />
        </ToastProvider>,
    );
    return onProfileChange;
};

describe("StaffProfile", () => {
    beforeEach(() => {
        window.localStorage.clear();
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.getStaffProfile.mockResolvedValue(base);
        mocks.getPasswordChange.mockResolvedValue({ status: "none", requested_at: null });
        mocks.listPatients.mockResolvedValue({ items: [{ user_id: "p1", full_name: "Ana Torres", birth_date: null }], total: 4 });
        mocks.listAlerts.mockResolvedValue({ items: [], total: 2 });
        mocks.listConsultations.mockImplementation((params: { status?: string }) =>
            Promise.resolve({ items: [], total: params.status === "in_review" ? 2 : 1 }),
        );
        mocks.listAccounts.mockResolvedValue({
            items: [
                { id: "u1", email: "a@hta.demo", full_name: "Ana", role: "patient", active: true, consent: null, active_sessions: 2 },
                { id: "u2", email: "b@hta.demo", full_name: "Beto", role: "patient", active: false, consent: null, active_sessions: 0 },
            ],
            total: 2,
        });
    });

    it.each([
        ["physician", "Médico", /ves a tus pacientes/i],
        ["caregiver", "Cuidador", /no las cierras y no respondes consultas/i],
        ["admin", "Administrador", /no abre lecturas, síntomas ni alertas clínicas/i],
    ] as const)("shows the %s identity and what the role may do", async (role, label, copy) => {
        mocks.getStaffProfile.mockResolvedValue({ ...base, role });
        const changed = mount(role);

        expect(await screen.findByText("Julián Morales", { selector: "p" })).toBeInTheDocument();
        expect(screen.getByText(label)).toBeInTheDocument();
        expect(screen.getByText(copy)).toBeInTheDocument();
        expect(screen.getByText("medico@hta.demo")).toBeInTheDocument();
        expect(changed).toHaveBeenCalledWith(expect.objectContaining({ role }));
    });

    it("shows an error when the profile does not load", async () => {
        mocks.getStaffProfile.mockRejectedValue(new Error("down"));
        mount("admin");
        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar tus datos/i);
    });

    it("gives only the physician the license and the specialty", async () => {
        mount("physician");
        expect(await screen.findByText("RM-10020")).toBeInTheDocument();
        expect(screen.getByText("Medicina interna")).toBeInTheDocument();
    });

    it.each(["caregiver", "admin"] as const)("does not show the license to the %s", async (role) => {
        mocks.getStaffProfile.mockResolvedValue({ ...base, role, license_number: null, specialty: null });
        mount(role);
        await screen.findByText("Teléfono");
        expect(screen.queryByText("Registro profesional")).not.toBeInTheDocument();
        expect(screen.queryByText("Especialidad")).not.toBeInTheDocument();
    });

    it("sends only the changed fields and updates the header callback", async () => {
        const saved = { ...base, phone: "3168765432" };
        mocks.updateStaffProfile.mockResolvedValue(saved);
        const changed = mount("physician");
        await userEvent.click(await screen.findByRole("button", { name: "Editar perfil" }));
        expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();

        const phone = screen.getByLabelText("Teléfono");
        await userEvent.clear(phone);
        await userEvent.type(phone, "3168765432");
        await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

        await waitFor(() => expect(mocks.updateStaffProfile).toHaveBeenCalledWith({ phone: "3168765432" }));
        expect(changed).toHaveBeenLastCalledWith(saved);
        expect(await screen.findByRole("button", { name: "Editar perfil" })).toBeInTheDocument();
    });

    it("clears an optional field by sending null", async () => {
        mocks.updateStaffProfile.mockResolvedValue({ ...base, specialty: null });
        mount("physician");
        await userEvent.click(await screen.findByRole("button", { name: "Editar perfil" }));
        await userEvent.clear(screen.getByLabelText("Especialidad"));
        await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
        await waitFor(() => expect(mocks.updateStaffProfile).toHaveBeenCalledWith({ specialty: null }));
    });

    it("does not allow an empty name and does not call the API", async () => {
        mount("caregiver");
        mocks.getStaffProfile.mockResolvedValue({ ...base, role: "caregiver" });
        await userEvent.click(await screen.findByRole("button", { name: "Editar perfil" }));
        await userEvent.clear(screen.getByLabelText("Nombre completo"));
        await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
        expect(await screen.findByText("El nombre no puede quedar vacío")).toBeInTheDocument();
        expect(mocks.updateStaffProfile).not.toHaveBeenCalled();
    });

    it("cancels editing without saving", async () => {
        mount("physician");
        await userEvent.click(await screen.findByRole("button", { name: "Editar perfil" }));
        await userEvent.type(screen.getByLabelText("Teléfono"), "1");
        await userEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
        expect(mocks.updateStaffProfile).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Editar perfil" })).toBeInTheDocument();
    });

    it("reports a save failure and stays in edit mode", async () => {
        mocks.updateStaffProfile.mockRejectedValue(new Error("boom"));
        mount("physician");
        await userEvent.click(await screen.findByRole("button", { name: "Editar perfil" }));
        await userEvent.type(screen.getByLabelText("Teléfono"), "1");
        await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
        expect(await screen.findByText("No se pudo guardar el perfil")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancelar edición" })).toBeInTheDocument();
    });

    it("removes the photo", async () => {
        mocks.getStaffProfile.mockResolvedValue({ ...base, avatar: "data:image/jpeg;base64,/9j/AA==" });
        mocks.updateStaffProfile.mockResolvedValue(base);
        mount("physician");
        await screen.findByRole("img", { name: "Foto de perfil" });
        await userEvent.click(screen.getByRole("button", { name: "Cambiar foto" }));
        await userEvent.click(screen.getByRole("menuitem", { name: "Quitar foto" }));
        await waitFor(() => expect(mocks.updateStaffProfile).toHaveBeenCalledWith({ avatar: null }));
    });

    it("rejects a file that is not an image before opening the editor", async () => {
        mount("physician");
        await screen.findByText("RM-10020");
        const file = new File(["x"], "notas.pdf", { type: "application/pdf" });
        await userEvent.upload(screen.getByTestId("avatar-file-input"), file, { applyAccept: false });
        expect(await screen.findByText("Elige una imagen JPEG, PNG o WebP.")).toBeInTheDocument();
        expect(mocks.updateStaffProfile).not.toHaveBeenCalled();
    });

    it("rejects an image over 10 MB", async () => {
        mount("physician");
        await screen.findByText("RM-10020");
        const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.png", { type: "image/png" });
        await userEvent.upload(screen.getByTestId("avatar-file-input"), big);
        expect(await screen.findByText("La imagen pesa más de 10 MB.")).toBeInTheDocument();
    });

    it("shows the physician practice summary, counting in review plus pending as waiting", async () => {
        mount("physician");
        expect(await screen.findByText("Pacientes asignados")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("Pacientes asignados").nextElementSibling).toHaveTextContent("4"));
        expect(screen.getByText("Consultas por atender").nextElementSibling).toHaveTextContent("3");
        expect(screen.getByText("Alertas críticas abiertas").nextElementSibling).toHaveTextContent("2");
    });

    it("lists the people in charge of a caregiver", async () => {
        mocks.getStaffProfile.mockResolvedValue({ ...base, role: "caregiver" });
        mount("caregiver");
        expect(await screen.findByText("Ana Torres")).toBeInTheDocument();
    });

    it("says so when no physician authorized the caregiver", async () => {
        mocks.getStaffProfile.mockResolvedValue({ ...base, role: "caregiver" });
        mocks.listPatients.mockResolvedValue({ items: [], total: 0 });
        mount("caregiver");
        expect(await screen.findByText(/todavía ningún médico te autorizó/i)).toBeInTheDocument();
    });

    it("counts accounts, active accounts and open sessions for the administrator", async () => {
        mocks.getStaffProfile.mockResolvedValue({ ...base, role: "admin" });
        mount("admin");
        expect(await screen.findByText("Cuentas activas")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("Sesiones abiertas").nextElementSibling).toHaveTextContent("2"));
        expect(screen.getByText("Cuentas", { selector: "p" }).nextElementSibling).toHaveTextContent("2");
        expect(screen.getByText("Cuentas activas").nextElementSibling).toHaveTextContent("1");
    });

    it("shows an error when the summary does not load", async () => {
        mocks.listPatients.mockRejectedValue(new Error("down"));
        mount("physician");
        expect(await screen.findByText(/no se pudo cargar el resumen/i)).toBeInTheDocument();
    });
});
