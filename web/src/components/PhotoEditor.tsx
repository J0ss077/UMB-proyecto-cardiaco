// @requirement none
import { RotateCcw, RotateCw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { EDITOR_SIZE, clampOffset, moveBy, normalizeRotation, type CropParams } from "../lib/photoCrop";
import { canvasRenderer, type LoadedImage, type PhotoRenderer, type ViewParams } from "../lib/photoRenderer";
import { Button } from "./ui/Button";

interface PhotoEditorProps {
    file: File;
    onApply: (dataUrl: string) => void;
    onCancel: () => void;
    renderer?: PhotoRenderer;
}

const KEY_STEP = 8;
const START: ViewParams = { zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 };

export function PhotoEditor({ file, onApply, onCancel, renderer = canvasRenderer }: PhotoEditorProps) {
    const [image, setImage] = useState<LoadedImage | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [exportFailed, setExportFailed] = useState(false);
    const [zoom, setZoom] = useState(START.zoom);
    const [turns, setTurns] = useState(0);
    const [fine, setFine] = useState(0);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const canvas = useRef<HTMLCanvasElement>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; y: number; ratio: number } | null>(null);

    useEffect(() => {
        dialog.current?.focus();
        const onKey = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") onCancel();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onCancel]);

    useEffect(() => {
        let cancelled = false;
        renderer
            .load(file)
            .then((loaded) => {
                if (!cancelled) setImage(loaded);
            })
            .catch(() => {
                if (!cancelled) setLoadFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [file, renderer]);

    const rotation = normalizeRotation(turns * 90 + fine);
    const view: ViewParams = useMemo(
        () => ({ zoom, rotation, offsetX: offset.x, offsetY: offset.y }),
        [zoom, rotation, offset.x, offset.y],
    );
    const crop = (overrides: Partial<ViewParams>): CropParams => ({
        imageWidth: image?.width ?? 1,
        imageHeight: image?.height ?? 1,
        ...view,
        ...overrides,
    });

    useEffect(() => {
        if (image && canvas.current) renderer.draw(canvas.current, image, view);
    }, [image, renderer, view]);

    // A new zoom or tilt can leave the photo too far off center: pull it back.
    function reframe(overrides: Partial<ViewParams>) {
        const next = crop(overrides);
        const kept = clampOffset(next, EDITOR_SIZE);
        setOffset({ x: kept.offsetX, y: kept.offsetY });
    }

    function pan(dx: number, dy: number) {
        const moved = moveBy(crop({}), dx, dy, EDITOR_SIZE);
        setOffset({ x: moved.offsetX, y: moved.offsetY });
    }

    function onKeyDown(event: KeyboardEvent) {
        const steps: Record<string, [number, number]> = {
            ArrowLeft: [-KEY_STEP, 0],
            ArrowRight: [KEY_STEP, 0],
            ArrowUp: [0, -KEY_STEP],
            ArrowDown: [0, KEY_STEP],
        };
        const step = steps[event.key];
        if (!step) return;
        event.preventDefault();
        pan(step[0], step[1]);
    }

    function onPointerDown(event: PointerEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        drag.current = { x: event.clientX, y: event.clientY, ratio: rect.width ? EDITOR_SIZE / rect.width : 1 };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const start = drag.current;
        if (!start) return;
        pan((event.clientX - start.x) * start.ratio, (event.clientY - start.y) * start.ratio);
        drag.current = { ...start, x: event.clientX, y: event.clientY };
    }

    function turn(direction: 1 | -1) {
        const nextTurns = turns + direction;
        setTurns(nextTurns);
        reframe({ rotation: normalizeRotation(nextTurns * 90 + fine) });
    }

    function reset() {
        setZoom(START.zoom);
        setTurns(0);
        setFine(0);
        setOffset({ x: 0, y: 0 });
    }

    function apply() {
        if (!image) return;
        setExportFailed(false);
        try {
            onApply(renderer.export(image, view));
        } catch {
            setExportFailed(true);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
            <div
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-label="Ajustar foto"
                tabIndex={-1}
                className="flex max-h-[95vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[1.25rem] bg-background p-6 shadow-xl sm:rounded-[1.25rem]"
            >
                <h2 className="text-xl font-medium">Ajustar foto</h2>

                {loadFailed ? (
                    <>
                        <p role="alert" className="text-sm text-critical">
                            No se pudo leer la imagen. Prueba con otra foto.
                        </p>
                        <div className="flex justify-end">
                            <Button variant="outline" onClick={onCancel}>
                                Cancelar
                            </Button>
                        </div>
                    </>
                ) : !image ? (
                    <p className="py-10 text-center text-subtle">Cargando imagen...</p>
                ) : (
                    <>
                        <div
                            role="application"
                            aria-label="Mover la foto: arrastra o usa las flechas del teclado"
                            tabIndex={0}
                            onKeyDown={onKeyDown}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={() => {
                                drag.current = null;
                            }}
                            onPointerCancel={() => {
                                drag.current = null;
                            }}
                            className="relative mx-auto aspect-square w-64 max-w-full cursor-grab touch-none overflow-hidden rounded-full border-4 border-primary-soft bg-muted active:cursor-grabbing"
                        >
                            <canvas ref={canvas} width={EDITOR_SIZE} height={EDITOR_SIZE} className="h-full w-full" />
                        </div>
                        <p className="text-center text-xs text-subtle">Así se verá tu foto en el círculo. Arrástrala para encuadrarla.</p>

                        <div className="flex flex-col gap-2">
                            <label htmlFor="photo-zoom" className="text-sm font-medium">
                                Zoom
                            </label>
                            <input
                                id="photo-zoom"
                                type="range"
                                min={1}
                                max={4}
                                step={0.05}
                                value={zoom}
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    setZoom(next);
                                    reframe({ zoom: next });
                                }}
                                className="w-full accent-primary"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label htmlFor="photo-fine" className="text-sm font-medium">
                                Ajuste fino
                            </label>
                            <input
                                id="photo-fine"
                                type="range"
                                min={-45}
                                max={45}
                                step={1}
                                value={fine}
                                onChange={(event) => {
                                    const next = Number(event.target.value);
                                    setFine(next);
                                    reframe({ rotation: normalizeRotation(turns * 90 + next) });
                                }}
                                className="w-full accent-primary"
                            />
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => turn(-1)} aria-label="Girar a la izquierda">
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                Izquierda
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => turn(1)} aria-label="Girar a la derecha">
                                <RotateCw className="h-4 w-4" aria-hidden="true" />
                                Derecha
                            </Button>
                            <Button variant="ghost" size="sm" onClick={reset}>
                                <Undo2 className="h-4 w-4" aria-hidden="true" />
                                Restablecer
                            </Button>
                        </div>

                        {exportFailed ? (
                            <p role="alert" className="text-sm text-critical">
                                No se pudo preparar la foto. Intenta de nuevo.
                            </p>
                        ) : null}

                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={onCancel}>
                                Cancelar
                            </Button>
                            <Button onClick={apply}>Aplicar foto</Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
