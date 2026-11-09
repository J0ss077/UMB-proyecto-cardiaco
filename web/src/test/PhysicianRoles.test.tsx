// @requirement RF-16
// @requirement RF-19
// @requirement RF-24
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhysicianView } from "../components/PhysicianView";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listPatients: vi.fn(),
    listAlerts: vi.fn(),
    listReadings: vi.fn(),
    listSymptoms: vi.fn(),
    getReadingsSummary: vi.fn(),
    listConsultations: vi.fn(),
    respondConsultation: vi.fn(),
    getProfile: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const patients = {
    items: [
        { user_id: "p1", full_name: "Ana María Torres Gil", birth_date: "1955-01-30" },
        { user_id: "p2", full_name: "Carlos Pérez Ruiz", birth_date: null },
    ],
    total: 2,
};

const reading = (patientId: string, systolic: number, diastolic: number) => ({
    id: `r-${patientId}`,
    patient_id: patientId,
    systolic,
    diastolic,
    heart_rate: 70,
    source: "manual",
    measured_at: "2026-11-07T20:00:00Z",
    validation_status: "valid",
});

describe("PhysicianView for each role", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listPatients.mockResolvedValue(patients);
        mocks.listAlerts.mockResolvedValue({ items: [], total: 2 });
        mocks.listReadings.mockImplementation(({ patient_id, limit }: { patient_id: string; limit: number }) =>
            Promise.resolve({ items: [reading(patient_id, patient_id === "p1" ? 118 : 150, 80)], total: limit === 1 ? 1 : 1 }),
        );
        mocks.listSymptoms.mockResolvedValue({ items: [], total: 0 });
        mocks.getReadingsSummary.mockRejectedValue(new Error("none"));
        mocks.listConsultations.mockImplementation((params: { status?: string }) =>
            Promise.resolve({ items: [], total: params?.status === "pending" ? 0 : 3 }),
        );
        mocks.getProfile.mockResolvedValue(null);
    });

    describe("as a physician", () => {
        it("shows the three indicators and lets each one open its page", async () => {
            const onOpenAlerts = vi.fn();
            const onOpenConsultations = vi.fn();
            renderWithToasts(<PhysicianView onOpenAlerts={onOpenAlerts} onOpenConsultations={onOpenConsultations} />);
            await screen.findByText("Ana María Torres Gil");

            expect(screen.getByTestId("kpi-patients")).toHaveTextContent("2");
            expect(screen.getByTestId("kpi-critical-alerts")).toHaveTextContent("2");
            expect(screen.getByTestId("kpi-consultations")).toHaveTextContent("3");

            await userEvent.click(screen.getByRole("button", { name: /alertas críticas pendientes/i }));
            await userEvent.click(screen.getByRole("button", { name: /consultas pendientes/i }));
            expect(onOpenAlerts).toHaveBeenCalledTimes(1);
            expect(onOpenConsultations).toHaveBeenCalledTimes(1);
        });

        it("leaves the indicators as plain cards when no page is wired", async () => {
            renderWithToasts(<PhysicianView />);
            await screen.findByText("Ana María Torres Gil");
            expect(screen.queryByRole("button", { name: /alertas críticas pendientes/i })).not.toBeInTheDocument();
        });

        it("offers to download the history of the patient in the detail", async () => {
            const createObjectURL = vi.fn(() => "blob:mock");
            Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
            const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
            renderWithToasts(<PhysicianView />);

            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));
            await userEvent.click(await screen.findByRole("button", { name: /descargar historial/i }));
            await userEvent.click(screen.getByRole("radio", { name: /excel/i }));
            await userEvent.click(screen.getByRole("button", { name: /^descargar$/i }));

            await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
            expect(mocks.listReadings).toHaveBeenCalledWith(expect.objectContaining({ patient_id: "p1", since: expect.any(String), limit: 200 }));
            click.mockRestore();
        });
    });

    describe("as a caregiver", () => {
        const caregiver = (props: Record<string, unknown> = {}) =>
            renderWithToasts(
                <PhysicianView
                    heading="Pacientes autorizados"
                    includeConsultations={false}
                    notice="Estas cifras las revisa el médico."
                    emptyMessage="Todavía nadie te autorizó."
                    patientsLabel="Pacientes autorizados"
                    {...props}
                />,
            );

        it("shows two indicators, a notice and never asks for consultations", async () => {
            caregiver();
            await screen.findByText("Ana María Torres Gil");

            expect(screen.getByRole("heading", { name: "Pacientes autorizados" })).toBeInTheDocument();
            expect(screen.getByText("Estas cifras las revisa el médico.")).toBeInTheDocument();
            expect(screen.getByTestId("kpi-patients")).toBeInTheDocument();
            expect(screen.getByTestId("kpi-critical-alerts")).toBeInTheDocument();
            expect(screen.queryByTestId("kpi-consultations")).not.toBeInTheDocument();
            expect(mocks.listConsultations).not.toHaveBeenCalled();
        });

        it("opens a patient without consultations, without a way to answer and without export", async () => {
            caregiver();

            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));

            const detail = await screen.findByTestId("patient-detail");
            expect(await within(detail).findByRole("heading", { name: "Ana María Torres Gil" })).toBeInTheDocument();
            expect(screen.queryByTestId("detail-consultations")).not.toBeInTheDocument();
            expect(within(detail).queryByRole("button", { name: /descargar historial/i })).not.toBeInTheDocument();
            expect(within(detail).queryByRole("button", { name: /responder/i })).not.toBeInTheDocument();
            expect(mocks.listConsultations).not.toHaveBeenCalled();
        });

        it("says nobody authorized the caregiver yet", async () => {
            mocks.listPatients.mockResolvedValue({ items: [], total: 0 });
            caregiver();
            expect(await screen.findByText("Todavía nadie te autorizó.")).toBeInTheDocument();
        });

        it("keeps working when the caregiver's scope is minimal and the API returns an empty page", async () => {
            mocks.listPatients.mockResolvedValue({ items: [], total: 0 });
            mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });
            caregiver();
            expect(await screen.findByTestId("kpi-patients")).toHaveTextContent("0");
        });
    });

    afterEach(() => vi.restoreAllMocks());
});
