// @requirement none
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoEditor } from "../components/PhotoEditor";
import type { PhotoRenderer } from "../lib/photoRenderer";

const file = new File(["x"], "foto.jpg", { type: "image/jpeg" });

function makeRenderer(overrides: Partial<PhotoRenderer> = {}) {
    const renderer: PhotoRenderer = {
        load: vi.fn().mockResolvedValue({ width: 800, height: 600, source: {} }),
        draw: vi.fn(),
        export: vi.fn().mockReturnValue("data:image/jpeg;base64,AAAA"),
        ...overrides,
    };
    return renderer;
}

const lastDraw = (renderer: PhotoRenderer) => {
    const calls = (renderer.draw as ReturnType<typeof vi.fn>).mock.calls;
    return calls[calls.length - 1]![2] as { zoom: number; rotation: number; offsetX: number; offsetY: number };
};

const mount = (renderer = makeRenderer(), handlers = { onApply: vi.fn(), onCancel: vi.fn() }) => {
    render(<PhotoEditor file={file} renderer={renderer} {...handlers} />);
    return { renderer, ...handlers };
};

describe("PhotoEditor", () => {
    beforeEach(() => vi.restoreAllMocks());

    it("loads the chosen file and draws it at the start position", async () => {
        const { renderer } = mount();

        expect(screen.getByText(/cargando imagen/i)).toBeInTheDocument();
        await screen.findByRole("slider", { name: "Zoom" });

        expect(renderer.load).toHaveBeenCalledWith(file);
        await waitFor(() => expect(lastDraw(renderer)).toEqual({ zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 }));
    });

    it("is a labelled modal dialog", async () => {
        mount();
        await screen.findByRole("slider", { name: "Zoom" });
        expect(screen.getByRole("dialog", { name: "Ajustar foto" })).toHaveAttribute("aria-modal", "true");
    });

    it("zooms in and out with the slider", async () => {
        const { renderer } = mount();
        const zoom = await screen.findByRole("slider", { name: "Zoom" });

        fireEvent.change(zoom, { target: { value: "2.5" } });

        expect(lastDraw(renderer).zoom).toBe(2.5);
        expect(zoom).toHaveAttribute("min", "1");
    });

    it("rotates a quarter turn to each side", async () => {
        const { renderer } = mount();
        await screen.findByRole("slider", { name: "Zoom" });

        await userEvent.click(screen.getByRole("button", { name: /girar a la derecha/i }));
        expect(lastDraw(renderer).rotation).toBe(90);

        await userEvent.click(screen.getByRole("button", { name: /girar a la izquierda/i }));
        await userEvent.click(screen.getByRole("button", { name: /girar a la izquierda/i }));
        expect(lastDraw(renderer).rotation).toBe(-90);
    });

    it("adds a fine adjustment on top of the quarter turns", async () => {
        const { renderer } = mount();
        await screen.findByRole("slider", { name: "Zoom" });

        await userEvent.click(screen.getByRole("button", { name: /girar a la derecha/i }));
        fireEvent.change(screen.getByRole("slider", { name: /ajuste fino/i }), { target: { value: "12" } });

        expect(lastDraw(renderer).rotation).toBe(102);
    });

    it("moves the photo with the arrow keys and never past the edge", async () => {
        const { renderer } = mount();
        const preview = await screen.findByRole("application", { name: /mover la foto/i });

        // At zoom one a landscape image only has slack along x.
        fireEvent.keyDown(preview, { key: "ArrowRight" });
        expect(lastDraw(renderer).offsetX).toBeGreaterThan(0);
        fireEvent.keyDown(preview, { key: "ArrowDown" });
        expect(lastDraw(renderer).offsetY).toBeCloseTo(0, 1);

        for (let step = 0; step < 40; step += 1) fireEvent.keyDown(preview, { key: "ArrowRight" });
        expect(lastDraw(renderer).offsetX).toBeLessThanOrEqual(43);
    });

    it("drags the photo with the pointer", async () => {
        const { renderer } = mount();
        const preview = await screen.findByRole("application", { name: /mover la foto/i });
        fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "3" } });

        fireEvent.pointerDown(preview, { clientX: 100, clientY: 100, pointerId: 1 });
        fireEvent.pointerMove(preview, { clientX: 120, clientY: 90, pointerId: 1 });
        fireEvent.pointerUp(preview, { pointerId: 1 });

        expect(lastDraw(renderer).offsetX).toBeCloseTo(20);
        expect(lastDraw(renderer).offsetY).toBeCloseTo(-10);
    });

    it("keeps the photo inside the frame when zooming back out", async () => {
        const { renderer } = mount();
        const preview = await screen.findByRole("application", { name: /mover la foto/i });
        const zoom = screen.getByRole("slider", { name: "Zoom" });
        fireEvent.change(zoom, { target: { value: "3" } });
        for (let step = 0; step < 30; step += 1) fireEvent.keyDown(preview, { key: "ArrowLeft" });
        const far = lastDraw(renderer).offsetX;

        fireEvent.change(zoom, { target: { value: "1" } });

        expect(Math.abs(lastDraw(renderer).offsetX)).toBeLessThan(Math.abs(far));
    });

    it("restores the starting position", async () => {
        const { renderer } = mount();
        await screen.findByRole("slider", { name: "Zoom" });
        fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });
        await userEvent.click(screen.getByRole("button", { name: /girar a la derecha/i }));

        await userEvent.click(screen.getByRole("button", { name: /restablecer/i }));

        expect(lastDraw(renderer)).toEqual({ zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 });
    });

    it("exports the current framing when applied", async () => {
        const { renderer, onApply } = mount();
        await screen.findByRole("slider", { name: "Zoom" });
        fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "2" } });

        await userEvent.click(screen.getByRole("button", { name: /aplicar foto/i }));

        expect(renderer.export).toHaveBeenCalledWith(expect.objectContaining({ width: 800 }), { zoom: 2, rotation: 0, offsetX: 0, offsetY: 0 });
        expect(onApply).toHaveBeenCalledWith("data:image/jpeg;base64,AAAA");
    });

    it("cancels with the button and with Escape", async () => {
        const { onCancel } = mount();
        await screen.findByRole("slider", { name: "Zoom" });

        await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
        await userEvent.keyboard("{Escape}");

        expect(onCancel).toHaveBeenCalledTimes(2);
    });

    it("says when the image cannot be read and only allows cancelling", async () => {
        const { onCancel } = mount(makeRenderer({ load: vi.fn().mockRejectedValue(new Error("bad image")) }));

        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo leer la imagen/i);
        expect(screen.queryByRole("button", { name: /aplicar foto/i })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
        expect(onCancel).toHaveBeenCalled();
    });

    it("reports an export failure without closing", async () => {
        const { onApply } = mount(
            makeRenderer({
                export: vi.fn(() => {
                    throw new Error("canvas");
                }),
            }),
        );
        await screen.findByRole("slider", { name: "Zoom" });

        await userEvent.click(screen.getByRole("button", { name: /aplicar foto/i }));

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo preparar la foto/i));
        expect(onApply).not.toHaveBeenCalled();
    });
});
