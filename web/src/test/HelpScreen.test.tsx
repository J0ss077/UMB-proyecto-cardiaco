// @requirement RF-24
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { HelpScreen } from "../components/patient/HelpScreen";
import type { Consultation } from "../types";
import { renderWithToasts } from "./helpers";

const mocks = vi.hoisted(() => ({
    listReadings: vi.fn(),
    listConsultations: vi.fn(),
    createConsultation: vi.fn(),
    listRecipients: vi.fn(),
    getProfile: vi.fn(),
    listSymptoms: vi.fn(),
    getReadingsSummary: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    ...mocks,
}));

const consultation = (id: string, overrides: Partial<Consultation> = {}): Consultation => ({
    id,
    patient_id: "p1",
    patient_name: "Ana",
    physician_id: "d1",
    physician_name: "Dr. Morales",
    message: "Dolor de cabeza",
    response: "Gracias por avisar. Registra tus lecturas de hoy.",
    status: "completed",
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    responded_at: new Date(Date.now() - 2 * 86_400_000 + 3_600_000).toISOString(),
    reason: "dizziness_headache",
    onset: "since_yesterday",
    medications: null,
    urgent: false,
    wants_meet: false,
    contact_phone: null,
    reading: null,
    meet_url: "https://meet.google.com/abc-defg-hij",
    checkup_general: "Estable, sin dolor.",
    checkup_pressure: "150/95 revisada.",
    checkup_symptoms: "Mareo de ayer.",
    checkup_conduct: "Seguir el registro diario.",
    ...overrides,
});

const mount = (props: { onConsentRequired?: () => void } = {}) =>
    renderWithToasts(<HelpScreen onConsentRequired={props.onConsentRequired ?? vi.fn()} />);

const form = async () => {
    await screen.findByRole("textbox", { name: /consulta rápida/i });
};

const fillBasics = async (message = "Tengo mareos desde ayer") => {
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /motivo/i }), "high_pressure");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /desde cuándo/i }), "since_yesterday");
    await userEvent.type(screen.getByRole("textbox", { name: /consulta rápida/i }), message);
};

const review = async () => userEvent.click(screen.getByRole("button", { name: /revisar y enviar/i }));

