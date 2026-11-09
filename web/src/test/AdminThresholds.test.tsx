// @requirement RF-15
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { AdminThresholds } from "../components/staff/AdminThresholds";
import type { AlertConfigRow } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({ listAlertConfig: vi.fn(), updateAlertRecipients: vi.fn(), updateAlertThresholds: vi.fn() }));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const row = (id: string, overrides: Partial<AlertConfigRow> = {}): AlertConfigRow => ({
    id,
    patient_user_id: null,
    patient_name: null,
    metric: "systolic",
    low_threshold: 90,
    high_threshold: 140,
    critical_low: null,
    critical_high: 180,
    recipients: ["patient", "physician"],
    ...overrides,
});

const rows = [row("g1"), row("p1", { metric: "diastolic", patient_user_id: "u1", patient_name: "Ana Torres", low_threshold: null, high_threshold: 90, critical_high: 120, recipients: [] })];

const mount = () => renderWithToasts(<AdminThresholds />);
const item = (metric: RegExp) => screen.getByRole("listitem", { name: metric });

describe("AdminThresholds", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listAlertConfig.mockResolvedValue({ items: rows, total: 2 });
        mocks.updateAlertRecipients.mockResolvedValue(undefined);
        mocks.updateAlertThresholds.mockResolvedValue(undefined);
    });

    describe("the page", () => {
        it("says the band can be edited and is not clinical evidence yet", async () => {
            mount();
            expect(await screen.findByRole("heading", { name: "Umbrales" })).toBeInTheDocument();
            expect(screen.getByText(/desde dónde y hasta dónde/i)).toBeInTheDocument();
            expect(screen.getByText(/no cuentan como evidencia hasta la firma clínica/i)).toBeInTheDocument();
        });

        it("shows each configuration with its four edges, an empty field for a missing one, and whose it is", async () => {
            mount();
            await screen.findByRole("heading", { name: "Umbrales" });

            const general = within(item(/presión sistólica/i));
            expect(general.getByText("Configuración general")).toBeInTheDocument();
            expect(general.getByRole("spinbutton", { name: "Aviso desde" })).toHaveValue(90);
            expect(general.getByRole("spinbutton", { name: "Aviso hasta" })).toHaveValue(140);
            expect(general.getByRole("spinbutton", { name: "Crítico desde" })).toHaveValue(null);
            expect(general.getByRole("spinbutton", { name: "Crítico hasta" })).toHaveValue(180);
            const patient = within(item(/presión diastólica/i));
            expect(patient.getByText("Ana Torres")).toBeInTheDocument();
            expect(patient.getByRole("spinbutton", { name: "Aviso desde" })).toHaveValue(null);
            expect(patient.getByRole("spinbutton", { name: "Aviso hasta" })).toHaveValue(90);
            expect(patient.getByRole("spinbutton", { name: "Crítico hasta" })).toHaveValue(120);
        });

        it("says there is nothing configured", async () => {
            mocks.listAlertConfig.mockResolvedValue({ items: [], total: 0 });
            mount();
            expect(await screen.findByText(/no hay umbrales configurados/i)).toBeInTheDocument();
        });

        it("says it is loading and reports a failure", async () => {
            mocks.listAlertConfig.mockRejectedValue(new Error("boom"));
            mount();

            expect(screen.getByText(/cargando umbrales/i)).toBeInTheDocument();
            expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar los umbrales/i);
        });
    });

    describe("the recipients", () => {
        it("shows who receives each metric's notice", async () => {
            mount();
            await screen.findByRole("heading", { name: "Umbrales" });

            const general = within(item(/presión sistólica/i));
            expect(general.getByRole("checkbox", { name: "Paciente" })).toBeChecked();
            expect(general.getByRole("checkbox", { name: "Médico" })).toBeChecked();
            expect(general.getByRole("checkbox", { name: "Cuidador" })).not.toBeChecked();
        });

        it("keeps Save off until something changes", async () => {
            mount();
            await screen.findByRole("heading", { name: "Umbrales" });
            const general = within(item(/presión sistólica/i));
            const save = general.getByRole("button", { name: /guardar cambios/i });
            expect(save).toBeDisabled();

            await userEvent.click(general.getByRole("checkbox", { name: "Cuidador" }));
            expect(save).toBeEnabled();

            await userEvent.click(general.getByRole("checkbox", { name: "Cuidador" }));
            expect(save).toBeDisabled();
        });

        it("saves the chosen recipients for that row only", async () => {
            mount();
            await screen.findByRole("heading", { name: "Umbrales" });
            const general = within(item(/presión sistólica/i));

            await userEvent.click(general.getByRole("checkbox", { name: "Cuidador" }));
            await userEvent.click(general.getByRole("checkbox", { name: "Paciente" }));
            await userEvent.click(general.getByRole("button", { name: /guardar cambios/i }));

            await waitFor(() => expect(mocks.updateAlertRecipients).toHaveBeenCalledWith("g1", ["physician", "caregiver"]));
            expect(mocks.updateAlertThresholds).not.toHaveBeenCalled();
            expect(await screen.findByRole("status")).toHaveTextContent(/destinatarios guardados/i);
            expect(general.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
            expect(within(item(/presión diastólica/i)).getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
        });

        it("saves the band for that row and leaves the other one alone", async () => {
            mount();
            await screen.findByRole("heading", { name: "Umbrales" });
            const general = within(item(/presión sistólica/i));

            fireEvent.change(general.getByRole("spinbutton", { name: "Aviso desde" }), { target: { value: "85" } });
            fireEvent.change(general.getByRole("spinbutton", { name: "Crítico desde" }), { target: { value: "70" } });
            await userEvent.click(general.getByRole("button", { name: /guardar cambios/i }));

            await waitFor(() =>
                expect(mocks.updateAlertThresholds).toHaveBeenCalledWith("g1", {
                    low_threshold: 85,
                    high_threshold: 140,
                    critical_low: 70,
                    critical_high: 180,
                }),
            );
            expect(mocks.updateAlertRecipients).not.toHaveBeenCalled();
            expect(await screen.findByRole("status")).toHaveTextContent(/umbrales guardados/i);
            expect(general.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
        });

        it("refuses an inverted band before asking the server", async () => {
            mount();
            await screen.findByRole("heading", { name: "Umbrales" });
            const general = within(item(/presión sistólica/i));

            fireEvent.change(general.getByRole("spinbutton", { name: "Aviso desde" }), { target: { value: "150" } });

            expect(general.getByText(/el aviso desde tiene que ser menor que el aviso hasta/i)).toBeInTheDocument();
            expect(general.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
            expect(mocks.updateAlertThresholds).not.toHaveBeenCalled();
        });

        it("warns when nobody would receive the notice", async () => {
            mount();
            await screen.findByRole("heading", { name: "Umbrales" });

            expect(within(item(/presión diastólica/i)).getByText(/nadie recibirá el aviso/i)).toBeInTheDocument();
            await userEvent.click(within(item(/presión sistólica/i)).getByRole("checkbox", { name: "Paciente" }));
            await userEvent.click(within(item(/presión sistólica/i)).getByRole("checkbox", { name: "Médico" }));
            expect(within(item(/presión sistólica/i)).getByText(/nadie recibirá el aviso/i)).toBeInTheDocument();
        });

        it("shows the server's message when saving fails and keeps the change", async () => {
            mocks.updateAlertRecipients.mockRejectedValue(new ApiError(404, "La configuración no existe"));
            mount();
            await screen.findByRole("heading", { name: "Umbrales" });
            const general = within(item(/presión sistólica/i));

            await userEvent.click(general.getByRole("checkbox", { name: "Cuidador" }));
            await userEvent.click(general.getByRole("button", { name: /guardar cambios/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent("La configuración no existe");
            expect(general.getByRole("checkbox", { name: "Cuidador" })).toBeChecked();
            expect(general.getByRole("button", { name: /guardar cambios/i })).toBeEnabled();
        });
    });
});
