// @requirement none
// Layout of the patient home: order, width (in twelfths of the row), height and
// visibility of each widget. Pure functions plus load and save; the view lives in
// components/DashboardGrid.tsx.

export type WidgetId =
    | "latest"
    | "trend"
    | "alert"
    | "summary"
    | "recommendation"
    | "risk"
    | "heartRate"
    | "today"
    | "stats"
    | "comparison"
    | "distribution"
    | "timeOfDay"
    | "symptoms"
    | "emergency"
    | "devices"
    | "shortcuts";
export type Span = 4 | 6 | 8 | 12;
export type Height = "compact" | "normal" | "tall";

export interface WidgetLayout {
    id: WidgetId;
    span: Span;
    height: Height;
    hidden: boolean;
}

export const SPANS: readonly Span[] = [4, 6, 8, 12];
export const HEIGHTS: readonly Height[] = ["compact", "normal", "tall"];

// The first six are the core home; the rest are offered hidden so the user adds
// the ones they want from the customize mode.
const CORE: readonly WidgetId[] = ["latest", "trend", "alert", "summary", "recommendation", "risk"];
const EXTRA: readonly WidgetId[] = [
    "heartRate",
    "today",
    "stats",
    "comparison",
    "distribution",
    "timeOfDay",
    "symptoms",
    "emergency",
    "devices",
    "shortcuts",
];
const IDS: readonly WidgetId[] = [...CORE, ...EXTRA];
const STORAGE_KEY = "hta.dashboard.layout.v1";

export const DEFAULT_LAYOUT: WidgetLayout[] = IDS.map((id) => ({
    id,
    span: 6,
    height: "normal",
    hidden: EXTRA.includes(id),
}));

const isId = (value: unknown): value is WidgetId => IDS.includes(value as WidgetId);

export function normalizeLayout(raw: unknown): WidgetLayout[] {
    if (!Array.isArray(raw)) return DEFAULT_LAYOUT.map((entry) => ({ ...entry }));
    const seen = new Set<WidgetId>();
    const kept: WidgetLayout[] = [];
    for (const item of raw as Record<string, unknown>[]) {
        if (!item || !isId(item.id) || seen.has(item.id)) continue;
        seen.add(item.id);
        kept.push({
            id: item.id,
            span: SPANS.includes(item.span as Span) ? (item.span as Span) : 6,
            height: HEIGHTS.includes(item.height as Height) ? (item.height as Height) : "normal",
            hidden: item.hidden === true,
        });
    }
    for (const entry of DEFAULT_LAYOUT) {
        if (!seen.has(entry.id)) kept.push({ ...entry });
    }
    return kept;
}

export function moveBefore(layout: WidgetLayout[], id: WidgetId, targetId: WidgetId): WidgetLayout[] {
    const from = layout.findIndex((entry) => entry.id === id);
    const to = layout.findIndex((entry) => entry.id === targetId);
    if (from < 0 || to < 0 || from === to) return layout;
    const next = layout.filter((entry) => entry.id !== id);
    const insertAt = next.findIndex((entry) => entry.id === targetId);
    next.splice(insertAt, 0, layout[from]!);
    return next;
}

export function moveBy(layout: WidgetLayout[], id: WidgetId, delta: -1 | 1): WidgetLayout[] {
    const from = layout.findIndex((entry) => entry.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= layout.length) return layout;
    const next = [...layout];
    [next[from], next[to]] = [next[to]!, next[from]!];
    return next;
}

const update = (layout: WidgetLayout[], id: WidgetId, patch: Partial<WidgetLayout>) =>
    layout.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));

export const setSpan = (layout: WidgetLayout[], id: WidgetId, span: Span) => update(layout, id, { span });
export const setHeight = (layout: WidgetLayout[], id: WidgetId, height: Height) => update(layout, id, { height });
export const setHidden = (layout: WidgetLayout[], id: WidgetId, hidden: boolean) => update(layout, id, { hidden });

export function loadLayout(): WidgetLayout[] {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return normalizeLayout(raw ? JSON.parse(raw) : null);
    } catch {
        return normalizeLayout(null);
    }
}

export function saveLayout(layout: WidgetLayout[]): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
        // Storage can be blocked; the layout then lasts only for this visit.
    }
}
