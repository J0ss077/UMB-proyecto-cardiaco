// @requirement none
import type { CaregiverScope } from "../types";

export const CAREGIVER_SCOPE_LABEL: Record<CaregiverScope, string> = {
    readings: "Lecturas",
    minimal: "Mínimo",
};

export const CAREGIVER_SCOPE_OPTIONS: { value: CaregiverScope; label: string }[] = [
    { value: "readings", label: CAREGIVER_SCOPE_LABEL.readings },
    { value: "minimal", label: CAREGIVER_SCOPE_LABEL.minimal },
];
