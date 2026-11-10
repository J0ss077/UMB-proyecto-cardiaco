// @requirement RF-03
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { acceptConsent, ApiError, getConsentDocument } from "../api";
import type { ConsentDocument } from "../types";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { useToast } from "./ui/Toast";

// El texto no vive aquí: la compuerta pide el documento a la API y lo muestra
// tal cual. Así lo que el paciente lee es el mismo documento cuya versión y
// referencia se registran al aceptar, y editar la interfaz no cambia lo que
// significa una aceptación ya guardada.
function DocumentBody({ text }: { text: string }) {
    const blocks: ReactNode[] = [];
    let paragraph: string[] = [];
    let items: string[] = [];

    const flushParagraph = () => {
        if (paragraph.length === 0) return;
        blocks.push(
            <p key={`p-${blocks.length}`} className="text-sm leading-relaxed text-subtle">
                {paragraph.join(" ")}
            </p>,
        );
        paragraph = [];
    };
    const flushList = () => {
        if (items.length === 0) return;
        const entries = items;
        items = [];
        blocks.push(
            <ul key={`ul-${blocks.length}`} className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-subtle">
                {entries.map((item, index) => (
                    <li key={index}>{item}</li>
                ))}
            </ul>,
        );
    };

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
            flushParagraph();
            flushList();
            continue;
        }
        if (line.startsWith("- ")) {
            flushParagraph();
            items.push(line.slice(2));
            continue;
        }
        flushList();
        if (line.startsWith("## ")) {
            flushParagraph();
            blocks.push(
                <h3 key={`h3-${blocks.length}`} className="pt-2 text-base font-medium">
                    {line.slice(3)}
                </h3>,
            );
            continue;
        }
        if (line.startsWith("# ")) {
            flushParagraph();
            blocks.push(
                <h2 key={`h2-${blocks.length}`} className="text-lg font-medium">
                    {line.slice(2)}
                </h2>,
            );
            continue;
        }
        paragraph.push(line);
    }
    flushParagraph();
    flushList();

    return (
        <div data-testid="consent-document" className="flex flex-col gap-3">
            {blocks}
        </div>
    );
}

export function ConsentGate({
    version,
    onAccepted,
    onDismiss,
}: {
    version: number | null;
    onAccepted: () => void;
    onDismiss?: () => void;
}) {
    const toast = useToast();
    const [document, setDocument] = useState<ConsentDocument | null>(null);
    const [documentError, setDocumentError] = useState(false);
    const [loadingDocument, setLoadingDocument] = useState(true);
    const [busy, setBusy] = useState(false);

    const loadDocument = useCallback(async () => {
        setLoadingDocument(true);
        setDocumentError(false);
        try {
            setDocument(await getConsentDocument());
        } catch {
            setDocumentError(true);
        } finally {
            setLoadingDocument(false);
        }
    }, []);

    useEffect(() => {
        void loadDocument();
    }, [loadDocument]);

    async function accept() {
        setBusy(true);
        try {
            await acceptConsent();
            onAccepted();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo registrar el consentimiento");
        } finally {
            setBusy(false);
        }
    }

    const shownVersion = version ?? document?.version ?? null;

    return (
        <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-8">
            <Card className="w-full">
                <CardContent className="flex flex-col gap-5 py-8 text-left">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <ShieldCheck className="h-8 w-8" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-2 text-center">
                        <h1 className="text-2xl font-normal">Consentimiento informado</h1>
                        <p className="text-sm text-subtle" data-testid="consent-version">
                            {shownVersion
                                ? `Versión ${shownVersion} del documento, la misma que la API registra al aceptar.`
                                : "La API registra la versión vigente del documento al aceptar."}
                        </p>
                    </div>
                    <p className="text-base text-subtle">
                        Para registrar y analizar tus datos de presión arterial necesitamos tu consentimiento
                        informado. Léelo antes de aceptar.
                    </p>
                    {loadingDocument ? (
                        <p role="status" className="text-sm text-subtle">
                            Cargando el documento...
                        </p>
                    ) : documentError ? (
                        <div role="alert" className="flex flex-col gap-3 rounded-card border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
                            <p>No se pudo cargar el documento de consentimiento. Sin el texto no puedes aceptarlo.</p>
                            <Button variant="outline" onClick={() => void loadDocument()}>
                                Reintentar
                            </Button>
                        </div>
                    ) : document ? (
                        <>
                            <DocumentBody text={document.text} />
                            <p className="text-xs text-subtle">Referencia del documento: {document.content_ref}</p>
                        </>
                    ) : null}
                    <Button onClick={accept} loading={busy} disabled={!document}>
                        Acepto el consentimiento
                    </Button>
                    {onDismiss ? (
                        <div className="flex flex-col gap-2 border-t border-border/70 pt-4">
                            <Button variant="outline" onClick={onDismiss}>
                                Consultar mi historial sin aceptar
                            </Button>
                            <p className="text-xs text-subtle">
                                Puedes leer tu historia sin aceptar. No podrás registrar lecturas ni síntomas, y el
                                resumen de siete días no se calculará.
                            </p>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </main>
    );
}
