// @requirement none
import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { runThemeTransition } from "./themeTransition";

export type Theme = "light" | "dark";

const KEY = "hta.theme";

// Browser bar colors, the same ones index.html declares for each system scheme.
export const THEME_COLOR: Record<Theme, string> = { light: "#0084ff", dark: "#0f172a" };

export function readStoredTheme(): Theme | null {
    try {
        const value = window.localStorage.getItem(KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return null;
    }
}

export function storeTheme(theme: Theme): void {
    try {
        window.localStorage.setItem(KEY, theme);
    } catch {
        // Storage can be blocked; the choice then lasts only for this visit.
    }
}

const systemQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null);

export const systemPrefersDark = (): boolean => systemQuery()?.matches ?? false;

// What the user chose wins; without a choice the operating system decides.
export const resolveTheme = (stored: Theme | null, systemDark: boolean): Theme => stored ?? (systemDark ? "dark" : "light");

export function applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    // An explicit theme must beat the per-scheme tags, so they all take the same color.
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.setAttribute("content", THEME_COLOR[theme]);
        meta.removeAttribute("media");
    });
}

export interface Origin {
    x: number;
    y: number;
}

export function useTheme(): { theme: Theme; setTheme: (theme: Theme, origin?: Origin) => void; toggle: (origin?: Origin) => void } {
    const [theme, setThemeState] = useState<Theme>(() => resolveTheme(readStoredTheme(), systemPrefersDark()));
    const [chosen, setChosen] = useState<boolean>(() => readStoredTheme() !== null);

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    // Until the user chooses, a change of the system setting is followed.
    useEffect(() => {
        const query = systemQuery();
        if (!query || chosen) return;
        const onChange = (event: { matches: boolean }) => setThemeState(event.matches ? "dark" : "light");
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, [chosen]);

    const setTheme = useCallback((next: Theme, origin?: Origin) => {
        storeTheme(next);
        // Inside the transition both the page and the switch itself change, so the
        // knob moves within the bubble instead of after it.
        runThemeTransition(() => {
            applyTheme(next);
            flushSync(() => {
                setChosen(true);
                setThemeState(next);
            });
        }, origin);
    }, []);

    return { theme, setTheme, toggle: (origin?: Origin) => setTheme(theme === "dark" ? "light" : "dark", origin) };
}
