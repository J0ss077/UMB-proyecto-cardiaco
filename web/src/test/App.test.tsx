// @requirement RF-02
// @requirement RF-03
// @requirement RF-19
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveSession, loadSession } from "../auth";
import { ApiError, CONSENT_REQUIRED_DETAIL } from "../api";
import App from "../App";

const mocks = vi.hoisted(() => ({
    getConsent: vi.fn(),
    acceptConsent: vi.fn(),
    revokeConsent: vi.fn(),
    listReadings: vi.fn(),
    getReadingsSummary: vi.fn(),
    listSymptoms: vi.fn(),
    listAlerts: vi.fn(),
    listPatients: vi.fn(),
    getProfile: vi.fn(),
    listConsultations: vi.fn(),
    listAccounts: vi.fn(),
    listRecipients: vi.fn(),
    logout: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const empty = { items: [], total: 0 };
const latest = {
    id: "r1",
    patient_id: "p1",
    systolic: 120,
    diastolic: 80,
    heart_rate: 70,
    source: "manual",
    measured_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    validation_status: "valid",
};

describe("App", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.getConsent.mockResolvedValue({ active: true, requires_acceptance_of_version: null });
        mocks.listReadings.mockResolvedValue({ items: [latest], total: 1 });
        mocks.listSymptoms.mockResolvedValue(empty);
        mocks.listAlerts.mockResolvedValue(empty);
        mocks.listPatients.mockResolvedValue(empty);
        mocks.getProfile.mockResolvedValue(null);
        mocks.listConsultations.mockResolvedValue(empty);
        mocks.listRecipients.mockResolvedValue(empty);
        mocks.listAccounts.mockResolvedValue(empty);
        mocks.getReadingsSummary.mockResolvedValue({
            window_start: "2026-11-01T00:00:00Z",
            window_end: "2026-11-08T00:00:00Z",
            sufficient: false,
            valid_count: 2,
            days_with_readings: 1,
            mean_systolic: null,
            mean_diastolic: null,
        });
        mocks.logout.mockImplementation(async () => {
            window.localStorage.clear();
        });
    });

    it("shows the sign-in screen without a session", () => {
        render(<App />);
        expect(screen.getByRole("heading", { name: /bienvenido a hipertai/i })).toBeInTheDocument();
    });

    it("shows the latest reading on the patient home", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        render(<App />);

        const card = await screen.findByTestId("latest-reading");
        expect(card).toHaveTextContent("120");
        expect(card).toHaveTextContent("80");
        expect(card).toHaveTextContent(/hace 5 min/i);
    });

    it("shows an open alert on the patient home", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        mocks.listAlerts.mockResolvedValue({
            items: [
                {
                    id: "a1",
                    patient_id: "p1",
                    type: "crisis_hipertensiva",
                    severity: "critical",
                    status: "open",
                    note: "Lecturas domiciliarias de 186/122 mmHg; pendiente de revisión médica.",
                    created_at: "2026-11-07T21:00:00Z",
                    validated_by: null,
                    validated_at: null,
                },
            ],
            total: 1,
        });
        render(<App />);

        expect(await screen.findByTestId("open-alert")).toHaveTextContent(/pendiente de revisión médica/i);
    });

    it("asks for consent before showing clinical screens and accepts on request", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        mocks.getConsent
            .mockResolvedValueOnce({ active: false, requires_acceptance_of_version: 1 })
            .mockResolvedValue({ active: true, requires_acceptance_of_version: null });
        mocks.acceptConsent.mockResolvedValue({ id: "c1" });
        render(<App />);

        await userEvent.click(await screen.findByRole("button", { name: /acepto el consentimiento/i }));

        await waitFor(() => expect(mocks.acceptConsent).toHaveBeenCalled());
        expect(await screen.findByTestId("latest-reading")).toBeInTheDocument();
    });

    it("opens the physician home", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "physician" });
        render(<App />);
        expect(await screen.findByRole("heading", { name: "Por atender" })).toBeInTheDocument();
        expect(mocks.getConsent).not.toHaveBeenCalled();
    });

    it("opens the administrator accounts screen without clinical data", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "admin" });
        render(<App />);
        expect(await screen.findByRole("heading", { name: "Cuentas" })).toBeInTheDocument();
        expect(screen.getByText(/no ve lecturas, síntomas ni alertas clínicas/i)).toBeInTheDocument();
        expect(mocks.listPatients).not.toHaveBeenCalled();
    });

    it("signs out and returns to the sign-in screen", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "physician" });
        render(<App />);

        await userEvent.click(await screen.findByRole("button", { name: /cerrar sesión/i }));

        expect(await screen.findByRole("heading", { name: /bienvenido a hipertai/i })).toBeInTheDocument();
        expect(loadSession()).toBeNull();
    });

    it("shows the AI recommendation and the risk level on the patient home", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        render(<App />);

        expect(await screen.findByText("Recomendación IA")).toBeInTheDocument();
        expect(screen.getByText(/tus niveles suben por las mañanas/i)).toBeInTheDocument();
        expect(screen.getByTestId("risk-level")).toHaveTextContent("Bajo riesgo");
        expect(screen.getByRole("button", { name: /conectar dispositivo/i })).toBeInTheDocument();
    });

    it("shows the consent gate when the summary is blocked by consent", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        mocks.getConsent
            .mockResolvedValueOnce({ active: true, requires_acceptance_of_version: null })
            .mockResolvedValue({ active: false, requires_acceptance_of_version: 1 });
        mocks.getReadingsSummary.mockRejectedValue(new ApiError(403, CONSENT_REQUIRED_DETAIL));

        render(<App />);

        expect(await screen.findByRole("heading", { name: "Consentimiento informado" })).toBeInTheDocument();
        expect(screen.queryByTestId("risk-level")).not.toBeInTheDocument();
        expect(mocks.getConsent).toHaveBeenCalledTimes(2);
    });

    it("opens the blank chatbot tab", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        render(<App />);

        await userEvent.click(await screen.findByRole("button", { name: "Chatbot" }));

        expect(screen.getByRole("heading", { name: "Asistente HipertAI" })).toBeInTheDocument();
    });

    it("opens the connect device screen from the home and comes back", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        render(<App />);

        await userEvent.click(await screen.findByRole("button", { name: /conectar dispositivo/i }));
        expect(screen.getByRole("heading", { name: "Conectar dispositivo" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /volver/i }));
        expect(await screen.findByTestId("latest-reading")).toBeInTheDocument();
    });

    it("opens the medical help screen from the bottom bar", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        render(<App />);

        await userEvent.click(await screen.findByRole("button", { name: "Ayuda" }));

        expect(await screen.findByRole("heading", { name: "Necesito ayuda médica" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /llamar a emergencias/i })).toHaveAttribute("href", "tel:123");
    });
});
