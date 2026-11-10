// @requirement RF-14
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { saveSession } from "../auth";

const mocks = vi.hoisted(() => ({
    getConsent: vi.fn(),
    listReadings: vi.fn(),
    getReadingsSummary: vi.fn(),
    listSymptoms: vi.fn(),
    listAlerts: vi.fn(),
    getProfile: vi.fn(),
    listPatientCaregivers: vi.fn(),
    listConsultations: vi.fn(),
    listRecipients: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const crisis = {
    id: "r1",
    patient_id: "p1",
    systolic: 186,
    diastolic: 122,
    heart_rate: 90,
    source: "manual",
    measured_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    validation_status: "valid",
};

const profile = {
    user_id: "u1",
    email: "m@hta.demo",
    full_name: "Manuel Alejandro González",
    birth_date: null,
    sex: null,
    document_number: null,
    phone: null,
    diagnosis_date: null,
    trusted_contact_phone: null,
    trusted_contact_email: null,
};

const setNotification = (permission: NotificationPermission | undefined) => {
    if (permission === undefined) {
        Reflect.deleteProperty(window, "Notification");
        return undefined;
    }
    const ctor = vi.fn();
    Object.assign(ctor, { permission, requestPermission: vi.fn().mockResolvedValue("granted") });
    Object.defineProperty(window, "Notification", { value: ctor, configurable: true, writable: true });
    return ctor as unknown as ReturnType<typeof vi.fn> & { requestPermission: ReturnType<typeof vi.fn> };
};

describe("notifications in the app", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        mocks.getConsent.mockResolvedValue({ active: true, requires_acceptance_of_version: null });
        mocks.listReadings.mockResolvedValue({ items: [crisis], total: 1 });
        mocks.listSymptoms.mockResolvedValue({
            items: [{ id: "s1", patient_id: "p1", free_text: "dolor de cabeza", mood: null, recorded_at: crisis.measured_at }],
            total: 1,
        });
        mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });
        mocks.getReadingsSummary.mockRejectedValue(new Error("none"));
        mocks.getProfile.mockResolvedValue(profile);
        mocks.listPatientCaregivers.mockResolvedValue({ items: [], total: 0 });
        mocks.listConsultations.mockResolvedValue({ items: [], total: 0 });
        // The help screen asks for these; an unmocked call would hit the real API and expire the next test's session.
        mocks.listRecipients.mockResolvedValue({ items: [], total: 0 });
        setNotification(undefined);
    });

    afterEach(() => setNotification(undefined));

    it("shows the bell with the count, the avatar and the gear next to the logout button", async () => {
        render(<App />);

        expect(await screen.findByRole("button", { name: /notificaciones, 1 sin leer/i })).toBeInTheDocument();
        expect(await screen.findByText("MA")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /configuración y perfil/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();
    });

    it("lists the crisis with its symptom and opens the emergency guide", async () => {
        render(<App />);
        await userEvent.click(await screen.findByRole("button", { name: /notificaciones/i }));

        const panel = screen.getByRole("dialog", { name: "Notificaciones" });
        expect(within(panel).getByText("¡Presión peligrosamente alta!")).toBeInTheDocument();
        expect(within(panel).getByText(/186\/122 mmHg detectado. Síntomas: dolor de cabeza. Actúa ahora./)).toBeInTheDocument();

        await userEvent.click(within(panel).getByRole("button", { name: "Guía de emergencia" }));

        const guide = screen.getByRole("dialog", { name: "Guía de emergencia" });
        expect(within(guide).getByText(/llama ya a emergencias/i)).toBeInTheDocument();
        expect(within(guide).getByRole("link", { name: /llamar al 123/i })).toHaveAttribute("href", "tel:123");
    });

    it("includes open critical alerts in the count", async () => {
        mocks.listAlerts.mockResolvedValue({
            items: [{ id: "a1", patient_id: "p1", type: "crisis_hipertensiva", severity: "critical", status: "open", note: "pendiente de revisión médica", created_at: new Date().toISOString(), validated_by: null, validated_at: null }],
            total: 1,
        });
        render(<App />);
        expect(await screen.findByRole("button", { name: /notificaciones, 2 sin leer/i })).toBeInTheDocument();
    });

    it("has nothing to announce when the readings are normal", async () => {
        mocks.listReadings.mockResolvedValue({ items: [{ ...crisis, systolic: 118, diastolic: 76 }], total: 1 });
        render(<App />);
        expect(await screen.findByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
    });

    it("clears the notifications", async () => {
        render(<App />);
        await userEvent.click(await screen.findByRole("button", { name: /notificaciones/i }));
        await userEvent.click(screen.getByRole("button", { name: /borrar todas/i }));

        expect(screen.getByText(/no tienes notificaciones/i)).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
    });

    it("sends a browser notification once when the permission is granted", async () => {
        const ctor = setNotification("granted")!;
        const { unmount } = render(<App />);

        await waitFor(() => expect(ctor).toHaveBeenCalledTimes(1));
        expect(ctor).toHaveBeenCalledWith("¡Presión peligrosamente alta!", expect.objectContaining({ tag: "reading:r1", body: expect.stringContaining("186/122 mmHg") }));
        unmount();

        render(<App />);
        await screen.findByRole("button", { name: /notificaciones/i });
        expect(ctor).toHaveBeenCalledTimes(1);
    });

    it("asks for the permission only when the user taps the button", async () => {
        const ctor = setNotification("default")!;
        render(<App />);
        await userEvent.click(await screen.findByRole("button", { name: /notificaciones/i }));

        expect(ctor).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: /activar avisos del navegador/i }));

        expect(ctor.requestPermission).toHaveBeenCalled();
    });

    it("opens the profile from the avatar and from the gear", async () => {
        render(<App />);

        await userEvent.click(await screen.findByRole("button", { name: /ir al perfil/i }));
        expect(await screen.findByRole("heading", { name: "Manuel Alejandro González" })).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Inicio" }));
        expect(screen.queryByRole("heading", { name: "Manuel Alejandro González" })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: /configuración y perfil/i }));
        expect(await screen.findByRole("heading", { name: "Manuel Alejandro González" })).toBeInTheDocument();
    });

    it("shows the profile photo in the header when there is one", async () => {
        mocks.getProfile.mockResolvedValue({ ...profile, avatar: "data:image/jpeg;base64,AAAA" });
        render(<App />);

        const button = await screen.findByRole("button", { name: /ir al perfil/i });
        await waitFor(() => expect(button.querySelector("img")).toHaveAttribute("src", "data:image/jpeg;base64,AAAA"));
    });

    it("lets the patient go from the emergency guide to asking a doctor for help", async () => {
        render(<App />);
        await userEvent.click(await screen.findByRole("button", { name: /notificaciones/i }));
        await userEvent.click(within(screen.getByRole("dialog", { name: "Notificaciones" })).getByRole("button", { name: "Guía de emergencia" }));

        await userEvent.click(within(screen.getByRole("dialog", { name: "Guía de emergencia" })).getByRole("button", { name: /pedir ayuda médica/i }));

        expect(await screen.findByRole("heading", { name: "Necesito ayuda médica" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Guía de emergencia" })).not.toBeInTheDocument();
    });

    describe("marking as read and unread", () => {
        const critical = {
            id: "a1",
            patient_id: "p1",
            type: "crisis_hipertensiva",
            severity: "critical",
            status: "open",
            note: "pendiente de revisión médica",
            created_at: new Date(Date.now() - 3_600_000).toISOString(),
            validated_by: null,
            validated_at: null,
        };

        beforeEach(() => {
            mocks.listAlerts.mockResolvedValue({ items: [critical], total: 1 });
        });

        const openBell = async (count = "2 sin leer") => {
            await userEvent.click(await screen.findByRole("button", { name: new RegExp(`notificaciones, ${count}`, "i") }));
            return within(screen.getByRole("dialog", { name: "Notificaciones" }));
        };

        it("marks one notification read and then unread again, and the bell follows", async () => {
            render(<App />);
            const panel = await openBell();

            await userEvent.click(panel.getByRole("button", { name: "Marcar como leída: ¡Presión peligrosamente alta!" }));
            expect(screen.getByRole("button", { name: /notificaciones, 1 sin leer/i })).toBeInTheDocument();

            await userEvent.click(panel.getByRole("button", { name: "Marcar como no leída: ¡Presión peligrosamente alta!" }));
            expect(screen.getByRole("button", { name: /notificaciones, 2 sin leer/i })).toBeInTheDocument();
        });

        it("remembers what was read after the page is opened again", async () => {
            const { unmount } = render(<App />);
            const panel = await openBell();
            await userEvent.click(panel.getByRole("button", { name: "Marcar como leída: ¡Presión peligrosamente alta!" }));
            unmount();

            render(<App />);

            expect(await screen.findByRole("button", { name: /notificaciones, 1 sin leer/i })).toBeInTheDocument();
        });

        it("marks everything read and everything unread", async () => {
            render(<App />);
            const panel = await openBell();

            await userEvent.click(panel.getByRole("button", { name: /marcar todas como leídas/i }));
            expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument();

            await userEvent.click(panel.getByRole("button", { name: /marcar todas como no leídas/i }));
            expect(screen.getByRole("button", { name: /notificaciones, 2 sin leer/i })).toBeInTheDocument();
        });

        it("filters the small panel by unread", async () => {
            render(<App />);
            const panel = await openBell();
            await userEvent.click(panel.getByRole("button", { name: "Marcar como leída: ¡Presión peligrosamente alta!" }));

            await userEvent.click(panel.getByRole("tab", { name: /sin leer/i }));

            expect(panel.getAllByRole("listitem")).toHaveLength(1);
            expect(panel.getByText("Alerta crítica pendiente")).toBeInTheDocument();
        });

        it("opens the big window, selects several and clears them for good", async () => {
            const { unmount } = render(<App />);
            const panel = await openBell();
            await userEvent.click(panel.getByRole("button", { name: /ver todas las notificaciones/i }));
            const center = within(screen.getByRole("dialog", { name: "Todas las notificaciones" }));
            expect(center.getByText("2 notificaciones · 2 sin leer")).toBeInTheDocument();

            await userEvent.click(center.getByRole("checkbox", { name: /seleccionar todas las visibles/i }));
            await userEvent.click(center.getByRole("button", { name: "Borrar seleccionadas" }));

            expect(center.getByText(/no tienes notificaciones/i)).toBeInTheDocument();
            unmount();

            render(<App />);
            expect(await screen.findByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
        });

        it("marks a selection read from the big window", async () => {
            render(<App />);
            const panel = await openBell();
            await userEvent.click(panel.getByRole("button", { name: /ver todas las notificaciones/i }));
            const center = within(screen.getByRole("dialog", { name: "Todas las notificaciones" }));

            await userEvent.click(center.getByRole("checkbox", { name: "Seleccionar: Alerta crítica pendiente" }));
            await userEvent.click(center.getByRole("button", { name: "Marcar como leídas" }));

            expect(center.getByText("2 notificaciones · 1 sin leer")).toBeInTheDocument();
            await userEvent.click(center.getByRole("button", { name: /cerrar/i }));
            expect(screen.getByRole("button", { name: /notificaciones, 1 sin leer/i })).toBeInTheDocument();
        });
    });
});
