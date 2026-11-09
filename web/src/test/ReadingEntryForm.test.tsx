// @requirement RF-05
// @requirement RF-08
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { ReadingEntryForm } from "../components/ReadingEntryForm";
import type { Reading } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({ createReading: vi.fn() }));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    createReading: mocks.createReading,
}));

const saved: Reading = {
    id: "r1",
    patient_id: "p1",
    systolic: 138,
    diastolic: 88,
    heart_rate: 72,
    source: "manual",
    measured_at: "2026-11-08T15:00:00Z",
    validation_status: "valid",
};

async function fill(systolic: string, diastolic: string, heartRate = "") {
    await userEvent.type(screen.getByLabelText(/sistólica/i), systolic);
    await userEvent.type(screen.getByLabelText(/diastólica/i), diastolic);
    if (heartRate) await userEvent.type(screen.getByLabelText(/frecuencia cardíaca/i), heartRate);
}

describe("ReadingEntryForm", () => {
    beforeEach(() => {
        mocks.createReading.mockReset();
    });

    it("shows mmHg and lpm units", () => {
        renderWithToasts(<ReadingEntryForm onSaved={vi.fn()} onConsentRequired={vi.fn()} />);
        expect(screen.getAllByText("mmHg")).toHaveLength(2);
        expect(screen.getByText("lpm")).toBeInTheDocument();
    });

    it("sends integers to createReading and reports the saved reading", async () => {
        mocks.createReading.mockResolvedValue(saved);
        const onSaved = vi.fn();
        renderWithToasts(<ReadingEntryForm onSaved={onSaved} onConsentRequired={vi.fn()} />);

        await fill("138", "88", "72");
        await userEvent.click(screen.getByRole("button", { name: /guardar lectura/i }));

        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
        expect(mocks.createReading).toHaveBeenCalledWith({ systolic: 138, diastolic: 88, heart_rate: 72 });
    });

    it("warns about an out-of-range value but still submits it", async () => {
        mocks.createReading.mockResolvedValue({ ...saved, systolic: 300, validation_status: "out_of_range" });
        renderWithToasts(<ReadingEntryForm onSaved={vi.fn()} onConsentRequired={vi.fn()} />);

        await fill("300", "88");
        expect(screen.getByText(/fuera del rango habitual \(80 a 200 mmHg\)/i)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /guardar lectura/i }));

        await waitFor(() => expect(mocks.createReading).toHaveBeenCalledWith({ systolic: 300, diastolic: 88 }));
        expect(await screen.findByRole("status")).toHaveTextContent(/fuera de rango/i);
    });

    it("requires systolic and diastolic before calling the API", async () => {
        renderWithToasts(<ReadingEntryForm onSaved={vi.fn()} onConsentRequired={vi.fn()} />);
        await userEvent.click(screen.getByRole("button", { name: /guardar lectura/i }));
        expect(mocks.createReading).not.toHaveBeenCalled();
        expect(screen.getAllByText(/obligatori/i).length).toBeGreaterThan(0);
    });

    it("hands the patient to the consent step on the consent 403", async () => {
        mocks.createReading.mockRejectedValue(new ApiError(403, "No hay consentimiento informado vigente"));
        const onConsentRequired = vi.fn();
        renderWithToasts(<ReadingEntryForm onSaved={vi.fn()} onConsentRequired={onConsentRequired} />);

        await fill("120", "80");
        await userEvent.click(screen.getByRole("button", { name: /guardar lectura/i }));

        await waitFor(() => expect(onConsentRequired).toHaveBeenCalled());
    });
});
