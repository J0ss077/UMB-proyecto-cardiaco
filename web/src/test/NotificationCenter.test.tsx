// @requirement RF-14
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "../components/NotificationCenter";
import type { AppNotification } from "../lib/notifications";

const NOW = new Date(2026, 10, 9, 15, 0);
const at = (daysAgo: number, hour = 9) => new Date(2026, 10, 9 - daysAgo, hour, 0).toISOString();

const entry = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
    id,
    kind: "reading",
    title: `Presión alta ${id}`,
    body: `Lectura ${id} detectada. Actúa ahora.`,
    at: at(0),
    ...overrides,
});

const list = [
    entry("a", { at: at(0, 10) }),
    entry("b", { at: at(0, 8), kind: "alert", title: "Alerta crítica pendiente", body: "Un médico debe revisar tus lecturas." }),
    entry("c", { at: at(1, 21) }),
    entry("d", { at: at(5, 9) }),
];

const props = (overrides: Partial<React.ComponentProps<typeof NotificationCenter>> = {}) => ({
    notifications: list,
    readIds: ["c"] as string[],
    now: NOW,
    onClose: vi.fn(),
    onSetRead: vi.fn(),
    onDismiss: vi.fn(),
    onEmergency: vi.fn(),
    ...overrides,
});

const mount = (overrides: Partial<React.ComponentProps<typeof NotificationCenter>> = {}) => {
    const p = props(overrides);
    render(<NotificationCenter {...p} />);
    return p;
};
const rows = () => screen.getAllByRole("listitem");
const row = (title: string) => rows().find((node) => within(node).queryByText(title))!;

