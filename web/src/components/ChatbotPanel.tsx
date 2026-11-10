// @requirement RF-20
import { Bot, FileText, Image as ImageIcon, Paperclip, Phone, Send, TriangleAlert, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { cn } from "../lib/cn";
import { EMERGENCY_GUIDANCE } from "../lib/emergency";
import { Button } from "./ui/Button";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/*,application/pdf,text/plain,text/csv";

function isAllowedType(type: string): boolean {
    return type.startsWith("image/") || type === "application/pdf" || type === "text/plain" || type === "text/csv";
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const SUGGESTED_QUESTIONS = [
    "¿Qué hacer si mi presión está alta?",
    "¿El café afecta mi presión?",
    "Guía de crisis hipertensiva",
] as const;

const TOPICS = ["ejercicio", "medicamentos", "dieta"] as const;

// A reply is plain text, or text plus a flag to show the quick actions under it
// (use it when the assistant greets).
export type ChatReply = string | { text: string; quickActions?: boolean };

interface ChatMessage {
    id: number;
    from: "user" | "assistant";
    text: string;
    attachments: string[];
    kind?: "faq" | "emergency";
    quickActions?: boolean;
}

interface ChatbotPanelProps {
    // Reserved for the model integration (RF-20, still pending). The real app mounts
    // the panel without it, so the panel says plainly that the assistant does not
    // exist yet instead of showing a disabled chat that looks available.
    onSend?: (question: string, attachments: File[]) => Promise<ChatReply>;
}

function QuickActions({ showFaq, onFaq, onEmergency }: { showFaq: boolean; onFaq: () => void; onEmergency: () => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {showFaq ? (
                <button
                    type="button"
                    onClick={onFaq}
                    className="rounded-field border border-border bg-background px-4 py-2 text-sm hover:bg-surface"
                >
                    Preguntas frecuentes
                </button>
            ) : null}
            <button
                type="button"
                onClick={onEmergency}
                className="flex items-center gap-2 rounded-field border border-critical/30 bg-critical-soft px-4 py-2 text-sm text-critical hover:bg-critical-soft/70"
            >
                <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                Emergencia
            </button>
        </div>
    );
}

function FileIcon({ type }: { type: string }) {
    const Icon = type.startsWith("image/") ? ImageIcon : FileText;
    return <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />;
}

export function ChatbotPanel({ onSend }: ChatbotPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [attachments, setAttachments] = useState<File[]>([]);
    const [attachError, setAttachError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [busy, setBusy] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const enabled = onSend !== undefined;
    const canSend = enabled && !busy && (draft.trim().length > 0 || attachments.length > 0);

    function addFiles(incoming: File[]) {
        const problems: string[] = [];
        const accepted: File[] = [];
        for (const file of incoming) {
            if (!isAllowedType(file.type)) {
                problems.push(`${file.name} no es un tipo admitido (imágenes, PDF o texto).`);
            } else if (file.size > MAX_ATTACHMENT_BYTES) {
                problems.push(`${file.name} supera el límite de ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`);
            } else {
                accepted.push(file);
            }
        }
        const room = MAX_ATTACHMENTS - attachments.length;
        if (accepted.length > room) {
            problems.push(`Puedes adjuntar hasta ${MAX_ATTACHMENTS} archivos.`);
        }
        setAttachments((current) => [...current, ...accepted.slice(0, Math.max(room, 0))]);
        setAttachError(problems.length > 0 ? problems.join(" ") : null);
    }

    function handlePick(event: ChangeEvent<HTMLInputElement>) {
        addFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        setDragging(false);
        if (!enabled) return;
        addFiles(Array.from(event.dataTransfer?.files ?? []));
    }

    async function ask(question: string, files: File[]) {
        if (!onSend) return;
        setBusy(true);
        setMessages((current) => [
            ...current,
            { id: current.length, from: "user", text: question, attachments: files.map((file) => file.name) },
        ]);
        try {
            const reply = await onSend(question, files);
            const { text, quickActions } = typeof reply === "string" ? { text: reply, quickActions: false } : reply;
            setMessages((current) => [
                ...current,
                { id: current.length, from: "assistant", text, attachments: [], quickActions },
            ]);
        } catch {
            setMessages((current) => [
                ...current,
                { id: current.length, from: "assistant", text: "No pude responder en este momento.", attachments: [] },
            ]);
        } finally {
            setBusy(false);
        }
    }

    function submit(event: FormEvent) {
        event.preventDefault();
        if (!canSend) return;
        const question = draft.trim();
        const files = attachments;
        setDraft("");
        setAttachments([]);
        setAttachError(null);
        void ask(question, files);
    }

    const showFaq = () =>
        setMessages((current) => [
            ...current,
            { id: current.length, from: "assistant", text: "Preguntas frecuentes", attachments: [], kind: "faq" },
        ]);

    const showEmergency = () =>
        setMessages((current) => [
            ...current,
            {
                id: current.length,
                from: "assistant",
                text: EMERGENCY_GUIDANCE,
                attachments: [],
                kind: "emergency",
            },
        ]);

    return (
        <section
            data-testid="chat-dropzone"
            onDragOver={(event) => {
                event.preventDefault();
                if (enabled) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
                "mx-auto flex min-h-[28rem] max-w-2xl flex-col overflow-hidden rounded-card border bg-background transition-colors lg:h-[calc(100vh-9rem)] lg:w-full lg:max-w-none",
                dragging ? "border-accent ring-2 ring-accent/40" : "border-border/70",
            )}
        >
            <header className="flex items-center gap-3 border-b border-border/70 px-5 py-4 lg:px-8 lg:py-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-primary-foreground">
                    <Bot className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                    <h2 className="text-lg font-medium leading-tight">Asistente HipertAI</h2>
                    <p className="text-sm text-subtle">
                        {enabled ? "Pregúntame sobre hipertensión" : "No disponible todavía"}
                    </p>
                </div>
            </header>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 lg:gap-4 lg:px-8 lg:py-6" aria-live="polite">
                {enabled ? null : (
                    <div
                        data-testid="chat-unavailable"
                        role="status"
                        className="flex flex-col gap-2 rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-base"
                    >
                        <p className="flex items-center gap-2 font-medium text-warning">
                            <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
                            El asistente todavía no está disponible.
                        </p>
                        <p>
                            Cuando exista el modelo, responderá preguntas sobre tu propia historia clínica: tus
                            lecturas, tus síntomas y el tratamiento que tengas registrado.
                        </p>
                        <p>
                            Hoy no responde nada: este espacio no envía preguntas ni devuelve respuestas. Las
                            preguntas de abajo son solo ejemplos de lo que responderá; no puedes enviarlas.
                        </p>
                    </div>
                )}
                <div data-testid="chat-welcome" className="flex flex-col gap-3">
                    <div className="flex max-w-[85%] flex-col gap-2 self-start rounded-card bg-muted px-4 py-3 text-base lg:max-w-[70%] lg:px-5 lg:py-4 lg:text-lg">
                        <p>
                            {enabled
                                ? "Hola, soy tu asistente de hipertensión. Puedes preguntarme:"
                                : "Ejemplos de preguntas que responderá cuando exista el modelo:"}
                        </p>
                        <ul
                            aria-label={enabled ? undefined : "Ejemplos de preguntas"}
                            className="list-inside list-disc text-foreground"
                        >
                            {SUGGESTED_QUESTIONS.map((question) => (
                                <li key={question}>{question}</li>
                            ))}
                        </ul>
                    </div>
                    <QuickActions showFaq={enabled} onFaq={showFaq} onEmergency={showEmergency} />
                </div>
                {dragging ? <p className="m-auto text-sm text-accent">Suelta los archivos para adjuntarlos</p> : null}
                {messages.map((message) => (
                    <div
                        key={message.id}
                        data-testid="chat-message"
                        className={cn(
                            "flex max-w-[85%] flex-col gap-2 rounded-card px-4 py-3 text-base lg:max-w-[70%] lg:px-5 lg:py-4 lg:text-lg",
                            message.from === "user" ? "self-end bg-accent text-primary-foreground" : "self-start bg-muted",
                        )}
                    >
                        {message.attachments.length > 0 ? (
                            <ul className="flex flex-wrap gap-2">
                                {message.attachments.map((name, index) => (
                                    <li key={`${name}-${index}`} className="flex items-center gap-1.5 rounded-full bg-background/20 px-2.5 py-1 text-xs">
                                        <Paperclip className="h-3 w-3" aria-hidden="true" />
                                        {name}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        {message.text ? <p>{message.text}</p> : null}
                        {message.kind === "faq" ? (
                            <>
                                {enabled ? null : (
                                    <p className="text-sm text-subtle">
                                        Ejemplos de preguntas que responderá cuando exista el modelo:
                                    </p>
                                )}
                                <ul className="flex flex-col gap-2">
                                    {SUGGESTED_QUESTIONS.map((question) => (
                                        <li key={question}>
                                            {enabled ? (
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void ask(question, [])}
                                                    className="w-full rounded-field border border-border bg-background px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-60"
                                                >
                                                    {question}
                                                </button>
                                            ) : (
                                                <span className="block rounded-field border border-border/70 bg-background px-3 py-2 text-left text-sm">
                                                    {question}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                        {message.kind === "emergency" ? (
                            <div className="flex flex-wrap gap-2">
                                <a
                                    href="tel:123"
                                    className="flex items-center gap-2 rounded-field bg-critical px-4 py-2 text-sm font-medium text-primary-foreground"
                                >
                                    <Phone className="h-4 w-4" aria-hidden="true" />
                                    Llamar al 123
                                </a>
                                <a
                                    href="tel:911"
                                    className="flex items-center gap-2 rounded-field bg-critical px-4 py-2 text-sm font-medium text-primary-foreground"
                                >
                                    <Phone className="h-4 w-4" aria-hidden="true" />
                                    Llamar al 911
                                </a>
                            </div>
                        ) : null}
                        {message.quickActions ? (
                            <QuickActions showFaq={enabled} onFaq={showFaq} onEmergency={showEmergency} />
                        ) : null}
                    </div>
                ))}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3 border-t border-border/70 p-4 lg:px-8 lg:py-5">
                {attachments.length > 0 ? (
                    <ul aria-label="Archivos adjuntos" className="flex flex-wrap gap-2">
                        {attachments.map((file, index) => (
                            <li
                                key={`${file.name}-${index}`}
                                className="flex max-w-full items-center gap-2 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-sm"
                            >
                                <FileIcon type={file.type} />
                                <span className="truncate">{file.name}</span>
                                <span className="shrink-0 text-xs text-subtle">{formatSize(file.size)}</span>
                                <button
                                    type="button"
                                    aria-label={`Quitar ${file.name}`}
                                    onClick={() => setAttachments((current) => current.filter((_, position) => position !== index))}
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-subtle hover:bg-muted"
                                >
                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}
                {attachError ? (
                    <p role="alert" className="text-sm text-critical">
                        {attachError}
                    </p>
                ) : null}
                {enabled ? (
                    <div role="group" aria-labelledby="chat-topics-label" className="flex flex-wrap items-center gap-2">
                        <span id="chat-topics-label" className="text-sm text-subtle">
                            ¿Quieres preguntar sobre...?
                        </span>
                        {TOPICS.map((topic) => (
                            <button
                                key={topic}
                                type="button"
                                disabled={busy}
                                onClick={() => void ask(`Quiero preguntar sobre ${topic}`, [])}
                                className="rounded-full bg-muted px-3 py-1.5 text-sm transition-colors hover:bg-border/60 disabled:opacity-60"
                            >
                                {topic}
                            </button>
                        ))}
                    </div>
                ) : null}
                <div className="flex items-center gap-3">
                    <input
                        ref={fileInput}
                        data-testid="attachment-input"
                        type="file"
                        multiple
                        accept={ACCEPT}
                        tabIndex={-1}
                        className="hidden"
                        onChange={handlePick}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-12 w-12 shrink-0 rounded-full"
                        aria-label="Adjuntar archivos"
                        disabled={!enabled || busy || attachments.length >= MAX_ATTACHMENTS}
                        onClick={() => fileInput.current?.click()}
                    >
                        <Paperclip className="h-5 w-5" aria-hidden="true" />
                    </Button>
                    <input
                        aria-label="Escribe tu pregunta"
                        placeholder={enabled ? "Escribe tu pregunta" : "El asistente no está disponible"}
                        value={draft}
                        disabled={!enabled || busy}
                        onChange={(event) => setDraft(event.target.value)}
                        className="h-12 min-w-0 flex-1 rounded-full bg-muted px-5 text-base disabled:opacity-60"
                    />
                    <Button type="submit" size="icon" className="h-12 w-12 shrink-0 rounded-full" disabled={!canSend} loading={busy} aria-label="Enviar">
                        <Send className="h-5 w-5" aria-hidden="true" />
                    </Button>
                </div>
            </form>
        </section>
    );
}
