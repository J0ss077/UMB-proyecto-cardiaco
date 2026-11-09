// @requirement none
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type ToastTone = "success" | "error";

interface ToastItem {
    id: number;
    tone: ToastTone;
    message: string;
}

interface ToastApi {
    success: (message: string) => void;
    error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const counter = useRef(0);

    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const push = useCallback(
        (tone: ToastTone, message: string) => {
            counter.current += 1;
            const id = counter.current;
            setToasts((current) => [...current, { id, tone, message }]);
            window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
        },
        [dismiss],
    );

    const api = useMemo<ToastApi>(
        () => ({ success: (m) => push("success", m), error: (m) => push("error", m) }),
        [push],
    );

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div
                className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
                aria-live="polite"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        role={toast.tone === "error" ? "alert" : "status"}
                        className={cn(
                            "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border px-4 py-3 text-sm shadow-lg",
                            toast.tone === "error"
                                ? "border-critical/30 bg-critical-soft text-critical"
                                : "border-normal/30 bg-normal-soft text-normal",
                        )}
                    >
                        {toast.tone === "error" ? (
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        <p className="flex-1">{toast.message}</p>
                        <button type="button" onClick={() => dismiss(toast.id)} aria-label="Cerrar aviso">
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastApi {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used inside ToastProvider");
    return context;
}
