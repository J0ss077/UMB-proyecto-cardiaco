// @requirement RF-19
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadingsTrend } from "../components/ReadingsTrend";
import type { Reading } from "../types";

const reading = (id: string, systolic: number, diastolic: number, measured_at: string): Reading => ({
    id,
    patient_id: "p",
    systolic,
    diastolic,
    heart_rate: null,
    source: "manual",
    measured_at,
    validation_status: "valid",
});

describe("ReadingsTrend", () => {
    it("shows an empty state without readings", () => {
        render(<ReadingsTrend readings={[]} />);
        expect(screen.getByText(/sin lecturas para graficar/i)).toBeInTheDocument();
    });

    it("exposes an accessible summary and the legend with both series and both guidelines", () => {
        render(
            <ReadingsTrend
                readings={[
                    reading("2", 150, 95, "2026-11-07T20:00:00Z"),
                    reading("1", 120, 80, "2026-11-06T20:00:00Z"),
                ]}
            />,
        );
        expect(screen.getByRole("img", { name: /2 lecturas/i })).toBeInTheDocument();
        expect(screen.getByText("Sistólica")).toBeInTheDocument();
        expect(screen.getByText("Diastólica")).toBeInTheDocument();
        expect(screen.getByText(/OMS 140\/90/)).toBeInTheDocument();
        expect(screen.getByText(/ACC\/AHA 130\/80/)).toBeInTheDocument();
    });
});

describe("ReadingsTrend legend toggles", () => {
    const data = [reading("1", 120, 80, "2026-11-06T20:00:00Z")];

    it("lets the user hide and show a series", async () => {
        const { default: userEvent } = await import("@testing-library/user-event");
        render(<ReadingsTrend readings={data} />);
        const toggle = screen.getByRole("button", { name: "Diastólica" });
        expect(toggle).toHaveAttribute("aria-pressed", "true");

        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-pressed", "false");

        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    it("lets the user hide a guideline", async () => {
        const { default: userEvent } = await import("@testing-library/user-event");
        render(<ReadingsTrend readings={data} />);
        const toggle = screen.getByRole("button", { name: /ACC\/AHA 130\/80/ });
        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-pressed", "false");
    });
});
