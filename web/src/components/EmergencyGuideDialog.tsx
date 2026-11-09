// @requirement none
import { Phone, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { EMERGENCY_GUIDANCE, EMERGENCY_NUMBERS } from "../lib/emergency";
import { Button } from "./ui/Button";

export function EmergencyGuideDialog({ onClose, onRequestHelp }: { onClose: () => void; onRequestHelp?: () => void }) {
    const dialog = useRef<HTMLDivElement>(null);

    useEffect(() => {
        dialog.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
            <div
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-label="Guía de emergencia"
                tabIndex={-1}
                className="flex w-full max-w-md flex-col gap-4 rounded-t-[1.25rem] bg-background p-6 shadow-xl sm:rounded-[1.25rem]"
            >
                <h2 className="flex items-center gap-2 text-xl font-medium text-critical">
                    <TriangleAlert className="h-6 w-6" aria-hidden="true" />
                    Guía de emergencia
                </h2>
                <p className="text-base">{EMERGENCY_GUIDANCE}</p>
                <div className="flex flex-wrap gap-2">
                    {EMERGENCY_NUMBERS.map(({ number, href }) => (
                        <a
                            key={number}
                            href={href}
                            className="flex items-center gap-2 rounded-field bg-critical px-4 py-3 text-base font-medium text-primary-foreground"
                        >
                            <Phone className="h-5 w-5" aria-hidden="true" />
                            {`Llamar al ${number}`}
                        </a>
                    ))}
                </div>
                <p className="text-xs text-subtle">Esta guía es informativa y no sustituye la atención médica.</p>
                {onRequestHelp ? (
                    <Button
                        variant="accent"
                        onClick={() => {
                            onClose();
                            onRequestHelp();
                        }}
                    >
                        Pedir ayuda médica
                    </Button>
                ) : null}
                <Button variant="outline" onClick={onClose}>
                    Cerrar
                </Button>
            </div>
        </div>
    );
}
