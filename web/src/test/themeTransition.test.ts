// @requirement none
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUBBLE_MS, runThemeTransition } from "../lib/themeTransition";

const setReducedMotion = (reduce: boolean) => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: reduce && query.includes("reduce") })) as unknown as typeof window.matchMedia;
};

// A stand-in for the browser's view transition: it runs the callback and resolves `ready`.
function stubTransition(ready: Promise<void> = Promise.resolve()) {
    const callbacks: (() => void)[] = [];
    const start = vi.fn((callback: () => void) => {
        callbacks.push(callback);
        callback();
        return { ready, finished: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: vi.fn() };
    });
    Object.assign(document, { startViewTransition: start });
    return start;
}

describe("runThemeTransition", () => {
    const animate = vi.fn();

    beforeEach(() => {
        setReducedMotion(false);
        animate.mockReset();
        document.documentElement.animate = animate as unknown as typeof document.documentElement.animate;
        Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    });

    afterEach(() => {
        Reflect.deleteProperty(document, "startViewTransition");
        Reflect.deleteProperty(window, "matchMedia");
    });

    it("just runs the update when the browser cannot animate the change", () => {
        const update = vi.fn();

        runThemeTransition(update, { x: 10, y: 10 });

        expect(update).toHaveBeenCalledTimes(1);
        expect(animate).not.toHaveBeenCalled();
    });

    it("skips the animation for someone who asked for less motion", () => {
        const start = stubTransition();
        setReducedMotion(true);
        const update = vi.fn();

        runThemeTransition(update, { x: 10, y: 10 });

        expect(update).toHaveBeenCalledTimes(1);
        expect(start).not.toHaveBeenCalled();
    });

    it("changes the theme inside the transition, not before it", () => {
        const order: string[] = [];
        Object.assign(document, {
            startViewTransition: vi.fn((callback: () => void) => {
                order.push("start");
                callback();
                return { ready: Promise.resolve(), finished: Promise.resolve() };
            }),
        });

        runThemeTransition(() => order.push("update"), { x: 0, y: 0 });

        expect(order).toEqual(["start", "update"]);
    });

    it("grows a circle of the new theme from the point that was pressed, up to the farthest corner", async () => {
        stubTransition();

        runThemeTransition(vi.fn(), { x: 900, y: 100 });
        await Promise.resolve();
        await Promise.resolve();

        expect(animate).toHaveBeenCalledTimes(1);
        const [keyframes, options] = animate.mock.calls[0] as [{ clipPath: string[] }, KeyframeAnimationOptions];
        // The farthest corner from (900, 100) in a 1000x800 window is (0, 800).
        const radius = Math.hypot(900, 700);
        expect(keyframes.clipPath).toEqual(["circle(0px at 900px 100px)", `circle(${radius}px at 900px 100px)`]);
        expect(options).toMatchObject({ duration: BUBBLE_MS, pseudoElement: "::view-transition-new(root)" });
    });

    it("grows from the middle of the screen when it does not know where the press was", async () => {
        stubTransition();

        runThemeTransition(vi.fn());
        await Promise.resolve();
        await Promise.resolve();

        const [keyframes] = animate.mock.calls[0] as [{ clipPath: string[] }];
        expect(keyframes.clipPath[0]).toBe("circle(0px at 500px 400px)");
    });

    it("still applies the change when the browser refuses to animate it", async () => {
        stubTransition(Promise.reject(new Error("skipped")));
        const update = vi.fn();

        expect(() => runThemeTransition(update, { x: 1, y: 1 })).not.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(update).toHaveBeenCalledTimes(1);
        expect(animate).not.toHaveBeenCalled();
    });

    it("styles the transition so the new theme is revealed over the old one", () => {
        const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

        expect(css).toMatch(/::view-transition-old\(root\),\s*::view-transition-new\(root\)\s*{[^}]*animation:\s*none/);
        expect(css).toMatch(/::view-transition-new\(root\)\s*{[^}]*z-index:\s*2/);
    });
});
