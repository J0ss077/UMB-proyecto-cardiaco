// @requirement RF-19
// @requirement RF-17
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientData } from "../components/patient/PatientData";
import type { Reading } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({ listReadings: vi.fn(), getProfile: vi.fn(), listSymptoms: vi.fn(), listAlerts: vi.fn() }));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

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
const previousMonthDay = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0);
};

const pool = (): Reading[] => [
    reading(new Date(Date.now() - 60_000), 150, 100, 83),
    reading(daysAgoAt(1, 9), 152, 98),
    reading(daysAgoAt(3, 15), 118, 76),
    reading(daysAgoAt(10, 8), 130, 85),
    reading(previousMonthDay(), 125, 80),
];

const mount = (onSymptoms = vi.fn()) => {
    renderWithToasts(<PatientData refreshKey={0} onSymptoms={onSymptoms} />);
    return onSymptoms;
};

const week = () => userEvent.click(screen.getByRole("tab", { name: "Semanal" }));

describe("Datos tab", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listReadings.mockImplementation(() => Promise.resolve({ items: pool(), total: 5 }));
        mocks.getProfile.mockResolvedValue(null);
        mocks.listSymptoms.mockResolvedValue({ items: [], total: 0 });
        mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });
    });

    it("splits the cards into two columns whose last card grows to close the gap", async () => {
        mount();
        const layout = await screen.findByTestId("data-layout");
        const columnA = within(layout).getByTestId("data-column-a");
        const columnB = within(layout).getByTestId("data-column-b");

        for (const id of ["data-latest", "data-trend", "data-plain-summary", "data-comparison", "data-daily-chart"]) {
            expect(columnA).toContainElement(screen.getByTestId(id));
        }
        for (const id of ["data-warning", "data-heart-chart", "data-distribution", "data-time-of-day"]) {
            expect(columnB).toContainElement(screen.getByTestId(id));
        }
        // The last card of each column is the one that stretches (the charts, which grow).
        expect(columnA.lastElementChild?.className).toContain("lg:flex-1");
        expect(columnB.lastElementChild?.className).toContain("lg:flex-1");
        expect(columnA.lastElementChild).toContainElement(screen.getByTestId("data-daily-chart"));
        expect(columnB.lastElementChild).toContainElement(screen.getByTestId("data-time-of-day"));
    });

    it("gives the growing charts a fixed height on a phone and lets them grow only on desktop", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        const bare = /(^|\s)(flex-1|min-h-\d+)(\s|$)/;
        const moment = within(screen.getByTestId("data-time-of-day")).getByRole("img", { name: /presión por momento del día/i });
        const daily = within(screen.getByTestId("data-daily-chart")).getByRole("img", { name: /promedio de presión por día/i });

        expect(moment.className).toContain("h-40");
        expect(moment.className).toContain("lg:flex-1");
        expect(moment.className).not.toMatch(bare);
        expect(daily.className).toContain("h-56");
        expect(daily.className).toContain("lg:flex-1");
        expect(daily.className).not.toMatch(bare);
    });

    it("keeps the same cards when there is no warning, with the other column still filled", async () => {
        mocks.listReadings.mockResolvedValue({ items: [reading(new Date(Date.now() - 60_000), 118, 76)], total: 1 });
        mount();
        const layout = await screen.findByTestId("data-layout");

        expect(screen.queryByTestId("data-warning")).not.toBeInTheDocument();
        expect(within(layout).getByTestId("data-column-b").lastElementChild).toContainElement(screen.getByTestId("data-time-of-day"));
    });

    it("shows the latest reading with its category and the change since yesterday", async () => {
        mount();

        const card = await screen.findByTestId("data-latest");
        expect(within(card).getByText("150")).toBeInTheDocument();
        expect(within(card).getByText("100")).toBeInTheDocument();
        expect(within(card).getByText("mmHg")).toBeInTheDocument();
        expect(within(card).getByText("Alta")).toBeInTheDocument();
        expect(within(card).getByText(/2 mmHg vs\. ayer/i)).toBeInTheDocument();
    });

    it("offers daily, weekly and monthly periods, with the daily one selected first", async () => {
        mount();
        await screen.findByTestId("data-latest");

        expect(screen.getByRole("tab", { name: "Diario" })).toHaveAttribute("aria-selected", "true");
        await week();
        expect(screen.getByRole("tab", { name: "Semanal" })).toHaveAttribute("aria-selected", "true");
        await userEvent.click(screen.getByRole("tab", { name: "Mensual" }));
        expect(screen.getByRole("tab", { name: "Mensual" })).toHaveAttribute("aria-selected", "true");
    });

    it("shows the trend with its legend", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        const trend = screen.getByTestId("data-trend");
        expect(within(trend).getByRole("img", { name: /3 lecturas/i })).toBeInTheDocument();
        expect(within(trend).getByRole("button", { name: "Sistólica" })).toBeInTheDocument();
    });

    it("compares the weekly average, the 30-day average and the previous month", async () => {
        mount();
        const card = within(await screen.findByTestId("data-comparison"));

        // Which readings fall in the last 30 days or in the previous calendar month
        // depends on today's date, so the expectation is computed from the same pool.
        const readings = pool();
        const average = (items: Reading[]) =>
            `${Math.round(items.reduce((sum, r) => sum + r.systolic, 0) / items.length)}/${Math.round(items.reduce((sum, r) => sum + r.diastolic, 0) / items.length)}`;
        const now = new Date();
        const inLast30 = readings.filter((r) => now.getTime() - new Date(r.measured_at).getTime() <= 30 * DAY);
        const inPreviousMonth = readings.filter((r) => {
            const date = new Date(r.measured_at);
            const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return date.getFullYear() === first.getFullYear() && date.getMonth() === first.getMonth();
        });

        const rows = card.getByText("Promedio semanal").parentElement!;
        expect(within(rows).getByText("140/91")).toBeInTheDocument();
        expect(within(card.getByText("Promedio 30 días").parentElement!).getByText(average(inLast30))).toBeInTheDocument();
        expect(within(card.getByText("Mes anterior").parentElement!).getByText(average(inPreviousMonth))).toBeInTheDocument();
    });

    it("shows a danger card for a high latest reading and sends the user to log symptoms", async () => {
        const onSymptoms = mount();

        const alert = await screen.findByTestId("data-warning");
        expect(alert).toHaveTextContent(/valor elevado detectado/i);
        expect(alert).toHaveTextContent("150/100 mmHg");

        await userEvent.click(within(alert).getByRole("button", { name: /registrar síntoma/i }));
        expect(onSymptoms).toHaveBeenCalled();
    });

    it("does not warn when the latest reading is normal", async () => {
        mocks.listReadings.mockResolvedValue({ items: [reading(new Date(Date.now() - 60_000), 118, 76)], total: 1 });
        mount();
        await screen.findByTestId("data-latest");
        expect(screen.queryByTestId("data-warning")).not.toBeInTheDocument();
    });

    it("shows the three headline tiles for the selected period", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        expect(within(screen.getByTestId("tile-streak")).getByText("2")).toBeInTheDocument();
        expect(within(screen.getByTestId("tile-count")).getByText("3")).toBeInTheDocument();
        expect(within(screen.getByTestId("tile-range")).getByText("33%")).toBeInTheDocument();
    });

    it("shows detailed statistics for the period", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        expect(screen.getByTestId("stat-mean")).toHaveTextContent("140/91");
        expect(screen.getByTestId("stat-max-systolic")).toHaveTextContent("152");
        expect(screen.getByTestId("stat-min-systolic")).toHaveTextContent("118");
        expect(screen.getByTestId("stat-spread")).toHaveTextContent("15.6");
        expect(screen.getByTestId("stat-pulse")).toHaveTextContent("49");
        expect(screen.getByTestId("stat-heart-rate")).toHaveTextContent("83");
        expect(screen.getByTestId("stat-high")).toHaveTextContent("2");
    });

    it("shows the distribution and the moment of the day for the period", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        expect(within(screen.getByTestId("data-distribution")).getByText(/normal: 1/i)).toBeInTheDocument();
        expect(within(screen.getByTestId("data-time-of-day")).getByText("Mañana")).toBeInTheDocument();
    });

    it("explains the period in plain words", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        const card = within(screen.getByTestId("data-plain-summary"));
        expect(card.getByText("Tuviste 3 mediciones válidas y 33% estuvieron bajo 140/90.")).toBeInTheDocument();
        expect(card.getByText(/tu lectura más alta fue 152\/98 mmHg/i)).toBeInTheDocument();
    });

    it("shows the average per day as bars with a one-line explanation", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        const card = within(screen.getByTestId("data-daily-chart"));
        expect(card.getByRole("img", { name: /promedio de presión por día/i })).toBeInTheDocument();
        expect(card.getByText(/cada barra es el promedio de un día/i)).toBeInTheDocument();
    });

    it("shows the share of readings per state as a donut with the share in range at the center", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        const card = within(screen.getByTestId("data-distribution"));
        expect(card.getByRole("img", { name: /distribución de las lecturas/i })).toBeInTheDocument();
        expect(card.getByTestId("donut-center")).toHaveTextContent("33%");
        expect(card.getByText(/normal: 1/i)).toBeInTheDocument();
    });

    it("charts the moment of the day and says when there is not enough to compare", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();

        const card = within(screen.getByTestId("data-time-of-day"));
        expect(card.getByRole("img", { name: /presión por momento del día/i })).toBeInTheDocument();
        expect(card.getByText("Mañana")).toBeInTheDocument();
    });

    it("charts the heart rate, or says there is none", async () => {
        mount();
        await screen.findByTestId("data-latest");
        await week();
        expect(within(screen.getByTestId("data-heart-chart")).getByRole("img", { name: /frecuencia cardíaca/i })).toBeInTheDocument();
    });

    it("says there is no heart rate in the period", async () => {
        mocks.listReadings.mockResolvedValue({ items: [reading(new Date(Date.now() - 60_000), 118, 76)], total: 1 });
        mount();
        await screen.findByTestId("data-latest");

        expect(within(screen.getByTestId("data-heart-chart")).getByText(/sin frecuencia cardíaca registrada/i)).toBeInTheDocument();
    });

    const longHistory = () =>
        mocks.listReadings.mockResolvedValue({
            items: Array.from({ length: 25 }, (_, index) => reading(daysAgoAt(index % 20, 8 + (index % 9)), 120 + index, 80)),
            total: 25,
        });

    it("opens the reading history in a dialog and pages through it", async () => {
        longHistory();
        mount();
        await screen.findByTestId("data-latest");

        await userEvent.click(screen.getByRole("button", { name: /^historial$/i }));

        const dialog = screen.getByRole("dialog", { name: /lecturas desde el inicio del mes anterior/i });
        const history = within(dialog);
        expect(history.getAllByRole("row")).toHaveLength(11);
        await userEvent.click(history.getByRole("button", { name: /ver más/i }));
        expect(history.getAllByRole("row")).toHaveLength(21);
        await userEvent.click(history.getByRole("button", { name: /ver más/i }));
        expect(history.getAllByRole("row")).toHaveLength(26);
        expect(history.queryByRole("button", { name: /ver más/i })).not.toBeInTheDocument();
    });

    it("filters the history by category", async () => {
        longHistory();
        mount();
        await screen.findByTestId("data-latest");
        await userEvent.click(screen.getByRole("button", { name: /^historial$/i }));
        const history = within(screen.getByRole("dialog", { name: /lecturas desde el inicio del mes anterior/i }));

        await userEvent.click(history.getByRole("button", { name: "Alta" }));

        expect(history.getAllByRole("row")).toHaveLength(6);
        expect(history.getByRole("button", { name: "Alta" })).toHaveAttribute("aria-pressed", "true");
        await userEvent.click(history.getByRole("button", { name: "Todas" }));
        expect(history.getAllByRole("row")).toHaveLength(11);
    });

    it("says when no reading matches the filter", async () => {
        mocks.listReadings.mockResolvedValue({ items: [reading(new Date(Date.now() - 60_000), 118, 76)], total: 1 });
        mount();
        await screen.findByTestId("data-latest");
        await userEvent.click(screen.getByRole("button", { name: /^historial$/i }));
        const history = within(screen.getByRole("dialog", { name: /lecturas desde el inicio del mes anterior/i }));

        await userEvent.click(history.getByRole("button", { name: "Crisis" }));

        expect(history.getByText(/ninguna lectura coincide/i)).toBeInTheDocument();
    });

    it("closes the history with Escape and with the close button", async () => {
        mount();
        await screen.findByTestId("data-latest");

        await userEvent.click(screen.getByRole("button", { name: /^historial$/i }));
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /^historial$/i }));
        await userEvent.click(screen.getByRole("button", { name: /cerrar/i }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("has no separate report button: the floating button opens the export dialog", async () => {
        mount();
        await screen.findByTestId("data-latest");

        expect(screen.queryByRole("button", { name: /generar informe/i })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Descargar historial" }));
        expect(screen.getByRole("dialog", { name: /descargar historial/i })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("explains that there are no readings yet", async () => {
        mocks.listReadings.mockResolvedValue({ items: [], total: 0 });
        mount();
        expect(await screen.findByText(/aún no tienes lecturas/i)).toBeInTheDocument();
    });

    it("reports a failure loading the readings", async () => {
        mocks.listReadings.mockRejectedValue(new Error("boom"));
        mount();
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no se pudieron cargar las lecturas/i));
    });
});
