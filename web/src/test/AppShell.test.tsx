// @requirement none
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { House, User } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../components/AppShell";

const items = [
    { id: "home", label: "Inicio", icon: House },
    { id: "profile", label: "Perfil", icon: User },
];

describe("AppShell", () => {
    it("marks the active item and reports navigation", async () => {
        const onChange = vi.fn();
        render(
            <AppShell items={items} active="home" onChange={onChange} onLogout={vi.fn()}>
                <p>contenido</p>
            </AppShell>,
        );

        expect(screen.getByRole("button", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
        await userEvent.click(screen.getByRole("button", { name: "Perfil" }));
        expect(onChange).toHaveBeenCalledWith("profile");
        expect(screen.getByText("contenido")).toBeInTheDocument();
    });

    it("offers a single logout control", async () => {
        const onLogout = vi.fn();
        render(
            <AppShell items={items} active="home" onChange={vi.fn()} onLogout={onLogout}>
                <p>x</p>
            </AppShell>,
        );
        await userEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));
        expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it("renders no navigation when there is a single destination", () => {
        render(
            <AppShell items={[items[0]!]} active="home" onChange={vi.fn()} onLogout={vi.fn()}>
                <p>x</p>
            </AppShell>,
        );
        expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });
});

describe("AppShell collapsible sidebar", () => {
    const renderShell = (onChange = vi.fn()) =>
        render(
            <AppShell items={items} active="home" onChange={onChange} onLogout={vi.fn()}>
                <p>x</p>
            </AppShell>,
        );

    it("starts expanded and collapses and expands from the toggle", async () => {
        renderShell();
        const toggle = screen.getByRole("button", { name: /contraer menú/i });
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("navigation")).toHaveAttribute("data-collapsed", "false");

        await userEvent.click(toggle);

        expect(screen.getByRole("button", { name: /expandir menú/i })).toHaveAttribute("aria-expanded", "false");
        expect(screen.getByRole("navigation")).toHaveAttribute("data-collapsed", "true");

        await userEvent.click(screen.getByRole("button", { name: /expandir menú/i }));
        expect(screen.getByRole("navigation")).toHaveAttribute("data-collapsed", "false");
    });

    it("keeps every destination reachable by name while collapsed", async () => {
        const onChange = vi.fn();
        renderShell(onChange);
        await userEvent.click(screen.getByRole("button", { name: /contraer menú/i }));

        await userEvent.click(screen.getByRole("button", { name: "Perfil" }));

        expect(onChange).toHaveBeenCalledWith("profile");
    });

    it("remembers the choice across reloads", async () => {
        const { unmount } = renderShell();
        await userEvent.click(screen.getByRole("button", { name: /contraer menú/i }));
        unmount();

        renderShell();

        expect(screen.getByRole("navigation")).toHaveAttribute("data-collapsed", "true");
    });
});

describe("AppShell header actions", () => {
    it("shows the notifications next to the logout button", () => {
        render(
            <AppShell items={items} active="home" onChange={vi.fn()} onLogout={vi.fn()} notifications={<button type="button">Campana</button>}>
                <p>x</p>
            </AppShell>,
        );
        expect(screen.getByRole("button", { name: "Campana" })).toBeInTheDocument();
    });

    it("opens the profile from the round avatar and from the settings gear", async () => {
        const onOpen = vi.fn();
        render(
            <AppShell items={items} active="home" onChange={vi.fn()} onLogout={vi.fn()} profile={{ initials: "MA", onOpen }}>
                <p>x</p>
            </AppShell>,
        );

        expect(screen.getByText("MA")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /ir al perfil/i }));
        expect(onOpen).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole("button", { name: /configuración y perfil/i }));
        expect(onOpen).toHaveBeenCalledTimes(2);
    });

    it("falls back to a person icon when the initials are not known yet", () => {
        render(
            <AppShell items={items} active="home" onChange={vi.fn()} onLogout={vi.fn()} profile={{ initials: null, onOpen: vi.fn() }}>
                <p>x</p>
            </AppShell>,
        );
        expect(screen.getByRole("button", { name: /ir al perfil/i }).querySelector("svg")).toBeInTheDocument();
    });

    it("hides a desktop-only destination from the bottom bar on phones", () => {
        render(
            <AppShell
                items={[items[0]!, { ...items[1]!, desktopOnly: true }]}
                active="home"
                onChange={vi.fn()}
                onLogout={vi.fn()}
            >
                <p>x</p>
            </AppShell>,
        );
        expect(screen.getByRole("button", { name: "Perfil" }).className).toMatch(/(^|\s)hidden(\s|$)/);
        expect(screen.getByRole("button", { name: "Perfil" }).className).toContain("lg:flex");
        expect(screen.getByRole("button", { name: "Inicio" }).className).not.toMatch(/(^|\s)hidden(\s|$)/);
    });

    it("shows the photo in the avatar button when there is one", () => {
        render(
            <AppShell items={items} active="home" onChange={vi.fn()} onLogout={vi.fn()} profile={{ initials: "MA", avatar: "data:image/jpeg;base64,AAAA", onOpen: vi.fn() }}>
                <p>x</p>
            </AppShell>,
        );
        const button = screen.getByRole("button", { name: /ir al perfil/i });
        expect(button.querySelector("img")).toHaveAttribute("src", "data:image/jpeg;base64,AAAA");
        expect(screen.queryByText("MA")).not.toBeInTheDocument();
    });

    it("shows a count on a destination without changing its name", () => {
        render(
            <AppShell
                items={[{ ...items[0]!, badge: 3 }, items[1]!]}
                active="home"
                onChange={vi.fn()}
                onLogout={vi.fn()}
            >
                <p>x</p>
            </AppShell>,
        );

        const button = screen.getByRole("button", { name: "Inicio" });
        expect(button).toHaveAccessibleDescription("3 pendientes");
        expect(button).toHaveTextContent("3");
    });

    it("hides a zero count and caps a long one", () => {
        render(
            <AppShell
                items={[{ ...items[0]!, badge: 0 }, { ...items[1]!, badge: 250 }]}
                active="home"
                onChange={vi.fn()}
                onLogout={vi.fn()}
            >
                <p>x</p>
            </AppShell>,
        );

        expect(screen.getByRole("button", { name: "Inicio" })).not.toHaveAccessibleDescription();
        expect(screen.getByRole("button", { name: "Perfil" })).toHaveTextContent("99+");
        expect(screen.getByRole("button", { name: "Perfil" })).toHaveAccessibleDescription("250 pendientes");
    });

    it("puts the light and dark switch in the header for every role", () => {
        render(
            <AppShell items={items} active="home" onChange={vi.fn()} onLogout={vi.fn()}>
                <p>x</p>
            </AppShell>,
        );
        expect(screen.getByRole("switch", { name: /modo oscuro/i })).toBeInTheDocument();
    });
});
