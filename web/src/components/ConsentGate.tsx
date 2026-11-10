// @requirement RF-03
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { acceptConsent, ApiError } from "../api";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { useToast } from "./ui/Toast";

const SECTIONS: { title: string; body: string }[] = [
    {
        title: "Qué datos se recogen",
        body: "Tu nombre y correo de la cuenta; los datos de tu perfil (fecha de nacimiento, sexo, diagnóstico, talla, peso, documento y contactos); tus lecturas de presión y frecuencia cardíaca con su fecha y origen; los síntomas y el estado de ánimo que registres; y el texto de las consultas que envíes y de las respuestas de tu médico.",
    },
    {
        title: "Para qué se usan",
        body: "Para guardar tu historia clínica, mostrar tu tendencia y tu promedio de siete días, generar alertas que revisa una persona y apoyar la consulta con tu médico. Hoy la plataforma no usa un modelo de IA para analizar tus datos; si lo incorpora, estimará la probabilidad de descontrol tensional y no diagnosticará ni tratará.",
    },
    {
        title: "Quién puede verlos",
        body: "Tú; el médico tratante que tengas asignado; y el cuidador que autorices, solo si le das alcance de lecturas. El personal administrativo no ve tus datos clínicos. La auditoría registra los inicios de sesión, el consentimiento y los cambios en tus datos, pero no cada consulta de lectura.",
    },
    {
        title: "Qué no hace la plataforma",
        body: "No diagnostica ni trata, no formula ni ajusta medicamentos, y ninguna alerta se cierra sin que una persona la revise. Si tienes una urgencia, llama al 123.",
    },
    {
        title: "Cómo revocarlo",
        body: "Puedes revocarlo cuando quieras desde tu perfil. Desde ese momento no se registran lecturas ni síntomas nuevos y tu resumen de siete días deja de calcularse; tu historia anterior se conserva y sigue disponible para ti y para tu médico. Para volver a registrar datos tendrás que aceptar de nuevo.",
    },
];

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
        <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-8">
            <Card className="w-full">
                <CardContent className="flex flex-col gap-5 py-8 text-left">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <ShieldCheck className="h-8 w-8" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col gap-2 text-center">
                        <h1 className="text-2xl font-normal">Consentimiento informado</h1>
                        <p className="text-sm text-subtle" data-testid="consent-version">
                            {version
                                ? `Versión ${version} del documento, la misma que la API registra al aceptar.`
                                : "La API registra la versión vigente del documento al aceptar."}
                        </p>
                    </div>
                    <p className="text-base text-subtle">
                        Para registrar y analizar tus datos de presión arterial necesitamos tu consentimiento
                        informado. Léelo antes de aceptar.
                    </p>
                    {SECTIONS.map((section) => (
                        <section key={section.title} className="flex flex-col gap-1">
                            <h2 className="text-base font-medium">{section.title}</h2>
                            <p className="text-sm leading-relaxed text-subtle">{section.body}</p>
                        </section>
                    ))}
                    <Button onClick={accept} loading={busy}>
                        Acepto el consentimiento
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
