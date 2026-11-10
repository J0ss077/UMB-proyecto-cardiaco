// @requirement RF-16
// @requirement RF-19
// @requirement RF-24
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffHome } from "../components/staff/StaffHome";
import type { Alert, Consultation, Reading } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listPatients: vi.fn(),
    listAlerts: vi.fn(),
    listReadings: vi.fn(),
    listConsultations: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const DAY = 86_400_000;

const patient = (id: string, name: string) => ({ user_id: id, full_name: name, birth_date: null });
const reading = (patientId: string, systolic: number, diastolic: number, when: Date): Reading => ({
    id: `r-${patientId}`,
    patient_id: patientId,
    systolic,
    diastolic,
    heart_rate: 70,
    source: "manual",
    measured_at: when.toISOString(),
    validation_status: "valid",
});
const alert = (id: string, patientId: string, severity: Alert["severity"] = "critical"): Alert => ({
    id,
    patient_id: patientId,
    type: "crisis_hipertensiva",
    severity,
    status: "open",
    note: null,
    created_at: new Date().toISOString(),
    validated_by: null,
    validated_at: null,
});
const consultation = (id: string, name: string, wantsMeet = false): Consultation => ({
    id,
    patient_id: `p-${id}`,
    patient_name: name,
    physician_id: "d1",
    physician_name: "Dr. Morales",
    message: "Mensaje",
    response: null,
    status: "in_review",
    created_at: "2026-11-08T14:00:00Z",
    responded_at: null,
    reason: null,
    onset: null,
    medications: null,
    urgent: false,
    wants_meet: wantsMeet,
    contact_phone: null,
    reading: null,
});

const people = [patient("p1", "Ana Torres"), patient("p2", "Carlos Pérez"), patient("p3", "Jorge Salas")];
let latest: Record<string, Reading | null> = {};

