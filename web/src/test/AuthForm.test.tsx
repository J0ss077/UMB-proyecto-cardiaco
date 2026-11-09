// @requirement RF-01
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { AuthForm } from "../components/AuthForm";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    login: mocks.login,
    register: mocks.register,
}));

describe("AuthForm", () => {
    beforeEach(() => {
        mocks.login.mockReset();
        mocks.register.mockReset();
    });

    it("signs in and reports the session", async () => {
        const pair = { access_token: "a", refresh_token: "r", role: "patient" as const };
        mocks.login.mockResolvedValue(pair);
        const onAuthenticated = vi.fn();
        renderWithToasts(<AuthForm onAuthenticated={onAuthenticated} />);

        await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
        await userEvent.type(screen.getByLabelText("Contraseña"), "Secreto123");
        await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

        await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(pair));
        expect(mocks.login).toHaveBeenCalledWith({ email: "ana@example.com", password: "Secreto123" });
    });

    it("shows the API detail in a toast when credentials are wrong", async () => {
        mocks.login.mockRejectedValue(new ApiError(401, "Credenciales inválidas"));
        renderWithToasts(<AuthForm onAuthenticated={vi.fn()} />);

        await userEvent.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
        await userEvent.type(screen.getByLabelText("Contraseña"), "mala");
        await userEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Credenciales inválidas");
    });

    it("blocks registration until the password rules and terms are met", async () => {
        renderWithToasts(<AuthForm onAuthenticated={vi.fn()} />);
        await userEvent.click(screen.getByRole("button", { name: /regístrate/i }));

        await userEvent.type(screen.getByLabelText(/nombre completo/i), "Ana Rojas");
        await userEvent.type(screen.getByLabelText(/fecha de nacimiento/i), "1971-03-14");
        await userEvent.type(screen.getByLabelText(/^correo electrónico/i), "ana@example.com");
        await userEvent.type(screen.getByLabelText(/^contraseña/i), "corta");
        await userEvent.type(screen.getByLabelText(/confirmar contraseña/i), "corta");
        await userEvent.click(screen.getByRole("button", { name: /^registrarse$/i }));

        expect(mocks.register).not.toHaveBeenCalled();
        expect(screen.getByText(/mínimo 8 caracteres/i)).toBeInTheDocument();
    });

    it("registers and then signs in with the same credentials", async () => {
        const pair = { access_token: "a", refresh_token: "r", role: "patient" as const };
        mocks.register.mockResolvedValue({ id: "u1" });
        mocks.login.mockResolvedValue(pair);
        const onAuthenticated = vi.fn();
        renderWithToasts(<AuthForm onAuthenticated={onAuthenticated} />);
        await userEvent.click(screen.getByRole("button", { name: /regístrate/i }));

        await userEvent.type(screen.getByLabelText(/nombre completo/i), "Ana Rojas");
        await userEvent.type(screen.getByLabelText(/fecha de nacimiento/i), "1971-03-14");
        await userEvent.type(screen.getByLabelText(/^correo electrónico/i), "ana@example.com");
        await userEvent.type(screen.getByLabelText(/^contraseña/i), "Secreto123");
        await userEvent.type(screen.getByLabelText(/confirmar contraseña/i), "Secreto123");
        await userEvent.click(screen.getByRole("checkbox", { name: /acepto los términos/i }));
        await userEvent.click(screen.getByRole("button", { name: /^registrarse$/i }));

        await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(pair));
        expect(mocks.register).toHaveBeenCalledWith({
            email: "ana@example.com",
            password: "Secreto123",
            full_name: "Ana Rojas",
            birth_date: "1971-03-14",
        });
    });

    it("shows the brand panel with the product promises next to the form", () => {
        renderWithToasts(<AuthForm onAuthenticated={vi.fn()} />);

        const panel = screen.getByTestId("auth-brand-panel");
        expect(within(panel).getByRole("heading", { name: /tu presión arterial, a la vista/i })).toBeInTheDocument();
        expect(within(panel).getByText(/tu médico revisa cada alerta/i)).toBeInTheDocument();
        expect(screen.getByRole("form", { name: /inicio de sesión/i })).toBeInTheDocument();
    });

    it("keeps the brand panel while registering", async () => {
        renderWithToasts(<AuthForm onAuthenticated={vi.fn()} />);
        await userEvent.click(screen.getByRole("button", { name: /regístrate/i }));

        expect(screen.getByTestId("auth-brand-panel")).toBeInTheDocument();
        expect(screen.getByRole("form", { name: /registro/i })).toBeInTheDocument();
    });

    it("offers the light and dark switch before signing in", () => {
        renderWithToasts(<AuthForm onAuthenticated={vi.fn()} />);
        expect(screen.getByRole("switch", { name: /modo oscuro/i })).toBeInTheDocument();
    });
});
