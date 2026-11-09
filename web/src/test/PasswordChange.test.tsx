// @requirement RF-02
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { AdminPasswordRequests } from "../components/staff/AdminPasswordRequests";
import { PasswordChangeCard, validatePasswordChange } from "../components/staff/PasswordChangeCard";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
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

const none = { status: "none", requested_at: null } as const;

describe("validatePasswordChange", () => {
    it("accepts a long, different and confirmed password", () => {
        expect(validatePasswordChange("actual", "nueva-clave-9", "nueva-clave-9")).toEqual({});
    });

    it("reports every problem it finds", () => {
        expect(validatePasswordChange("", "corta", "otra")).toEqual({
            current: "Escribe tu contraseña actual",
            next: "Usa al menos 8 caracteres",
            confirm: "Las contraseñas no coinciden",
        });
    });

    it("rejects a new password equal to the current one", () => {
        expect(validatePasswordChange("misma-clave-1", "misma-clave-1", "misma-clave-1").next).toMatch(/distinta de la actual/);
    });
});

describe("PasswordChangeCard", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.getPasswordChange.mockResolvedValue(none);
    });

    const fill = async (current: string, next: string, confirm: string) => {
        await userEvent.type(await screen.findByLabelText("Contraseña actual"), current);
        await userEvent.type(screen.getByLabelText("Contraseña nueva"), next);
        await userEvent.type(screen.getByLabelText("Repite la contraseña nueva"), confirm);
    };

    it.each(["physician", "caregiver"] as const)("tells the %s that an administrator must approve", async (role) => {
        renderWithToasts(<PasswordChangeCard role={role} />);
        expect(await screen.findByText(/no se aplica hasta que un administrador lo apruebe/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pedir cambio de contraseña" })).toBeInTheDocument();
    });

    it("tells the administrator the change is immediate", async () => {
        renderWithToasts(<PasswordChangeCard role="admin" />);
        expect(await screen.findByText(/se aplica al momento/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeInTheDocument();
    });

    it("does not call the API with an invalid form and shows each error", async () => {
        renderWithToasts(<PasswordChangeCard role="physician" />);
        await fill("actual", "corta", "otra");
        await userEvent.click(screen.getByRole("button", { name: "Pedir cambio de contraseña" }));

        expect(screen.getByText("Usa al menos 8 caracteres")).toBeInTheDocument();
        expect(screen.getByText("Las contraseñas no coinciden")).toBeInTheDocument();
        expect(mocks.requestPasswordChange).not.toHaveBeenCalled();
    });

    it("sends the request, clears the form and shows it as waiting", async () => {
        mocks.requestPasswordChange.mockResolvedValue({ status: "pending", requested_at: "2026-11-09T15:00:00Z" });
        renderWithToasts(<PasswordChangeCard role="physician" />);
        await fill("actual", "nueva-clave-9", "nueva-clave-9");
        await userEvent.click(screen.getByRole("button", { name: "Pedir cambio de contraseña" }));

        await waitFor(() =>
            expect(mocks.requestPasswordChange).toHaveBeenCalledWith({ current_password: "actual", new_password: "nueva-clave-9" }),
        );
        expect(await screen.findByText(/pediste cambiar tu contraseña/i)).toBeInTheDocument();
        expect(screen.queryByLabelText("Contraseña actual")).not.toBeInTheDocument();
    });

    it("shows the pending state when it loads and lets the person withdraw it", async () => {
        mocks.getPasswordChange.mockResolvedValue({ status: "pending", requested_at: "2026-11-09T15:00:00Z" });
        mocks.cancelPasswordChange.mockResolvedValue(undefined);
        renderWithToasts(<PasswordChangeCard role="caregiver" />);

        await userEvent.click(await screen.findByRole("button", { name: "Cancelar solicitud" }));

        await waitFor(() => expect(mocks.cancelPasswordChange).toHaveBeenCalledTimes(1));
        expect(await screen.findByLabelText("Contraseña actual")).toBeInTheDocument();
    });

    it("puts the server's message under the current password when it is wrong", async () => {
        mocks.requestPasswordChange.mockRejectedValue(new ApiError(400, "La contraseña actual no es correcta"));
        renderWithToasts(<PasswordChangeCard role="physician" />);
        await fill("mala", "nueva-clave-9", "nueva-clave-9");
        await userEvent.click(screen.getByRole("button", { name: "Pedir cambio de contraseña" }));

        expect(await screen.findByText("La contraseña actual no es correcta")).toBeInTheDocument();
        expect(screen.getByLabelText("Contraseña actual")).toBeInTheDocument();
    });

    it("signs the administrator out after an immediate change", async () => {
        mocks.requestPasswordChange.mockResolvedValue({ status: "changed", requested_at: null });
        const onChangedNow = vi.fn();
        renderWithToasts(<PasswordChangeCard role="admin" onChangedNow={onChangedNow} />);
        await fill("actual", "nueva-clave-9", "nueva-clave-9");
        await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

        await waitFor(() => expect(onChangedNow).toHaveBeenCalledTimes(1));
    });

    it("reports a failed status load without hiding the form", async () => {
        mocks.getPasswordChange.mockRejectedValue(new Error("down"));
        renderWithToasts(<PasswordChangeCard role="physician" />);
        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo consultar/i);
        expect(screen.getByLabelText("Contraseña actual")).toBeInTheDocument();
    });
});

describe("AdminPasswordRequests", () => {
    const request = (id: string, name: string, role: "physician" | "caregiver") => ({
        user_id: id,
        email: `${id}@hta.demo`,
        full_name: name,
        role,
        requested_at: "2026-11-09T15:00:00Z",
    });

    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
    });

    it("renders nothing when there are no requests", async () => {
        mocks.listPasswordRequests.mockResolvedValue({ items: [] });
        renderWithToasts(<AdminPasswordRequests />);
        await waitFor(() => expect(mocks.listPasswordRequests).toHaveBeenCalled());
        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("lists who asked, with their role and email, and no password", async () => {
        mocks.listPasswordRequests.mockResolvedValue({ items: [request("m1", "Julián Morales", "physician")] });
        renderWithToasts(<AdminPasswordRequests />);

        expect(await screen.findByRole("heading", { name: "Solicitudes de cambio de contraseña" })).toBeInTheDocument();
        expect(screen.getByText("Julián Morales")).toBeInTheDocument();
        expect(screen.getByText(/Médico · m1@hta\.demo/)).toBeInTheDocument();
    });

    it("approves a request, removes it and tells the parent", async () => {
        mocks.listPasswordRequests.mockResolvedValue({ items: [request("m1", "Julián Morales", "physician"), request("c1", "Marta Gómez", "caregiver")] });
        mocks.approvePasswordRequest.mockResolvedValue(undefined);
        const onChanged = vi.fn();
        renderWithToasts(<AdminPasswordRequests onChanged={onChanged} />);

        await userEvent.click(await screen.findByRole("button", { name: "Aprobar a Julián Morales" }));

        await waitFor(() => expect(mocks.approvePasswordRequest).toHaveBeenCalledWith("m1"));
        await waitFor(() => expect(screen.queryByText("Julián Morales")).not.toBeInTheDocument());
        expect(screen.getByText("Marta Gómez")).toBeInTheDocument();
        expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it("rejects a request", async () => {
        mocks.listPasswordRequests.mockResolvedValue({ items: [request("c1", "Marta Gómez", "caregiver")] });
        mocks.rejectPasswordRequest.mockResolvedValue(undefined);
        renderWithToasts(<AdminPasswordRequests />);

        await userEvent.click(await screen.findByRole("button", { name: "Rechazar a Marta Gómez" }));

        await waitFor(() => expect(mocks.rejectPasswordRequest).toHaveBeenCalledWith("c1"));
        await waitFor(() => expect(screen.queryByText("Marta Gómez")).not.toBeInTheDocument());
    });

    it("keeps the request and shows the server's message when the decision fails", async () => {
        mocks.listPasswordRequests.mockResolvedValue({ items: [request("m1", "Julián Morales", "physician")] });
        mocks.approvePasswordRequest.mockRejectedValue(new ApiError(404, "No hay una solicitud de cambio de contraseña para esa cuenta"));
        renderWithToasts(<AdminPasswordRequests />);

        await userEvent.click(await screen.findByRole("button", { name: "Aprobar a Julián Morales" }));

        expect(await screen.findByText(/no hay una solicitud/i)).toBeInTheDocument();
        expect(screen.getByText("Julián Morales")).toBeInTheDocument();
    });

    it("reports a failed load", async () => {
        mocks.listPasswordRequests.mockRejectedValue(new Error("down"));
        renderWithToasts(<AdminPasswordRequests />);
        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar las solicitudes/i);
        expect(within(document.body).queryByRole("button", { name: /aprobar/i })).not.toBeInTheDocument();
    });
});

describe("the eye on the password fields", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.getPasswordChange.mockResolvedValue(none);
    });

    it("hides every field by default and shows only the one whose eye is pressed", async () => {
        renderWithToasts(<PasswordChangeCard role="physician" />);
        const current = await screen.findByLabelText("Contraseña actual");
        const next = screen.getByLabelText("Contraseña nueva");
        expect(current).toHaveAttribute("type", "password");
        expect(screen.getAllByRole("button", { name: "Mostrar contraseña" })).toHaveLength(3);

        await userEvent.click(screen.getAllByRole("button", { name: "Mostrar contraseña" })[1]!);

        expect(next).toHaveAttribute("type", "text");
        expect(current).toHaveAttribute("type", "password");
        expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute("aria-pressed", "true");
    });

    it("hides the password again and keeps what was typed", async () => {
        renderWithToasts(<PasswordChangeCard role="admin" />);
        const field = await screen.findByLabelText("Contraseña actual");
        await userEvent.type(field, "secreta-1");
        await userEvent.click(screen.getAllByRole("button", { name: "Mostrar contraseña" })[0]!);
        expect(field).toHaveValue("secreta-1");
        await userEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
        expect(field).toHaveAttribute("type", "password");
        expect(field).toHaveValue("secreta-1");
    });
});
