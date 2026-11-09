// @requirement none
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../components/ui/ThemeToggle";

type Listener = (event: { matches: boolean }) => void;

// A controllable stand-in for the system color scheme.
function stubSystem(dark: boolean) {
    const listeners = new Set<Listener>();
    const media = {
        matches: dark,
        addEventListener: (_: string, listener: Listener) => listeners.add(listener),
        removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
    };
    // Only the color scheme question gets the controllable answer; others (such as reduced motion) say no.
    window.matchMedia = vi.fn().mockImplementation((query: string) =>
        query.includes("color-scheme") ? media : { matches: false, addEventListener: () => undefined, removeEventListener: () => undefined },
    ) as unknown as typeof window.matchMedia;
    return {
        change(next: boolean) {
            media.matches = next;
            act(() => listeners.forEach((listener) => listener({ matches: next })));
        },
    };
}

const toggle = () => screen.getByRole("switch", { name: /modo oscuro/i });
const html = document.documentElement;

describe("ThemeToggle", () => {
    beforeEach(() => {
        window.localStorage.clear();
        html.removeAttribute("data-theme");
    });

    afterEach(() => {
        Reflect.deleteProperty(window, "matchMedia");
    });

    it("is a labelled switch", () => {
        stubSystem(false);
        render(<ThemeToggle />);
        expect(toggle()).toHaveAttribute("aria-checked", "false");
    });

    it("starts in the system theme when nothing was chosen", () => {
        stubSystem(true);
        render(<ThemeToggle />);

        expect(toggle()).toHaveAttribute("aria-checked", "true");
        expect(html.dataset.theme).toBe("dark");
    });

    it("starts in light when the system is light or cannot be read", () => {
        Reflect.deleteProperty(window, "matchMedia");
        render(<ThemeToggle />);

        expect(toggle()).toHaveAttribute("aria-checked", "false");
        expect(html.dataset.theme).toBe("light");
    });

    it("prefers what the user chose before over the system", () => {
        stubSystem(true);
        window.localStorage.setItem("hta.theme", "light");
        render(<ThemeToggle />);

        expect(toggle()).toHaveAttribute("aria-checked", "false");
        expect(html.dataset.theme).toBe("light");
    });

    it("switches to dark and back, applying and remembering each choice", async () => {
        stubSystem(false);
        render(<ThemeToggle />);

        await userEvent.click(toggle());
        expect(toggle()).toHaveAttribute("aria-checked", "true");
        expect(html.dataset.theme).toBe("dark");
        expect(window.localStorage.getItem("hta.theme")).toBe("dark");

        await userEvent.click(toggle());
        expect(toggle()).toHaveAttribute("aria-checked", "false");
        expect(html.dataset.theme).toBe("light");
        expect(window.localStorage.getItem("hta.theme")).toBe("light");
    });

    it("works from the keyboard", async () => {
        stubSystem(false);
        render(<ThemeToggle />);

        toggle().focus();
        await userEvent.keyboard(" ");
        expect(html.dataset.theme).toBe("dark");
        await userEvent.keyboard("{Enter}");
        expect(html.dataset.theme).toBe("light");
    });

    it("keeps following the system until the user chooses", () => {
        const system = stubSystem(false);
        render(<ThemeToggle />);

        system.change(true);

        expect(toggle()).toHaveAttribute("aria-checked", "true");
        expect(html.dataset.theme).toBe("dark");
    });

    it("stops following the system once the user has chosen", async () => {
        const system = stubSystem(false);
        render(<ThemeToggle />);
        await userEvent.click(toggle());
        await userEvent.click(toggle());

        system.change(true);

        expect(toggle()).toHaveAttribute("aria-checked", "false");
        expect(html.dataset.theme).toBe("light");
    });

    it("accepts a class for where it is placed", () => {
        stubSystem(false);
        render(<ThemeToggle className="ml-auto" />);
        expect(toggle().className).toContain("ml-auto");
    });

    it("still works when storage is blocked", async () => {
        stubSystem(false);
        const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("blocked");
        });
        render(<ThemeToggle />);

        await userEvent.click(toggle());

        expect(html.dataset.theme).toBe("dark");
        setItem.mockRestore();
    });

    describe("the bubble", () => {
        const html = document.documentElement;

        afterEach(() => {
            Reflect.deleteProperty(document, "startViewTransition");
        });

        it("runs the change inside a view transition when the browser has them", async () => {
            stubSystem(false);
            const start = vi.fn((callback: () => void) => {
                callback();
                return { ready: Promise.resolve(), finished: Promise.resolve() };
            });
            Object.assign(document, { startViewTransition: start });
            html.animate = vi.fn() as unknown as typeof html.animate;
            render(<ThemeToggle />);

            await userEvent.click(toggle());

            expect(start).toHaveBeenCalledTimes(1);
            expect(html.dataset.theme).toBe("dark");
            expect(toggle()).toHaveAttribute("aria-checked", "true");
        });

        it("starts the bubble at the center of the button", async () => {
            stubSystem(false);
            Object.assign(document, {
                startViewTransition: vi.fn((callback: () => void) => {
                    callback();
                    return { ready: Promise.resolve(), finished: Promise.resolve() };
                }),
                });
            const animate = vi.fn();
            html.animate = animate as unknown as typeof html.animate;
            render(<ThemeToggle />);
            vi.spyOn(toggle(), "getBoundingClientRect").mockReturnValue({ left: 100, top: 20, width: 64, height: 32 } as DOMRect);

            await userEvent.click(toggle());
            await new Promise((resolve) => setTimeout(resolve, 0));

            const [keyframes] = animate.mock.calls[0] as [{ clipPath: string[] }];
            expect(keyframes.clipPath[0]).toBe("circle(0px at 132px 36px)");
        });

        it("changes the theme on both directions through the same bubble", async () => {
            stubSystem(true);
            const start = vi.fn((callback: () => void) => {
                callback();
                return { ready: Promise.resolve(), finished: Promise.resolve() };
            });
            Object.assign(document, { startViewTransition: start });
            html.animate = vi.fn() as unknown as typeof html.animate;
            render(<ThemeToggle />);

            await userEvent.click(toggle());
            expect(html.dataset.theme).toBe("light");
            await userEvent.click(toggle());
            expect(html.dataset.theme).toBe("dark");
            expect(start).toHaveBeenCalledTimes(2);
        });
    });
});
