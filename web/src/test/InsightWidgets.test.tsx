// @requirement RF-19
// @requirement RF-21
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientHome } from "../components/patient/PatientHome";
import { DEFAULT_LAYOUT, saveLayout } from "../lib/dashboardLayout";
import { saveDevices } from "../lib/devices";
import type { Reading, Symptom } from "../types";
import { renderWithToasts } from "./helpers";

const DAY = 86_400_000;
let counter = 0;
const reading = (when: Date, systolic: number, diastolic: number, heartRate: number | null = null): Reading => ({
    id: `r${counter++}`,
    patient_id: "p",
    systolic,
    diastolic,
    heart_rate: heartRate,
    source: "manual",
    measured_at: when.toISOString(),
    validation_status: "valid",
});
const daysAgoAt = (days: number, hour: number) => {
    const date = new Date(Date.now() - days * DAY);
    date.setHours(hour, 0, 0, 0);
    return date;
};

const history: Reading[] = [
    reading(new Date(Date.now() - 60_000), 150, 95, 83),
    reading(daysAgoAt(1, 9), 120, 80, 70),
    reading(daysAgoAt(2, 15), 118, 76, null),
];

const symptoms: Symptom[] = [
    { id: "s1", patient_id: "p", free_text: "mareo y dolor de cabeza", mood: "ansioso", recorded_at: new Date().toISOString() },
];

const handlers = {
    onRegister: vi.fn(),
    onSymptoms: vi.fn(),
    onChatbot: vi.fn(),
    onConnectDevice: vi.fn(),
};

const showAll = () => saveLayout(DEFAULT_LAYOUT.map((entry) => ({ ...entry, hidden: false })));

const mount = (overrides: Partial<{ history: Reading[]; symptoms: Symptom[] }> = {}) =>
    renderWithToasts(
        <PatientHome
            recent={history}
            history={overrides.history ?? history}
            symptoms={overrides.symptoms ?? symptoms}
            summary={null}
            openAlert={null}
            {...handlers}
        />,
    );

const widget = (id: string) =>
    screen.getAllByTestId("dashboard-widget").find((node) => node.getAttribute("data-widget-id") === id)!;

