// @requirement RF-22
import { EMERGENCY_GUIDANCE, EMERGENCY_NUMBERS } from "../../lib/emergency";
import { Card, CardContent } from "../ui/Card";

const STEPS = [
    { title: "Espalda apoyada", caption: "Sentada, en silencio." },
    { title: "Pies en el suelo", caption: "Sin cruzar las piernas." },
    { title: "Brazo al corazón", caption: "Brazalete del tamaño del brazo." },
    { title: "Dos tomas", caption: "Cinco minutos, y un minuto entre las dos." },
] as const;

const LEVELS = [
    { label: "Normal", hint: "Debajo de 130/80", color: "rgb(var(--status-normal))" },
    { label: "Elevada", hint: "Antes de 140/90", color: "rgb(var(--status-elevated))" },
    { label: "Alta", hint: "Desde 140/90", color: "rgb(var(--status-warning))" },
    { label: "Crisis", hint: "Desde 180 de sistólica o 120 de diastólica", color: "rgb(var(--status-critical))" },
] as const;

function Scene({ step }: { step: number }) {
    const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    return (
        <svg viewBox="0 0 80 64" className="h-16 w-20 text-primary" aria-hidden="true">
            {step === 0 ? (
                <>
                    <path {...common} d="M18 46 V28 H34 V46" />
                    <path {...common} d="M34 34 H52" />
                    <circle {...common} cx="28" cy="18" r="6" />
                    <path {...common} d="M28 24 V38 M22 30 H34 M24 46 L28 38 L34 46" />
                </>
            ) : null}
            {step === 1 ? (
                <>
                    <path {...common} d="M24 16 V34 M18 24 H30 M20 46 L24 34 L30 46" />
                    <circle {...common} cx="24" cy="10" r="5" />
                    <path {...common} d="M14 50 H46 M14 54 H46" />
                </>
            ) : null}
            {step === 2 ? (
                <>
                    <circle {...common} cx="22" cy="14" r="5" />
                    <path {...common} d="M22 19 V36 M16 26 H40 M18 46 L22 36 L28 46" />
                    <rect {...common} x="36" y="22" width="16" height="10" rx="3" />
                    <path {...common} d="M52 27 H62" />
                </>
            ) : null}
            {step === 3 ? (
                <>
                    <circle {...common} cx="24" cy="32" r="12" />
                    <circle {...common} cx="52" cy="32" r="12" />
                    <text x="24" y="37" textAnchor="middle" fontSize="14" fill="currentColor" stroke="none">
                        1
                    </text>
                    <text x="52" y="37" textAnchor="middle" fontSize="14" fill="currentColor" stroke="none">
                        2
                    </text>
                </>
            ) : null}
        </svg>
    );
}

function Sign({ kind }: { kind: "chest" | "air" | "mind" }) {
    const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const };
    return (
        <svg viewBox="0 0 48 48" className="h-10 w-10 text-critical" aria-hidden="true">
            {kind === "chest" ? <path {...common} d="M24 40 C8 28 8 16 16 14 C20 13 23 16 24 18 C25 16 28 13 32 14 C40 16 40 28 24 40 Z" /> : null}
            {kind === "air" ? (
                <>
                    <path {...common} d="M8 18 H28 C36 18 36 28 28 28 H16" />
                    <path {...common} d="M8 30 H24 C32 30 32 40 24 40 H14" />
                </>
            ) : null}
            {kind === "mind" ? (
                <>
                    <circle {...common} cx="24" cy="20" r="10" />
                    <path {...common} d="M24 34 V42 M18 40 H30" />
                </>
            ) : null}
        </svg>
    );
}

export function CaregiverGuide() {
    return (
        <section className="flex flex-col gap-4" aria-labelledby="guide-heading">
            <div className="flex flex-col gap-1">
                <h2 id="guide-heading" className="text-2xl font-medium">
                    Cómo acompañar
                </h2>
                <p className="text-sm text-subtle">Cuatro miradas. Quien decide es el médico.</p>
            </div>

            <Card>
                <CardContent className="flex flex-col gap-4">
                    <h3 className="text-lg font-medium">Cómo se toma la presión en casa</h3>
                    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {STEPS.map((step, index) => (
                            <li key={step.title} className="flex flex-col items-center gap-2 rounded-card bg-surface px-3 py-4 text-center">
                                <Scene step={index} />
                                <p className="text-sm font-medium">{`${index + 1}. ${step.title}`}</p>
                                <p className="text-sm text-subtle">{step.caption}</p>
                            </li>
                        ))}
                    </ol>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="flex flex-col gap-4">
                    <h3 className="text-lg font-medium">Qué significa cada categoría</h3>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="img" aria-label="De normal a crisis">
                        {LEVELS.map((level) => (
                            <div key={level.label} className="overflow-hidden rounded-card border border-border/70">
                                <div className="h-3" style={{ background: level.color }} />
                                <div className="flex flex-col gap-1 p-3">
                                    <p className="font-medium">{level.label}</p>
                                    <p className="text-sm text-subtle">{level.hint}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-subtle">Son cortes de las guías. El médico decide qué hacer.</p>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="flex flex-col gap-4">
                    <h3 className="text-lg font-medium">Cuándo pedir ayuda urgente</h3>
                    <ul className="grid gap-3 sm:grid-cols-3">
                        {(
                            [
                                ["chest", "Pecho"],
                                ["air", "Aire"],
                                ["mind", "Confusión"],
                            ] as const
                        ).map(([kind, label]) => (
                            <li key={kind} className="flex items-center gap-3 rounded-card bg-critical-soft px-3 py-3">
                                <Sign kind={kind} />
                                <p className="font-medium text-critical">{label}</p>
                            </li>
                        ))}
                    </ul>
                    <p>{EMERGENCY_GUIDANCE}</p>
                    <div className="flex flex-wrap gap-3">
                        {EMERGENCY_NUMBERS.map((entry) => (
                            <a
                                key={entry.number}
                                href={entry.href}
                                className="inline-flex h-12 items-center rounded-field bg-critical px-4 font-medium text-primary-foreground"
                            >
                                {`Llamar al ${entry.number}`}
                            </a>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="flex flex-col gap-4">
                    <h3 className="text-lg font-medium">Qué puede hacer esta cuenta</h3>
                    <ul className="grid gap-3 sm:grid-cols-2">
                        <li className="rounded-card border border-border/70 p-4">
                            <p className="text-sm text-subtle">Sí</p>
                            <p className="text-lg font-medium">Ver</p>
                        </li>
                        <li className="rounded-card border border-border/70 p-4">
                            <p className="text-sm text-subtle">No</p>
                            <p className="text-lg font-medium">Registrar, responder o cerrar</p>
                        </li>
                    </ul>
                    <p className="text-sm text-subtle">
                        Con alcance de lecturas ves lo compartido. Con alcance mínimo solo ves que la persona existe. No registras tomas, no respondes consultas y no cierras alertas.
                    </p>
                </CardContent>
            </Card>
        </section>
    );
}
