// @requirement none
import { HeartPulse, LogOut, PanelLeftClose, PanelLeftOpen, Settings, User } from "lucide-react";
import { Fragment, useState, type ComponentType, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { ThemeToggle } from "./ui/ThemeToggle";

export interface NavItem<Id extends string = string> {
    id: Id;
    label: string;
    icon: ComponentType<{ className?: string }>;
    // Left out of the phone's bottom bar; the sidebar on desktop still lists it.
    desktopOnly?: boolean;
    // Pending items shown as a count on the destination; zero or absent shows nothing.
    badge?: number;
}

interface AppShellProps<Id extends string> {
    items: NavItem<Id>[];
    active: Id;
    onChange: (id: Id) => void;
    onLogout: () => void;
    // Notifications control, shown next to the logout button.
    notifications?: ReactNode;
    // Round avatar and settings gear; both open the profile.
    profile?: { initials: string | null; avatar?: string | null; onOpen: () => void };
    children: ReactNode;
}

const COLLAPSED_KEY = "hta.sidebar.collapsed";

function readCollapsed(): boolean {
    try {
        return window.localStorage.getItem(COLLAPSED_KEY) === "true";
    } catch {
        return false;
    }
}

function Logo({ compact = false }: { compact?: boolean }) {
    return (
        <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field bg-accent text-primary-foreground">
                <HeartPulse className="h-6 w-6" aria-hidden="true" />
            </div>
            {compact ? null : <span className="hidden text-xl min-[390px]:inline lg:inline">HipertAI</span>}
        </div>
    );
}

// Phone: top bar plus a bottom tab bar. Desktop (lg and up): a left sidebar the
// user can collapse to icons. The navigation is one element restyled per breakpoint.
export function AppShell<Id extends string>({
    items,
    active,
    onChange,
    onLogout,
    notifications,
    profile,
    children,
}: AppShellProps<Id>) {
    const hasNav = items.length > 1;
    const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

    const toggle = () => {
        setCollapsed((current) => {
            const next = !current;
            try {
                window.localStorage.setItem(COLLAPSED_KEY, String(next));
            } catch {
                // Storage can be blocked; the choice then lasts only for this visit.
            }
            return next;
        });
    };

    return (
        <div
            className={cn(
                "min-h-screen bg-muted/60",
                hasNav &&
                    "lg:grid motion-safe:lg:transition-[grid-template-columns] motion-safe:lg:duration-200 " +
                        (collapsed ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)]"),
            )}
        >
            {hasNav ? (
                <nav
                    aria-label="Navegación principal"
                    data-collapsed={collapsed}
                    className={cn(
                        "fixed inset-x-0 bottom-0 z-20 flex border-t border-border/70 bg-background pb-[env(safe-area-inset-bottom)]",
                        "lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:gap-1 lg:border-r lg:border-t-0 lg:pb-4",
                        collapsed ? "lg:items-center lg:p-2" : "lg:p-4",
                    )}
                >
                    <div className={cn("mb-4 hidden pt-2 lg:block", collapsed ? "px-0" : "px-2")}>
                        <Logo compact={collapsed} />
                    </div>
                    {items.map(({ id, label, icon: Icon, desktopOnly, badge }) => (
                        <Fragment key={id}>
                        <button
                            type="button"
                            onClick={() => onChange(id)}
                            title={collapsed ? label : undefined}
                            aria-describedby={badge ? `nav-badge-${id}` : undefined}
                            aria-current={active === id ? "page" : undefined}
                            className={cn(
                                desktopOnly ? "hidden lg:flex" : "flex",
                                "flex-1 flex-col items-center gap-1 py-3 text-sm transition-colors",
                                "lg:flex-none lg:flex-row lg:gap-3 lg:rounded-field lg:py-2.5 lg:text-base",
                                collapsed ? "lg:h-11 lg:w-11 lg:justify-center lg:px-0" : "lg:px-3",
                                active === id
                                    ? "font-medium text-foreground lg:bg-primary-soft/60 lg:text-primary"
                                    : "text-subtle hover:text-foreground lg:hover:bg-muted",
                            )}
                        >
                            <span className="relative">
                                <Icon className="h-6 w-6 shrink-0 lg:h-5 lg:w-5" aria-hidden="true" />
                                {badge ? (
                                    <span
                                        aria-hidden="true"
                                        className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-medium text-primary-foreground"
                                    >
                                        {badge > 99 ? "99+" : badge}
                                    </span>
                                ) : null}
                            </span>
                            <span className={cn(collapsed && "lg:sr-only")}>{label}</span>
                        </button>
                        {badge ? (
                            <span id={`nav-badge-${id}`} className="sr-only">
                                {`${badge} pendientes`}
                            </span>
                        ) : null}
                        </Fragment>
                    ))}
                    <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
                        title={collapsed ? "Expandir menú" : "Contraer menú"}
                        className={cn(
                            "mt-auto hidden items-center gap-3 rounded-field py-2.5 text-base text-subtle transition-colors hover:bg-muted hover:text-foreground lg:flex",
                            collapsed ? "h-11 w-11 justify-center" : "px-3",
                        )}
                    >
                        {collapsed ? (
                            <PanelLeftOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
                        ) : (
                            <>
                                <PanelLeftClose className="h-5 w-5 shrink-0" aria-hidden="true" />
                                <span aria-hidden="true">Contraer</span>
                            </>
                        )}
                    </button>
                </nav>
            ) : null}

            <div className="flex min-w-0 flex-col">
                <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/70 bg-background px-3 py-3 sm:px-4 lg:px-8">
                    <div className={cn("min-w-0", hasNav && "lg:invisible")}>
                        <Logo />
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
                        <ThemeToggle className="mr-0.5 sm:mr-1" />
                        {notifications}
                        {profile ? (
                            <>
                                <button
                                    type="button"
                                    onClick={profile.onOpen}
                                    aria-label="Ir al perfil"
                                    title="Ir al perfil"
                                    className="flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-muted bg-primary-soft text-sm font-medium text-primary transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    {profile.avatar ? (
                                        <img src={profile.avatar} alt="" className="h-full w-full rounded-full object-cover" />
                                    ) : profile.initials ? (
                                        profile.initials
                                    ) : (
                                        <User className="h-4 w-4" aria-hidden="true" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={profile.onOpen}
                                    aria-label="Configuración y perfil"
                                    title="Configuración y perfil"
                                    className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
                                >
                                    <Settings className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={onLogout} aria-label="Cerrar sesión">
                            <LogOut className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Cerrar sesión</span>
                        </Button>
                    </div>
                </header>
                <main className={cn("w-full flex-1 px-4 py-4 lg:px-8 lg:py-6", hasNav && "pb-24 lg:pb-8")}>
                    <div className="mx-auto w-full max-w-6xl">{children}</div>
                </main>
            </div>
        </div>
    );
}
