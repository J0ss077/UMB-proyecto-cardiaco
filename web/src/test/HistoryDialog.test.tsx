// @requirement RF-19
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryDialog } from "../components/HistoryDialog";
import type { Reading } from "../types";

const reading: Reading = {
    id: "r1",
    patient_id: "p1",
    systolic: 150,
    diastolic: 95,
    heart_rate: 80,
    source: "manual",
    measured_at: "2026-11-08T14:00:00Z",
    validation_status: "valid",
};

describe("HistoryDialog", () => {
    it("says which window the pool covers instead of calling it the complete history", () => {
        render(<HistoryDialog readings={[reading]} onClose={vi.fn()} />);

        expect(
            screen.getByRole("heading", { name: "Lecturas desde el inicio del mes anterior" }),
        ).toBeInTheDocument();
        expect(screen.getByText(/no es tu historial completo/i)).toBeInTheDocument();
        expect(screen.getByText("150/95")).toBeInTheDocument();
    });
});
