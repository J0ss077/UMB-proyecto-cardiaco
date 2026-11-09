// @requirement RF-24
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { ConsultationInbox } from "../components/staff/ConsultationInbox";
import type { Consultation } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listConsultations: vi.fn(),
    sendMeetLink: vi.fn(),
    completeConsultation: vi.fn(),
    listReadings: vi.fn(),
    listSymptoms: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const consultation = (id: string, overrides: Partial<Consultation> = {}): Consultation => ({
    id,
    patient_id: `p-${id}`,
    patient_name: `Paciente ${id}`,
    physician_id: "d1",
    physician_name: "Dr. Morales",
    message: `Mensaje ${id}`,
    response: null,
    status: "in_review",
    wants_meet: false,
    created_at: "2026-11-08T14:00:00Z",
    responded_at: null,
    reason: "high_pressure",
    onset: "today",
    medications: null,
    urgent: false,
    contact_phone: null,
    reading: null,
    ...overrides,
});

const completed = (id: string) => consultation(id, { status: "completed", response: "Respuesta previa", responded_at: "2026-11-08T16:00:00Z" });

const items = [completed("old"), consultation("new1", { wants_meet: true }), consultation("new2")];

const mount = (props: { onChanged?: () => void } = {}) => renderWithToasts(<ConsultationInbox onChanged={props.onChanged} />);
const filter = (name: RegExp) => screen.getByRole("button", { name });

