// @requirement RF-14
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationBell } from "../components/NotificationBell";
import type { AppNotification } from "../lib/notifications";

const item = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
    id,
    kind: "reading",
    title: `Presión alta ${id}`,
    body: "150/100 mmHg detectado. Síntomas: dolor de cabeza. Actúa ahora.",
    at: new Date(2026, 10, 9, 8, 30).toISOString(),
    ...overrides,
});

const props = (overrides: Partial<React.ComponentProps<typeof NotificationBell>> = {}) => ({
    notifications: [item("a"), item("b", { kind: "alert", title: "Alerta crítica pendiente" })],
    readIds: [] as string[],
    unread: 2,
    permission: "granted" as const,
    onSetRead: vi.fn(),
    onDismiss: vi.fn(),
    onEmergency: vi.fn(),
    onRequestPermission: vi.fn(),
    ...overrides,
});

const open = () => userEvent.click(screen.getByRole("button", { name: /notificaciones/i }));
const popover = () => within(screen.getByRole("dialog", { name: "Notificaciones" }));

describe("NotificationBell", () => {
    describe("the bell", () => {
        it("shows the unread count on the bell", () => {
            render(<NotificationBell {...props()} />);
            expect(screen.getByRole("button", { name: /notificaciones, 2 sin leer/i })).toBeInTheDocument();
        });

        it("shows no count when everything is read", () => {
            render(<NotificationBell {...props({ unread: 0 })} />);
            expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
        });

        it("closes the panel with Escape", async () => {
            render(<NotificationBell {...props()} />);
            await open();
            await userEvent.keyboard("{Escape}");
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    describe("the list", () => {
        it("shows each notification with its time and the emergency guide button", async () => {
            const onEmergency = vi.fn();
            render(<NotificationBell {...props({ onEmergency })} />);
            await open();

            const items = popover().getAllByRole("listitem");
            expect(items).toHaveLength(2);
            expect(within(items[0]!).getByText("Presión alta a")).toBeInTheDocument();
            expect(within(items[0]!).getByText(/8:30/)).toBeInTheDocument();
            await userEvent.click(within(items[0]!).getByRole("button", { name: "Guía de emergencia" }));
            expect(onEmergency).toHaveBeenCalled();
            expect(screen.queryByRole("dialog", { name: "Notificaciones" })).not.toBeInTheDocument();
        });

        it("tells the unread ones from the read ones", async () => {
            render(<NotificationBell {...props({ readIds: ["b"], unread: 1 })} />);
            await open();

            const [first, second] = popover().getAllByRole("listitem");
            expect(first).toHaveAttribute("data-unread", "true");
            expect(second).toHaveAttribute("data-unread", "false");
        });

        it("says there is nothing to show, with the message it was given", async () => {
            const { unmount } = render(<NotificationBell {...props({ notifications: [], unread: 0 })} />);
            await open();
            expect(popover().getByText(/no tienes notificaciones\./i)).toBeInTheDocument();
            unmount();

            render(<NotificationBell {...props({ notifications: [], unread: 0, emptyMessage: "Esta cuenta no recibe avisos." })} />);
            await open();
            expect(popover().getByText("Esta cuenta no recibe avisos.")).toBeInTheDocument();
        });
    });

    describe("tabs", () => {
        it("starts on All and counts the unread ones on the other tab", async () => {
            render(<NotificationBell {...props({ readIds: ["b"], unread: 1 })} />);
            await open();

            expect(popover().getByRole("tab", { name: "Todas" })).toHaveAttribute("aria-selected", "true");
            expect(popover().getByRole("tab", { name: /sin leer/i })).toHaveTextContent("1");
        });

        it("shows only the unread ones on the Unread tab", async () => {
            render(<NotificationBell {...props({ readIds: ["b"], unread: 1 })} />);
            await open();

            await userEvent.click(popover().getByRole("tab", { name: /sin leer/i }));

            expect(popover().getAllByRole("listitem")).toHaveLength(1);
            expect(popover().getByText("Presión alta a")).toBeInTheDocument();
            expect(popover().getByRole("tab", { name: /sin leer/i })).toHaveAttribute("aria-selected", "true");
        });

        it("says there is nothing unread when everything has been read", async () => {
            render(<NotificationBell {...props({ readIds: ["a", "b"], unread: 0 })} />);
            await open();

            await userEvent.click(popover().getByRole("tab", { name: /sin leer/i }));

            expect(popover().getByText(/no tienes notificaciones sin leer/i)).toBeInTheDocument();
        });
    });

    describe("marking one notification", () => {
        it("offers to mark an unread one as read and sends only that id", async () => {
            const onSetRead = vi.fn();
            render(<NotificationBell {...props({ onSetRead })} />);
            await open();

            const first = popover().getAllByRole("listitem")[0]!;
            await userEvent.click(within(first).getByRole("button", { name: "Marcar como leída: Presión alta a" }));

            expect(onSetRead).toHaveBeenCalledWith(["a"], true);
        });

        it("offers to mark a read one as unread again", async () => {
            const onSetRead = vi.fn();
            render(<NotificationBell {...props({ readIds: ["b"], unread: 1, onSetRead })} />);
            await open();

            const second = popover().getAllByRole("listitem")[1]!;
            await userEvent.click(within(second).getByRole("button", { name: "Marcar como no leída: Alerta crítica pendiente" }));

            expect(onSetRead).toHaveBeenCalledWith(["b"], false);
        });

        it("marks an unread notification read when its text is tapped, and leaves a read one alone", async () => {
            const onSetRead = vi.fn();
            render(<NotificationBell {...props({ readIds: ["b"], unread: 1, onSetRead })} />);
            await open();
            const [first, second] = popover().getAllByRole("listitem");

            await userEvent.click(within(first!).getByText(/150\/100 mmHg detectado/));
            expect(onSetRead).toHaveBeenCalledWith(["a"], true);

            onSetRead.mockClear();
            await userEvent.click(within(second!).getByText(/150\/100 mmHg detectado/));
            expect(onSetRead).not.toHaveBeenCalled();
        });

        it("does not mark it read as a side effect of pressing its other buttons", async () => {
            const onSetRead = vi.fn();
            const onDismiss = vi.fn();
            render(<NotificationBell {...props({ onSetRead, onDismiss })} />);
            await open();
            const first = popover().getAllByRole("listitem")[0]!;

            await userEvent.click(within(first).getByRole("button", { name: "Borrar: Presión alta a" }));

            expect(onDismiss).toHaveBeenCalledWith(["a"]);
            expect(onSetRead).not.toHaveBeenCalled();
        });
    });

    describe("marking all", () => {
        it("marks all as read and all as unread with the ids of every notification", async () => {
            const onSetRead = vi.fn();
            render(<NotificationBell {...props({ readIds: ["b"], unread: 1, onSetRead })} />);
            await open();

            await userEvent.click(popover().getByRole("button", { name: /marcar todas como leídas/i }));
            expect(onSetRead).toHaveBeenLastCalledWith(["a", "b"], true);

            await userEvent.click(popover().getByRole("button", { name: /marcar todas como no leídas/i }));
            expect(onSetRead).toHaveBeenLastCalledWith(["a", "b"], false);
        });

        it("only offers marking all read while something is unread, and unread only while something is read", async () => {
            const { unmount } = render(<NotificationBell {...props({ readIds: [], unread: 2 })} />);
            await open();
            expect(popover().getByRole("button", { name: /marcar todas como leídas/i })).toBeEnabled();
            expect(popover().getByRole("button", { name: /marcar todas como no leídas/i })).toBeDisabled();
            unmount();

            render(<NotificationBell {...props({ readIds: ["a", "b"], unread: 0 })} />);
            await open();
            expect(popover().getByRole("button", { name: /marcar todas como leídas/i })).toBeDisabled();
            expect(popover().getByRole("button", { name: /marcar todas como no leídas/i })).toBeEnabled();
        });

        it("clears everything", async () => {
            const onDismiss = vi.fn();
            render(<NotificationBell {...props({ onDismiss })} />);
            await open();

            await userEvent.click(popover().getByRole("button", { name: /borrar todas/i }));

            expect(onDismiss).toHaveBeenCalledWith(["a", "b"]);
        });
    });

    describe("the full inbox", () => {
        it("opens a large window from the footer and closes the small panel", async () => {
            render(<NotificationBell {...props()} />);
            await open();

            await userEvent.click(popover().getByRole("button", { name: /ver todas las notificaciones/i }));

            expect(screen.getByRole("dialog", { name: "Todas las notificaciones" })).toBeInTheDocument();
            expect(screen.queryByRole("dialog", { name: "Notificaciones" })).not.toBeInTheDocument();
        });

        it("closes it and can be opened again", async () => {
            render(<NotificationBell {...props()} />);
            await open();
            await userEvent.click(popover().getByRole("button", { name: /ver todas las notificaciones/i }));

            await userEvent.click(screen.getByRole("button", { name: /cerrar/i }));
            expect(screen.queryByRole("dialog", { name: "Todas las notificaciones" })).not.toBeInTheDocument();

            await open();
            expect(popover().getByRole("button", { name: /ver todas las notificaciones/i })).toBeInTheDocument();
        });

        it("passes the actions of the big window to the same handlers", async () => {
            const onSetRead = vi.fn();
            render(<NotificationBell {...props({ onSetRead })} />);
            await open();
            await userEvent.click(popover().getByRole("button", { name: /ver todas las notificaciones/i }));

            const center = within(screen.getByRole("dialog", { name: "Todas las notificaciones" }));
            await userEvent.click(center.getByRole("button", { name: /marcar todas como leídas/i }));

            expect(onSetRead).toHaveBeenCalledWith(["a", "b"], true);
        });
    });

    describe("browser notifications", () => {
        it("offers to turn them on when permission was not asked yet", async () => {
            const onRequestPermission = vi.fn();
            render(<NotificationBell {...props({ permission: "default", onRequestPermission })} />);
            await open();

            await userEvent.click(popover().getByRole("button", { name: /activar avisos del navegador/i }));

            expect(onRequestPermission).toHaveBeenCalled();
        });

        it("explains when they were blocked and hides the button", async () => {
            render(<NotificationBell {...props({ permission: "denied" })} />);
            await open();

            expect(popover().getByText(/bloqueaste los avisos del navegador/i)).toBeInTheDocument();
            expect(popover().queryByRole("button", { name: /activar avisos/i })).not.toBeInTheDocument();
        });

        it("says nothing about them when the browser has none", async () => {
            render(<NotificationBell {...props({ permission: "unsupported" })} />);
            await open();
            expect(popover().queryByText(/avisos del navegador/i)).not.toBeInTheDocument();
        });
    });
});
