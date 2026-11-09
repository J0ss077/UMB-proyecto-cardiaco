// @requirement RF-04
import { ArrowLeft, Bluetooth, ChevronRight, CircleHelp, HeartPulse, MoreVertical, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import {
    forgetAll,
    forgetDevice,
    loadDevices,
    mergePermitted,
    saveDevices,
    setLinked,
    upsertLinked,
    type ChosenDevice,
    type KnownDevice,
} from "../lib/devices";
import { Button } from "./ui/Button";

interface BluetoothLike {
    requestDevice: (options: { filters: { services: string[] }[] }) => Promise<ChosenDevice>;
    getDevices?: () => Promise<ChosenDevice[]>;
}

const bluetooth = (): BluetoothLike | undefined => (navigator as unknown as { bluetooth?: BluetoothLike }).bluetooth;

export function ConnectDeviceScreen({ onBack }: { onBack: () => void }) {
    const [devices, setDevices] = useState<KnownDevice[]>(loadDevices);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const update = (next: KnownDevice[]) => {
        setDevices(next);
        saveDevices(next);
    };

    useEffect(() => {
        let cancelled = false;
        const api = bluetooth();
        if (!api?.getDevices) return;
        api
            .getDevices()
            .then((permitted) => {
                if (!cancelled) setDevices((current) => mergePermitted(current, permitted));
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    async function search() {
        const api = bluetooth();
        if (!api) {
            setError("Tu navegador no admite Bluetooth. Prueba con Chrome o Edge.");
            return;
        }
        setError(null);
        setSearching(true);
        try {
            const chosen = await api.requestDevice({ filters: [{ services: ["blood_pressure"] }] });
            update(upsertLinked(devices, chosen));
        } catch (failure) {
            // Closing the browser's chooser is not an error.
            if (!(failure instanceof Error && failure.name === "NotFoundError")) {
                setError("No se pudo conectar el dispositivo.");
            }
        } finally {
            setSearching(false);
        }
    }

    return (
        <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
            <header className="relative flex items-center justify-between">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Volver"
                    className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
                >
                    <ArrowLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <h2 className="text-xl font-normal">Conectar dispositivo</h2>
                <div className="relative">
                    <button
                        type="button"
                        aria-label="Más opciones"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((open) => !open)}
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
                    >
                        <MoreVertical className="h-6 w-6" aria-hidden="true" />
                    </button>
                    {menuOpen ? (
                        <div role="menu" className="absolute right-0 z-10 mt-1 w-64 rounded-card border border-border bg-background p-1 shadow-lg">
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    update(forgetAll());
                                    setExpanded(null);
                                    setMenuOpen(false);
                                }}
                                className="w-full rounded-field px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                                Olvidar todos los dispositivos
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>

            <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
                    <Bluetooth className="h-10 w-10 text-accent" aria-hidden="true" />
                </div>
                <p className="text-subtle">Busca y conecta dispositivos médicos</p>
            </div>

            <div className="flex flex-col gap-2">
                <Button variant="accent" onClick={search} loading={searching}>
                    {searching ? null : <Search className="h-5 w-5" aria-hidden="true" />}
                    Buscar dispositivos
                </Button>
                {error ? (
                    <p role="alert" className="text-center text-sm text-critical">
                        {error}
                    </p>
                ) : null}
            </div>

            <div className="flex flex-col gap-3">
                <h3 className="text-base text-foreground">Dispositivos disponibles</h3>
                {devices.length === 0 ? (
                    <p className="rounded-card border border-dashed border-border p-5 text-center text-sm text-subtle">
                        Aún no hay dispositivos. Pulsa Buscar dispositivos y elige tu tensiómetro.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-3">
                        {devices.map((device) => (
                            <li key={device.id} className="rounded-card border border-border/70 bg-background">
                                <button
                                    type="button"
                                    aria-expanded={expanded === device.id}
                                    onClick={() => setExpanded(expanded === device.id ? null : device.id)}
                                    className="flex w-full items-center gap-4 p-4 text-left"
                                >
                                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-field bg-muted text-accent">
                                        {device.linked ? (
                                            <HeartPulse className="h-6 w-6" aria-hidden="true" />
                                        ) : (
                                            <CircleHelp className="h-6 w-6" aria-hidden="true" />
                                        )}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-lg leading-tight">{device.name}</span>
                                        <span className="text-sm text-subtle">{device.linked ? "Vinculado" : "Disponible"}</span>
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        className={cn("h-2 w-2 shrink-0 rounded-full", device.linked ? "bg-accent" : "bg-primary/50")}
                                    />
                                    <ChevronRight
                                        aria-hidden="true"
                                        className={cn("h-5 w-5 shrink-0 text-subtle transition-transform", expanded === device.id && "rotate-90")}
                                    />
                                </button>
                                {expanded === device.id ? (
                                    <div className="flex flex-wrap gap-2 border-t border-border/70 p-3">
                                        {device.linked ? null : (
                                            <Button size="sm" onClick={() => update(setLinked(devices, device.id, true))}>
                                                Vincular
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                update(forgetDevice(devices, device.id));
                                                setExpanded(null);
                                            }}
                                        >
                                            Olvidar dispositivo
                                        </Button>
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
                <p className="text-xs text-subtle">
                    Las lecturas de un dispositivo vinculado todavía no se guardan automáticamente: registra tus
                    mediciones desde la pestaña Registrar.
                </p>
            </div>
        </section>
    );
}
