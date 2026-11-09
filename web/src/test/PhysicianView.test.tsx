// @requirement RF-19
// @requirement RF-16
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhysicianView } from "../components/PhysicianView";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listPatients: vi.fn(),
    listAlerts: vi.fn(),
    listReadings: vi.fn(),
    listSymptoms: vi.fn(),
    getReadingsSummary: vi.fn(),
    listConsultations: vi.fn(),
    completeConsultation: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    listPatients: mocks.listPatients,
    listAlerts: mocks.listAlerts,
    listReadings: mocks.listReadings,
    listSymptoms: mocks.listSymptoms,
    getReadingsSummary: mocks.getReadingsSummary,
    listConsultations: mocks.listConsultations,
    completeConsultation: mocks.completeConsultation,
}));

const reading = (patient_id: string, systolic: number, diastolic: number) => ({
    items: [
        {
            id: `r-${patient_id}`,
            patient_id,
            systolic,
            diastolic,
            heart_rate: 70,
            source: "manual",
            measured_at: "2026-11-07T20:00:00Z",
            validation_status: "valid",
        },
    ],
    total: 1,
});

describe("PhysicianView", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listConsultations.mockResolvedValue({ items: [], total: 0 });
    });

    it("shows the KPI totals and one row per patient with the reading badge", async () => {
        mocks.listPatients.mockResolvedValue({
            items: [
                { user_id: "p1", full_name: "Ana María Torres Gil", birth_date: "1955-01-30" },
                { user_id: "p2", full_name: "Carlos Pérez Ruiz", birth_date: null },
            ],
            total: 2,
        });
        mocks.listAlerts.mockResolvedValue({ items: [], total: 3 });
        mocks.listReadings.mockImplementation(({ patient_id }: { patient_id: string }) =>
            Promise.resolve(patient_id === "p1" ? reading("p1", 118, 76) : { items: [], total: 0 }),
        );

        renderWithToasts(<PhysicianView />);

        expect(await screen.findByText("Ana María Torres Gil")).toBeInTheDocument();
        expect(within(screen.getByTestId("kpi-patients")).getByText("2")).toBeInTheDocument();
        expect(within(screen.getByTestId("kpi-critical-alerts")).getByText("3")).toBeInTheDocument();
        expect(mocks.listAlerts).toHaveBeenCalledWith({ status: "open", severity: "critical", limit: 1 });

        const rows = screen.getAllByRole("row");
        expect(within(rows[1]!).getByText("118/76")).toBeInTheDocument();
        expect(within(rows[1]!).getByTestId("category-badge")).toHaveTextContent("Normal");
        expect(within(rows[2]!).getByText(/sin lecturas/i)).toBeInTheDocument();
    });

    it("tells the physician when there are no linked patients", async () => {
        mocks.listPatients.mockResolvedValue({ items: [], total: 0 });
        mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });

        renderWithToasts(<PhysicianView />);

        expect(await screen.findByText(/no tienes pacientes vinculados/i)).toBeInTheDocument();
    });

    it("reports a load failure in an alert region", async () => {
        mocks.listPatients.mockRejectedValue(new Error("boom"));
        mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });

        renderWithToasts(<PhysicianView />);

        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cargar/i);
    });

    describe("interaction", () => {
        const patients = {
            items: [
                { user_id: "p1", full_name: "Ana María Torres Gil", birth_date: "1955-01-30" },
                { user_id: "p2", full_name: "Carlos Pérez Ruiz", birth_date: "1958-03-14" },
                { user_id: "p3", full_name: "Jorge Ramírez Salas", birth_date: "1970-11-05" },
            ],
            total: 3,
        };

        beforeEach(() => {
            mocks.listPatients.mockResolvedValue(patients);
            mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });
            mocks.listReadings.mockImplementation(({ patient_id, limit }: { patient_id: string; limit: number }) => {
                const byPatient: Record<string, [number, number]> = { p1: [118, 76], p2: [150, 95], p3: [186, 122] };
                const [s, d] = byPatient[patient_id] ?? [120, 80];
                const page = reading(patient_id, s, d);
                return Promise.resolve(limit === 1 ? page : { items: page.items, total: 1 });
            });
            mocks.listSymptoms.mockResolvedValue({
                items: [
                    { id: "s1", patient_id: "p1", free_text: "mareo", mood: "ansioso", recorded_at: "2026-11-07T21:30:00Z" },
                ],
                total: 1,
            });
            mocks.getReadingsSummary.mockResolvedValue({
                window_start: "2026-11-01T00:00:00Z",
                window_end: "2026-11-08T00:00:00Z",
                sufficient: true,
                valid_count: 9,
                days_with_readings: 5,
                mean_systolic: 134.4,
                mean_diastolic: 86,
            });
        });

        it("filters the table by name", async () => {
            renderWithToasts(<PhysicianView />);
            await screen.findByText("Ana María Torres Gil");

            await userEvent.type(screen.getByRole("searchbox", { name: /buscar paciente/i }), "carlos");

            expect(screen.queryByText("Ana María Torres Gil")).not.toBeInTheDocument();
            expect(screen.getByText("Carlos Pérez Ruiz")).toBeInTheDocument();
        });

        it("filters the table by reading category", async () => {
            renderWithToasts(<PhysicianView />);
            await screen.findByText("Ana María Torres Gil");

            await userEvent.click(screen.getByRole("button", { name: "Crisis" }));

            expect(screen.getByText("Jorge Ramírez Salas")).toBeInTheDocument();
            expect(screen.queryByText("Carlos Pérez Ruiz")).not.toBeInTheDocument();
        });

        it("sorts the highest pressure first on request", async () => {
            renderWithToasts(<PhysicianView />);
            await screen.findByText("Ana María Torres Gil");

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /ordenar/i }), "pressure");

            const rows = screen.getAllByRole("row");
            expect(within(rows[1]!).getByText("Jorge Ramírez Salas")).toBeInTheDocument();
        });

        it("searches by the reading and clears every filter", async () => {
            renderWithToasts(<PhysicianView />);
            await screen.findByText("Ana María Torres Gil");

            await userEvent.type(screen.getByRole("searchbox", { name: /buscar paciente/i }), "150");

            expect(screen.getByText("Carlos Pérez Ruiz")).toBeInTheDocument();
            expect(screen.queryByText("Ana María Torres Gil")).not.toBeInTheDocument();
            expect(screen.getByText("1 de 3")).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

            expect(screen.getByText("Ana María Torres Gil")).toBeInTheDocument();
            expect(screen.getByText("3 pacientes")).toBeInTheDocument();
        });

        it("filters by situation and sorts by open alerts", async () => {
            const day = 86_400_000;
            mocks.listReadings.mockImplementation(({ patient_id, limit }: { patient_id: string; limit: number }) => {
                if (limit !== 1) return Promise.resolve(reading(patient_id, 120, 80));
                if (patient_id === "p3") return Promise.resolve({ items: [], total: 0 });
                const measured = patient_id === "p1" ? new Date().toISOString() : new Date(Date.now() - 10 * day).toISOString();
                const [systolic, diastolic] = patient_id === "p1" ? [118, 76] : [150, 95];
                const page = reading(patient_id, systolic, diastolic);
                return Promise.resolve({ items: [{ ...page.items[0]!, measured_at: measured }], total: 1 });
            });
            mocks.listAlerts.mockImplementation((params: { severity?: string }) => {
                if (params?.severity === "critical") return Promise.resolve({ items: [], total: 0 });
                const open = (id: string, patientId: string) => ({
                    id,
                    patient_id: patientId,
                    type: "high_systolic",
                    severity: "high" as const,
                    status: "open" as const,
                    note: null,
                    created_at: new Date().toISOString(),
                    validated_by: null,
                    validated_at: null,
                });
                return Promise.resolve({ items: [open("a1", "p2"), open("a2", "p2")], total: 2 });
            });
            renderWithToasts(<PhysicianView />);
            await screen.findByText("Ana María Torres Gil");

            await userEvent.click(screen.getByRole("button", { name: "Sin lecturas" }));
            expect(screen.getByText("Jorge Ramírez Salas")).toBeInTheDocument();
            expect(screen.queryByText("Ana María Torres Gil")).not.toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Con lectura de hoy" }));
            expect(screen.getByText("Ana María Torres Gil")).toBeInTheDocument();
            expect(screen.queryByText("Jorge Ramírez Salas")).not.toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Con alerta abierta" }));
            expect(screen.getByText("Carlos Pérez Ruiz")).toBeInTheDocument();
            expect(screen.queryByText("Ana María Torres Gil")).not.toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Cualquier situación" }));
            await userEvent.selectOptions(screen.getByRole("combobox", { name: /ordenar/i }), "alerts");
            const rows = screen.getAllByRole("row");
            expect(within(rows[1]!).getByText("Carlos Pérez Ruiz")).toBeInTheDocument();
            expect(within(rows[1]!).getByText("2")).toBeInTheDocument();
        });

        it("shows a message when no patient matches", async () => {
            renderWithToasts(<PhysicianView />);
            await screen.findByText("Ana María Torres Gil");

            await userEvent.type(screen.getByRole("searchbox", { name: /buscar paciente/i }), "zzz");

            expect(screen.getByText(/ningún paciente coincide/i)).toBeInTheDocument();
        });

        it("opens a patient detail with trend, symptoms and summary, and closes it", async () => {
            renderWithToasts(<PhysicianView />);
            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));

            const detail = await screen.findByTestId("patient-detail");
            await waitFor(() => expect(within(detail).getByText("mareo")).toBeInTheDocument());
            expect(mocks.listReadings).toHaveBeenCalledWith({ patient_id: "p1", limit: 60 });
            expect(mocks.listSymptoms).toHaveBeenCalledWith({ patient_id: "p1", limit: 10 });
            expect(within(detail).getByText("134.4/86")).toBeInTheDocument();
            expect(within(detail).getByRole("img", { name: /lecturas/i })).toBeInTheDocument();

            await userEvent.click(within(detail).getByRole("button", { name: /volver/i }));
            expect(screen.queryByTestId("patient-detail")).not.toBeInTheDocument();
        });

        it("explains a missing summary when the patient has no consent", async () => {
            const { ApiError } = await import("../api");
            mocks.getReadingsSummary.mockRejectedValue(new ApiError(403, "No hay consentimiento informado vigente"));
            renderWithToasts(<PhysicianView />);

            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));

            expect(await screen.findByText(/sin consentimiento vigente/i)).toBeInTheDocument();
        });
    });

    describe("consultations", () => {
        const consult = (id: string, overrides: Record<string, unknown> = {}) => ({
            id,
            patient_id: "p1",
            patient_name: "Ana María Torres Gil",
            physician_id: "d1",
            physician_name: "Dr. Morales",
            message: "Tengo mareos desde ayer",
            response: null,
            status: "pending",
            created_at: "2026-11-08T14:00:00Z",
            responded_at: null,
            reading: { systolic: 170, diastolic: 110, measured_at: "2026-11-08T13:55:00Z" },
            reason: "high_pressure",
            onset: "since_yesterday",
            medications: "Losartán 50 mg",
            urgent: false,
            wants_meet: false,
            contact_phone: "+57 316 8765 432",
            ...overrides,
        });

        beforeEach(() => {
            mocks.listPatients.mockResolvedValue({ items: [{ user_id: "p1", full_name: "Ana María Torres Gil", birth_date: null }], total: 1 });
            mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });
            mocks.listReadings.mockResolvedValue({ items: [], total: 0 });
            mocks.listSymptoms.mockResolvedValue({ items: [], total: 0 });
            mocks.getReadingsSummary.mockRejectedValue(new Error("none"));
        });

        it("counts the pending consultations in a third indicator", async () => {
            mocks.listConsultations.mockImplementation((params: { limit?: number; status?: string }) =>
                Promise.resolve(params.limit === 1 ? { items: [], total: params.status === "in_review" ? 3 : 1 } : { items: [], total: 0 }),
            );

            renderWithToasts(<PhysicianView />);

            expect(await within(await screen.findByTestId("kpi-consultations")).findByText("4")).toBeInTheDocument();
            expect(mocks.listConsultations).toHaveBeenCalledWith({ status: "in_review", limit: 1 });
            expect(mocks.listConsultations).toHaveBeenCalledWith({ status: "pending", limit: 1 });
        });

        it("shows the patient's consultations in the detail with the attached reading", async () => {
            mocks.listConsultations.mockImplementation((params: { patient_id?: string }) =>
                Promise.resolve(params.patient_id ? { items: [consult("c1")], total: 1 } : { items: [], total: 0 }),
            );
            renderWithToasts(<PhysicianView />);

            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));

            const panel = within(await screen.findByTestId("detail-consultations"));
            expect(await panel.findByText("Tengo mareos desde ayer")).toBeInTheDocument();
            expect(panel.getByText(/170\/110 mmHg/)).toBeInTheDocument();
            expect(panel.getByText(/pendiente/i)).toBeInTheDocument();
            expect(mocks.listConsultations).toHaveBeenCalledWith({ patient_id: "p1", limit: 10 });
        });

        it("shows the structured details the patient sent, with a call link for a shared phone", async () => {
            mocks.listConsultations.mockImplementation((params: { patient_id?: string }) =>
                Promise.resolve(params.patient_id ? { items: [consult("c1")], total: 1 } : { items: [], total: 0 }),
            );
            renderWithToasts(<PhysicianView />);
            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));

            const panel = within(await screen.findByTestId("detail-consultations"));
            expect(await panel.findByText("Presión alta")).toBeInTheDocument();
            expect(panel.getByText("Desde ayer")).toBeInTheDocument();
            expect(panel.getByText("Atención por comentarios")).toBeInTheDocument();
            expect(panel.getByText(/losartán 50 mg/i)).toBeInTheDocument();
            expect(panel.getByRole("link", { name: /llamar al paciente/i })).toHaveAttribute("href", "tel:+573168765432");
        });

        it("does not invent details for an older consultation or a phone that was not shared", async () => {
            mocks.listConsultations.mockImplementation((params: { patient_id?: string }) =>
                Promise.resolve(
                    params.patient_id
                        ? { items: [consult("c1", { reason: null, onset: null, medications: null, urgent: false, contact_phone: null })], total: 1 }
                        : { items: [], total: 0 },
                ),
            );
            renderWithToasts(<PhysicianView />);
            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));

            const panel = within(await screen.findByTestId("detail-consultations"));
            await panel.findByText("Tengo mareos desde ayer");
            expect(panel.queryByText("Urgente")).not.toBeInTheDocument();
            expect(panel.queryByRole("link", { name: /llamar al paciente/i })).not.toBeInTheDocument();
            expect(panel.queryByText(/medicamentos/i)).not.toBeInTheDocument();
        });

        it("answers a pending consultation and shows the answer in place", async () => {
            mocks.listConsultations.mockImplementation((params: { patient_id?: string }) =>
                Promise.resolve(params.patient_id ? { items: [consult("c1")], total: 1 } : { items: [], total: 0 }),
            );
            mocks.completeConsultation.mockResolvedValue(
                consult("c1", { status: "completed", response: "Registra tus lecturas de hoy", responded_at: "2026-11-09T10:00:00Z" }),
            );
            renderWithToasts(<PhysicianView />);
            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));
            const panel = within(await screen.findByTestId("detail-consultations"));

            expect(await panel.findByText(/sin lecturas recientes/i)).toBeInTheDocument();
            await userEvent.type(panel.getByRole("textbox", { name: /cómo está el paciente/i }), "Estable");
            await userEvent.type(panel.getByRole("textbox", { name: /presión del chequeo/i }), "150/95");
            await userEvent.type(panel.getByRole("textbox", { name: /síntomas del chequeo/i }), "Mareo");
            await userEvent.type(panel.getByRole("textbox", { name: /conducta del chequeo/i }), "Registro diario");
            await userEvent.type(await panel.findByRole("textbox", { name: /respuesta a la consulta/i }), "  Registra tus lecturas de hoy  ");
            await userEvent.click(panel.getByRole("button", { name: /^completar$/i }));

            await waitFor(() =>
                expect(mocks.completeConsultation).toHaveBeenCalledWith("c1", {
                    response: "Registra tus lecturas de hoy",
                    checkup_general: "Estable",
                    checkup_pressure: "150/95",
                    checkup_symptoms: "Mareo",
                    checkup_conduct: "Registro diario",
                }),
            );
            expect(await panel.findByText(/registra tus lecturas de hoy/i)).toBeInTheDocument();
            expect(panel.queryByRole("textbox")).not.toBeInTheDocument();
            expect(panel.getByText(/^completada$/i)).toBeInTheDocument();
        });

        it("does not send an empty answer", async () => {
            mocks.listConsultations.mockImplementation((params: { patient_id?: string }) =>
                Promise.resolve(params.patient_id ? { items: [consult("c1")], total: 1 } : { items: [], total: 0 }),
            );
            renderWithToasts(<PhysicianView />);
            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));
            const panel = within(await screen.findByTestId("detail-consultations"));

            await userEvent.click(await panel.findByRole("button", { name: /^completar$/i }));

            expect(mocks.completeConsultation).not.toHaveBeenCalled();
            expect(panel.getByRole("alert")).toHaveTextContent(/escribe una respuesta/i);
        });

        it("keeps the form and shows the API message when answering fails", async () => {
            const { ApiError } = await import("../api");
            mocks.listConsultations.mockImplementation((params: { patient_id?: string }) =>
                Promise.resolve(params.patient_id ? { items: [consult("c1")], total: 1 } : { items: [], total: 0 }),
            );
            mocks.completeConsultation.mockRejectedValue(new ApiError(409, "La consulta ya fue completada"));
            renderWithToasts(<PhysicianView />);
            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));
            const panel = within(await screen.findByTestId("detail-consultations"));

            await userEvent.type(panel.getByRole("textbox", { name: /cómo está el paciente/i }), "Estable");
            await userEvent.type(panel.getByRole("textbox", { name: /presión del chequeo/i }), "150/95");
            await userEvent.type(panel.getByRole("textbox", { name: /síntomas del chequeo/i }), "Mareo");
            await userEvent.type(panel.getByRole("textbox", { name: /conducta del chequeo/i }), "Registro diario");
            await userEvent.type(await panel.findByRole("textbox", { name: /respuesta a la consulta/i }), "ok");
            await userEvent.click(panel.getByRole("button", { name: /^completar$/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent(/ya fue completada/i);
            expect(panel.getByRole("textbox", { name: /respuesta a la consulta/i })).toBeInTheDocument();
        });

        it("says when the patient has no consultations", async () => {
            renderWithToasts(<PhysicianView />);
            await userEvent.click(await screen.findByRole("button", { name: "Ana María Torres Gil" }));
            expect(await within(await screen.findByTestId("detail-consultations")).findByText(/no ha enviado consultas/i)).toBeInTheDocument();
        });
    });
});
