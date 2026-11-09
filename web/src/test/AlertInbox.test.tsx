// @requirement RF-16
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { AlertInbox } from "../components/staff/AlertInbox";
import type { Alert, AlertDetail } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listPatients: vi.fn(),
    listAlerts: vi.fn(),
    listReadings: vi.fn(),
    getAlert: vi.fn(),
    acknowledgeAlert: vi.fn(),
    validateAlert: vi.fn(),
    dismissAlert: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const alert = (id: string, overrides: Partial<Alert> = {}): Alert => ({
    id,
    patient_id: "p1",
    type: "crisis_hipertensiva",
    severity: "critical",
    status: "open",
    note: "Lecturas de 186/122 mmHg; pendiente de revisión médica.",
    created_at: "2026-11-08T12:00:00Z",
    validated_by: null,
    validated_at: null,
    ...overrides,
});

const detail = (a: Alert, overrides: Partial<AlertDetail> = {}): AlertDetail => ({
    ...a,
    validated_by_name: null,
    dismissal_reason: null,
    ...overrides,
});

const reading = (id: string, systolic: number, diastolic: number) => ({
    id,
    patient_id: "p1",
    systolic,
    diastolic,
    heart_rate: 80,
    source: "manual",
    measured_at: "2026-11-08T11:00:00Z",
    validation_status: "valid",
});

const open = (name = /Ana Torres/) => userEvent.click(screen.getByRole("button", { name }));
const panel = () => within(screen.getByRole("region", { name: /detalle de la alerta/i }));

