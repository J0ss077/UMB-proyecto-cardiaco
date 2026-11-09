// @requirement RF-19
// @requirement RF-16
import { AlertTriangle, BookOpen, Brain, Plus, RefreshCw } from "lucide-react";
import { classifyReading, riskLevel, type RiskKey } from "../../lib/clinical";
import { formatRelative } from "../../lib/format";
import { DEFAULT_RECOMMENDATION } from "../../lib/recommendation";
import type { Alert, Reading, ReadingsSummary, Symptom } from "../../types";
import { DashboardGrid, type WidgetDefinition } from "../DashboardGrid";
import { buildInsightWidgets } from "./InsightWidgets";
import { PressureRing } from "../PressureRing";
import { ReadingsTrend } from "../ReadingsTrend";
import { CategoryBadge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import type { WidgetId } from "../../lib/dashboardLayout";

interface PatientHomeProps {
    recent: Reading[];
    // Every reading the home loaded (most recent first); defaults to `recent`.
    history?: Reading[];
    symptoms?: Symptom[];
    summary: ReadingsSummary | null;
    openAlert: Alert | null;
    onRegister: () => void;
    onSymptoms: () => void;
    onConnectDevice: () => void;
    onChatbot: () => void;
    recommendation?: { message: string; note?: string };
}

const RISK_DOT: Record<RiskKey, string> = {
    low: "bg-elevated",
    moderate: "bg-primary",
    high: "bg-warning",
    very_high: "bg-critical",
    unknown: "bg-subtle",
};

export function PatientHome({
    recent,
    history = recent,
    symptoms = [],
    summary,
    openAlert,
    onRegister,
    onSymptoms,
    onConnectDevice,
    onChatbot,
    recommendation = DEFAULT_RECOMMENDATION,
}: PatientHomeProps) {
    const latest = recent[0] ?? null;
    const risk = riskLevel(summary, latest);

    const insights = buildInsightWidgets({ history, symptoms, onRegister, onSymptoms, onChatbot, onConnectDevice });

    const widgets: Record<WidgetId, WidgetDefinition> = {
        ...insights,
        latest: {
            title: "Última medición",
            render: () => (
                <Card data-testid="latest-reading">
                    <CardHeader>
                        <CardTitle>Última medición</CardTitle>
                        {latest ? <CategoryBadge category={classifyReading(latest.systolic, latest.diastolic)} /> : null}
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-4">
                        {latest ? (
                            <>
                                <div className="flex w-full justify-around">
                                    <PressureRing label="Sistólica" value={latest.systolic} max={200} />
                                    <PressureRing label="Diastólica" value={latest.diastolic} max={130} />
                                </div>
                                <p className="text-center text-sm">
                                    mmHg
                                    <span className="block text-subtle">{formatRelative(latest.measured_at)}</span>
                                </p>
                            </>
                        ) : (
                            <p className="py-6 text-center text-sm text-subtle">
                                Aún no tienes lecturas. Registra la primera para ver tu tendencia.
                            </p>
                        )}
                        <Button variant="accent" className="w-full" onClick={onConnectDevice}>
                            <RefreshCw className="h-5 w-5" aria-hidden="true" />
                            Conectar dispositivo de nuevo
                        </Button>
                        <div className="flex w-full flex-col gap-3 sm:flex-row">
                            <Button variant="primary" className="flex-1" onClick={onRegister}>
                                <Plus className="h-5 w-5" aria-hidden="true" />
                                Registrar lectura
                            </Button>
                            <Button variant="outline" className="flex-1" onClick={onSymptoms}>
                                <BookOpen className="h-5 w-5" aria-hidden="true" />
                                Diario de síntomas
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        trend: {
            title: "Tendencia reciente",
            render: (chartHeight) => (
                <Card>
                    <CardHeader>
                        <CardTitle>Tendencia reciente</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ReadingsTrend readings={recent} height={chartHeight} />
                    </CardContent>
                </Card>
            ),
        },
        alert: {
            title: "Alerta pendiente",
            available: openAlert !== null,
            render: () => (
                <Card data-testid="open-alert" className="border-critical/30 bg-critical-soft/40">
                    <CardContent className="flex gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-critical" aria-hidden="true" />
                        <div className="flex flex-col gap-1">
                            <p className="font-medium text-critical">Alerta pendiente de revisión</p>
                            <p className="text-sm text-foreground">{openAlert?.note ?? "Un médico debe revisar tus lecturas."}</p>
                            <p className="text-xs text-subtle">Ninguna alerta se cierra sin que un médico la revise.</p>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        summary: {
            title: "Promedio de 7 días",
            render: () => (
                <Card data-testid="home-summary">
                    <CardHeader>
                        <CardTitle>Promedio de 7 días</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {summary?.sufficient ? (
                            <p className="text-3xl font-semibold tabular-nums">
                                <span>{summary.mean_systolic}/{summary.mean_diastolic}</span>{" "}
                                <span className="text-sm font-normal text-subtle">mmHg</span>
                            </p>
                        ) : (
                            <p className="text-sm text-subtle">Datos insuficientes para un promedio.</p>
                        )}
                    </CardContent>
                </Card>
            ),
        },
        recommendation: {
            title: "Recomendación IA",
            render: () => (
                <Card data-testid="ai-recommendation">
                    <CardContent className="flex gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Brain className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <h3 className="text-base font-medium">Recomendación IA</h3>
                            <p className="text-base text-foreground">{recommendation.message}</p>
                            {recommendation.note ? <p className="text-xs text-subtle">{recommendation.note}</p> : null}
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        risk: {
            title: "Nivel de riesgo",
            render: () => (
                <Card data-testid="risk-level">
                    <CardContent className="flex flex-col gap-3">
                        <h3 className="text-base font-medium">Nivel de riesgo</h3>
                        <p className="flex items-center gap-3 text-base">
                            <span aria-hidden="true" className={`h-4 w-4 rounded-full ${RISK_DOT[risk.key]}`} />
                            {risk.label}
                        </p>
                        <p className="text-xs text-subtle">Según tus lecturas recientes y las guías de referencia.</p>
                    </CardContent>
                </Card>
            ),
        },
    };

    return <DashboardGrid widgets={widgets} />;
}