describe("StaffHome", () => {
    beforeEach(() => {
        latest = {
            p1: reading("p1", 186, 122, new Date()),
            p2: reading("p2", 118, 76, new Date(Date.now() - 10 * DAY)),
            p3: null,
        };
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listPatients.mockResolvedValue({ items: people, total: 3 });
        mocks.listAlerts.mockImplementation((params: { severity?: string }) => {
            const items = [alert("a1", "p1"), alert("a2", "p1", "high"), alert("a3", "p2", "medium")];
            if (params?.severity === "critical") {
                return Promise.resolve({ items: items.filter((item) => item.severity === "critical"), total: 1 });
            }
            return Promise.resolve({ items, total: items.length });
        });
        mocks.listConsultations.mockImplementation((params: { status?: string }) => {
            if (params?.status === "in_review") {
                return Promise.resolve({ items: [consultation("c1", "Ana Torres", true)], total: 1 });
            }
            if (params?.status === "pending") {
                return Promise.resolve({ items: [{ ...consultation("c2", "Carlos Pérez"), status: "pending" as const }], total: 1 });
            }
            return Promise.resolve({ items: [], total: 0 });
        });
        mocks.listReadings.mockImplementation(({ patient_id }: { patient_id: string }) =>
            Promise.resolve({ items: latest[patient_id] ? [latest[patient_id]] : [], total: latest[patient_id] ? 1 : 0 }),
        );
    });

    describe("for a physician", () => {
        const card = (name: RegExp) => within(screen.getByRole("heading", { name }).closest("div")!.parentElement!);

        it("loads the patients, the open alerts, the pending consultations and each last reading", async () => {
            renderWithToasts(<StaffHome role="physician" />);
            expect(await screen.findByRole("heading", { name: "Por atender" })).toBeInTheDocument();

            expect(mocks.listPatients).toHaveBeenCalledWith({ limit: 200 });
            expect(mocks.listAlerts).toHaveBeenCalledWith({ status: "open", limit: 50 });
            expect(mocks.listConsultations).toHaveBeenCalledWith({ status: "in_review", limit: 20 });
            expect(mocks.listConsultations).toHaveBeenCalledWith({ status: "pending", limit: 20 });
            expect(mocks.listReadings).toHaveBeenCalledWith({ patient_id: "p2", limit: 1 });
        });

        it("lists the open alerts with the patient and the severity", async () => {
            renderWithToasts(<StaffHome role="physician" />);
            await screen.findByRole("heading", { name: "Por atender" });

            const alerts = card(/^alertas abiertas$/i);
            expect(alerts.getAllByText("Ana Torres")).toHaveLength(2);
            expect(alerts.getAllByRole("listitem")).toHaveLength(3);
            expect(alerts.getByText(/· crítica/i)).toBeInTheDocument();
            expect(alerts.getByText(/· media/i)).toBeInTheDocument();
        });

        it("lists the pending consultations, marking the urgent ones", async () => {
            renderWithToasts(<StaffHome role="physician" />);
            await screen.findByRole("heading", { name: "Por atender" });

            const consultations = card(/consultas sin responder/i);
            expect(consultations.getAllByRole("listitem")).toHaveLength(2);
            expect(consultations.getByText(/· en revisión/i)).toBeInTheDocument();
            expect(consultations.getByText(/· pendiente/i)).toBeInTheDocument();
            expect(consultations.getByText(/· atención por meet/i)).toBeInTheDocument();
        });

        it("lists who has no reading in three days, with the last one and its category", async () => {
            renderWithToasts(<StaffHome role="physician" />);
            await screen.findByRole("heading", { name: "Por atender" });

            const stale = card(/sin medición en 3 días/i);
            expect(stale.getAllByRole("listitem")).toHaveLength(2);
            expect(stale.getByText("Carlos Pérez")).toBeInTheDocument();
            expect(stale.getByText(/· normal/i)).toBeInTheDocument();
            expect(stale.getByText("Jorge Salas")).toBeInTheDocument();
            expect(stale.getByText("Sin lecturas")).toBeInTheDocument();
            expect(stale.queryByText("Ana Torres")).not.toBeInTheDocument();
        });

        it("treats a patient whose readings cannot be loaded as having none", async () => {
            mocks.listReadings.mockRejectedValue(new Error("boom"));
            renderWithToasts(<StaffHome role="physician" />);
            await screen.findByRole("heading", { name: "Por atender" });

            expect(card(/sin medición en 3 días/i).getAllByRole("listitem")).toHaveLength(3);
        });

        it("shows only the first five alerts and consultations", async () => {
            mocks.listAlerts.mockResolvedValue({ items: Array.from({ length: 8 }, (_, index) => alert(`a${index}`, "p1")), total: 8 });
            mocks.listConsultations.mockResolvedValue({ items: Array.from({ length: 8 }, (_, index) => consultation(`c${index}`, `Persona ${index}`)), total: 8 });
            renderWithToasts(<StaffHome role="physician" />);
            await screen.findByRole("heading", { name: "Por atender" });

            expect(card(/^alertas abiertas$/i).getAllByRole("listitem")).toHaveLength(5);
            expect(card(/consultas sin responder/i).getAllByRole("listitem")).toHaveLength(5);
        });

        it("summarizes the caseload and ranks who has more open alerts", async () => {
            renderWithToasts(<StaffHome role="physician" />);
            await screen.findByRole("heading", { name: "Por atender" });

            expect(screen.getByTestId("home-patients")).toHaveTextContent("3");
            expect(screen.getByTestId("home-open-alerts")).toHaveTextContent("3");
            expect(screen.getByTestId("home-critical")).toHaveTextContent("1");
            expect(screen.getByTestId("home-consultations")).toHaveTextContent("2");
            expect(screen.getByTestId("home-today")).toHaveTextContent("1");
            expect(screen.getByTestId("home-stale")).toHaveTextContent("2");
            expect(mocks.listAlerts).toHaveBeenCalledWith({ status: "open", severity: "critical", limit: 1 });

            const rank = within(screen.getByRole("list", { name: "Pacientes con más alertas abiertas" }));
            const ranked = rank.getAllByRole("listitem");
            expect(ranked[0]).toHaveTextContent("Ana Torres");
            expect(ranked[0]).toHaveTextContent("2");
            expect(ranked[1]).toHaveTextContent("Carlos Pérez");
            expect(ranked[1]).toHaveTextContent("1");

            const states = within(screen.getByRole("list", { name: "Estado de la última lectura" }));
            expect(states.getByText("Crisis")).toBeInTheDocument();
            expect(states.getByText("Normal")).toBeInTheDocument();
            expect(states.getByText("Sin lectura")).toBeInTheDocument();
        });

        it("says when there is nothing to attend", async () => {
            mocks.listAlerts.mockResolvedValue({ items: [], total: 0 });
            mocks.listConsultations.mockResolvedValue({ items: [], total: 0 });
            latest.p2 = reading("p2", 118, 76, new Date());
            latest.p3 = reading("p3", 118, 76, new Date());
            renderWithToasts(<StaffHome role="physician" />);
            await screen.findByRole("heading", { name: "Por atender" });

            expect(screen.getByText(/no hay alertas abiertas/i)).toBeInTheDocument();
            expect(screen.getByText(/no hay consultas pendientes/i)).toBeInTheDocument();
            expect(screen.getByText(/todos tienen una lectura reciente/i)).toBeInTheDocument();
        });
    });

    describe("for a caregiver", () => {
        it("never asks for consultations and says the physician is the one who closes alerts", async () => {
            renderWithToasts(<StaffHome role="caregiver" />);

            expect(await screen.findByRole("heading", { name: "Personas a tu cargo" })).toBeInTheDocument();
            expect(screen.getByText(/tú no cierras alertas ni respondes consultas/i)).toBeInTheDocument();
            expect(mocks.listConsultations).not.toHaveBeenCalled();
        });

        it("summarizes the people, who has more open alerts and how the last reading sits", async () => {
            renderWithToasts(<StaffHome role="caregiver" />);
            await screen.findByRole("heading", { name: "Personas a tu cargo" });

            expect(screen.getByTestId("home-people")).toHaveTextContent("3");
            expect(screen.getByTestId("home-today")).toHaveTextContent("1");
            expect(screen.getByTestId("home-stale")).toHaveTextContent("2");
            expect(screen.getByTestId("home-open-alerts")).toHaveTextContent("3");

            const rank = within(screen.getByRole("list", { name: "Quién tiene más alertas abiertas" }));
            expect(rank.getAllByRole("listitem")[0]).toHaveTextContent("Ana Torres");
            expect(rank.getAllByRole("listitem")[0]).toHaveTextContent("2");

            const states = within(screen.getByRole("list", { name: "Cómo está la última lectura" }));
            expect(states.getByText("Crisis")).toBeInTheDocument();
            expect(states.getByText("Normal")).toBeInTheDocument();
            expect(states.getByText("Sin lectura")).toBeInTheDocument();
        });

        it("shows a card per person with the last figure, its category and whether there is one today", async () => {
            renderWithToasts(<StaffHome role="caregiver" />);
            await screen.findByRole("heading", { name: "Personas a tu cargo" });

            const ana = within(screen.getByRole("heading", { name: "Ana Torres" }).closest("li")!);
            expect(ana.getByText("186/122")).toBeInTheDocument();
            expect(ana.getByTestId("category-badge")).toHaveTextContent("Crisis");
            expect(ana.getByText(/hay una lectura de hoy/i)).toBeInTheDocument();
            expect(ana.getByText(/2 alertas abiertas. las cierra el médico/i)).toBeInTheDocument();

            const carlos = within(screen.getByRole("heading", { name: "Carlos Pérez" }).closest("li")!);
            expect(carlos.getByText(/hoy no hay lectura/i)).toBeInTheDocument();
            expect(carlos.getByText(/1 alerta abierta. las cierra el médico/i)).toBeInTheDocument();
        });

        it("says when a person has no shared readings and no open alerts", async () => {
            renderWithToasts(<StaffHome role="caregiver" />);
            await screen.findByRole("heading", { name: "Personas a tu cargo" });

            const jorge = within(screen.getByRole("heading", { name: "Jorge Salas" }).closest("li")!);
            expect(jorge.getByText(/sin lecturas compartidas/i)).toBeInTheDocument();
            expect(jorge.getByText(/sin alertas abiertas/i)).toBeInTheDocument();
        });

        it("says no physician authorized the caregiver yet", async () => {
            mocks.listPatients.mockResolvedValue({ items: [], total: 0 });
            renderWithToasts(<StaffHome role="caregiver" />);
            expect(await screen.findByText(/todavía ningún médico te autorizó/i)).toBeInTheDocument();
        });
    });

    it("says it is loading and reports a failure", async () => {
        mocks.listPatients.mockRejectedValue(new Error("boom"));
        renderWithToasts(<StaffHome role="physician" />);

        expect(screen.getByText(/cargando/i)).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cargar el inicio/i);
    });
});