describe("extra home widgets", () => {
    beforeEach(() => {
        window.localStorage.clear();
        Object.values(handlers).forEach((handler) => handler.mockReset());
    });

    it("keeps the extra widgets out of the home until the user adds them", async () => {
        mount();
        expect(screen.queryByTestId("dashboard-widget-heartRate")).not.toBeInTheDocument();
        expect(screen.getAllByTestId("dashboard-widget")).toHaveLength(5);

        await userEvent.click(screen.getByRole("button", { name: /personalizar/i }));
        const tray = within(screen.getByRole("region", { name: /widgets disponibles/i }));
        for (const title of [
            "Frecuencia cardíaca",
            "Hoy",
            "Tu actividad",
            "Comparativa semanal",
            "Distribución de lecturas",
            "Por momento del día",
            "Síntomas recientes",
            "Ayuda en emergencias",
            "Dispositivos",
            "Accesos rápidos",
        ]) {
            expect(tray.getByRole("button", { name: `Mostrar ${title}` })).toBeInTheDocument();
        }

        await userEvent.click(tray.getByRole("button", { name: "Mostrar Frecuencia cardíaca" }));
        expect(widget("heartRate")).toBeInTheDocument();
    });

    describe("with every widget visible", () => {
        beforeEach(showAll);

        it("shows the latest heart rate and the weekly average", () => {
            mount();
            const card = within(widget("heartRate"));
            expect(card.getByText("83")).toBeInTheDocument();
            expect(card.getByText(/promedio de 7 días: 77 lpm/i)).toBeInTheDocument();
        });

        it("tells whether a reading was registered today and the streak", () => {
            mount();
            const card = within(widget("today"));
            expect(card.getByText(/registraste 1 lectura hoy/i)).toBeInTheDocument();
            expect(card.getByText(/3 días seguidos/i)).toBeInTheDocument();
        });

        it("invites to register when nothing was registered today", async () => {
            mount({ history: history.slice(1) });
            const card = within(widget("today"));
            expect(card.getByText(/aún no has registrado una lectura hoy/i)).toBeInTheDocument();

            await userEvent.click(card.getByRole("button", { name: /registrar lectura/i }));
            expect(handlers.onRegister).toHaveBeenCalled();
        });

        it("shows streak, measurements and share in range", () => {
            mount();
            const card = within(widget("stats"));
            expect(within(card.getByTestId("stat-streak")).getByText("3")).toBeInTheDocument();
            expect(within(card.getByTestId("stat-count")).getByText("3")).toBeInTheDocument();
            expect(within(card.getByTestId("stat-range")).getByText("67%")).toBeInTheDocument();
        });

        it("compares this week with the previous one, saying when there is no earlier data", () => {
            mount();
            const card = within(widget("comparison"));
            expect(card.getByText("129/84")).toBeInTheDocument();
            expect(card.getByText(/sin lecturas la semana anterior/i)).toBeInTheDocument();
        });

        it("shows the share of readings per category", () => {
            mount();
            const card = within(widget("distribution"));
            expect(card.getByText(/normal: 2/i)).toBeInTheDocument();
            expect(card.getByText(/alta: 1/i)).toBeInTheDocument();
        });

        it("shows the averages per moment of the day and names the highest", () => {
            mount();
            const card = within(widget("timeOfDay"));
            expect(card.getByText("Mañana")).toBeInTheDocument();
            expect(card.getByText("Tarde")).toBeInTheDocument();
            expect(card.getByText("Noche")).toBeInTheDocument();
            expect(card.getByText(/promedio más alto/i)).toBeInTheDocument();
        });

        it("lists the latest symptoms and opens the symptom diary", async () => {
            mount();
            const card = within(widget("symptoms"));
            expect(card.getByText("mareo y dolor de cabeza")).toBeInTheDocument();
            expect(card.getByText("ansioso")).toBeInTheDocument();

            await userEvent.click(card.getByRole("button", { name: /registrar síntoma/i }));
            expect(handlers.onSymptoms).toHaveBeenCalled();
        });

        it("says there are no symptoms yet", () => {
            mount({ symptoms: [] });
            expect(within(widget("symptoms")).getByText(/aún no has registrado síntomas/i)).toBeInTheDocument();
        });

        it("offers the emergency numbers and guidance without any data", () => {
            mount({ history: [], symptoms: [] });
            const card = within(widget("emergency"));
            expect(card.getByText(/llama ya a emergencias/i)).toBeInTheDocument();
            expect(card.getByRole("link", { name: /llamar al 123/i })).toHaveAttribute("href", "tel:123");
            expect(card.getByRole("link", { name: /llamar al 911/i })).toHaveAttribute("href", "tel:911");
        });

        it("lists the linked devices or invites to connect one", async () => {
            mount();
            expect(within(widget("devices")).getByText(/sin dispositivos vinculados/i)).toBeInTheDocument();
            await userEvent.click(within(widget("devices")).getByRole("button", { name: /conectar dispositivo/i }));
            expect(handlers.onConnectDevice).toHaveBeenCalled();
        });

        it("shows the linked devices stored in this browser", () => {
            saveDevices([
                { id: "d1", name: "Omron X-450", linked: true },
                { id: "d2", name: "Beurer BM-28", linked: false },
            ]);
            mount();
            const card = within(widget("devices"));
            expect(card.getByText("Omron X-450")).toBeInTheDocument();
            expect(card.queryByText("Beurer BM-28")).not.toBeInTheDocument();
        });

        it("offers shortcuts to the main actions", async () => {
            mount();
            const card = within(widget("shortcuts"));

            await userEvent.click(card.getByRole("button", { name: /registrar lectura/i }));
            await userEvent.click(card.getByRole("button", { name: /diario de síntomas/i }));
            await userEvent.click(card.getByRole("button", { name: /^chatbot$/i }));
            await userEvent.click(card.getByRole("button", { name: /conectar dispositivo/i }));

            expect(handlers.onRegister).toHaveBeenCalled();
            expect(handlers.onSymptoms).toHaveBeenCalled();
            expect(handlers.onChatbot).toHaveBeenCalled();
            expect(handlers.onConnectDevice).toHaveBeenCalled();
        });

        it("does not break with an empty history", () => {
            mount({ history: [], symptoms: [] });
            expect(widget("heartRate")).toHaveTextContent(/aún no hay frecuencia cardíaca/i);
            expect(widget("distribution")).toHaveTextContent(/sin lecturas/i);
            expect(widget("timeOfDay")).toHaveTextContent(/sin lecturas/i);
        });
    });
});
