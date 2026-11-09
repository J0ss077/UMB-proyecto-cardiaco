// @requirement none
import { Moon, Sun } from "lucide-react";
import { cn } from "../../lib/cn";
import { useTheme } from "../../lib/theme";

// A pill switch for light and dark mode. The knob slides over the icon of the
// current theme, so the pill always shows both options.
export function ThemeToggle({ className }: { className?: string }) {
    const { theme, toggle } = useTheme();
    const dark = theme === "dark";

    return (
        <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-label="Modo oscuro"
            title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            onClick={(event) => {
                // The bubble grows from the middle of the switch.
                const box = event.currentTarget.getBoundingClientRect();
                toggle({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
            }}
            className={cn(
                "relative flex h-8 w-16 shrink-0 items-center justify-between rounded-full border border-border bg-background px-1.5 transition-colors duration-300",
                className,
            )}
        >
            <Sun className="h-4 w-4 text-subtle" strokeWidth={1.5} aria-hidden="true" />
            <Moon className="h-4 w-4 text-subtle" strokeWidth={1.5} aria-hidden="true" />
            <span
                aria-hidden="true"
                className={cn(
                    "absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-transform duration-300",
                    dark ? "translate-x-8" : "translate-x-0",
                )}
            >
                {dark ? <Moon className="h-4 w-4" strokeWidth={1.5} /> : <Sun className="h-4 w-4" strokeWidth={1.5} />}
            </span>
        </button>
    );
}
