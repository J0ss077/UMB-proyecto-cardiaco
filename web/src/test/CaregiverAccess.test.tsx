// @requirement RF-02
// @requirement RF-16
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { CaregiverAccessPanel } from "../components/CaregiverAccessPanel";
import { PatientDetail } from "../components/PatientDetail";
import type { PatientCaregiver, ReadingsSummary } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listPatientCaregivers: vi.fn(),
    authorizePatientCaregiver: vi.fn(),
    changePatientCaregiverScope: vi.fn(),
    revokePatientCaregiver: vi.fn(),
    listReadings: vi.fn(),
    listSymptoms: vi.fn(),
    getReadingsSummary: vi.fn(),
    listConsultations: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const link: PatientCaregiver = {
    id: "link1",
    caregiver_user_id: "cui1",
    caregiver_name: "Marta Lucía Gómez",
    caregiver_email: "cuidador@hta.demo",
    authorized_scope: "readings",
    created_at: "2026-10-31T10:00:00Z",
};

const summary: ReadingsSummary = {
    window_start: "2026-11-01T00:00:00Z",
    window_end: "2026-11-08T00:00:00Z",
    sufficient: false,
    valid_count: 0,
    days_with_readings: 0,
    mean_systolic: null,
    mean_diastolic: null,
};

const mount = () => renderWithToasts(<CaregiverAccessPanel patientId="p1" patientName="Ana Torres" />);
const loaded = () => screen.findByRole("heading", { name: "Cuidadores autorizados" });
const panel = async () => within(await screen.findByRole("region", { name: "Cuidadores autorizados" }));
const emailInput = () => screen.getByLabelText(/correo del cuidador/i);
const addButton = () => screen.getByRole("button", { name: /autorizar cuidador/i });

