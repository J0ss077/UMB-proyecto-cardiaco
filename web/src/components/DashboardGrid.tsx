// @requirement none
import { ArrowLeft, ArrowRight, Eye, EyeOff, GripVertical, LayoutDashboard, RotateCcw } from "lucide-react";
import { useState, type DragEvent, type ReactNode } from "react";
import { cn } from "../lib/cn";
import {
    DEFAULT_LAYOUT,
    HEIGHTS,
    SPANS,
    loadLayout,
    moveBefore,
    moveBy,
    saveLayout,
    setHeight,
    setHidden,
    setSpan,
    type Height,
    type Span,
    type WidgetId,
    type WidgetLayout,
} from "../lib/dashboardLayout";
import { Button } from "./ui/Button";

export interface WidgetDefinition {
    title: string;
    // False when the widget has nothing to show (for example no open alert).
    available?: boolean;
    // Receives the chart height that matches the chosen widget height.
    render: (chartHeight: number) => ReactNode;
}

const SPAN_CLASS: Record<Span, string> = {
    4: "lg:col-span-4",
    6: "lg:col-span-6",
    8: "lg:col-span-8",
    12: "lg:col-span-12",
};

const SPAN_LABEL: Record<Span, string> = { 4: "Pequeño", 6: "Mediano", 8: "Grande", 12: "Ancho completo" };
const HEIGHT_LABEL: Record<Height, string> = { compact: "Compacto", normal: "Normal", tall: "Alto" };
const HEIGHT_CLASS: Record<Height, string> = { compact: "", normal: "", tall: "lg:min-h-[28rem]" };
const CHART_HEIGHT: Record<Height, number> = { compact: 180, normal: 240, tall: 360 };

const SHORT: Record<string, string> = { "4": "S", "6": "M", "8": "L", "12": "XL", compact: "Bajo", normal: "Medio", tall: "Alto" };

function Segmented<T extends string | number>({
    label,
    options,
    value,
    format,
    onChange,
}: {
    label: string;
    options: readonly T[];
    value: T;
    format: (option: T) => string;
    onChange: (option: T) => void;
}) {
    return (
        <div role="group" aria-label={label} className="flex rounded-field border border-border bg-background p-0.5">
            {options.map((option) => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={value === option}
                    aria-label={format(option)}
                    title={format(option)}
                    onClick={() => onChange(option)}
                    className={cn(
                        "rounded-[0.4rem] px-2 py-1 text-xs transition-colors",
                        value === option ? "bg-accent text-primary-foreground" : "text-foreground hover:bg-muted",
                    )}
                >
                    {SHORT[String(option)] ?? format(option)}
                </button>
            ))}
        </div>
    );
}

export function DashboardGrid({ widgets }: { widgets: Record<WidgetId, WidgetDefinition> }) {
    const [layout, setLayout] = useState<WidgetLayout[]>(loadLayout);
    const [editing, setEditing] = useState(false);
    const [dragged, setDragged] = useState<WidgetId | null>(null);

    const apply = (next: WidgetLayout[]) => {
        setLayout(next);
        saveLayout(next);
    };

    const present = layout.filter((entry) => widgets[entry.id].available !== false);
    const visible = present.filter((entry) => !entry.hidden);
    const hidden = present.filter((entry) => entry.hidden);

    function handleDrop(event: DragEvent, targetId: WidgetId) {
        event.preventDefault();
        if (dragged) apply(moveBefore(layout, dragged, targetId));
        setDragged(null);
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
                {editing ? (
                    <>
                        <p className="mr-auto text-sm text-subtle">
                            Arrastra las tarjetas, cambia su tamaño o escóndelas. Se guarda en este navegador.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => apply(DEFAULT_LAYOUT.map((entry) => ({ ...entry })))}>
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            Restablecer
                        </Button>
                        <Button size="sm" onClick={() => setEditing(false)}>
                            Listo
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                        <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                        Personalizar
                    </Button>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-12 lg:grid-flow-row-dense">
                {visible.map((entry, index) => {
                    const definition = widgets[entry.id];
                    return (
                        <div
                            key={entry.id}
                            data-testid="dashboard-widget"
                            data-widget-id={entry.id}
                            data-span={entry.span}
                            data-height={entry.height}
                            draggable={editing}
                            onDragStart={(event) => {
                                setDragged(entry.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", entry.id);
                            }}
                            onDragOver={(event) => {
                                if (editing && dragged) {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                }
                            }}
                            onDrop={(event) => handleDrop(event, entry.id)}
                            onDragEnd={() => setDragged(null)}
                            className={cn(
                                "flex min-w-0 flex-col gap-2",
                                SPAN_CLASS[entry.span],
                                HEIGHT_CLASS[entry.height],
                                editing && "rounded-card border-2 border-dashed border-accent/40 p-2",
                                dragged === entry.id && "opacity-50",
                            )}
                        >
                            {editing ? (
                                <div
                                    role="group"
                                    aria-label={`Opciones de ${definition.title}`}
                                    className="flex flex-wrap items-center gap-2 rounded-field bg-surface px-2 py-1.5"
                                >
                                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-subtle" aria-hidden="true" />
                                    <span className="mr-auto truncate text-sm font-medium">{definition.title}</span>
                                    <Segmented
                                        label="Ancho"
                                        options={SPANS}
                                        value={entry.span}
                                        format={(span) => SPAN_LABEL[span]}
                                        onChange={(span) => apply(setSpan(layout, entry.id, span))}
                                    />
                                    <Segmented
                                        label="Alto"
                                        options={HEIGHTS}
                                        value={entry.height}
                                        format={(height) => HEIGHT_LABEL[height]}
                                        onChange={(height) => apply(setHeight(layout, entry.id, height))}
                                    />
                                    <button
                                        type="button"
                                        aria-label={`Mover antes ${definition.title}`}
                                        title="Mover antes"
                                        disabled={index === 0}
                                        onClick={() => apply(moveBy(layout, entry.id, -1))}
                                        className="flex h-7 w-7 items-center justify-center rounded-field hover:bg-muted disabled:opacity-40"
                                    >
                                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Mover después ${definition.title}`}
                                        title="Mover después"
                                        disabled={index === visible.length - 1}
                                        onClick={() => apply(moveBy(layout, entry.id, 1))}
                                        className="flex h-7 w-7 items-center justify-center rounded-field hover:bg-muted disabled:opacity-40"
                                    >
                                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Ocultar ${definition.title}`}
                                        title="Ocultar"
                                        onClick={() => apply(setHidden(layout, entry.id, true))}
                                        className="flex h-7 w-7 items-center justify-center rounded-field hover:bg-muted"
                                    >
                                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                            ) : null}
                            <div className="flex-1 [&>*]:h-full">{definition.render(CHART_HEIGHT[entry.height])}</div>
                        </div>
                    );
                })}
            </div>

            {editing && hidden.length > 0 ? (
                <section aria-label="Widgets disponibles" className="flex flex-wrap items-center gap-2 rounded-card border border-dashed border-border p-3">
                    <span className="text-sm text-subtle">Agregar:</span>
                    {hidden.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            aria-label={`Mostrar ${widgets[entry.id].title}`}
                            onClick={() => apply(setHidden(layout, entry.id, false))}
                            className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
                        >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            {widgets[entry.id].title}
                        </button>
                    ))}
                </section>
            ) : null}
        </div>
    );
}
