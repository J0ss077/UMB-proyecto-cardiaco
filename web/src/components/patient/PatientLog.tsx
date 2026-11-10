// @requirement RF-05
// @requirement RF-21
import type { Symptom } from "../../types";
import { ReadingEntryForm } from "../ReadingEntryForm";
import { SymptomEntryForm } from "../SymptomEntryForm";
import { SymptomHistory } from "../SymptomHistory";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import type { Reading } from "../../types";

interface PatientLogProps {
    symptoms: Symptom[];
    consentActive: boolean;
    onReadingSaved: (reading: Reading) => void;
    onSymptomSaved: () => void;
    onConsentRequired: () => void;
    onReviewConsent: () => void;
}

export function PatientLog({
    symptoms,
    consentActive,
    onReadingSaved,
    onSymptomSaved,
    onConsentRequired,
    onReviewConsent,
}: PatientLogProps) {
    return (
        <div className="flex flex-col gap-4">
            {consentActive ? (
                <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                    <Card>
                        <CardHeader>
                            <CardTitle>Registrar lectura</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ReadingEntryForm onSaved={onReadingSaved} onConsentRequired={onConsentRequired} />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Registrar síntoma</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <SymptomEntryForm onSaved={onSymptomSaved} onConsentRequired={onConsentRequired} />
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Registrar lectura y síntomas</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <p className="text-sm text-subtle">
                            Necesitas consentimiento informado vigente para registrar lecturas o síntomas. Tu historia
                            anterior sigue disponible y puedes consultarla.
                        </p>
                        <Button variant="outline" onClick={onReviewConsent}>
                            Revisar consentimiento
                        </Button>
                    </CardContent>
                </Card>
            )}
            <section aria-labelledby="symptom-history-heading" className="flex flex-col gap-3">
                <h2 id="symptom-history-heading" className="px-1 text-lg font-medium">
                    Historial de síntomas
                </h2>
                <SymptomHistory symptoms={symptoms} />
            </section>
        </div>
    );
}
