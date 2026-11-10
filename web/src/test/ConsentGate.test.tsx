// @requirement RF-03
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentGate } from "../components/ConsentGate";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({ acceptConsent: vi.fn(), getConsentDocument: vi.fn() }));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    acceptConsent: mocks.acceptConsent,
    getConsentDocument: mocks.getConsentDocument,
}));

const API_DOCUMENT = {
    version: 1,
    content_ref: "consentimiento-informado-v1",
    text: [
        "# Consentimiento informado de la API",
        "",
        "## Quién puede verlos",
        "",
        "El médico tratante autoriza al cuidador y fija su alcance.",
        "",
        "- Tú",
        "- Tu médico tratante",
        "",
        "## Cómo revocas el consentimiento",
        "",
        "Desde tu perfil, en la sección Privacidad.",
    ].join("\n"),
};

describe("ConsentGate", () => {
    beforeEach(() => {
        mocks.acceptConsent.mockReset();
        mocks.acceptConsent.mockResolvedValue({ id: "c1" });
        mocks.getConsentDocument.mockReset();
        mocks.getConsentDocument.mockResolvedValue(API_DOCUMENT);
    });

    it("renders the text served by the API and keeps the version visible", async () => {
        renderWithToasts(<ConsentGate version={3} onAccepted={vi.fn()} />);

        expect(screen.getByRole("heading", { name: "Consentimiento informado" })).toBeInTheDocument();
        expect(screen.getByTestId("consent-version")).toHaveTextContent("Versión 3");
        expect(await screen.findByText(/el médico tratante autoriza al cuidador/i)).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Quién puede verlos" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Cómo revocas el consentimiento" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /acepto el consentimiento/i })).toBeEnabled();
        expect(mocks.getConsentDocument).toHaveBeenCalledTimes(1);
    });

    it("shows an error state and keeps acceptance closed when the document fails", async () => {
        mocks.getConsentDocument.mockRejectedValue(new Error("sin conexión"));
        renderWithToasts(<ConsentGate version={1} onAccepted={vi.fn()} />);

        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cargar el documento/i);
        expect(screen.getByRole("button", { name: /acepto el consentimiento/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
    });

    it("records the acceptance without sending a version", async () => {
        const onAccepted = vi.fn();
        renderWithToasts(<ConsentGate version={1} onAccepted={onAccepted} />);

        await screen.findByText(/el médico tratante autoriza al cuidador/i);
        await userEvent.click(screen.getByRole("button", { name: /acepto el consentimiento/i }));

        expect(mocks.acceptConsent).toHaveBeenCalledWith();
        expect(onAccepted).toHaveBeenCalledTimes(1);
    });

    it("offers a way to read the history without accepting", async () => {
        const onDismiss = vi.fn();
        renderWithToasts(<ConsentGate version={1} onAccepted={vi.fn()} onDismiss={onDismiss} />);

        await screen.findByText(/el médico tratante autoriza al cuidador/i);
        await userEvent.click(screen.getByRole("button", { name: /consultar mi historial sin aceptar/i }));

        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});
