// @requirement RF-01
import { ROLE_LABEL } from "../../lib/staff";
import type { Role } from "../../types";
import { Card, CardContent } from "../ui/Card";

const COPY: Record<Exclude<Role, "patient">, string> = {
    physician: "Ves a tus pacientes, sus lecturas y sus consultas. Las alertas solo se cierran cuando tú acusas recibo, las validas o las descartas.",
    caregiver: "Acompañas a quienes te autorizaron. Con alcance de lecturas ves sus cifras y sus alertas. No las cierras y no respondes consultas.",
    admin: "Gestionas cuentas, vínculos, destinatarios de alerta y el rastro. Esta sesión no abre lecturas, síntomas ni alertas clínicas.",
};

export function StaffProfile({ role }: { role: Exclude<Role, "patient"> }) {
    return (
        <section className="flex flex-col gap-4" aria-labelledby="staff-profile-heading">
            <h2 id="staff-profile-heading" className="text-2xl font-medium">
                Perfil
            </h2>
            <Card>
                <CardContent className="flex flex-col gap-2">
                    <p className="text-sm text-subtle">Rol</p>
                    <p className="text-xl font-medium">{ROLE_LABEL[role]}</p>
                    <p className="max-w-2xl text-base leading-relaxed">{COPY[role]}</p>
                    <p className="text-sm text-subtle">El nombre y el teléfono de esta cuenta se muestran cuando exista una ruta de perfil para este rol.</p>
                </CardContent>
            </Card>
        </section>
    );
}
