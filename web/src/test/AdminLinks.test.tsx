// @requirement RF-02
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { AdminLinks } from "../components/staff/AdminLinks";
import type { Account, LinkDirectory } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listAccounts: vi.fn(),
    listLinks: vi.fn(),
    assignPhysician: vi.fn(),
    removePhysician: vi.fn(),
    authorizeCaregiver: vi.fn(),
    updateCaregiverScope: vi.fn(),
    revokeCaregiver: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const account = (id: string, role: Account["role"], overrides: Partial<Account> = {}): Account => ({
    id,
    email: `${id}@hta.demo`,
    full_name: `Nombre ${id}`,
    role,
    active: true,
    consent: null,
    active_sessions: 0,
    ...overrides,
});

const accounts: Account[] = [
    account("pat1", "patient", { full_name: "Ana Torres" }),
    account("pat2", "patient", { full_name: "Carlos Pérez" }),
    account("pat-old", "patient", { full_name: "Paciente retirado", active: false }),
    account("med1", "physician", { full_name: "Dr. Morales" }),
    account("cui1", "caregiver", { full_name: "Marta Cuidadora" }),
    account("adm", "admin", { full_name: "Administración" }),
];

const directory: LinkDirectory = {
    physicians: [{ patient_user_id: "pat1", patient_name: "Ana Torres", physician_user_id: "med1", physician_name: "Dr. Morales", assigned_at: "2026-11-01T10:00:00Z" }],
    caregivers: [
        {
            id: "link1",
            patient_user_id: "pat2",
            patient_name: "Carlos Pérez",
            caregiver_user_id: "cui1",
            caregiver_name: "Marta Cuidadora",
            authorized_scope: "readings",
            created_at: "2026-11-02T10:00:00Z",
        },
    ],
};

const mount = () => renderWithToasts(<AdminLinks />);
const loaded = () => screen.findByRole("heading", { name: "Vínculos" });
const pick = (name: RegExp, value: string) => userEvent.selectOptions(screen.getByRole("combobox", { name }), value);

