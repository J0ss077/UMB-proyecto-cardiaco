/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    server: { port: 5173 },
    test: {
        environment: "jsdom",
        environmentOptions: { jsdom: { url: "http://localhost:3000" } },
        globals: true,
        setupFiles: ["./src/test/setup.ts"],
        css: false,
    },
});
