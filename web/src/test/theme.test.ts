// @requirement none
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME_COLOR, applyTheme, readStoredTheme, resolveTheme, storeTheme } from "../lib/theme";

// Read from disk: the test runner replaces imported CSS with an empty module.
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

describe("resolveTheme", () => {
    it("uses the stored choice over the system setting", () => {
        expect(resolveTheme("light", true)).toBe("light");
        expect(resolveTheme("dark", false)).toBe("dark");
    });

    it("follows the system when nothing was chosen", () => {
        expect(resolveTheme(null, true)).toBe("dark");
        expect(resolveTheme(null, false)).toBe("light");
    });
});

describe("storing the choice", () => {
    beforeEach(() => window.localStorage.clear());

    it("round-trips light and dark", () => {
        storeTheme("dark");
        expect(readStoredTheme()).toBe("dark");
        storeTheme("light");
        expect(readStoredTheme()).toBe("light");
    });

    it("ignores anything else that was stored", () => {
        expect(readStoredTheme()).toBeNull();
        window.localStorage.setItem("hta.theme", "sepia");
        expect(readStoredTheme()).toBeNull();
    });
});

describe("applyTheme", () => {
    beforeEach(() => {
        document.head.innerHTML = `
            <meta name="theme-color" content="#0084ff" media="(prefers-color-scheme: light)">
            <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)">`;
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.style.colorScheme = "";
    });

    it("marks the page with the chosen theme and the matching color scheme", () => {
        applyTheme("dark");
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(document.documentElement.style.colorScheme).toBe("dark");

        applyTheme("light");
        expect(document.documentElement.dataset.theme).toBe("light");
        expect(document.documentElement.style.colorScheme).toBe("light");
    });

    it("recolors the browser bar for the chosen theme, whatever the system says", () => {
        applyTheme("dark");

        const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
        expect(metas.every((meta) => meta.getAttribute("content") === THEME_COLOR.dark)).toBe(true);
        expect(metas.every((meta) => !meta.hasAttribute("media"))).toBe(true);
    });

    it("works when the page has no theme-color tag", () => {
        document.head.innerHTML = "";
        expect(() => applyTheme("light")).not.toThrow();
    });
});

describe("the palettes", () => {
    const variables = (block: string) => [...block.matchAll(/(--[a-z-]+):/g)].map((match) => match[1]!).sort();
    const rootBlock = /:root\s*{([^}]*)}/.exec(css)![1]!;

    it("defines a dark value for every color the light palette defines, in both ways of turning it on", () => {
        const light = variables(rootBlock).filter((name) => name !== "--color-scheme");
        const media = /@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)\s*{([^}]*)}/.exec(css);
        const manual = /:root\[data-theme="dark"\]\s*{([^}]*)}/.exec(css);

        expect(media, "system dark palette").not.toBeNull();
        expect(manual, "manual dark palette").not.toBeNull();
        expect(variables(media![1]!)).toEqual(light);
        expect(variables(manual![1]!)).toEqual(light);
    });

    it("gives both dark palettes the same values", () => {
        const media = /@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)\s*{([^}]*)}/.exec(css)![1]!;
        const manual = /:root\[data-theme="dark"\]\s*{([^}]*)}/.exec(css)![1]!;
        const values = (block: string) => [...block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((match) => `${match[1]}:${match[2]!.trim()}`).sort();

        expect(values(manual)).toEqual(values(media));
    });

    it("lets a manual light choice win over a dark system", () => {
        expect(css).toContain(':root:not([data-theme="light"])');
    });
});