describe("AdminLinks", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listAccounts.mockResolvedValue({ items: accounts, total: accounts.length });
        mocks.listLinks.mockResolvedValue(directory);
        for (const name of ["assignPhysician", "removePhysician", "authorizeCaregiver", "updateCaregiverScope", "revokeCaregiver"] as const) {
            mocks[name].mockResolvedValue(undefined);
        }
    });

    describe("the page", () => {
        it("explains the scopes and that no figures are shown here", async () => {
            mount();
            await loaded();
            expect(screen.getByText(/el alcance de lecturas abre cifras, síntomas y alertas/i)).toBeInTheDocument();
            expect(screen.getByText(/aquí no se ven las cifras/i)).toBeInTheDocument();
        });

        it("lists the assigned physicians and the authorized caregivers", async () => {
            mount();
            await loaded();

            const physicians = within(screen.getByRole("list", { name: /médicos asignados/i }));
            expect(physicians.getByText("Ana Torres")).toBeInTheDocument();
            expect(physicians.getByText(/dr\. morales/i)).toBeInTheDocument();
            const caregivers = within(screen.getByRole("list", { name: /cuidadores autorizados/i }));
            expect(caregivers.getByText("Carlos Pérez")).toBeInTheDocument();
            expect(caregivers.getByText(/marta cuidadora/i)).toBeInTheDocument();
            expect(caregivers.getByRole("combobox", { name: /alcance de marta cuidadora/i })).toHaveValue("readings");
        });

        it("says when there are none", async () => {
            mocks.listLinks.mockResolvedValue({ physicians: [], caregivers: [] });
            mount();
            await loaded();
            expect(screen.getByText(/no hay médicos asignados/i)).toBeInTheDocument();
            expect(screen.getByText(/no hay cuidadores autorizados/i)).toBeInTheDocument();
        });

        it("says it is loading and reports a failure", async () => {
            mocks.listLinks.mockRejectedValue(new Error("boom"));
            mount();

            expect(screen.getByText(/cargando vínculos/i)).toBeInTheDocument();
            expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudieron cargar los vínculos/i);
        });

        it("offers only the active accounts of each role in the selectors", async () => {
            mount();
            await loaded();

            const options = (name: RegExp) => within(screen.getByRole("combobox", { name })).getAllByRole("option").map((option) => option.textContent);
            expect(options(/paciente del vínculo/i)).toEqual(["Elige un paciente", "Ana Torres · pat1@hta.demo", "Carlos Pérez · pat2@hta.demo"]);
            expect(options(/médico a asignar/i)).toEqual(["Elige un médico", "Dr. Morales"]);
            expect(options(/cuidador a autorizar/i)).toEqual(["Elige un cuidador", "Marta Cuidadora"]);
        });

        it("reads every page of accounts, not only the first", async () => {
            const many = Array.from({ length: 230 }, (_, index) => account(`m${index}`, "patient", { full_name: `Persona ${index}` }));
            mocks.listAccounts.mockImplementation(({ offset = 0, limit }: { offset?: number; limit: number }) =>
                Promise.resolve({ items: many.slice(offset, offset + limit), total: 230 }),
            );
            mount();
            await loaded();

            expect(within(screen.getByRole("combobox", { name: /paciente del vínculo/i })).getAllByRole("option")).toHaveLength(231);
        });
    });

    describe("assigning a physician", () => {
        it("needs a patient and a physician", async () => {
            mount();
            await loaded();
            const button = screen.getByRole("button", { name: /asignar médico/i });
            expect(button).toBeDisabled();

            await pick(/paciente del vínculo/i, "pat1");
            expect(button).toBeDisabled();
            await pick(/médico a asignar/i, "med1");
            expect(button).toBeEnabled();
        });

        it("assigns, reloads, clears the physician choice and confirms", async () => {
            mount();
            await loaded();
            await pick(/paciente del vínculo/i, "pat2");
            await pick(/médico a asignar/i, "med1");

            await userEvent.click(screen.getByRole("button", { name: /asignar médico/i }));

            await waitFor(() => expect(mocks.assignPhysician).toHaveBeenCalledWith("pat2", "med1"));
            expect(await screen.findByRole("status")).toHaveTextContent(/médico asignado/i);
            expect(mocks.listLinks.mock.calls.length).toBeGreaterThan(1);
            expect(screen.getByRole("combobox", { name: /médico a asignar/i })).toHaveValue("");
        });

        it("shows the server's message when it refuses", async () => {
            mocks.assignPhysician.mockRejectedValue(new ApiError(409, "El paciente ya tiene a ese médico"));
            mount();
            await loaded();
            await pick(/paciente del vínculo/i, "pat1");
            await pick(/médico a asignar/i, "med1");

            await userEvent.click(screen.getByRole("button", { name: /asignar médico/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent("El paciente ya tiene a ese médico");
        });
    });

    describe("authorizing a caregiver", () => {
        it("sends the chosen scope, readings by default", async () => {
            mount();
            await loaded();
            await pick(/paciente del vínculo/i, "pat1");
            await pick(/cuidador a autorizar/i, "cui1");

            await userEvent.click(screen.getByRole("button", { name: /autorizar cuidador/i }));
            await waitFor(() => expect(mocks.authorizeCaregiver).toHaveBeenCalledWith("pat1", "cui1", "readings"));
            expect(await screen.findByRole("status")).toHaveTextContent(/cuidador autorizado/i);
        });

        it("sends the minimal scope when chosen", async () => {
            mount();
            await loaded();
            await pick(/paciente del vínculo/i, "pat1");
            await pick(/cuidador a autorizar/i, "cui1");
            await pick(/alcance del cuidador/i, "minimal");

            await userEvent.click(screen.getByRole("button", { name: /autorizar cuidador/i }));

            await waitFor(() => expect(mocks.authorizeCaregiver).toHaveBeenCalledWith("pat1", "cui1", "minimal"));
        });

        it("needs a patient and a caregiver, and shows the server's message on failure", async () => {
            mocks.authorizeCaregiver.mockRejectedValue(new ApiError(409, "Ese cuidador ya está autorizado"));
            mount();
            await loaded();
            const button = screen.getByRole("button", { name: /autorizar cuidador/i });
            expect(button).toBeDisabled();
            await pick(/paciente del vínculo/i, "pat1");
            await pick(/cuidador a autorizar/i, "cui1");

            await userEvent.click(button);

            expect(await screen.findByRole("alert")).toHaveTextContent("Ese cuidador ya está autorizado");
        });
    });

    describe("changing and removing links", () => {
        it("changes a caregiver's scope at once", async () => {
            mount();
            await loaded();

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /alcance de marta cuidadora/i }), "minimal");

            await waitFor(() => expect(mocks.updateCaregiverScope).toHaveBeenCalledWith("link1", "minimal"));
            expect(await screen.findByRole("status")).toHaveTextContent(/alcance actualizado/i);
        });

        it("shows the server's message when the scope cannot be changed", async () => {
            mocks.updateCaregiverScope.mockRejectedValue(new ApiError(404, "El vínculo no existe"));
            mount();
            await loaded();

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /alcance de marta cuidadora/i }), "minimal");

            expect(await screen.findByRole("alert")).toHaveTextContent("El vínculo no existe");
        });

        it("asks before removing a physician and backs out on Cancel", async () => {
            mount();
            await loaded();
            const list = within(screen.getByRole("list", { name: /médicos asignados/i }));

            await userEvent.click(list.getByRole("button", { name: /^quitar$/i }));
            expect(list.getByText(/dejará de ver las lecturas de ana torres/i)).toBeInTheDocument();
            expect(mocks.removePhysician).not.toHaveBeenCalled();

            await userEvent.click(list.getByRole("button", { name: /^cancelar$/i }));
            expect(list.getByRole("button", { name: /^quitar$/i })).toBeInTheDocument();
            expect(mocks.removePhysician).not.toHaveBeenCalled();
        });

        it("removes the physician after the confirmation", async () => {
            mount();
            await loaded();
            const list = within(screen.getByRole("list", { name: /médicos asignados/i }));

            await userEvent.click(list.getByRole("button", { name: /^quitar$/i }));
            await userEvent.click(list.getByRole("button", { name: /confirmar/i }));

            await waitFor(() => expect(mocks.removePhysician).toHaveBeenCalledWith("pat1", "med1"));
            expect(await screen.findByRole("status")).toHaveTextContent(/asignación quitada/i);
        });

        it("asks before revoking a caregiver and then revokes", async () => {
            mount();
            await loaded();
            const list = within(screen.getByRole("list", { name: /cuidadores autorizados/i }));

            await userEvent.click(list.getByRole("button", { name: /^revocar$/i }));
            expect(list.getByText(/dejará de ver los datos de carlos pérez/i)).toBeInTheDocument();
            expect(mocks.revokeCaregiver).not.toHaveBeenCalled();

            await userEvent.click(list.getByRole("button", { name: /confirmar/i }));
            await waitFor(() => expect(mocks.revokeCaregiver).toHaveBeenCalledWith("link1"));
            expect(await screen.findByRole("status")).toHaveTextContent(/autorización revocada/i);
        });

        it("shows the server's message when removing fails", async () => {
            mocks.removePhysician.mockRejectedValue(new ApiError(404, "La asignación no existe"));
            mount();
            await loaded();
            const list = within(screen.getByRole("list", { name: /médicos asignados/i }));

            await userEvent.click(list.getByRole("button", { name: /^quitar$/i }));
            await userEvent.click(list.getByRole("button", { name: /confirmar/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent("La asignación no existe");
        });
    });
});
