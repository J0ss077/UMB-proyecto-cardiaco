// @requirement RF-03
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentGate } from "../components/ConsentGate";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({ acceptConsent: vi.fn() }));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    acceptConsent: mocks.acceptConsent,
}));

describe("ConsentGate", () => {
    beforeEach(() => {
        mocks.acceptConsent.mockReset();
        mocks.acceptConsent.mockResolvedValue({ id: "c1" });
    });

    it("shows the consent text and the version the API records before asking to accept", () => {
        renderWithToasts(<ConsentGate version={3} onAccepted={vi.fn()} />);

        expect(screen.getByRole("heading", { name: "Consentimiento informado" })).toBeInTheDocument();
        expect(screen.getByTestId("consent-version")).toHaveTextContent("Versión 3");

        for (const heading of [
            "Qué datos se recogen",
            "Para qué se usan",
            "Quién puede verlos",
            "Qué no hace la plataforma",
            "Cómo revocarlo",
        ]) {
            expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
        }

        expect(screen.getByText(/tus lecturas de presión y frecuencia cardíaca/i)).toBeInTheDocument();
        expect(screen.getByText(/promedio de siete días/i)).toBeInTheDocument();
        expect(screen.getByText(/el médico tratante que tengas asignado/i)).toBeInTheDocument();
        expect(screen.getByText(/no diagnostica ni trata/i)).toBeInTheDocument();
        expect(screen.getByText(/tu historia anterior se conserva/i)).toBeInTheDocument();
        expect(screen.getByText(/no se registran lecturas ni síntomas nuevos/i)).toBeInTheDocument();
    });

    it("records the acceptance without sending a version", async () => {
        const onAccepted = vi.fn();
        renderWithToasts(<ConsentGate version={1} onAccepted={onAccepted} />);

        await userEvent.click(screen.getByRole("button", { name: /acepto el consentimiento/i }));

        expect(mocks.acceptConsent).toHaveBeenCalledWith();
        expect(onAccepted).toHaveBeenCalledTimes(1);
    });
});
