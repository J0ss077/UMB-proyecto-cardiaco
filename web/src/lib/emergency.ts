// @requirement none
// Emergency guidance shown in the chatbot and in the emergency widget. It is
// static on purpose: it must not depend on any service being available.
export const EMERGENCY_GUIDANCE =
    "Si tienes dolor de pecho, falta de aire, confusión, debilidad en un lado del cuerpo o un dolor de cabeza muy intenso, llama ya a emergencias.";

export const EMERGENCY_NUMBERS = [
    { number: "123", href: "tel:123" },
    { number: "911", href: "tel:911" },
] as const;
