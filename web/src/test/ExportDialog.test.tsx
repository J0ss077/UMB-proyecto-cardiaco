// @requirement RF-17
// @requirement RF-18
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "../components/ExportDialog";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    getProfile: vi.fn(),
    listReadings: vi.fn(),
    listSymptoms: vi.fn(),
    listAlerts: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const createObjectURL = vi.fn(() => "blob:mock");
const revokeObjectURL = vi.fn();
let clicked: HTMLAnchorElement[] = [];

describe("ExportDialog", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.getProfile.mockResolvedValue({ full_name: "Ana", birth_date: null, sex: null, document_number: null, diagnosis_date: null });
        mocks.listReadings.mockResolvedValue({
            items: [{ id: "r", patient_id: "u", systolic: 120, diastolic: 80, heart_rate: 70, source: "manual", measured_at: "2026-11-07T20:00:00Z", validation_status: "valid" }],
            total: 1,
        });
        mocks.listSymptoms.mockResolvedValue({ items: [], total: 0 });
        mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });
        clicked = [];
        Object.assign(URL, { createObjectURL, revokeObjectURL });
        createObjectURL.mockClear();
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            clicked.push(this);
        });
    });

    afterEach(() => vi.restoreAllMocks());

    const open = (onClose = vi.fn()) => {
        renderWithToasts(<ExportDialog onClose={onClose} />);
        return onClose;
    };

    it("asks whether the user wants Excel or PDF and waits for the answer", () => {
        open();

        expect(screen.getByRole("dialog", { name: /descargar historial/i })).toHaveAttribute("aria-modal", "true");
        expect(screen.getByText("¿En qué formato quieres tus datos?")).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: /excel/i })).not.toBeChecked();
        expect(screen.getByRole("radio", { name: /pdf/i })).not.toBeChecked();
        expect(screen.getByRole("button", { name: /^descargar$/i })).toBeDisabled();
    });

    it("warns that the file holds health data and is not a clinical history", () => {
        open();
        expect(screen.getByText(/contiene datos de salud/i)).toBeInTheDocument();
        expect(screen.getByText(/no sustituye la historia clínica/i)).toBeInTheDocument();
    });

    it("downloads an Excel file for the chosen period", async () => {
        const onClose = open();

        await userEvent.click(screen.getByRole("radio", { name: /excel/i }));
        await userEvent.click(screen.getByRole("button", { name: /^descargar$/i }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(createObjectURL).toHaveBeenCalledTimes(1);
        const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
        expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        expect(clicked[0]?.download).toMatch(/^historial-hipertai-\d{4}-\d{2}-\d{2}\.xlsx$/);
        expect(mocks.listReadings).toHaveBeenCalledWith(expect.objectContaining({ since: expect.any(String) }));
    });

    it("downloads a PDF of the whole history when asked", async () => {
        const onClose = open();

        await userEvent.click(screen.getByRole("radio", { name: /pdf/i }));
        await userEvent.selectOptions(screen.getByRole("combobox", { name: /período/i }), "all");
        await userEvent.click(screen.getByRole("button", { name: /^descargar$/i }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect((createObjectURL.mock.calls[0] as unknown as [Blob])[0].type).toBe("application/pdf");
        expect(clicked[0]?.download).toMatch(/\.pdf$/);
        expect(mocks.listReadings).toHaveBeenCalledWith({ limit: 200, offset: 0 });
    });

    it("lets the user choose which sections go in the file", async () => {
        open();
        await userEvent.click(screen.getByRole("radio", { name: /excel/i }));

        await userEvent.click(screen.getByRole("checkbox", { name: /alertas/i }));
        await userEvent.click(screen.getByRole("checkbox", { name: /síntomas/i }));
        await userEvent.click(screen.getByRole("button", { name: /^descargar$/i }));

        await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
        expect(mocks.listAlerts).not.toHaveBeenCalled();
        expect(mocks.listSymptoms).not.toHaveBeenCalled();
        expect(mocks.listReadings).toHaveBeenCalled();
    });

    it("blocks the download when nothing is selected", async () => {
        open();
        await userEvent.click(screen.getByRole("radio", { name: /excel/i }));

        for (const name of [/resumen/i, /lecturas/i, /síntomas/i, /alertas/i]) {
            await userEvent.click(screen.getByRole("checkbox", { name }));
        }

        expect(screen.getByRole("button", { name: /^descargar$/i })).toBeDisabled();
    });

    it("still produces the file when the profile cannot be read", async () => {
        mocks.getProfile.mockRejectedValue(new Error("boom"));
        const onClose = open();

        await userEvent.click(screen.getByRole("radio", { name: /pdf/i }));
        await userEvent.click(screen.getByRole("button", { name: /^descargar$/i }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(createObjectURL).toHaveBeenCalled();
    });

    it("reports a failure and stays open", async () => {
        mocks.listReadings.mockRejectedValue(new Error("boom"));
        const onClose = open();

        await userEvent.click(screen.getByRole("radio", { name: /excel/i }));
        await userEvent.click(screen.getByRole("button", { name: /^descargar$/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo generar el archivo/i);
        expect(onClose).not.toHaveBeenCalled();
        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("closes with Escape and with Cancel", async () => {
        const onClose = open();

        await userEvent.keyboard("{Escape}");
        await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
