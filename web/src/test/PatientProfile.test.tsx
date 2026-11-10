// @requirement RF-01
// @requirement RF-03
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { PatientProfile } from "../components/patient/PatientProfile";
import type { PhotoRenderer } from "../lib/photoRenderer";
import type { PatientCaregiver, Profile, ReadingsSummary } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    revokeConsent: vi.fn(),
    listPatientCaregivers: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const profile: Profile = {
    user_id: "u1",
    email: "manuel.gonzalez@gmail.com",
    full_name: "Manuel Alejandro González",
    birth_date: "1958-03-14",
    sex: "masculino",
    document_number: "12.345.678-9",
    phone: "+57 316 8765 432",
    diagnosis_date: "2025-08-15",
    trusted_contact_phone: "+57 300 1112233",
    trusted_contact_email: "familiar@correo.com",
    avatar: null,
};

const summary: ReadingsSummary = {
    window_start: "2026-11-01T00:00:00Z",
    window_end: "2026-11-08T00:00:00Z",
    sufficient: true,
    valid_count: 9,
    days_with_readings: 5,
    mean_systolic: 135,
    mean_diastolic: 85,
};

const photoRenderer: PhotoRenderer = {
    load: vi.fn().mockResolvedValue({ width: 800, height: 600, source: {} }),
    draw: vi.fn(),
    export: vi.fn().mockReturnValue("data:image/jpeg;base64,AAAA"),
};

const mount = (
    overrides: {
        summary?: ReadingsSummary | null;
        onOpenData?: () => void;
        onConsentRevoked?: () => void;
        onProfileChange?: (profile: Profile) => void;
    } = {},
) =>
    renderWithToasts(
        <PatientProfile
            summary={overrides.summary === undefined ? summary : overrides.summary}
            onOpenData={overrides.onOpenData ?? vi.fn()}
            onConsentRevoked={overrides.onConsentRevoked ?? vi.fn()}
            onProfileChange={overrides.onProfileChange}
            photoRenderer={photoRenderer}
        />,
    );

const edit = () => userEvent.click(screen.getByRole("button", { name: /editar perfil/i }));

