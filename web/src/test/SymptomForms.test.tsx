// @requirement RF-21
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SymptomEntryForm } from "../components/SymptomEntryForm";
import { SymptomHistory } from "../components/SymptomHistory";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({ createSymptom: vi.fn() }));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    createSymptom: mocks.createSymptom,
}));

describe("SymptomEntryForm", () => {
    beforeEach(() => {
        mocks.createSymptom.mockReset();
    });

    it("counts characters against the 2000 and 100 limits", async () => {
        renderWithToasts(<SymptomEntryForm onSaved={vi.fn()} onConsentRequired={vi.fn()} />);
        expect(screen.getByText("0/2000")).toBeInTheDocument();
        expect(screen.getByText("0/100")).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText(/describe tus síntomas/i), "mareo");
        await userEvent.type(screen.getByLabelText(/estado de ánimo/i), "bien");

        expect(screen.getByText("5/2000")).toBeInTheDocument();
        expect(screen.getByText("4/100")).toBeInTheDocument();
    });

    it("enforces the maximum length on the fields", () => {
        renderWithToasts(<SymptomEntryForm onSaved={vi.fn()} onConsentRequired={vi.fn()} />);
        expect(screen.getByLabelText(/describe tus síntomas/i)).toHaveAttribute("maxlength", "2000");
        expect(screen.getByLabelText(/estado de ánimo/i)).toHaveAttribute("maxlength", "100");
    });

    it("rejects an empty symptom before calling the API", async () => {
        renderWithToasts(<SymptomEntryForm onSaved={vi.fn()} onConsentRequired={vi.fn()} />);
        await userEvent.click(screen.getByRole("button", { name: /guardar síntoma/i }));
        expect(mocks.createSymptom).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(/texto o un estado de ánimo/i);
    });

    it("submits trimmed values and clears the form", async () => {
        mocks.createSymptom.mockResolvedValue({ id: "s1" });
        const onSaved = vi.fn();
        renderWithToasts(<SymptomEntryForm onSaved={onSaved} onConsentRequired={vi.fn()} />);

        await userEvent.type(screen.getByLabelText(/describe tus síntomas/i), "  mareo  ");
        await userEvent.click(screen.getByRole("button", { name: /guardar síntoma/i }));

        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(mocks.createSymptom).toHaveBeenCalledWith({ free_text: "mareo" });
        expect(screen.getByLabelText(/describe tus síntomas/i)).toHaveValue("");
    });
});

describe("SymptomHistory", () => {
    it("lists symptoms with text and mood, tolerating nulls", () => {
        renderWithToasts(
            <SymptomHistory
                symptoms={[
                    { id: "1", patient_id: "p", free_text: "mareo", mood: "ansioso", recorded_at: "2026-11-07T21:30:00Z" },
                    { id: "2", patient_id: "p", free_text: null, mood: "bien", recorded_at: "2026-11-06T10:00:00Z" },
                ]}
            />,
        );
        expect(screen.getByText("mareo")).toBeInTheDocument();
        expect(screen.getByText("ansioso")).toBeInTheDocument();
        expect(screen.getByText("bien")).toBeInTheDocument();
    });

    it("shows an empty state", () => {
        renderWithToasts(<SymptomHistory symptoms={[]} />);
        expect(screen.getByText(/aún no has registrado síntomas/i)).toBeInTheDocument();
    });
});
