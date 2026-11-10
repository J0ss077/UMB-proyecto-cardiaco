/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
            },
            colors: {
                background: "rgb(var(--background) / <alpha-value>)",
                surface: "rgb(var(--surface) / <alpha-value>)",
                muted: "rgb(var(--muted) / <alpha-value>)",
                foreground: "rgb(var(--foreground) / <alpha-value>)",
                subtle: "rgb(var(--subtle) / <alpha-value>)",
                border: "rgb(var(--border) / <alpha-value>)",
                primary: {
                    DEFAULT: "rgb(var(--primary) / <alpha-value>)",
                    soft: "rgb(var(--primary-soft) / <alpha-value>)",
                    foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
                },
                accent: "rgb(var(--accent) / <alpha-value>)",
                normal: {
                    DEFAULT: "rgb(var(--status-normal) / <alpha-value>)",
                    soft: "rgb(var(--status-normal-soft) / <alpha-value>)",
                },
                elevated: {
                    DEFAULT: "rgb(var(--status-elevated) / <alpha-value>)",
                    soft: "rgb(var(--status-elevated-soft) / <alpha-value>)",
                },
                warning: {
                    DEFAULT: "rgb(var(--status-warning) / <alpha-value>)",
                    soft: "rgb(var(--status-warning-soft) / <alpha-value>)",
                },
                critical: {
                    DEFAULT: "rgb(var(--status-critical) / <alpha-value>)",
                    soft: "rgb(var(--status-critical-soft) / <alpha-value>)",
                },
                systolic: "rgb(var(--chart-systolic) / <alpha-value>)",
                diastolic: "rgb(var(--chart-diastolic) / <alpha-value>)",
            },
            borderRadius: {
                card: "0.75rem",
                field: "0.625rem",
            },
        },
    },
    plugins: [],
};
