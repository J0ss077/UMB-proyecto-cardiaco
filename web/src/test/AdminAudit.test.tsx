// @requirement RF-27
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAudit } from "../components/staff/AdminAudit";
import type { AuditEvent } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({ listAudit: vi.fn() }));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const event = (id: string, overrides: Partial<AuditEvent> = {}): AuditEvent => ({
    id,
    actor_user_id: "u1",
    actor_name: "Administración",
    action: "accounts.role_changed",
    entity: "users",
    entity_id: "e1",
    ip: "10.0.0.5",
    occurred_at: "2026-11-08T12:00:00Z",
    details: { previous: "patient", new: "caregiver" },
    details_withheld: false,
    ...overrides,
});

const mount = () => renderWithToasts(<AdminAudit />);

describe("AdminAudit", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listAudit.mockResolvedValue({ items: [event("e1")], total: 1 });
    });

    it("says what the trail shows and what it keeps out", async () => {
        mount();
        expect(await screen.findByRole("heading", { name: "Auditoría" })).toBeInTheDocument();
        expect(screen.getByText(/el detalle de una lectura, un síntoma, una alerta o una consulta no se muestra/i)).toBeInTheDocument();
    });

    it("loads the latest events without filters", async () => {
        mount();
        await screen.findByText("Cambio de rol");
        expect(mocks.listAudit).toHaveBeenCalledWith({
            topic: undefined,
            action: undefined,
            since: undefined,
            until: undefined,
            limit: 50,
            offset: 0,
        });
    });

    it("shows the activity in plain language, with the actor, what it was about, the IP, the date and the details", async () => {
        mount();
        const entry = await screen.findByRole("listitem");

        expect(within(entry).getByText("Cambio de rol")).toBeInTheDocument();
        expect(within(entry).getByText(/administración · cuenta · 10\.0\.0\.5/i)).toBeInTheDocument();
        expect(within(entry).getByText("Antes: Paciente, Ahora: Cuidador")).toBeInTheDocument();
        expect(within(entry).queryByText("accounts.role_changed")).not.toBeInTheDocument();
    });

    it("fills in what is missing instead of showing blanks", async () => {
        mocks.listAudit.mockResolvedValue({
            items: [event("e2", { actor_name: null, entity: null, ip: null, details: null })],
            total: 1,
        });
        mount();
        const entry = await screen.findByRole("listitem");

        expect(within(entry).getByText(/sin actor · sin registro asociado · sin ip/i)).toBeInTheDocument();
        expect(within(entry).getByText("—")).toBeInTheDocument();
    });

    it("never shows the details of a clinical event", async () => {
        mocks.listAudit.mockResolvedValue({
            items: [event("e3", { action: "reading.created", details: { systolic: 150 }, details_withheld: true })],
            total: 1,
        });
        mount();
        const entry = await screen.findByRole("listitem");

        expect(within(entry).getByText(/detalle clínico omitido/i)).toBeInTheDocument();
        expect(within(entry).queryByText(/150/)).not.toBeInTheDocument();
    });

    it("offers the activities of the chosen type and hides the rest", async () => {
        mount();
        await screen.findByText("Cambio de rol");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por tipo/i }), "accounts");

        const activity = screen.getByRole("combobox", { name: /filtrar por actividad/i });
        expect(within(activity).getByRole("option", { name: "Cambio de rol" })).toBeInTheDocument();
        expect(within(activity).getByRole("option", { name: "Desactivación de una cuenta" })).toBeInTheDocument();
        expect(within(activity).queryByRole("option", { name: "Inicio de sesión" })).not.toBeInTheDocument();
    });

    it("labels and filters the caregiver actions", async () => {
        mocks.listAudit.mockResolvedValue({
            items: [
                event("e-caregiver", {
                    action: "caregiver.linked",
                    entity: "caregiver_links",
                    details: {
                        patient_user_id: "p1",
                        caregiver_user_id: "c1",
                        authorized_scope: "readings",
                    },
                }),
            ],
            total: 1,
        });
        mount();

        const entry = await screen.findByRole("listitem");
        expect(within(entry).getByText("Cuidador vinculado por el médico")).toBeInTheDocument();
        expect(within(entry).queryByText("caregiver.linked")).not.toBeInTheDocument();
        expect(within(entry).getByText(/cuidador: c1/i)).toBeInTheDocument();
        expect(within(entry).getByText(/alcance: lecturas/i)).toBeInTheDocument();

        await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por tipo/i }), "caregiver");

        await waitFor(() =>
            expect(mocks.listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ topic: "caregiver", action: undefined })),
        );
        const activity = screen.getByRole("combobox", { name: /filtrar por actividad/i });
        expect(within(activity).getByRole("option", { name: "Cuidador vinculado por el médico" })).toBeInTheDocument();
        expect(within(activity).getByRole("option", { name: "Cambio de alcance del cuidador" })).toBeInTheDocument();
        expect(within(activity).getByRole("option", { name: "Vínculo de cuidador revocado" })).toBeInTheDocument();
    });

    it("filters by type, by activity and by day, covering the whole of each day", async () => {
        mount();
        await screen.findByText("Cambio de rol");

        await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por tipo/i }), "accounts");
        await waitFor(() => expect(mocks.listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ topic: "accounts", action: undefined })));
        await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por actividad/i }), "accounts.deactivated");
        fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-11-01" } });
        fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-11-08" } });

        await waitFor(() =>
            expect(mocks.listAudit).toHaveBeenLastCalledWith({
                topic: "accounts",
                action: "accounts.deactivated",
                since: new Date(2026, 10, 1, 0, 0, 0).toISOString(),
                until: new Date(2026, 10, 8, 23, 59, 59).toISOString(),
                limit: 50,
                offset: 0,
            }),
        );
    });

    it("clears the filters and loads everything again", async () => {
        mount();
        await screen.findByText("Cambio de rol");
        await userEvent.selectOptions(screen.getByRole("combobox", { name: /filtrar por actividad/i }), "accounts.role_changed");
        await waitFor(() => expect(mocks.listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "accounts.role_changed" })));

        await userEvent.click(screen.getByRole("button", { name: /limpiar filtros/i }));

        await waitFor(() =>
            expect(mocks.listAudit).toHaveBeenLastCalledWith({
                topic: undefined,
                action: undefined,
                since: undefined,
                until: undefined,
                limit: 50,
                offset: 0,
            }),
        );
        expect(screen.getByRole("combobox", { name: /filtrar por actividad/i })).toHaveValue("");
        expect(screen.getByRole("combobox", { name: /filtrar por tipo/i })).toHaveValue("");
    });

    it("says there are no events with that filter", async () => {
        mocks.listAudit.mockResolvedValue({ items: [], total: 0 });
        mount();
        expect(await screen.findByText(/no hay eventos con ese filtro/i)).toBeInTheDocument();
    });

    it("loads the next page of events and keeps the filter", async () => {
        const first = Array.from({ length: 50 }, (_, index) => event(`a${index}`, { action: `first.${index}` }));
        const second = [event("b0", { action: "second.0" })];
        mocks.listAudit.mockImplementation(({ offset = 0 }: { offset?: number }) =>
            Promise.resolve(offset === 0 ? { items: first, total: 51 } : { items: second, total: 51 }),
        );
        mount();
        await screen.findByText("first.0");
        expect(screen.getByText(/mostrando 50 de 51/i)).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /ver más/i }));

        expect(await screen.findByText("second.0")).toBeInTheDocument();
        expect(screen.getByText("first.0")).toBeInTheDocument();
        expect(mocks.listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50, limit: 50 }));
        expect(screen.queryByRole("button", { name: /ver más/i })).not.toBeInTheDocument();
    });

    it("says it is loading and reports a failure", async () => {
        mocks.listAudit.mockRejectedValue(new Error("boom"));
        mount();

        expect(screen.getByText(/cargando el rastro/i)).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cargar el rastro/i);
    });
});
