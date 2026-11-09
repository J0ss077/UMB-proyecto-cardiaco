// @requirement RF-04
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectDeviceScreen } from "../components/ConnectDeviceScreen";
import { renderWithToasts } from "./helpers";

const setBluetooth = (value: unknown) => Object.defineProperty(navigator, "bluetooth", { value, configurable: true });
const search = () => screen.getByRole("button", { name: /buscar dispositivos/i });

describe("ConnectDeviceScreen", () => {
    beforeEach(() => window.localStorage.clear());
    afterEach(() => setBluetooth(undefined));

    it("shows the title, the invitation and an empty list", () => {
        setBluetooth({ requestDevice: vi.fn() });
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);

        expect(screen.getByRole("heading", { name: "Conectar dispositivo" })).toBeInTheDocument();
        expect(screen.getByText("Busca y conecta dispositivos médicos")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Dispositivos disponibles" })).toBeInTheDocument();
        expect(screen.getByText(/aún no hay dispositivos/i)).toBeInTheDocument();
    });

    it("goes back", async () => {
        const onBack = vi.fn();
        renderWithToasts(<ConnectDeviceScreen onBack={onBack} />);

        await userEvent.click(screen.getByRole("button", { name: /volver/i }));

        expect(onBack).toHaveBeenCalled();
    });

    it("opens the browser chooser for blood pressure monitors and lists the chosen device as linked", async () => {
        const requestDevice = vi.fn().mockResolvedValue({ id: "d1", name: "Omron X-450" });
        setBluetooth({ requestDevice });
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);

        await userEvent.click(search());

        expect(requestDevice).toHaveBeenCalledWith({ filters: [{ services: ["blood_pressure"] }] });
        const row = await screen.findByRole("button", { name: /omron x-450/i });
        expect(within(row).getByText("Vinculado")).toBeInTheDocument();
    });

    it("remembers linked devices after leaving the screen", async () => {
        setBluetooth({ requestDevice: vi.fn().mockResolvedValue({ id: "d1", name: "Omron X-450" }) });
        const { unmount } = renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);
        await userEvent.click(search());
        await screen.findByRole("button", { name: /omron x-450/i });
        unmount();

        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);

        expect(await screen.findByRole("button", { name: /omron x-450/i })).toBeInTheDocument();
    });

    it("explains that the browser has no Bluetooth support", async () => {
        setBluetooth(undefined);
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);

        await userEvent.click(search());

        expect(await screen.findByRole("alert")).toHaveTextContent(/no admite bluetooth/i);
    });

    it("stays quiet when the user closes the chooser", async () => {
        const cancelled = Object.assign(new Error("cancelled"), { name: "NotFoundError" });
        setBluetooth({ requestDevice: vi.fn().mockRejectedValue(cancelled) });
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);

        await userEvent.click(search());

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("reports other Bluetooth failures", async () => {
        setBluetooth({ requestDevice: vi.fn().mockRejectedValue(new Error("radio apagada")) });
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);

        await userEvent.click(search());

        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo conectar el dispositivo/i);
    });

    it("forgets a linked device from its row", async () => {
        setBluetooth({ requestDevice: vi.fn().mockResolvedValue({ id: "d1", name: "Omron X-450" }) });
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);
        await userEvent.click(search());

        await userEvent.click(await screen.findByRole("button", { name: /omron x-450/i }));
        await userEvent.click(screen.getByRole("button", { name: /olvidar dispositivo/i }));

        expect(screen.queryByRole("button", { name: /omron x-450/i })).not.toBeInTheDocument();
    });

    it("lists devices the browser already has permission for as available and links one on request", async () => {
        setBluetooth({ requestDevice: vi.fn(), getDevices: vi.fn().mockResolvedValue([{ id: "d3", name: "Beurer BM-28" }]) });
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);

        const row = await screen.findByRole("button", { name: /beurer bm-28/i });
        expect(within(row).getByText("Disponible")).toBeInTheDocument();

        await userEvent.click(row);
        await userEvent.click(screen.getByRole("button", { name: /^vincular$/i }));

        expect(within(screen.getByRole("button", { name: /beurer bm-28/i })).getByText("Vinculado")).toBeInTheDocument();
    });

    it("forgets every device from the options menu", async () => {
        setBluetooth({ requestDevice: vi.fn().mockResolvedValue({ id: "d1", name: "Omron X-450" }) });
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);
        await userEvent.click(search());
        await screen.findByRole("button", { name: /omron x-450/i });

        await userEvent.click(screen.getByRole("button", { name: /más opciones/i }));
        await userEvent.click(screen.getByRole("menuitem", { name: /olvidar todos los dispositivos/i }));

        expect(screen.getByText(/aún no hay dispositivos/i)).toBeInTheDocument();
    });

    it("says that readings are not saved automatically yet", () => {
        renderWithToasts(<ConnectDeviceScreen onBack={vi.fn()} />);
        expect(screen.getByText(/todavía no se guardan automáticamente/i)).toBeInTheDocument();
    });
});