describe("PatientProfile", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.getProfile.mockResolvedValue(profile);
        mocks.listPatientCaregivers.mockResolvedValue({ items: [], total: 0 });
    });

    it("shows the identity, contact, medical and trusted contact data read-only", async () => {
        mount();

        expect(await screen.findByRole("heading", { name: "Manuel Alejandro González" })).toBeInTheDocument();
        expect(screen.getByText(/\d+ años/)).toBeInTheDocument();
        expect(screen.getByText("Masculino")).toBeInTheDocument();
        expect(screen.getByText("12.345.678-9")).toBeInTheDocument();
        expect(screen.getAllByText("+57 316 8765 432")[0]).toBeInTheDocument();
        expect(screen.getByText("manuel.gonzalez@gmail.com")).toBeInTheDocument();
        expect(screen.getByText(/15 de agosto de 2025/i)).toBeInTheDocument();
        expect(screen.getByText("135/85 mmHg")).toBeInTheDocument();
        expect(screen.getByText("familiar@correo.com")).toBeInTheDocument();
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
    });

    it("shows initials as the avatar", async () => {
        mount();
        expect(await screen.findByText("MA")).toBeInTheDocument();
    });

    it("says when there is no weekly average", async () => {
        mount({ summary: { ...summary, sufficient: false, mean_systolic: null, mean_diastolic: null } });
        expect(await screen.findByText(/datos insuficientes/i)).toBeInTheDocument();
    });

    it("opens the data tab from the chart button", async () => {
        const onOpenData = vi.fn();
        mount({ onOpenData });
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });

        await userEvent.click(screen.getByRole("button", { name: /ver tendencia/i }));

        expect(onOpenData).toHaveBeenCalled();
    });

    it("turns the editable fields into inputs when editing and keeps the rest read-only", async () => {
        mount();
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });

        await edit();

        expect(screen.getByLabelText("Nombre completo")).toHaveValue("Manuel Alejandro González");
        expect(screen.getByLabelText("Teléfono")).toHaveValue("+57 316 8765 432");
        expect(screen.getByLabelText("Teléfono del contacto de confianza")).toHaveValue("+57 300 1112233");
        expect(screen.getByLabelText("Correo del contacto de confianza")).toHaveValue("familiar@correo.com");
        expect(screen.queryByLabelText("Correo electrónico")).not.toBeInTheDocument();
        expect(screen.getByText("12.345.678-9")).toBeInTheDocument();
    });

    it("sends only the changed fields and returns to read-only with the saved values", async () => {
        mocks.updateProfile.mockResolvedValue({ ...profile, phone: "3170000000" });
        mount();
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });
        await edit();

        const phone = screen.getByLabelText("Teléfono");
        await userEvent.clear(phone);
        await userEvent.type(phone, "3170000000");
        await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

        await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ phone: "3170000000" }));
        expect(await screen.findByRole("status")).toHaveTextContent(/perfil actualizado/i);
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.getAllByText("3170000000")[0]).toBeInTheDocument();
    });

    it("keeps save disabled until something changes", async () => {
        mount();
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });
        await edit();

        expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeDisabled();
        await userEvent.type(screen.getByLabelText("Teléfono"), "1");
        expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeEnabled();
    });

    it("refuses a blank name before calling the API", async () => {
        mount();
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });
        await edit();

        await userEvent.clear(screen.getByLabelText("Nombre completo"));
        await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

        expect(mocks.updateProfile).not.toHaveBeenCalled();
        expect(screen.getByText(/el nombre no puede quedar vacío/i)).toBeInTheDocument();
    });

    it("shows the API message when the update is rejected and stays in edit mode", async () => {
        mocks.updateProfile.mockRejectedValue(new ApiError(422, "phone: El teléfono no tiene un formato válido"));
        mount();
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });
        await edit();

        await userEvent.type(screen.getByLabelText("Teléfono"), "x");
        await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

        expect(await screen.findByRole("alert")).toHaveTextContent(/formato válido/i);
        expect(screen.getByLabelText("Teléfono")).toBeInTheDocument();
    });

    it("discards the edits on cancel", async () => {
        mount();
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });
        await edit();
        await userEvent.type(screen.getByLabelText("Teléfono"), "999");

        await userEvent.click(screen.getByRole("button", { name: /cancelar edición/i }));

        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(mocks.updateProfile).not.toHaveBeenCalled();
    });

    it("clears both trusted contact fields when the box is unchecked", async () => {
        mocks.updateProfile.mockResolvedValue({ ...profile, trusted_contact_phone: null, trusted_contact_email: null });
        mount();
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });
        await edit();

        await userEvent.click(screen.getByRole("checkbox", { name: /contacto de confianza/i }));
        await userEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

        await waitFor(() =>
            expect(mocks.updateProfile).toHaveBeenCalledWith({ trusted_contact_phone: null, trusted_contact_email: null }),
        );
    });

    it("starts the trusted contact unchecked when there is none, and reveals its fields when checked", async () => {
        mocks.getProfile.mockResolvedValue({ ...profile, trusted_contact_phone: null, trusted_contact_email: null });
        mount();
        await screen.findByRole("heading", { name: "Manuel Alejandro González" });
        await edit();

        const box = screen.getByRole("checkbox", { name: /contacto de confianza/i });
        expect(box).not.toBeChecked();
        expect(screen.queryByLabelText("Teléfono del contacto de confianza")).not.toBeInTheDocument();

        await userEvent.click(box);
        expect(screen.getByLabelText("Teléfono del contacto de confianza")).toBeInTheDocument();
    });

    it("reports a failure loading the profile", async () => {
        mocks.getProfile.mockRejectedValue(new Error("boom"));
        mount();
        expect(await screen.findByText(/no se pudieron cargar tus datos personales/i)).toBeInTheDocument();
    });

    it("revokes the consent and reports it", async () => {
        mocks.revokeConsent.mockResolvedValue(undefined);
        const onConsentRevoked = vi.fn();
        mount({ onConsentRevoked });

        await userEvent.click(await screen.findByRole("button", { name: /revocar consentimiento/i }));

        await waitFor(() => expect(onConsentRevoked).toHaveBeenCalled());
    });

    describe("profile photo", () => {
        const photo = "data:image/jpeg;base64,/9j/AAAA";
        const jpeg = () => new File(["x"], "yo.jpg", { type: "image/jpeg" });
        const heading = () => screen.findByRole("heading", { name: "Manuel Alejandro González" });
        const openMenu = async () => {
            await heading();
            await userEvent.click(screen.getByRole("button", { name: /cambiar foto/i }));
        };

        it("shows the photo instead of the initials when there is one", async () => {
            mocks.getProfile.mockResolvedValue({ ...profile, avatar: photo });
            mount();
            await heading();

            expect(screen.getByRole("img", { name: "Foto de perfil" })).toHaveAttribute("src", photo);
            expect(screen.queryByText("MA")).not.toBeInTheDocument();
        });

        it("offers to upload a photo, and to remove it only when there is one", async () => {
            mount();
            await openMenu();
            expect(screen.getByRole("menuitem", { name: /subir foto/i })).toBeInTheDocument();
            expect(screen.queryByRole("menuitem", { name: /quitar foto/i })).not.toBeInTheDocument();
        });

        it("opens the editor for a chosen picture and saves the framed result", async () => {
            const updated = { ...profile, avatar: "data:image/jpeg;base64,AAAA" };
            mocks.updateProfile.mockResolvedValue(updated);
            const onProfileChange = vi.fn();
            mount({ onProfileChange });
            await heading();

            await userEvent.upload(screen.getByTestId("avatar-file-input"), jpeg());
            expect(await screen.findByRole("dialog", { name: "Ajustar foto" })).toBeInTheDocument();
            await userEvent.click(await screen.findByRole("button", { name: /aplicar foto/i }));

            await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ avatar: "data:image/jpeg;base64,AAAA" }));
            expect(await screen.findByRole("status")).toHaveTextContent(/foto actualizada/i);
            expect(screen.getByRole("img", { name: "Foto de perfil" })).toHaveAttribute("src", "data:image/jpeg;base64,AAAA");
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            expect(onProfileChange).toHaveBeenCalledWith(updated);
        });

        it("does not save anything when the editor is cancelled", async () => {
            mount();
            await heading();

            await userEvent.upload(screen.getByTestId("avatar-file-input"), jpeg());
            await userEvent.click(await screen.findByRole("button", { name: /cancelar/i }));

            expect(mocks.updateProfile).not.toHaveBeenCalled();
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        it("rejects a file that is not a JPEG, PNG or WebP picture before opening the editor", async () => {
            const user = userEvent.setup({ applyAccept: false });
            mount();
            await heading();

            await user.upload(screen.getByTestId("avatar-file-input"), new File(["x"], "a.gif", { type: "image/gif" }));

            expect(screen.getByRole("alert")).toHaveTextContent(/elige una imagen jpeg, png o webp/i);
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        it("rejects a picture over 10 MB", async () => {
            mount();
            await heading();
            const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "grande.jpg", { type: "image/jpeg" });

            await userEvent.upload(screen.getByTestId("avatar-file-input"), big);

            expect(screen.getByRole("alert")).toHaveTextContent(/pesa más de 10 mb/i);
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        it("removes the photo and goes back to the initials", async () => {
            mocks.getProfile.mockResolvedValue({ ...profile, avatar: photo });
            mocks.updateProfile.mockResolvedValue({ ...profile, avatar: null });
            const onProfileChange = vi.fn();
            mount({ onProfileChange });
            await openMenu();

            await userEvent.click(screen.getByRole("menuitem", { name: /quitar foto/i }));

            await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith({ avatar: null }));
            expect(await screen.findByRole("status")).toHaveTextContent(/foto eliminada/i);
            expect(screen.queryByRole("img", { name: "Foto de perfil" })).not.toBeInTheDocument();
            expect(screen.getByText("MA")).toBeInTheDocument();
            expect(onProfileChange).toHaveBeenCalledWith({ ...profile, avatar: null });
        });

        it("keeps the current photo and reports the API message when saving fails", async () => {
            mocks.getProfile.mockResolvedValue({ ...profile, avatar: photo });
            mocks.updateProfile.mockRejectedValue(new ApiError(422, "avatar: La foto es demasiado grande"));
            mount();
            await heading();

            await userEvent.upload(screen.getByTestId("avatar-file-input"), jpeg());
            await userEvent.click(await screen.findByRole("button", { name: /aplicar foto/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent(/demasiado grande/i);
            expect(screen.getByRole("img", { name: "Foto de perfil" })).toHaveAttribute("src", photo);
        });
    });

    describe("caregiver access", () => {
        const caregiver: PatientCaregiver = {
            id: "link1",
            caregiver_user_id: "cui1",
            caregiver_name: "Marta Lucía Gómez",
            caregiver_email: "cuidador@hta.demo",
            authorized_scope: "readings",
            created_at: "2026-10-31T10:00:00Z",
        };

        it("lists who has access with name, email, scope and authorization date", async () => {
            mocks.listPatientCaregivers.mockResolvedValue({ items: [caregiver], total: 1 });
            mount();
            await screen.findByRole("heading", { name: "Manuel Alejandro González" });

            expect(await screen.findByRole("heading", { name: "Quién tiene acceso a mi historia" })).toBeInTheDocument();
            expect(mocks.listPatientCaregivers).toHaveBeenCalledWith("u1");
            expect(screen.getByText("Marta Lucía Gómez")).toBeInTheDocument();
            expect(screen.getByText("cuidador@hta.demo")).toBeInTheDocument();
            expect(screen.getByText(/alcance: lecturas/i)).toBeInTheDocument();
            expect(screen.getByText(/autorizado el 31 de octubre de 2026/i)).toBeInTheDocument();
        });

        it("says that the treating physician grants and revokes the access and that the patient can ask for a revocation", async () => {
            mount();
            await screen.findByRole("heading", { name: "Manuel Alejandro González" });

            expect(
                await screen.findByText(/tu médico tratante autoriza y revoca este acceso; si quieres que retire a un cuidador, pídeselo/i),
            ).toBeInTheDocument();
        });

        it("offers no control to revoke, change or authorize access", async () => {
            mocks.listPatientCaregivers.mockResolvedValue({ items: [caregiver], total: 1 });
            mount();
            await screen.findByRole("heading", { name: "Quién tiene acceso a mi historia" });
            const access = within(screen.getByRole("region", { name: "Quién tiene acceso a mi historia" }));

            expect(access.queryByRole("button", { name: /revocar/i })).not.toBeInTheDocument();
            expect(access.queryByRole("button", { name: /autorizar/i })).not.toBeInTheDocument();
            expect(access.queryByRole("combobox")).not.toBeInTheDocument();
            expect(access.queryByLabelText(/correo del cuidador/i)).not.toBeInTheDocument();
        });

        it("says when nobody has access yet", async () => {
            mount();
            await screen.findByRole("heading", { name: "Quién tiene acceso a mi historia" });

            expect(await screen.findByText(/todavía no hay cuidadores autorizados para tu historia/i)).toBeInTheDocument();
        });

        it("reports a failure loading the access list", async () => {
            mocks.listPatientCaregivers.mockRejectedValue(new Error("boom"));
            mount();
            await screen.findByRole("heading", { name: "Manuel Alejandro González" });

            expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo cargar quién tiene acceso a tu historia/i);
        });
    });
});
