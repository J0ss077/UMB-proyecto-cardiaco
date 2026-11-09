import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Node 26 ships its own experimental localStorage that shadows the jsdom one
// and is undefined without a backing file; install a plain in-memory store.
class MemoryStorage implements Storage {
    private data = new Map<string, string>();
    get length(): number {
        return this.data.size;
    }
    clear(): void {
        this.data.clear();
    }
    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.data.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.data.delete(key);
    }
    setItem(key: string, value: string): void {
        this.data.set(key, String(value));
    }
}

Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), configurable: true });

afterEach(() => {
    cleanup();
    window.localStorage.clear();
});

// jsdom has no layout engine; Recharts' ResponsiveContainer needs ResizeObserver.
class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

// jsdom has no PointerEvent; a mouse event carries the same coordinates.
if (typeof window.PointerEvent === "undefined") {
    Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true, writable: true });
}