describe("NotificationCenter", () => {
    describe("the window", () => {
        it("is a large, labelled modal that says how many there are and how many are unread", () => {
            mount();

            const dialog = screen.getByRole("dialog", { name: "Todas las notificaciones" });
            expect(dialog).toHaveAttribute("aria-modal", "true");
            expect(within(dialog).getByText("4 notificaciones · 3 sin leer")).toBeInTheDocument();
        });

        it("closes with the button and with Escape", async () => {
            const { onClose } = mount();

            await userEvent.click(screen.getByRole("button", { name: /cerrar/i }));
            await userEvent.keyboard("{Escape}");

            expect(onClose).toHaveBeenCalledTimes(2);
        });

        it("groups the notifications by day, newest first", () => {
            mount();

            const headings = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
            expect(headings).toEqual(["Hoy", "Ayer", "4 de noviembre"]);
            expect(rows().map((node) => node.getAttribute("data-id"))).toEqual(["a", "b", "c", "d"]);
        });

        it("says there is nothing, with the message it was given", () => {
            mount({ notifications: [], emptyMessage: "Sin avisos clínicos." });
            expect(screen.getByText("Sin avisos clínicos.")).toBeInTheDocument();
        });
    });

    describe("filters", () => {
        it("splits the list into All, Unread and Read with their counts", async () => {
            mount();

            expect(screen.getByRole("tab", { name: /^todas/i })).toHaveTextContent("4");
            expect(screen.getByRole("tab", { name: /^sin leer/i })).toHaveTextContent("3");
            expect(screen.getByRole("tab", { name: /^leídas/i })).toHaveTextContent("1");

            await userEvent.click(screen.getByRole("tab", { name: /^leídas/i }));
            expect(rows()).toHaveLength(1);
            expect(screen.getByText("Presión alta c")).toBeInTheDocument();

            await userEvent.click(screen.getByRole("tab", { name: /^sin leer/i }));
            expect(rows()).toHaveLength(3);
        });

        it("filters by type: readings or alerts", async () => {
            mount();

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /tipo/i }), "alert");
            expect(rows()).toHaveLength(1);
            expect(screen.getByText("Alerta crítica pendiente")).toBeInTheDocument();

            await userEvent.selectOptions(screen.getByRole("combobox", { name: /tipo/i }), "reading");
            expect(rows()).toHaveLength(3);
        });

        it("searches the title and the text, ignoring case and accents", async () => {
            mount();

            await userEvent.type(screen.getByRole("searchbox", { name: /buscar notificaciones/i }), "MÉDICO");

            expect(rows()).toHaveLength(1);
            expect(screen.getByText("Alerta crítica pendiente")).toBeInTheDocument();
        });

        it("combines the filters and says when nothing matches", async () => {
            mount();

            await userEvent.click(screen.getByRole("tab", { name: /^leídas/i }));
            await userEvent.selectOptions(screen.getByRole("combobox", { name: /tipo/i }), "alert");

            expect(screen.getByText(/ninguna notificación coincide/i)).toBeInTheDocument();
            expect(screen.queryAllByRole("listitem")).toHaveLength(0);
        });
    });

    describe("one notification", () => {
        it("marks it unread or read and shows which it is", async () => {
            const { onSetRead } = mount();

            expect(row("Presión alta a")).toHaveAttribute("data-unread", "true");
            expect(row("Presión alta c")).toHaveAttribute("data-unread", "false");

            await userEvent.click(within(row("Presión alta a")).getByRole("button", { name: "Marcar como leída: Presión alta a" }));
            expect(onSetRead).toHaveBeenLastCalledWith(["a"], true);

            await userEvent.click(within(row("Presión alta c")).getByRole("button", { name: "Marcar como no leída: Presión alta c" }));
            expect(onSetRead).toHaveBeenLastCalledWith(["c"], false);
        });

        it("deletes it", async () => {
            const { onDismiss } = mount();
            await userEvent.click(within(row("Presión alta d")).getByRole("button", { name: "Borrar: Presión alta d" }));
            expect(onDismiss).toHaveBeenCalledWith(["d"]);
        });

        it("opens the emergency guide", async () => {
            const { onEmergency } = mount();
            await userEvent.click(within(row("Presión alta a")).getByRole("button", { name: "Guía de emergencia" }));
            expect(onEmergency).toHaveBeenCalled();
        });
    });

    describe("selecting several", () => {
        it("shows how many are selected and offers the actions for the selection", async () => {
            const { onSetRead, onDismiss } = mount();

            await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar: Presión alta a" }));
            await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar: Presión alta d" }));
            expect(screen.getByText("2 seleccionadas")).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Marcar como leídas" }));
            expect(onSetRead).toHaveBeenLastCalledWith(["a", "d"], true);
            expect(screen.queryByText(/seleccionadas/)).not.toBeInTheDocument();

            await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar: Presión alta c" }));
            await userEvent.click(screen.getByRole("button", { name: "Marcar como no leídas" }));
            expect(onSetRead).toHaveBeenLastCalledWith(["c"], false);

            await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar: Alerta crítica pendiente" }));
            await userEvent.click(screen.getByRole("button", { name: "Borrar seleccionadas" }));
            expect(onDismiss).toHaveBeenLastCalledWith(["b"]);
        });

        it("selects every visible notification at once and clears the selection", async () => {
            mount();

            await userEvent.click(screen.getByRole("checkbox", { name: /seleccionar todas las visibles/i }));
            expect(screen.getByText("4 seleccionadas")).toBeInTheDocument();

            await userEvent.click(screen.getByRole("checkbox", { name: /seleccionar todas las visibles/i }));
            expect(screen.queryByText(/seleccionadas/)).not.toBeInTheDocument();
        });

        it("selects only what the filter shows", async () => {
            const { onSetRead } = mount();
            await userEvent.click(screen.getByRole("tab", { name: /^sin leer/i }));

            await userEvent.click(screen.getByRole("checkbox", { name: /seleccionar todas las visibles/i }));
            expect(screen.getByText("3 seleccionadas")).toBeInTheDocument();
            await userEvent.click(screen.getByRole("button", { name: "Marcar como leídas" }));

            expect(onSetRead).toHaveBeenCalledWith(["a", "b", "d"], true);
        });

        it("drops a selection that is no longer visible when the filter changes", async () => {
            mount();
            await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar: Presión alta c" }));
            expect(screen.getByText("1 seleccionada")).toBeInTheDocument();

            await userEvent.click(screen.getByRole("tab", { name: /^sin leer/i }));

            expect(screen.queryByText(/seleccionada/)).not.toBeInTheDocument();
        });
    });

    describe("every notification", () => {
        it("marks all read, all unread and deletes all, whatever the filter shows", async () => {
            const { onSetRead, onDismiss } = mount();
            await userEvent.click(screen.getByRole("tab", { name: /^leídas/i }));

            await userEvent.click(screen.getByRole("button", { name: /marcar todas como leídas/i }));
            expect(onSetRead).toHaveBeenLastCalledWith(["a", "b", "c", "d"], true);

            await userEvent.click(screen.getByRole("button", { name: /marcar todas como no leídas/i }));
            expect(onSetRead).toHaveBeenLastCalledWith(["a", "b", "c", "d"], false);

            await userEvent.click(screen.getByRole("button", { name: /borrar todas/i }));
            expect(onDismiss).toHaveBeenCalledWith(["a", "b", "c", "d"]);
        });

        it("disables the actions that would change nothing", () => {
            const { unmount } = render(<NotificationCenter {...props({ readIds: [] })} />);
            expect(screen.getByRole("button", { name: /marcar todas como no leídas/i })).toBeDisabled();
            unmount();

            render(<NotificationCenter {...props({ readIds: ["a", "b", "c", "d"] })} />);
            expect(screen.getByRole("button", { name: /marcar todas como leídas/i })).toBeDisabled();
        });
    });
});
