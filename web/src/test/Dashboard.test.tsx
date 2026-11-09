// @requirement none
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { PatientHome } from "../components/patient/PatientHome";
import type { Alert, Reading, ReadingsSummary } from "../types";
import { renderWithToasts } from "./helpers";

const reading: Reading = {
    id: "r1",
    patient_id: "p1",
    systolic: 154,
    diastolic: 100,
    heart_rate: 83,
    source: "manual",
    measured_at: new Date().toISOString(),
    validation_status: "valid",
};

const summary: ReadingsSummary = {
    window_start: "2026-11-01T00:00:00Z",
    window_end: "2026-11-08T00:00:00Z",
    sufficient: true,
    valid_count: 9,
    days_with_readings: 5,
    mean_systolic: 132.9,
    mean_diastolic: 84.7,
};

const alert: Alert = {
    id: "a1",
    patient_id: "p1",
    type: "crisis_hipertensiva",
    severity: "critical",
    status: "open",
    note: "pendiente de revisión médica",
    created_at: "2026-11-07T21:00:00Z",
    validated_by: null,
    validated_at: null,
};

const mount = (withAlert = false) =>
    renderWithToasts(
        <PatientHome
            recent={[reading]}
            summary={summary}
            openAlert={withAlert ? alert : null}
            onRegister={() => undefined}
            onSymptoms={() => undefined}
            onConnectDevice={() => undefined}
            onChatbot={() => undefined}
        />,
    );

const order = () => screen.getAllByTestId("dashboard-widget").map((node) => node.getAttribute("data-widget-id"));
const widget = (id: string) => screen.getAllByTestId("dashboard-widget").find((node) => node.getAttribute("data-widget-id") === id)!;

describe("customizable dashboard", () => {
    beforeEach(() => window.localStorage.clear());

    it("renders the widgets in the default order and without edit controls", () => {
        mount();

        expect(order()).toEqual(["latest", "trend", "summary", "recommendation", "risk"]);
        expect(screen.queryByRole("group", { name: /opciones de/i })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /personalizar/i })).toBeInTheDocument();
    });

    it("includes the alert widget only when there is an open alert", () => {
        mount(true);
        expect(order()).toContain("alert");
    });

    it("shows the controls of every widget in edit mode and hides them on finishing", async () => {
        mount();
        await userEvent.click(screen.getByRole("button", { name: /personalizar/i }));

        expect(screen.getAllByRole("group", { name: /opciones de/i })).toHaveLength(5);
        await userEvent.click(screen.getByRole("button", { name: /^listo$/i }));
        expect(screen.queryByRole("group", { name: /opciones de/i })).not.toBeInTheDocument();
    });

    it("resizes a widget to full width and remembers it", async () => {
        const { unmount } = mount();
        await userEvent.click(screen.getByRole("button", { name: /personalizar/i }));

        const controls = within(screen.getByRole("group", { name: /opciones de tendencia reciente/i }));
        await userEvent.click(controls.getByRole("button", { name: "Ancho completo" }));

        expect(widget("trend")).toHaveAttribute("data-span", "12");
        unmount();

        mount();
        expect(widget("trend")).toHaveAttribute("data-span", "12");
    });

    it("changes the height of a widget", async () => {
        mount();
        await userEvent.click(screen.getByRole("button", { name: /personalizar/i }));

        const controls = within(screen.getByRole("group", { name: /opciones de tendencia reciente/i }));
        await userEvent.click(controls.getByRole("button", { name: "Alto" }));

        expect(widget("trend")).toHaveAttribute("data-height", "tall");
        expect(controls.getByRole("button", { name: "Alto" })).toHaveAttribute("aria-pressed", "true");
    });

    it("moves a widget with the step buttons", async () => {
        mount();
        await userEvent.click(screen.getByRole("button", { name: /personalizar/i }));

        const controls = within(screen.getByRole("group", { name: /opciones de nivel de riesgo/i }));
        await userEvent.click(controls.getByRole("button", { name: /mover antes/i }));

        expect(order()).toEqual(["latest", "trend", "summary", "risk", "recommendation"]);
    });

    it("reorders by dragging a widget onto another", async () => {
        mount();
        await userEvent.click(screen.getByRole("button", { name: /personalizar/i }));

        fireEvent.dragStart(widget("risk"), { dataTransfer: { setData: () => undefined, effectAllowed: "" } });
        fireEvent.dragOver(widget("latest"), { dataTransfer: { dropEffect: "" } });
        fireEvent.drop(widget("latest"), { dataTransfer: {} });

        expect(order()[0]).toBe("risk");
    });

    it("hides a widget and offers to show it again", async () => {
        mount();
        await userEvent.click(screen.getByRole("button", { name: /personalizar/i }));

        await userEvent.click(screen.getByRole("button", { name: /ocultar nivel de riesgo/i }));
        expect(order()).not.toContain("risk");

        await userEvent.click(screen.getByRole("button", { name: /mostrar nivel de riesgo/i }));
        expect(order()).toContain("risk");
    });

    it("restores the default layout", async () => {
        mount();
        await userEvent.click(screen.getByRole("button", { name: /personalizar/i }));
        await userEvent.click(screen.getByRole("button", { name: /ocultar nivel de riesgo/i }));
        await userEvent.click(screen.getByRole("button", { name: /restablecer/i }));

        expect(order()).toEqual(["latest", "trend", "summary", "recommendation", "risk"]);
        expect(widget("trend")).toHaveAttribute("data-span", "6");
    });

    it("keeps the widget contents working inside the frame", () => {
        mount();
        expect(within(widget("latest")).getByTestId("latest-reading")).toBeInTheDocument();
        expect(within(widget("risk")).getByTestId("risk-level")).toBeInTheDocument();
    });
});