describe("AlertInbox", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listPatients.mockResolvedValue({ items: [{ user_id: "p1", full_name: "Ana Torres", birth_date: null }], total: 1 });
        mocks.listAlerts.mockResolvedValue({ items: [alert("a1")], total: 1 });
        mocks.getAlert.mockImplementation((id: string) => Promise.resolve(detail(alert(id))));
        mocks.listReadings.mockResolvedValue({ items: [reading("r1", 186, 122), reading("r2", 150, 95)], total: 2 });
        mocks.acknowledgeAlert.mockResolvedValue(undefined);
        mocks.validateAlert.mockResolvedValue(undefined);
        mocks.dismissAlert.mockResolvedValue(undefined);
    });

    describe("the list", () => {
        it("shows each alert with the patient, severity, status, date and note", async () => {
            renderWithToasts(<AlertInbox canAct />);

            const item = await screen.findByRole("button", { name: /Ana Torres/ });
            expect(within(item).getByText("Crítica")).toBeInTheDocument();
            expect(within(item).getByText("Abierta")).toBeInTheDocument();
            expect(within(item).getByText(/pendiente de revisión médica/i)).toBeInTheDocument();
            expect(screen.getByText(/1 alerta/i)).toBeInTheDocument();
        });

        it("starts with the open alerts and reloads when the filters change", async () => {
            renderWithToasts(<AlertInbox canAct />);
            await screen.findByRole("button", { name: /Ana Torres/ });
            expect(mocks.listAlerts).toHaveBeenLastCalledWith({ status: "open", severity: undefined, limit: 50 });

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por estado/i }), "validated");
            await waitFor(() => expect(mocks.listAlerts).toHaveBeenLastCalledWith({ status: "validated", severity: undefined, limit: 50 }));

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por severidad/i }), "high");
            await waitFor(() => expect(mocks.listAlerts).toHaveBeenLastCalledWith({ status: "validated", severity: "high", limit: 50 }));

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por estado/i }), "");
            await waitFor(() => expect(mocks.listAlerts).toHaveBeenLastCalledWith({ status: undefined, severity: "high", limit: 50 }));
        });

        it("falls back to a generic name when the patient cannot be matched", async () => {
            mocks.listPatients.mockRejectedValue(new Error("boom"));
            renderWithToasts(<AlertInbox canAct />);
            expect(await screen.findByRole("button", { name: /^Paciente/ })).toBeInTheDocument();
        });

        it("says there are no alerts with that filter", async () => {
            mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });
            renderWithToasts(<AlertInbox canAct />);
            expect(await screen.findByText(/no hay alertas con ese filtro/i)).toBeInTheDocument();
        });

        it("says it is loading and reports a failure", async () => {
            mocks.listAlerts.mockRejectedValue(new Error("boom"));
            renderWithToasts(<AlertInbox canAct />);

            expect(screen.getByText(/cargando alertas/i)).toBeInTheDocument();
            expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar las alertas/i);
        });

        it("ranks who has had the most alerts, apart from the list filter", async () => {
            mocks.listPatients.mockResolvedValue({
                items: [
                    { user_id: "p1", full_name: "Ana Torres", birth_date: null },
                    { user_id: "p2", full_name: "Carlos Pérez", birth_date: null },
                ],
                total: 2,
            });
            mocks.listAlerts.mockImplementation((params: { limit?: number; patient_id?: string }) => {
                if (params.patient_id === "p2") return Promise.resolve({ items: [alert("a3", { patient_id: "p2" })], total: 1 });
                if (params.limit === 200) {
                    return Promise.resolve({
                        items: [alert("a1"), alert("a2"), alert("a3", { patient_id: "p2" })],
                        total: 3,
                    });
                }
                return Promise.resolve({ items: [alert("a1"), alert("a2")], total: 2 });
            });
            renderWithToasts(<AlertInbox canAct />);

            const rank = within(await screen.findByRole("list", { name: "Pacientes con más alertas" }));
            const ranked = rank.getAllByRole("listitem");
            expect(ranked[0]).toHaveTextContent("Ana Torres");
            expect(ranked[0]).toHaveTextContent("2");
            expect(ranked[1]).toHaveTextContent("Carlos Pérez");
            expect(ranked[1]).toHaveTextContent("1");
            expect(screen.getByText(/no sigue el filtro de la lista/i)).toBeInTheDocument();

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por paciente/i }), "p2");
            await waitFor(() =>
                expect(mocks.listAlerts).toHaveBeenLastCalledWith({
                    status: "open",
                    severity: undefined,
                    patient_id: "p2",
                    limit: 50,
                }),
            );
            expect(await screen.findByRole("button", { name: /Carlos Pérez/ })).toBeInTheDocument();
            expect(within(screen.getByRole("list", { name: "Pacientes con más alertas" })).getByText("Ana Torres")).toBeInTheDocument();
        });

        it("narrows the loaded page by day and by whether the alert has a note", async () => {
            const day = 86_400_000;
            mocks.listAlerts.mockResolvedValue({
                items: [
                    alert("today", { created_at: new Date().toISOString(), note: "Revisar hoy" }),
                    alert("old", { created_at: new Date(Date.now() - 10 * day).toISOString(), note: null }),
                ],
                total: 2,
            });
            renderWithToasts(<AlertInbox canAct />);
            expect(await screen.findAllByRole("button", { name: /Ana Torres/ })).toHaveLength(2);

            await userEvent.click(screen.getByRole("button", { name: "Hoy" }));
            expect(screen.getAllByRole("button", { name: /Ana Torres/ })).toHaveLength(1);
            expect(screen.getByText(/revisar hoy/i)).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Cualquier fecha" }));
            await userEvent.click(screen.getByRole("button", { name: "Sin nota" }));
            expect(screen.getAllByRole("button", { name: /Ana Torres/ })).toHaveLength(1);
            expect(screen.queryByText(/revisar hoy/i)).not.toBeInTheDocument();
        });

        it("filters the loaded page by name or note", async () => {
            renderWithToasts(<AlertInbox canAct />);
            await screen.findByRole("button", { name: /Ana Torres/ });

            await userEvent.type(screen.getByRole("searchbox", { name: /buscar en las alertas/i }), "zzz");

            expect(screen.getByText(/ninguna alerta coincide con la búsqueda/i)).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: /Ana Torres/ })).not.toBeInTheDocument();
        });

        it("tells a physician that nothing closes by itself, and a caregiver who closes alerts", async () => {
            const { unmount } = renderWithToasts(<AlertInbox canAct />);
            expect(await screen.findByText(/ninguna alerta se cierra sola/i)).toBeInTheDocument();
            unmount();

            renderWithToasts(<AlertInbox canAct={false} />);
            expect(await screen.findByText(/quien las cierra es el médico/i)).toBeInTheDocument();
        });
    });

    describe("the detail", () => {
        it("opens with the alert, its context and the emergency numbers for a critical one", async () => {
            renderWithToasts(<AlertInbox canAct />);
            await screen.findByRole("button", { name: /Ana Torres/ });

            await open();

            const detailPanel = panel();
            expect(await detailPanel.findByRole("heading", { name: "Ana Torres" })).toBeInTheDocument();
            expect(detailPanel.getByText(/crítica · abierta/i)).toBeInTheDocument();
            expect(detailPanel.getByRole("link", { name: /llamar al 123/i })).toHaveAttribute("href", "tel:123");
            expect(await detailPanel.findByText("186/122")).toBeInTheDocument();
            expect(detailPanel.getByText("150/95")).toBeInTheDocument();
            expect(mocks.listReadings).toHaveBeenCalledWith({ patient_id: "p1", limit: 3 });
        });

        it("does not show the emergency numbers for a lower severity", async () => {
            mocks.listAlerts.mockResolvedValue({ items: [alert("a1", { severity: "medium" })], total: 1 });
            mocks.getAlert.mockResolvedValue(detail(alert("a1", { severity: "medium" })));
            renderWithToasts(<AlertInbox canAct />);
            await screen.findByRole("button", { name: /Ana Torres/ });

            await open();

            await panel().findByRole("heading", { name: "Ana Torres" });
            expect(panel().queryByRole("link", { name: /llamar al/i })).not.toBeInTheDocument();
        });

        it("shows who validated it and why one was dismissed", async () => {
            mocks.listAlerts.mockResolvedValue({ items: [alert("v", { status: "validated" }), alert("d", { status: "dismissed" })], total: 2 });
            mocks.getAlert.mockImplementation((id: string) =>
                Promise.resolve(
                    id === "v"
                        ? detail(alert("v", { status: "validated" }), { validated_by_name: "Julián Morales" })
                        : detail(alert("d", { status: "dismissed" }), { dismissal_reason: "Lectura mal tomada" }),
                ),
            );
            renderWithToasts(<AlertInbox canAct />);
            const items = await screen.findAllByRole("button", { name: /Ana Torres/ });

            await userEvent.click(items[0]!);
            expect(await panel().findByText(/validada por julián morales/i)).toBeInTheDocument();
            await userEvent.click(items[1]!);
            expect(await panel().findByText(/motivo del descarte: lectura mal tomada/i)).toBeInTheDocument();
        });

        it("marks the open alert and closes with the close button", async () => {
            renderWithToasts(<AlertInbox canAct />);
            const item = await screen.findByRole("button", { name: /Ana Torres/ });

            await userEvent.click(item);
            await panel().findByRole("heading", { name: "Ana Torres" });
            expect(item).toHaveAttribute("aria-current", "true");

            await userEvent.click(panel().getByRole("button", { name: /cerrar detalle/i }));
            expect(screen.queryByRole("region", { name: /detalle de la alerta/i })).not.toBeInTheDocument();
            expect(item).not.toHaveAttribute("aria-current");
        });

        it("reports a failure opening the alert", async () => {
            mocks.getAlert.mockRejectedValue(new ApiError(404, "La alerta no existe"));
            renderWithToasts(<AlertInbox canAct />);
            await screen.findByRole("button", { name: /Ana Torres/ });

            await open();

            expect(await screen.findByRole("alert")).toHaveTextContent("La alerta no existe");
        });

        it("keeps working when the patient's readings cannot be loaded", async () => {
            mocks.listReadings.mockRejectedValue(new Error("boom"));
            renderWithToasts(<AlertInbox canAct />);
            await screen.findByRole("button", { name: /Ana Torres/ });

            await open();

            expect(await panel().findByRole("heading", { name: "Ana Torres" })).toBeInTheDocument();
            expect(panel().getByText(/no se pudieron cargar las lecturas/i)).toBeInTheDocument();
        });
    });

    describe("the physician's actions", () => {
        const choose = async () => {
            renderWithToasts(<AlertInbox canAct />);
            await screen.findByRole("button", { name: /Ana Torres/ });
            await open();
            await panel().findByRole("heading", { name: "Ana Torres" });
        };

        it("acknowledges an open alert, with or without a note, and reloads the list", async () => {
            await choose();

            await userEvent.click(panel().getByRole("button", { name: "Acusar recibo" }));

            await waitFor(() => expect(mocks.acknowledgeAlert).toHaveBeenCalledWith("a1", undefined));
            expect(await screen.findByRole("status")).toHaveTextContent(/recibo registrado/i);
            expect(mocks.listAlerts.mock.calls.length).toBeGreaterThan(1);
            expect(screen.queryByRole("region", { name: /detalle de la alerta/i })).not.toBeInTheDocument();
        });

        it("sends the trimmed note with an acknowledgement or a validation", async () => {
            await choose();

            await userEvent.type(panel().getByRole("textbox", { name: /nota/i }), "  Paciente contactado  ");
            await userEvent.click(panel().getByRole("button", { name: "Validar" }));

            await waitFor(() => expect(mocks.validateAlert).toHaveBeenCalledWith("a1", "Paciente contactado"));
            expect(await screen.findByRole("status")).toHaveTextContent(/alerta validada/i);
        });

        it("validates without a note", async () => {
            await choose();
            await userEvent.click(panel().getByRole("button", { name: "Validar" }));
            await waitFor(() => expect(mocks.validateAlert).toHaveBeenCalledWith("a1", undefined));
        });

        it("will not dismiss without a reason and says so next to the field", async () => {
            await choose();

            await userEvent.click(panel().getByRole("button", { name: "Descartar" }));

            expect(mocks.dismissAlert).not.toHaveBeenCalled();
            expect(panel().getByRole("alert")).toHaveTextContent(/escribe el motivo del descarte/i);
            expect(panel().getByRole("textbox", { name: /nota/i })).toBeInvalid();
        });

        it("dismisses with the reason", async () => {
            await choose();

            await userEvent.type(panel().getByRole("textbox", { name: /nota/i }), "Lectura mal tomada");
            await userEvent.click(panel().getByRole("button", { name: "Descartar" }));

            await waitFor(() => expect(mocks.dismissAlert).toHaveBeenCalledWith("a1", "Lectura mal tomada"));
            expect(await screen.findByRole("status")).toHaveTextContent(/alerta descartada/i);
        });

        it("offers acknowledging only while the alert is open", async () => {
            mocks.listAlerts.mockResolvedValue({ items: [alert("a1", { status: "acknowledged" })], total: 1 });
            mocks.getAlert.mockResolvedValue(detail(alert("a1", { status: "acknowledged" })));
            await choose();

            expect(panel().queryByRole("button", { name: "Acusar recibo" })).not.toBeInTheDocument();
            expect(panel().getByRole("button", { name: "Validar" })).toBeInTheDocument();
        });

        it("offers nothing on an alert that is already closed", async () => {
            mocks.listAlerts.mockResolvedValue({ items: [alert("a1", { status: "validated" })], total: 1 });
            mocks.getAlert.mockResolvedValue(detail(alert("a1", { status: "validated" })));
            await choose();

            expect(panel().queryByRole("button", { name: "Validar" })).not.toBeInTheDocument();
            expect(panel().queryByRole("textbox", { name: /nota/i })).not.toBeInTheDocument();
        });

        it("shows the server's message when the transition is refused and keeps the detail open", async () => {
            mocks.validateAlert.mockRejectedValue(new ApiError(409, "La alerta está en estado 'validated' y no puede pasar al estado 'validated'"));
            await choose();

            await userEvent.click(panel().getByRole("button", { name: "Validar" }));

            expect(await screen.findByRole("alert")).toHaveTextContent(/no puede pasar al estado 'validated'/i);
            expect(screen.getByRole("region", { name: /detalle de la alerta/i })).toBeInTheDocument();
        });

        it("tells the parent that something changed so counters can refresh", async () => {
            const onChanged = vi.fn();
            renderWithToasts(<AlertInbox canAct onChanged={onChanged} />);
            await screen.findByRole("button", { name: /Ana Torres/ });
            await open();
            await panel().findByRole("heading", { name: "Ana Torres" });

            await userEvent.click(panel().getByRole("button", { name: "Acusar recibo" }));

            await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        });
    });

    describe("the caregiver", () => {
        it("reads the alert and its context but gets no way to close it", async () => {
            renderWithToasts(<AlertInbox canAct={false} />);
            await screen.findByRole("button", { name: /Ana Torres/ });

            await open();

            await panel().findByRole("heading", { name: "Ana Torres" });
            for (const name of ["Acusar recibo", "Validar", "Descartar"]) {
                expect(panel().queryByRole("button", { name })).not.toBeInTheDocument();
            }
            expect(panel().queryByRole("textbox", { name: /nota/i })).not.toBeInTheDocument();
            expect(panel().getByText(/las cierra el médico/i)).toBeInTheDocument();
        });
    });
});
