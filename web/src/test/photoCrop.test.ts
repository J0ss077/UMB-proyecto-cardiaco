// @requirement none
import { describe, expect, it } from "vitest";
import { baseScale, clampOffset, covers, drawCrop, moveBy, normalizeRotation, type CropParams } from "../lib/photoCrop";

const SIZE = 256;
const params = (overrides: Partial<CropParams> = {}): CropParams => ({
    imageWidth: 800,
    imageHeight: 600,
    zoom: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    ...overrides,
});

describe("baseScale", () => {
    it("fits the shorter side of the image to the square when it is not rotated", () => {
        expect(baseScale(params(), SIZE)).toBeCloseTo(SIZE / 600);
    });

    it("grows by the rotated diagonal so a tilted image still covers the square", () => {
        expect(baseScale(params({ rotation: 45 }), SIZE)).toBeCloseTo((SIZE * Math.SQRT2) / 600);
    });

    it("is the same for a quarter turn", () => {
        expect(baseScale(params({ rotation: 90 }), SIZE)).toBeCloseTo(SIZE / 600);
    });
});

describe("covers", () => {
    it("is true when centered at any zoom of one or more and any angle", () => {
        for (const rotation of [0, 15, 45, 90, 135, -30]) {
            for (const zoom of [1, 1.5, 3]) {
                expect(covers(params({ rotation, zoom }), SIZE)).toBe(true);
            }
        }
    });

    it("is false when the image is dragged far away from the square", () => {
        expect(covers(params({ offsetX: 500 }), SIZE)).toBe(false);
    });
});

describe("clampOffset", () => {
    it("leaves an offset that still covers the square untouched", () => {
        expect(clampOffset(params({ offsetX: 20, offsetY: 0 }), SIZE)).toEqual({ offsetX: 20, offsetY: 0 });
    });

    it("stops a landscape image at its edge without moving on the other axis", () => {
        const clamped = clampOffset(params({ offsetX: 500, offsetY: 0 }), SIZE);
        const width = (SIZE / 600) * 800;
        expect(clamped.offsetX).toBeCloseTo((width - SIZE) / 2, 0);
        expect(clamped.offsetY).toBe(0);
    });

    it("cannot move a square image that has no slack at zoom one", () => {
        const clamped = clampOffset(params({ imageWidth: 500, imageHeight: 500, offsetX: 40, offsetY: -40 }), SIZE);
        expect(Math.abs(clamped.offsetX)).toBeLessThan(0.01);
        expect(Math.abs(clamped.offsetY)).toBeLessThan(0.01);
    });

    it("keeps the direction and always lands on a covering position", () => {
        const clamped = clampOffset(params({ zoom: 2, rotation: 30, offsetX: 900, offsetY: 300 }), SIZE);
        expect(covers(params({ zoom: 2, rotation: 30, ...clamped }), SIZE)).toBe(true);
        expect(clamped.offsetY / clamped.offsetX).toBeCloseTo(300 / 900, 1);
    });

    it("allows more movement when zoomed in", () => {
        const far = clampOffset(params({ zoom: 3, offsetX: 900 }), SIZE).offsetX;
        const near = clampOffset(params({ zoom: 1, offsetX: 900 }), SIZE).offsetX;
        expect(far).toBeGreaterThan(near);
    });
});

describe("moveBy", () => {
    it("moves freely while the image still covers the square", () => {
        expect(moveBy(params({ zoom: 3 }), 20, -10, SIZE)).toEqual({ offsetX: 20, offsetY: -10 });
    });

    it("stops at the edge and still moves along the other axis", () => {
        const moved = moveBy(params({ zoom: 1, offsetX: 40 }), 30, 30, SIZE);
        expect(moved.offsetX).toBeCloseTo(((SIZE / 600) * 800 - SIZE) / 2, 0);
        expect(moved.offsetY).toBeCloseTo(0, 1);
        const zoomed = moveBy(params({ zoom: 3, offsetX: 0 }), 5000, 12, SIZE);
        expect(zoomed.offsetY).toBe(12);
        expect(covers(params({ zoom: 3, ...zoomed }), SIZE)).toBe(true);
    });
});

describe("normalizeRotation", () => {
    it("keeps the angle between -180 and 180", () => {
        expect(normalizeRotation(270)).toBe(-90);
        expect(normalizeRotation(-270)).toBe(90);
        expect(normalizeRotation(360)).toBe(0);
        expect(normalizeRotation(45)).toBe(45);
    });
});

describe("drawCrop", () => {
    it("paints a white background, then the image centered, rotated and scaled", () => {
        const calls: [string, ...unknown[]][] = [];
        const record = (name: string) => (...args: unknown[]) => {
            calls.push([name, ...args]);
        };
        const ctx = {
            fillStyle: "",
            save: record("save"),
            restore: record("restore"),
            fillRect: record("fillRect"),
            translate: record("translate"),
            rotate: record("rotate"),
            scale: record("scale"),
            drawImage: record("drawImage"),
        } as unknown as CanvasRenderingContext2D;
        const source = {} as CanvasImageSource;

        drawCrop(ctx, source, params({ zoom: 2, rotation: 90, offsetX: 10, offsetY: -5 }), SIZE);

        const scale = (SIZE / 600) * 2;
        expect(calls.map((call) => call[0])).toEqual(["save", "fillRect", "translate", "rotate", "scale", "drawImage", "restore"]);
        expect(calls[1]).toEqual(["fillRect", 0, 0, SIZE, SIZE]);
        expect(calls[2]).toEqual(["translate", SIZE / 2 + 10, SIZE / 2 - 5]);
        expect(calls[3]![1]).toBeCloseTo(Math.PI / 2);
        expect(calls[4]).toEqual(["scale", scale, scale]);
        expect(calls[5]).toEqual(["drawImage", source, -400, -300]);
    });

    it("does nothing without a context", () => {
        expect(() => drawCrop(null, {} as CanvasImageSource, params(), SIZE)).not.toThrow();
    });
});

