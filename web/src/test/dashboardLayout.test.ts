// @requirement none
import { beforeEach, describe, expect, it } from "vitest";
import {
    DEFAULT_LAYOUT,
    loadLayout,
    moveBy,
    moveBefore,
    normalizeLayout,
    saveLayout,
    setHeight,
    setHidden,
    setSpan,
    type WidgetLayout,
} from "../lib/dashboardLayout";

const ids = (layout: WidgetLayout[]) => layout.map((entry) => entry.id);

describe("dashboardLayout", () => {
    beforeEach(() => window.localStorage.clear());

    it("shows the six core widgets and offers the rest hidden, all at half width", () => {
        expect(ids(DEFAULT_LAYOUT).slice(0, 6)).toEqual(["latest", "trend", "alert", "summary", "recommendation", "risk"]);
        expect(DEFAULT_LAYOUT.slice(0, 6).every((entry) => !entry.hidden)).toBe(true);
        expect(DEFAULT_LAYOUT.slice(6).length).toBe(10);
        expect(DEFAULT_LAYOUT.slice(6).every((entry) => entry.hidden)).toBe(true);
        expect(DEFAULT_LAYOUT.every((entry) => entry.span === 6 && entry.height === "normal")).toBe(true);
    });

    it("drops unknown ids, repairs invalid values and appends missing widgets", () => {
        const result = normalizeLayout([
            { id: "risk", span: 8, height: "tall", hidden: true },
            { id: "ghost", span: 6, height: "normal", hidden: false },
            { id: "latest", span: 99, height: "huge", hidden: "yes" },
        ]);

        expect(ids(result).slice(0, 6)).toEqual(["risk", "latest", "trend", "alert", "summary", "recommendation"]);
        expect(ids(result)).toHaveLength(16);
        expect(result[0]).toEqual({ id: "risk", span: 8, height: "tall", hidden: true });
        expect(result[1]).toEqual({ id: "latest", span: 6, height: "normal", hidden: false });
    });

    it("falls back to the default for anything that is not a list", () => {
        expect(normalizeLayout("nope")).toEqual(DEFAULT_LAYOUT);
        expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    });

    it("moves a widget before another one", () => {
        expect(ids(moveBefore(DEFAULT_LAYOUT, "risk", "latest"))[0]).toBe("risk");
        expect(ids(moveBefore(DEFAULT_LAYOUT, "latest", "risk")).slice(0, 6)).toEqual(["trend", "alert", "summary", "recommendation", "latest", "risk"]);
    });

    it("ignores a move onto itself or an unknown id", () => {
        expect(moveBefore(DEFAULT_LAYOUT, "latest", "latest")).toEqual(DEFAULT_LAYOUT);
        expect(moveBefore(DEFAULT_LAYOUT, "latest", "ghost" as never)).toEqual(DEFAULT_LAYOUT);
    });

    it("moves by one step and stops at the ends", () => {
        expect(ids(moveBy(DEFAULT_LAYOUT, "trend", -1))[0]).toBe("trend");
        expect(ids(moveBy(DEFAULT_LAYOUT, "latest", -1))).toEqual(ids(DEFAULT_LAYOUT));
        const last = DEFAULT_LAYOUT[DEFAULT_LAYOUT.length - 1]!.id;
        expect(ids(moveBy(DEFAULT_LAYOUT, last, 1))).toEqual(ids(DEFAULT_LAYOUT));
        expect(ids(moveBy(DEFAULT_LAYOUT, "latest", 1))[1]).toBe("latest");
    });

    it("changes the size, height and visibility of one widget only", () => {
        const wide = setSpan(DEFAULT_LAYOUT, "trend", 12);
        expect(wide.find((entry) => entry.id === "trend")?.span).toBe(12);
        expect(wide.find((entry) => entry.id === "latest")?.span).toBe(6);
        expect(setHeight(DEFAULT_LAYOUT, "trend", "tall").find((e) => e.id === "trend")?.height).toBe("tall");
        expect(setHidden(DEFAULT_LAYOUT, "risk", true).find((e) => e.id === "risk")?.hidden).toBe(true);
    });

    it("does not mutate the layout it receives", () => {
        const before = JSON.stringify(DEFAULT_LAYOUT);
        setSpan(DEFAULT_LAYOUT, "trend", 12);
        moveBefore(DEFAULT_LAYOUT, "risk", "latest");
        expect(JSON.stringify(DEFAULT_LAYOUT)).toBe(before);
    });

    it("round-trips through storage", () => {
        const custom = setSpan(moveBefore(DEFAULT_LAYOUT, "risk", "latest"), "risk", 12);
        saveLayout(custom);
        expect(loadLayout()).toEqual(custom);
    });

    it("returns the default when storage is empty or corrupt", () => {
        expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
        window.localStorage.setItem("hta.dashboard.layout.v1", "{not json");
        expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
    });
});
