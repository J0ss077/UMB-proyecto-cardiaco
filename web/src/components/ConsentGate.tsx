// @requirement RF-03
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { acceptConsent, ApiError } from "../api";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { useToast } from "./ui/Toast";

export function ConsentGate({ version, onAccepted }: { version: number | null; onAccepted: () => void }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);

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

    return (
        <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-8">
            <Card className="w-full">
                <CardContent className="flex flex-col gap-5 py-8 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <ShieldCheck className="h-8 w-8" aria-hidden="true" />
                    </div>
                    <h1 className="text-2xl font-normal">Consentimiento informado</h1>
                    <p className="text-base text-subtle">
                        Para registrar y analizar tus datos de presión arterial necesitamos tu consentimiento
                        informado{version ? ` (versión ${version})` : ""}. Puedes revocarlo cuando quieras desde tu
                        perfil; tu historial se conserva.
                    </p>
                    <Button onClick={accept} loading={busy}>
                        Acepto el consentimiento
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