describe("HelpScreen", () => {
    beforeEach(() => {
        Object.values(mocks).forEach((mock) => {
            mock.mockReset();
        });
        mocks.listReadings.mockResolvedValue({
            items: [{ id: "r1", patient_id: "p1", systolic: 170, diastolic: 110, heart_rate: 90, source: "manual", measured_at: new Date(Date.now() - 5 * 60_000).toISOString(), validation_status: "valid" }],
            total: 1,
        });
        mocks.listConsultations.mockResolvedValue({ items: [], total: 0 });
        mocks.listRecipients.mockResolvedValue({ items: [{ id: "d1", full_name: "Dr. Morales" }], total: 1 });
        mocks.getProfile.mockResolvedValue({ phone: "+57 316 8765 432" });
        mocks.listSymptoms.mockResolvedValue({ items: [], total: 0 });
        mocks.getReadingsSummary.mockResolvedValue({
            window_start: "2026-11-01T00:00:00Z",
            window_end: "2026-11-08T00:00:00Z",
            sufficient: false,
            valid_count: 1,
            days_with_readings: 1,
            mean_systolic: null,
            mean_diastolic: null,
        });
    });

    describe("the page", () => {
        it("says help is on the way and offers the emergency numbers", async () => {
            mount();

            expect(await screen.findByRole("heading", { name: "Necesito ayuda médica" })).toBeInTheDocument();
            expect(screen.getByText("Te ayudaremos a asesorarte en lo que necesites")).toBeInTheDocument();
            const call = screen.getByRole("link", { name: /llamar a emergencias/i });
            expect(call).toHaveAttribute("href", "tel:123");
            expect(call).toHaveTextContent("911 / 123");
            expect(screen.getByRole("link", { name: /llamar al 911/i })).toHaveAttribute("href", "tel:911");
        });

        it("shows the recent health data that goes with the request", async () => {
            mount();
            const card = within(await screen.findByTestId("help-health-data"));

            expect(card.getByText("170/110 mmHg")).toBeInTheDocument();
            expect(card.getByText(/hace 5 min/i)).toBeInTheDocument();
            expect(card.getByText(/se enviarán automáticamente con tu solicitud/i)).toBeInTheDocument();
        });

        it("says so when there is no reading to attach", async () => {
            mocks.listReadings.mockResolvedValue({ items: [], total: 0 });
            mount();
            const card = within(await screen.findByTestId("help-health-data"));

            expect(card.getByText(/sin lecturas registradas/i)).toBeInTheDocument();
            expect(card.getByText(/tu solicitud se enviará sin lectura/i)).toBeInTheDocument();
        });

        it("uses the latest valid reading and ignores an out-of-range one", async () => {
            mocks.listReadings.mockResolvedValue({
                items: [
                    { id: "bad", patient_id: "p1", systolic: 300, diastolic: 200, heart_rate: null, source: "manual", measured_at: new Date().toISOString(), validation_status: "out_of_range" },
                    { id: "ok", patient_id: "p1", systolic: 150, diastolic: 95, heart_rate: null, source: "manual", measured_at: new Date(Date.now() - 3_600_000).toISOString(), validation_status: "valid" },
                ],
                total: 2,
            });
            mount();
            expect(await within(await screen.findByTestId("help-health-data")).findByText("150/95 mmHg")).toBeInTheDocument();
        });
    });

    describe("the form", () => {
        it("asks for the doctor, the reason, since when, the description, the medications and the options", async () => {
            mount();
            await form();

            expect(await screen.findByText(/para: dr\. morales/i)).toBeInTheDocument();
            expect(screen.getByRole("combobox", { name: /motivo/i })).toBeInTheDocument();
            expect(screen.getByRole("combobox", { name: /desde cuándo/i })).toBeInTheDocument();
            expect(screen.getByRole("textbox", { name: /medicamentos/i })).toBeInTheDocument();
            expect(screen.getByRole("combobox", { name: /^atención$/i })).toHaveValue("comments");
            expect(screen.getByRole("checkbox", { name: /compartir mi teléfono/i })).toBeInTheDocument();
        });

        it("lets the patient choose among several doctors", async () => {
            mocks.listRecipients.mockResolvedValue({
                items: [
                    { id: "d1", full_name: "Dr. Morales" },
                    { id: "d2", full_name: "Dra. Pérez" },
                ],
                total: 2,
            });
            mount();
            await form();

            const select = await screen.findByRole("combobox", { name: /enviar a/i });
            expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["Dr. Morales", "Dra. Pérez"]);
            expect(select).toHaveValue("d1");
            await userEvent.selectOptions(select, "d2");
            expect(select).toHaveValue("d2");
        });

        it("shows the doctor's name without a choice when there is only one", async () => {
            mount();
            await form();
            expect(await screen.findByText(/para: dr\. morales/i)).toBeInTheDocument();
            expect(screen.queryByRole("combobox", { name: /enviar a/i })).not.toBeInTheDocument();
        });

        it("explains there is nobody to write to and disables the review", async () => {
            mocks.listRecipients.mockResolvedValue({ items: [], total: 0 });
            mount();
            await form();

            expect(await screen.findByText(/aún no tienes un médico asignado/i)).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /revisar y enviar/i })).toBeDisabled();
        });

        it("counts characters against the 2000 limit", async () => {
            mount();
            const box = await screen.findByRole("textbox", { name: /consulta rápida/i });
            expect(box).toHaveAttribute("maxlength", "2000");
            expect(screen.getByText("0/2000")).toBeInTheDocument();

            await userEvent.type(box, "hola");
            expect(screen.getByText("4/2000")).toBeInTheDocument();
        });

        it("asks for the reason, the onset and the description before the review", async () => {
            mount();
            await form();

            await review();

            expect(mocks.createConsultation).not.toHaveBeenCalled();
            expect(screen.queryByTestId("consultation-review")).not.toBeInTheDocument();
            expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toMatch(/elige el motivo/i);
            expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toMatch(/escribe tu consulta/i);
        });

        it("warns about an emergency for chest pain and keeps the form usable", async () => {
            mount();
            await form();

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /motivo/i }), "chest_pain_or_breathing");

            const warning = screen.getByTestId("emergency-warning");
            expect(within(warning).getByText(/puede ser una emergencia/i)).toBeInTheDocument();
            expect(within(warning).getByRole("link", { name: /llamar al 123/i })).toHaveAttribute("href", "tel:123");
            expect(screen.getByRole("button", { name: /revisar y enviar/i })).toBeEnabled();
        });

        it("only lets the patient share a phone that exists in the profile", async () => {
            mocks.getProfile.mockResolvedValue({ phone: null });
            mount();
            await form();

            expect(await screen.findByRole("checkbox", { name: /compartir mi teléfono/i })).toBeDisabled();
            expect(screen.getByText(/agrega tu teléfono en tu perfil/i)).toBeInTheDocument();
        });
    });

    describe("the review before sending", () => {
        it("summarizes everything that will be sent and asks whether to change anything", async () => {
            mount();
            await form();
            await fillBasics("Tengo mareos desde ayer con presión 150/95");
            await userEvent.type(screen.getByRole("textbox", { name: /medicamentos/i }), "Losartán 50 mg");
            await userEvent.selectOptions(screen.getByRole("combobox", { name: /^atención$/i }), "meet");
            await userEvent.click(await screen.findByRole("checkbox", { name: /compartir mi teléfono/i }));
            await review();

            const summary = within(await screen.findByTestId("consultation-review"));
            expect(summary.getByText("Dr. Morales")).toBeInTheDocument();
            expect(summary.getByText("Presión alta")).toBeInTheDocument();
            expect(summary.getByText("Desde ayer")).toBeInTheDocument();
            expect(summary.getByText("Tengo mareos desde ayer con presión 150/95")).toBeInTheDocument();
            expect(summary.getByText("Losartán 50 mg")).toBeInTheDocument();
            expect(summary.getByTestId("review-attention")).toHaveTextContent("Atención por Meet");
            expect(summary.getByTestId("review-phone")).toHaveTextContent("+57 316 8765 432");
            expect(summary.getByTestId("review-reading")).toHaveTextContent("170/110 mmHg");
            expect(screen.getByText(/¿quieres agregar o modificar algo antes de enviar\?/i)).toBeInTheDocument();
            expect(mocks.createConsultation).not.toHaveBeenCalled();
        });

        it("says what was left out", async () => {
            mount();
            await form();
            await fillBasics();
            await review();

            const summary = within(await screen.findByTestId("consultation-review"));
            expect(summary.getByTestId("review-medications")).toHaveTextContent(/no indicaste/i);
            expect(summary.getByTestId("review-attention")).toHaveTextContent("Atención por comentarios");
            expect(summary.getByTestId("review-phone")).toHaveTextContent(/no se comparte/i);
        });

        it("goes back to the form with everything kept so the patient can add or change something", async () => {
            mount();
            await form();
            await fillBasics("Primer texto");
            await review();

            await userEvent.click(await screen.findByRole("button", { name: /agregar o modificar/i }));

            const box = screen.getByRole("textbox", { name: /consulta rápida/i });
            expect(box).toHaveValue("Primer texto");
            expect(screen.getByRole("combobox", { name: /motivo/i })).toHaveValue("high_pressure");
            await userEvent.type(box, " y ahora también náuseas");
            await review();
            expect(within(await screen.findByTestId("consultation-review")).getByText("Primer texto y ahora también náuseas")).toBeInTheDocument();
        });

        it("sends exactly what the summary showed, then clears the form and reloads the list", async () => {
            mocks.createConsultation.mockResolvedValue(consultation("new", { status: "in_review", response: null }));
            mount();
            await form();
            await fillBasics("  Tengo mareos  ");
            await userEvent.type(screen.getByRole("textbox", { name: /medicamentos/i }), "  Losartán  ");
            await userEvent.selectOptions(screen.getByRole("combobox", { name: /^atención$/i }), "meet");
            await userEvent.click(await screen.findByRole("checkbox", { name: /compartir mi teléfono/i }));
            await review();

            await userEvent.click(await screen.findByRole("button", { name: /enviar al médico/i }));

            await waitFor(() =>
                expect(mocks.createConsultation).toHaveBeenCalledWith({
                    message: "Tengo mareos",
                    reason: "high_pressure",
                    onset: "since_yesterday",
                    medications: "Losartán",
                    wants_meet: true,
                    share_phone: true,
                    physician_id: "d1",
                }),
            );
            expect(await screen.findByRole("status")).toHaveTextContent(/mensaje enviado a dr\. morales/i);
            expect(await screen.findByRole("textbox", { name: /consulta rápida/i })).toHaveValue("");
            expect(screen.queryByTestId("consultation-review")).not.toBeInTheDocument();
            await waitFor(() => expect(mocks.listConsultations).toHaveBeenCalledTimes(2));
        });

        it("sends the chosen doctor", async () => {
            mocks.listRecipients.mockResolvedValue({
                items: [
                    { id: "d1", full_name: "Dr. Morales" },
                    { id: "d2", full_name: "Dra. Pérez" },
                ],
                total: 2,
            });
            mocks.createConsultation.mockResolvedValue(consultation("new"));
            mount();
            await form();
            await userEvent.selectOptions(await screen.findByRole("combobox", { name: /enviar a/i }), "d2");
            await fillBasics();
            await review();
            expect(within(await screen.findByTestId("consultation-review")).getByText("Dra. Pérez")).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: /enviar al médico/i }));

            await waitFor(() => expect(mocks.createConsultation).toHaveBeenCalledWith(expect.objectContaining({ physician_id: "d2" })));
        });

        it("omits the optional fields it was not given", async () => {
            mocks.createConsultation.mockResolvedValue(consultation("new"));
            mount();
            await form();
            await fillBasics("Hola");
            await review();

            await userEvent.click(await screen.findByRole("button", { name: /enviar al médico/i }));

            await waitFor(() =>
                expect(mocks.createConsultation).toHaveBeenCalledWith({
                    message: "Hola",
                    reason: "high_pressure",
                    onset: "since_yesterday",
                    wants_meet: false,
                    share_phone: false,
                    physician_id: "d1",
                }),
            );
        });

        it("hands the patient to the consent step when consent is missing", async () => {
            mocks.createConsultation.mockRejectedValue(new ApiError(403, "No hay consentimiento informado vigente"));
            const onConsentRequired = vi.fn();
            mount({ onConsentRequired });
            await form();
            await fillBasics();
            await review();

            await userEvent.click(await screen.findByRole("button", { name: /enviar al médico/i }));

            await waitFor(() => expect(onConsentRequired).toHaveBeenCalled());
        });

        it("shows the API's explanation and keeps the review open when sending fails", async () => {
            mocks.createConsultation.mockRejectedValue(new ApiError(409, "Agrega tu teléfono en tu perfil para compartirlo"));
            mount();
            await form();
            await fillBasics();
            await review();

            await userEvent.click(await screen.findByRole("button", { name: /enviar al médico/i }));

            expect(await screen.findByRole("alert")).toHaveTextContent(/agrega tu teléfono en tu perfil/i);
            expect(screen.getByTestId("consultation-review")).toBeInTheDocument();
        });
    });

    describe("the history", () => {
        it("lists the latest consultations with the doctor, the reason and the answer or a pending note", async () => {
            mocks.listConsultations.mockResolvedValue({
                items: [
                    consultation("a", { message: "Presión elevada", status: "in_review", response: null, wants_meet: true, reading: { systolic: 150, diastolic: 95, measured_at: new Date().toISOString() } }),
                    consultation("b"),
                    consultation("c", { message: "Mareos", status: "pending", response: null, wants_meet: true }),
                ],
                total: 3,
            });
            mount();

            const list = within(await screen.findByRole("list", { name: /últimas consultas/i }));
            const items = list.getAllByRole("listitem");
            expect(items).toHaveLength(3);
            expect(within(items[0]!).getByText("Presión elevada")).toBeInTheDocument();
            expect(within(items[0]!).getByText(/^en revisión$/i)).toBeInTheDocument();
            expect(within(items[0]!).getByText(/atención por meet/i)).toBeInTheDocument();
            expect(within(items[0]!).getByText(/150\/95 mmHg/)).toBeInTheDocument();
            expect(within(items[1]!).getByText("Dolor de cabeza")).toBeInTheDocument();
            expect(within(items[1]!).getByText(/^completada$/i)).toBeInTheDocument();
            expect(within(items[1]!).getByText(/^atención por comentarios$/i)).toBeInTheDocument();
            expect(within(items[1]!).getByText(/ver la indicación de tu médico/i)).toBeInTheDocument();
            expect(within(items[1]!).getByText(/hace 2 días/i)).toBeInTheDocument();
            expect(within(items[1]!).getByText(/dr\. morales/i)).toBeInTheDocument();
            expect(within(items[1]!).getByText(/mareos o dolor de cabeza/i)).toBeInTheDocument();
            expect(within(items[2]!).getByText("Mareos")).toBeInTheDocument();
            expect(within(items[2]!).getByText(/^pendiente$/i)).toBeInTheDocument();
        });

        it("opens an answered consultation as the doctor's indication", async () => {
            mocks.listConsultations.mockResolvedValue({ items: [consultation("b")], total: 1 });
            mount();

            await userEvent.click(await screen.findByRole("button", { name: /dolor de cabeza/i }));

            const dialog = await screen.findByRole("dialog", { name: /indicación de tu médico/i });
            expect(within(dialog).getByText("Gracias por avisar. Registra tus lecturas de hoy.")).toBeInTheDocument();
            expect(within(dialog).getByText(/qué hacer/i)).toBeInTheDocument();
            expect(within(dialog).getByText(/esta indicación la escribió tu médico/i)).toBeInTheDocument();
            expect(within(dialog).getByRole("button", { name: /descargar chequeo/i })).toBeInTheDocument();
            expect(within(dialog).getByText(/no es tu historial de automonitoreo/i)).toBeInTheDocument();
            expect(within(dialog).getByRole("link", { name: /entrar a meet/i })).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
            expect(within(dialog).queryByRole("button", { name: /programar reunión/i })).not.toBeInTheDocument();
        });

        it("downloads the routine checkup that travels with the answer", async () => {
            const createObjectURL = vi.fn(() => "blob:checkup");
            const clicked: { download?: string }[] = [];
            Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
            const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
                clicked.push({ download: this.download });
            });
            mocks.listConsultations.mockResolvedValue({ items: [consultation("b")], total: 1 });
            mount();

            await userEvent.click(await screen.findByRole("button", { name: /dolor de cabeza/i }));
            await userEvent.click(await screen.findByRole("button", { name: /descargar chequeo/i }));

            await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
            const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
            expect(blob.type).toBe("application/pdf");
            expect(clicked[0]?.download).toMatch(/^chequeo-rutina-\d{4}-\d{2}-\d{2}\.pdf$/);
            expect(mocks.listReadings).not.toHaveBeenCalledWith({ limit: 14 });
            click.mockRestore();
        });

        it("opens a consultation in review and waits for the Meet link", async () => {
            mocks.listConsultations.mockResolvedValue({
                items: [consultation("a", { message: "Presión elevada", status: "in_review", response: null, wants_meet: true, meet_url: null })],
                total: 1,
            });
            mount();

            await userEvent.click(await screen.findByRole("button", { name: /presión elevada/i }));

            const dialog = await screen.findByRole("dialog", { name: /consulta en revisión/i });
            expect(within(dialog).getByText(/está revisando tu consulta/i)).toBeInTheDocument();
            expect(within(dialog).queryByText(/qué hacer/i)).not.toBeInTheDocument();
            expect(within(dialog).getByText(/el enlace de meet llega cuando tu médico lo envíe/i)).toBeInTheDocument();
            expect(within(dialog).queryByRole("link", { name: /entrar a meet/i })).not.toBeInTheDocument();

            await userEvent.click(within(dialog).getByRole("button", { name: /^cerrar$/i }));
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        it("says there are no consultations yet", async () => {
            mount();
            expect(await screen.findByText(/aún no has enviado consultas/i)).toBeInTheDocument();
        });

        it("reports a failure loading the consultations without hiding the form", async () => {
            mocks.listConsultations.mockRejectedValue(new Error("boom"));
            mount();

            expect(await screen.findByText(/no se pudieron cargar tus consultas/i)).toBeInTheDocument();
            expect(screen.getByRole("textbox", { name: /consulta rápida/i })).toBeInTheDocument();
        });
    });
});