describe("CaregiverAccessPanel", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listPatientCaregivers.mockResolvedValue({ items: [], total: 0 });
        for (const name of ["authorizePatientCaregiver", "changePatientCaregiverScope", "revokePatientCaregiver"] as const) {
            mocks[name].mockResolvedValue(undefined);
        }
        mocks.listReadings.mockResolvedValue({ items: [], total: 0 });
        mocks.listSymptoms.mockResolvedValue({ items: [], total: 0 });
        mocks.getReadingsSummary.mockResolvedValue(summary);
        mocks.listConsultations.mockResolvedValue({ items: [], total: 0 });
    });

    it("explains in one sentence what the section is for when nobody is authorized", async () => {
        mount();
        await loaded();

        expect(await screen.findByText(/aquí autorizas a los cuidadores que acompañan a este paciente; tú fijas su alcance y puedes revocarlo/i)).toBeInTheDocument();
    });

    it("lists each caregiver with the email and the scope", async () => {
        mocks.listPatientCaregivers.mockResolvedValue({ items: [link], total: 1 });
        mount();
        await loaded();

        const list = await panel();
        expect(list.getByText("Marta Lucía Gómez")).toBeInTheDocument();
        expect(list.getByText("cuidador@hta.demo")).toBeInTheDocument();
        expect(list.getByRole("combobox", { name: /alcance de marta lucía gómez/i })).toHaveValue("readings");
    });

    it("adds a caregiver by email with the chosen scope", async () => {
        mount();
        await loaded();
        mocks.listPatientCaregivers.mockResolvedValue({ items: [link], total: 1 });

        await userEvent.type(emailInput(), "cuidador@hta.demo");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: /alcance del nuevo cuidador/i }), "minimal");
        await userEvent.click(addButton());

        await waitFor(() => expect(mocks.authorizePatientCaregiver).toHaveBeenCalledWith("p1", "cuidador@hta.demo", "minimal"));
        expect(await screen.findByRole("status")).toHaveTextContent(/cuidador autorizado/i);
        expect(mocks.listPatientCaregivers.mock.calls.length).toBeGreaterThan(1);
        expect(await screen.findByText("Marta Lucía Gómez")).toBeInTheDocument();
        expect(emailInput()).toHaveValue("");
    });

    it("needs the caregiver's email before calling the API", async () => {
        mount();
        await loaded();
        expect(addButton()).toBeDisabled();

        await userEvent.type(emailInput(), "cuidador@hta.demo");
        expect(addButton()).toBeEnabled();
    });

    it("shows the API message when the authorization is refused", async () => {
        mocks.authorizePatientCaregiver.mockRejectedValue(new ApiError(422, "La cuenta del cuidador no tiene rol de cuidador"));
        mount();
        await loaded();
        await userEvent.type(emailInput(), "paciente2@hta.demo");
        await userEvent.click(addButton());

        expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta del cuidador no tiene rol de cuidador");
    });

    it("changes a caregiver's scope at once", async () => {
        mocks.listPatientCaregivers.mockResolvedValue({ items: [link], total: 1 });
        mount();
        await loaded();
        const list = await panel();

        await userEvent.selectOptions(list.getByRole("combobox", { name: /alcance de marta lucía gómez/i }), "minimal");

        await waitFor(() => expect(mocks.changePatientCaregiverScope).toHaveBeenCalledWith("p1", "link1", "minimal"));
        expect(await screen.findByRole("status")).toHaveTextContent(/alcance actualizado/i);
    });

    it("shows the API message when the scope cannot be changed", async () => {
        mocks.listPatientCaregivers.mockResolvedValue({ items: [link], total: 1 });
        mocks.changePatientCaregiverScope.mockRejectedValue(new ApiError(404, "El vínculo no existe"));
        mount();
        await loaded();
        const list = await panel();

        await userEvent.selectOptions(list.getByRole("combobox", { name: /alcance de marta lucía gómez/i }), "minimal");

        expect(await screen.findByRole("alert")).toHaveTextContent("El vínculo no existe");
    });

    it("asks before revoking and backs out on Cancel", async () => {
        mocks.listPatientCaregivers.mockResolvedValue({ items: [link], total: 1 });
        mount();
        await loaded();
        const list = await panel();

        await userEvent.click(list.getByRole("button", { name: /^revocar$/i }));
        expect(list.getByText(/marta lucía gómez dejará de ver los datos de ana torres/i)).toBeInTheDocument();
        expect(mocks.revokePatientCaregiver).not.toHaveBeenCalled();

        await userEvent.click(list.getByRole("button", { name: /^cancelar$/i }));
        expect(list.getByRole("button", { name: /^revocar$/i })).toBeInTheDocument();
        expect(mocks.revokePatientCaregiver).not.toHaveBeenCalled();
    });

    it("revokes the caregiver after the confirmation", async () => {
        mocks.listPatientCaregivers.mockResolvedValue({ items: [link], total: 1 });
        mount();
        await loaded();
        const list = await panel();
        mocks.listPatientCaregivers.mockResolvedValue({ items: [], total: 0 });

        await userEvent.click(list.getByRole("button", { name: /^revocar$/i }));
        await userEvent.click(list.getByRole("button", { name: /confirmar/i }));

        await waitFor(() => expect(mocks.revokePatientCaregiver).toHaveBeenCalledWith("p1", "link1"));
        expect(await screen.findByRole("status")).toHaveTextContent(/autorización revocada/i);
        expect(await screen.findByText(/aquí autorizas a los cuidadores/i)).toBeInTheDocument();
    });

    it("shows the API message when the revocation fails", async () => {
        mocks.listPatientCaregivers.mockResolvedValue({ items: [link], total: 1 });
        mocks.revokePatientCaregiver.mockRejectedValue(new ApiError(404, "El vínculo no existe"));
        mount();
        await loaded();
        const list = await panel();

        await userEvent.click(list.getByRole("button", { name: /^revocar$/i }));
        await userEvent.click(list.getByRole("button", { name: /confirmar/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent("El vínculo no existe");
    });

    it("reports a failure loading the caregivers", async () => {
        mocks.listPatientCaregivers.mockRejectedValue(new Error("boom"));
        mount();

        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar los cuidadores/i);
    });

    it("appears in the physician's patient detail and stays out of the caregiver's", async () => {
        const patient = { user_id: "p1", full_name: "Ana Torres", birth_date: null };
        const { unmount } = renderWithToasts(<PatientDetail patient={patient} onClose={vi.fn()} manageCaregivers />);
        expect(await screen.findByRole("heading", { name: "Cuidadores autorizados" })).toBeInTheDocument();
        unmount();

        renderWithToasts(<PatientDetail patient={patient} onClose={vi.fn()} />);
        await screen.findByTestId("patient-detail");
        expect(screen.queryByRole("heading", { name: "Cuidadores autorizados" })).not.toBeInTheDocument();
    });
});
