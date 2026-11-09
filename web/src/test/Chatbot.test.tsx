// @requirement RF-20
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatbotPanel, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "../components/ChatbotPanel";

describe("ChatbotPanel", () => {
    it("is blank and disabled until a backend is connected", () => {
        render(<ChatbotPanel />);

        expect(screen.getByRole("heading", { name: "Asistente HipertAI" })).toBeInTheDocument();
        expect(screen.queryAllByTestId("chat-message")).toHaveLength(0);
        expect(screen.getByRole("textbox", { name: /escribe tu pregunta/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /adjuntar archivos/i })).toBeDisabled();
    });

    it("sends the question through the provided handler and shows both messages", async () => {
        const onSend = vi.fn().mockResolvedValue("Respuesta del asistente");
        render(<ChatbotPanel onSend={onSend} />);

        await userEvent.type(screen.getByRole("textbox", { name: /escribe tu pregunta/i }), "hola");
        await userEvent.click(screen.getByRole("button", { name: /enviar/i }));

        await waitFor(() => expect(screen.getAllByTestId("chat-message")).toHaveLength(2));
        expect(onSend).toHaveBeenCalledWith("hola", []);
        expect(screen.getByText("Respuesta del asistente")).toBeInTheDocument();
    });

    it("does not send an empty question", async () => {
        const onSend = vi.fn();
        render(<ChatbotPanel onSend={onSend} />);
        expect(screen.getByRole("button", { name: /enviar/i })).toBeDisabled();
    });

    describe("attachments", () => {
        const file = (name: string, type: string, size = 100) =>
            new File([new Uint8Array(size)], name, { type });
        const fileInput = () => screen.getByTestId("attachment-input") as HTMLInputElement;
        const lab = () => file("analisis.pdf", "application/pdf");

        it("lists the chosen files and lets the user remove one", async () => {
            const user = userEvent.setup();
            render(<ChatbotPanel onSend={vi.fn()} />);

            await user.upload(fileInput(), [lab(), file("foto.png", "image/png")]);

            const list = screen.getByRole("list", { name: /archivos adjuntos/i });
            expect(within(list).getByText("analisis.pdf")).toBeInTheDocument();
            expect(within(list).getByText("foto.png")).toBeInTheDocument();

            await user.click(within(list).getByRole("button", { name: /quitar analisis\.pdf/i }));
            expect(within(list).queryByText("analisis.pdf")).not.toBeInTheDocument();
            expect(within(list).getByText("foto.png")).toBeInTheDocument();
        });

        it("sends the files with the question and shows them in the conversation", async () => {
            const user = userEvent.setup();
            const onSend = vi.fn().mockResolvedValue("Recibido");
            render(<ChatbotPanel onSend={onSend} />);
            const pdf = lab();

            await user.upload(fileInput(), pdf);
            await user.type(screen.getByRole("textbox", { name: /escribe tu pregunta/i }), "revisa esto");
            await user.click(screen.getByRole("button", { name: /enviar/i }));

            await waitFor(() => expect(onSend).toHaveBeenCalledWith("revisa esto", [pdf]));
            const messages = await screen.findAllByTestId("chat-message");
            expect(within(messages[0]!).getByText("analisis.pdf")).toBeInTheDocument();
            expect(screen.queryByRole("list", { name: /archivos adjuntos/i })).not.toBeInTheDocument();
        });

        it("allows sending files without any text", async () => {
            const user = userEvent.setup();
            const onSend = vi.fn().mockResolvedValue("ok");
            render(<ChatbotPanel onSend={onSend} />);

            await user.upload(fileInput(), lab());

            expect(screen.getByRole("button", { name: /enviar/i })).toBeEnabled();
            await user.click(screen.getByRole("button", { name: /enviar/i }));
            await waitFor(() => expect(onSend).toHaveBeenCalledWith("", expect.any(Array)));
        });

        it("rejects a file above the size limit", async () => {
            const user = userEvent.setup();
            render(<ChatbotPanel onSend={vi.fn()} />);

            await user.upload(fileInput(), file("enorme.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1));

            expect(screen.getByRole("alert")).toHaveTextContent(/enorme\.pdf supera/i);
            expect(screen.queryByRole("list", { name: /archivos adjuntos/i })).not.toBeInTheDocument();
        });

        it("rejects an unsupported type", async () => {
            const user = userEvent.setup({ applyAccept: false });
            render(<ChatbotPanel onSend={vi.fn()} />);

            await user.upload(fileInput(), file("programa.exe", "application/x-msdownload"));

            expect(screen.getByRole("alert")).toHaveTextContent(/programa\.exe no es un tipo admitido/i);
        });

        it("keeps at most the allowed number of files", async () => {
            const user = userEvent.setup();
            render(<ChatbotPanel onSend={vi.fn()} />);
            const many = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, index) => file(`f${index}.png`, "image/png"));

            await user.upload(fileInput(), many);

            expect(within(screen.getByRole("list", { name: /archivos adjuntos/i })).getAllByRole("listitem")).toHaveLength(MAX_ATTACHMENTS);
            expect(screen.getByRole("alert")).toHaveTextContent(new RegExp(`${MAX_ATTACHMENTS} archivos`));
        });

        it("accepts files dropped on the panel", () => {
            render(<ChatbotPanel onSend={vi.fn()} />);
            const dropped = lab();

            fireEvent.drop(screen.getByTestId("chat-dropzone"), { dataTransfer: { files: [dropped] } });

            expect(screen.getByText("analisis.pdf")).toBeInTheDocument();
        });

        it("ignores dropped files while the assistant is not connected", () => {
            render(<ChatbotPanel />);

            fireEvent.drop(screen.getByTestId("chat-dropzone"), { dataTransfer: { files: [lab()] } });

            expect(screen.queryByText("analisis.pdf")).not.toBeInTheDocument();
        });
    });

    describe("layout", () => {
        it("takes the whole width of the content area on desktop and stays a narrow column on a phone", () => {
            render(<ChatbotPanel />);

            const panel = screen.getByTestId("chat-dropzone");
            expect(panel.className).toContain("max-w-2xl");
            expect(panel.className).toContain("lg:max-w-none");
            expect(panel.className).toContain("lg:w-full");
        });

        it("lets the messages use more of the wider panel on desktop", () => {
            render(<ChatbotPanel />);
            expect(screen.getByTestId("chat-welcome").firstElementChild?.className).toContain("lg:max-w-[70%]");
        });
    });

    describe("welcome and quick actions", () => {
        it("greets with the suggested questions and the two quick actions, without counting as a message", () => {
            render(<ChatbotPanel />);

            const welcome = screen.getByTestId("chat-welcome");
            expect(within(welcome).getByText(/soy tu asistente de hipertensión/i)).toBeInTheDocument();
            expect(within(welcome).getByText("¿El café afecta mi presión?")).toBeInTheDocument();
            expect(within(welcome).getByRole("button", { name: "Preguntas frecuentes" })).toBeInTheDocument();
            expect(within(welcome).getByRole("button", { name: "Emergencia" })).toBeInTheDocument();
            expect(screen.queryAllByTestId("chat-message")).toHaveLength(0);
        });

        it("shows emergency guidance and call links even without an assistant connected", async () => {
            render(<ChatbotPanel />);

            await userEvent.click(within(screen.getByTestId("chat-welcome")).getByRole("button", { name: "Emergencia" }));

            const message = await screen.findByTestId("chat-message");
            expect(within(message).getByText(/llama ya a emergencias/i)).toBeInTheDocument();
            expect(within(message).getByRole("link", { name: /llamar al 123/i })).toHaveAttribute("href", "tel:123");
            expect(within(message).getByRole("link", { name: /llamar al 911/i })).toHaveAttribute("href", "tel:911");
        });

        it("lists the frequent questions and sends the one the user taps", async () => {
            const onSend = vi.fn().mockResolvedValue("respuesta");
            render(<ChatbotPanel onSend={onSend} />);

            await userEvent.click(within(screen.getByTestId("chat-welcome")).getByRole("button", { name: "Preguntas frecuentes" }));
            const faq = (await screen.findAllByTestId("chat-message"))[0]!;
            await userEvent.click(within(faq).getByRole("button", { name: "¿El café afecta mi presión?" }));

            await waitFor(() => expect(onSend).toHaveBeenCalledWith("¿El café afecta mi presión?", []));
        });

        it("shows the quick actions again under a reply that asks for them", async () => {
            const onSend = vi.fn().mockResolvedValue({ text: "Hola de nuevo", quickActions: true });
            render(<ChatbotPanel onSend={onSend} />);

            await userEvent.type(screen.getByRole("textbox", { name: /escribe tu pregunta/i }), "hola");
            await userEvent.click(screen.getByRole("button", { name: /enviar/i }));

            await screen.findByText("Hola de nuevo");
            expect(screen.getAllByRole("button", { name: "Emergencia" })).toHaveLength(2);
        });
    });

    describe("quick topics", () => {
        it("offers the topics above the input and disables them until an assistant is connected", () => {
            render(<ChatbotPanel />);

            const group = screen.getByRole("group", { name: /¿quieres preguntar sobre/i });
            for (const topic of ["ejercicio", "medicamentos", "dieta"]) {
                expect(within(group).getByRole("button", { name: topic })).toBeDisabled();
            }
        });

        it("sends a question about the tapped topic", async () => {
            const onSend = vi.fn().mockResolvedValue("ok");
            render(<ChatbotPanel onSend={onSend} />);

            await userEvent.click(screen.getByRole("button", { name: "dieta" }));

            await waitFor(() => expect(onSend).toHaveBeenCalledWith("Quiero preguntar sobre dieta", []));
        });
    });
});