describe("ConsultationInbox", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listConsultations.mockResolvedValue({ items, total: 3 });
        mocks.listReadings.mockResolvedValue({
            items: [{ id: "r1", patient_id: "p-new2", systolic: 150, diastolic: 95, heart_rate: 80, source: "manual", measured_at: "2026-11-08T12:00:00Z", validation_status: "valid" }],
            total: 1,
        });
        mocks.listSymptoms.mockResolvedValue({ items: [], total: 0 });
    });

    async function fillCheckup(scope: ReturnType<typeof within>) {
        await userEvent.type(scope.getByRole("textbox", { name: /cómo está el paciente/i }), "Estable");
        await userEvent.type(scope.getByRole("textbox", { name: /presión del chequeo/i }), "150/95");
        await userEvent.type(scope.getByRole("textbox", { name: /síntomas del chequeo/i }), "Mareo");
        await userEvent.type(scope.getByRole("textbox", { name: /conducta del chequeo/i }), "Registro diario");
    }

    it("loads the consultations and says what the page is for", async () => {
        mount();

        expect(await screen.findByRole("heading", { name: "Consultas" })).toBeInTheDocument();
        expect(screen.getByText(/las que están en revisión van primero/i)).toBeInTheDocument();
        expect(mocks.listConsultations).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    });

    it("starts with the pending ones and names the patient of each", async () => {
        mount();
        await screen.findByRole("heading", { name: "Consultas" });

        expect(await screen.findByText("Paciente new1")).toBeInTheDocument();
        expect(screen.getByText("Paciente new2")).toBeInTheDocument();
        expect(screen.queryByText("Paciente old")).not.toBeInTheDocument();
        expect(filter(/^en revisión/i)).toHaveAttribute("aria-pressed", "true");
    });

    it("shows the count of each group on its filter", async () => {
        mount();
        await screen.findByText("Paciente new1");

        expect(filter(/^en revisión/i)).toHaveTextContent("2");
        expect(filter(/^pendientes/i)).toHaveTextContent("0");
        expect(filter(/^completadas/i)).toHaveTextContent("1");
        expect(filter(/^todas/i)).toHaveTextContent("3");
    });

    it("switches between pending, answered and all, always with pending first", async () => {
        mount();
        await screen.findByText("Paciente new1");

        await userEvent.click(filter(/^completadas/i));
        expect(screen.getByText("Paciente old")).toBeInTheDocument();
        expect(screen.queryByText("Paciente new1")).not.toBeInTheDocument();

        await userEvent.click(filter(/^todas/i));
        const order = screen.getAllByText(/^Paciente /).map((node) => node.textContent);
        expect(order).toEqual(["Paciente new1", "Paciente new2", "Paciente old"]);
    });

    it("shows the urgent mark and the details of each consultation", async () => {
        mount();
        const first = (await screen.findByText("Paciente new1")).closest("li")!;

        expect(within(first).getByText("Atención por Meet")).toBeInTheDocument();
        expect(within(first).getByText("Presión alta")).toBeInTheDocument();
        expect(within(first).getByText("Mensaje new1")).toBeInTheDocument();
    });

    it("answers a consultation, moves it to the answered group and tells the parent", async () => {
        const onChanged = vi.fn();
        mocks.completeConsultation.mockResolvedValue({ ...consultation("new2"), status: "completed", response: "Registra tus lecturas", responded_at: "2026-11-09T10:00:00Z" });
        mount({ onChanged });
        const row = (await screen.findByText("Paciente new2")).closest("li")!;

        expect(await within(row).findByText(/150\/95/)).toBeInTheDocument();
        await fillCheckup(within(row));
        await userEvent.type(within(row).getByRole("textbox", { name: /respuesta a la consulta/i }), "  Registra tus lecturas  ");
        await userEvent.click(within(row).getByRole("button", { name: /^completar$/i }));

        await waitFor(() =>
            expect(mocks.completeConsultation).toHaveBeenCalledWith("new2", {
                response: "Registra tus lecturas",
                checkup_general: "Estable",
                checkup_pressure: "150/95",
                checkup_symptoms: "Mareo",
                checkup_conduct: "Registro diario",
            }),
        );
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(filter(/^en revisión/i)).toHaveTextContent("1"));
        expect(filter(/^completadas/i)).toHaveTextContent("2");
        expect(screen.queryByText("Paciente new2")).not.toBeInTheDocument();
    });

    it("keeps the pending consultation and the text when the answer fails", async () => {
        mocks.completeConsultation.mockRejectedValue(new ApiError(409, "La consulta ya fue completada"));
        const onChanged = vi.fn();
        mount({ onChanged });
        const row = (await screen.findByText("Paciente new2")).closest("li")!;

        await fillCheckup(within(row));
        await userEvent.type(within(row).getByRole("textbox", { name: /respuesta a la consulta/i }), "ok");
        await userEvent.click(within(row).getByRole("button", { name: /^completar$/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent(/ya fue completada/i);
        expect(onChanged).not.toHaveBeenCalled();
        expect(within(row).getByRole("textbox", { name: /respuesta a la consulta/i })).toHaveValue("ok");
    });

    it("says there is nothing pending", async () => {
        mocks.listConsultations.mockResolvedValue({ items: [completed("old")], total: 1 });
        mount();

        expect(await screen.findByText(/no hay consultas en revisión/i)).toBeInTheDocument();
    });

    it("says there are no consultations at all", async () => {
        mocks.listConsultations.mockResolvedValue({ items: [], total: 0 });
        mount();

        expect(await screen.findByText(/todavía no te llegó ninguna consulta/i)).toBeInTheDocument();
    });

    it("loads more when the doctor has more than a page", async () => {
        const first = Array.from({ length: 50 }, (_, index) => consultation(`a${index}`));
        const second = Array.from({ length: 5 }, (_, index) => consultation(`b${index}`));
        mocks.listConsultations.mockImplementation(({ offset = 0 }: { offset?: number }) =>
            Promise.resolve(offset === 0 ? { items: first, total: 55 } : { items: second, total: 55 }),
        );
        mount();
        await screen.findByText("Paciente a0");
        expect(screen.getByText(/mostrando 50 de 55/i)).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /ver más/i }));

        expect(await screen.findByText("Paciente b4")).toBeInTheDocument();
        expect(mocks.listConsultations).toHaveBeenLastCalledWith({ limit: 50, offset: 50 });
        expect(screen.queryByRole("button", { name: /ver más/i })).not.toBeInTheDocument();
    });

    it("says it is loading and reports a failure", async () => {
        mocks.listConsultations.mockRejectedValue(new Error("boom"));
        mount();

        expect(screen.getByText(/cargando consultas/i)).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar las consultas/i);
    });
});
