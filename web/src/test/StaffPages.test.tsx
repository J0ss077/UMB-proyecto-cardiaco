// @requirement RF-22
// @requirement RF-01
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaregiverGuide } from "../components/staff/CaregiverGuide";
import { StaffProfile } from "../components/staff/StaffProfile";
import { EMERGENCY_GUIDANCE } from "../lib/emergency";

describe("CaregiverGuide", () => {
    it("explains how to take the pressure, what the categories mean, when to call and what the account can do", () => {
        render(<CaregiverGuide />);

        expect(screen.getByRole("heading", { name: "Cómo acompañar" })).toBeInTheDocument();
        for (const title of [
            "Cómo se toma la presión en casa",
            "Qué significa cada categoría",
            "Cuándo pedir ayuda urgente",
            "Qué puede hacer esta cuenta",
        ]) {
            expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
        }
    });

    it("uses the same emergency guidance as the rest of the application", () => {
        render(<CaregiverGuide />);
        expect(screen.getByText(EMERGENCY_GUIDANCE)).toBeInTheDocument();
    });

    it("states the categories with the same cut-offs the application uses", () => {
        render(<CaregiverGuide />);
        const text = screen.getByRole("heading", { name: "Qué significa cada categoría" }).parentElement!.textContent ?? "";

        expect(text).toMatch(/130\/80/);
        expect(text).toMatch(/140\/90/);
        expect(text).toMatch(/180 de sistólica o 120 de diastólica/);
    });

    it("says what the caregiver cannot do", () => {
        render(<CaregiverGuide />);
        expect(screen.getByText(/no registras tomas, no respondes consultas y no cierras alertas/i)).toBeInTheDocument();
    });

    it("offers the emergency numbers as call links", () => {
        render(<CaregiverGuide />);
        expect(screen.getByRole("link", { name: /llamar al 123/i })).toHaveAttribute("href", "tel:123");
        expect(screen.getByRole("link", { name: /llamar al 911/i })).toHaveAttribute("href", "tel:911");
    });
});

describe("StaffProfile", () => {
    it.each([
        ["physician", "Médico", /ves a tus pacientes/i],
        ["caregiver", "Cuidador", /no las cierras y no respondes consultas/i],
        ["admin", "Administrador", /no abre lecturas, síntomas ni alertas clínicas/i],
    ] as const)("describes the %s role and what it may do", (role, label, copy) => {
        render(<StaffProfile role={role} />);

        expect(screen.getByRole("heading", { name: "Perfil" })).toBeInTheDocument();
        expect(screen.getByText(label)).toBeInTheDocument();
        expect(screen.getByText(copy)).toBeInTheDocument();
    });

    it("says the name and phone are not shown yet instead of inventing them", () => {
        render(<StaffProfile role="physician" />);
        const section = within(screen.getByRole("heading", { name: "Perfil" }).closest("section")!);
        expect(section.getByText(/cuando exista una ruta de perfil para este rol/i)).toBeInTheDocument();
    });
});
