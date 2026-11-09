// @requirement RF-01
import { Activity, Calendar, Eye, EyeOff, HeartPulse, Lock, LogIn, Mail, ShieldCheck, Stethoscope, TrendingUp, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, login, register } from "../api";
import { cn } from "../lib/cn";
import type { TokenPair } from "../types";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { ThemeToggle } from "./ui/ThemeToggle";
import { useToast } from "./ui/Toast";

type Mode = "login" | "register";

interface AuthFormProps {
    onAuthenticated: (session: TokenPair) => void;
}

const PASSWORD_RULES = [
    { id: "length", label: "Mínimo 8 caracteres", test: (value: string) => value.length >= 8 },
    { id: "upper", label: "Al menos una letra mayúscula", test: (value: string) => /\p{Lu}/u.test(value) },
    { id: "digit", label: "Al menos un número", test: (value: string) => /\d/.test(value) },
] as const;

function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-subtle hover:bg-muted"
        >
            {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
    );
}

function Brand({ title, subtitle, size }: { title: string; subtitle?: string; size: "lg" | "md" }) {
    return (
        <div className="flex flex-col items-center gap-4 text-center">
            <div
                className={cn(
                    "flex items-center justify-center rounded-full text-primary-foreground lg:hidden",
                    size === "lg" ? "h-28 w-28 bg-accent" : "h-20 w-20 bg-primary",
                )}
            >
                <HeartPulse className={size === "lg" ? "h-14 w-14" : "h-10 w-10"} aria-hidden="true" />
            </div>
            <h1 className={cn("font-normal text-foreground", size === "lg" ? "text-3xl" : "text-2xl", "lg:text-3xl")}>{title}</h1>
            {subtitle ? <p className="text-base text-subtle">{subtitle}</p> : null}
        </div>
    );
}

const PROMISES = [
    { icon: Activity, text: "Registra tus lecturas desde casa" },
    { icon: TrendingUp, text: "Sigue tu tendencia semana a semana" },
    { icon: Stethoscope, text: "Tu médico revisa cada alerta" },
] as const;

function BrandPanel() {
    return (
        <aside
            data-testid="auth-brand-panel"
            className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-accent to-primary p-12 text-primary-foreground lg:flex"
        >
            <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
                    <HeartPulse className="h-7 w-7" aria-hidden="true" />
                </div>
                <span className="text-2xl font-medium">HipertAI</span>
            </div>
            <div className="flex flex-col gap-8">
                <h2 className="max-w-md text-4xl font-semibold leading-tight">Tu presión arterial, a la vista</h2>
                <ul className="flex flex-col gap-4">
                    {PROMISES.map(({ icon: Icon, text }) => (
                        <li key={text} className="flex items-center gap-3 text-lg">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
                                <Icon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            {text}
                        </li>
                    ))}
                </ul>
            </div>
            <p className="text-sm text-white/80">
                {`© ${new Date().getFullYear()} Sistema de Monitoreo de Hipertensión`}
            </p>
            <HeartPulse
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-16 -right-16 h-72 w-72 text-white/5"
            />
        </aside>
    );
}

export function AuthForm({ onAuthenticated }: AuthFormProps) {
    const toast = useToast();
    const [mode, setMode] = useState<Mode>("login");
    const [busy, setBusy] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [form, setForm] = useState({
        email: "",
        password: "",
        confirm: "",
        full_name: "",
        birth_date: "",
        terms: false,
    });

    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
        setForm((current) => ({ ...current, [key]: value }));

    const switchMode = (next: Mode) => {
        setMode(next);
        setSubmitted(false);
        setShowPassword(false);
    };

    const registerErrors = {
        full_name: form.full_name.trim() ? null : "Ingresa tu nombre completo",
        birth_date: !form.birth_date
            ? "Ingresa tu fecha de nacimiento"
            : new Date(form.birth_date) > new Date()
              ? "La fecha de nacimiento no puede estar en el futuro"
              : null,
        email: form.email.trim() ? null : "Ingresa tu correo electrónico",
        password: PASSWORD_RULES.every((rule) => rule.test(form.password)) ? null : "La contraseña no cumple las reglas",
        confirm: form.confirm === form.password ? null : "Las contraseñas no coinciden",
        terms: form.terms ? null : "Debes aceptar los términos y la política de privacidad",
    };
    const registerValid = Object.values(registerErrors).every((error) => error === null);
    const shown = (key: keyof typeof registerErrors) => (submitted ? registerErrors[key] : null);

    async function signIn() {
        const session = await login({ email: form.email.trim(), password: form.password });
        onAuthenticated(session);
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitted(true);
        if (mode === "register" && !registerValid) return;
        setBusy(true);
        try {
            if (mode === "register") {
                await register({
                    email: form.email.trim(),
                    password: form.password,
                    full_name: form.full_name.trim(),
                    birth_date: form.birth_date,
                });
                toast.success("Cuenta creada. Iniciando sesión.");
            }
            await signIn();
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo conectar con el servidor");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="relative min-h-screen bg-muted lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:bg-background">
            <ThemeToggle className="absolute right-4 top-4 z-10" />
            <BrandPanel />
            <div className="flex items-center justify-center px-4 py-8 lg:px-12 lg:py-12">
            <div
                className={cn(
                    "w-full rounded-[1.25rem] border border-border/70 bg-background px-6 py-10 shadow-sm sm:px-8",
                    "lg:border-0 lg:px-0 lg:py-0 lg:shadow-none",
                    mode === "register" ? "max-w-md lg:max-w-2xl" : "max-w-md",
                )}
            >
                {mode === "login" ? (
                    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6" aria-label="Inicio de sesión">
                        <Brand size="lg" title="Bienvenido a HipertAI" />
                        <Input
                            label="Correo electrónico"
                            type="email"
                            autoComplete="email"
                            placeholder="tu@email.com"
                            value={form.email}
                            onChange={(event) => set("email", event.target.value)}
                        />
                        <Input
                            label="Contraseña"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            placeholder="Tu contraseña"
                            value={form.password}
                            onChange={(event) => set("password", event.target.value)}
                            trailing={<PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
                        />
                        <Button type="submit" loading={busy}>
                            {busy ? null : <LogIn className="h-5 w-5" aria-hidden="true" />}
                            Iniciar sesión
                        </Button>
                        <div className="flex items-center gap-3 text-sm text-subtle" aria-hidden="true">
                            <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
                        </div>
                        <p className="text-center text-base text-subtle">
                            ¿Eres nuevo?{" "}
                            <button type="button" className="font-medium text-foreground" onClick={() => switchMode("register")}>
                                Regístrate
                            </button>
                        </p>
                    </form>
                ) : (
                    <form onSubmit={handleSubmit} noValidate className="grid gap-5 lg:grid-cols-2" aria-label="Registro">
                        <div className="lg:col-span-2">
                            <Brand size="md" title="Crea tu cuenta" subtitle="Únete para monitorear tu presión arterial" />
                        </div>
                        <Input
                            label="Nombre completo"
                            labelIcon={<User className="h-4 w-4 text-primary" aria-hidden="true" />}
                            autoComplete="name"
                            placeholder="Ingresa tu nombre completo"
                            value={form.full_name}
                            error={shown("full_name")}
                            onChange={(event) => set("full_name", event.target.value)}
                        />
                        <Input
                            label="Fecha de nacimiento"
                            labelIcon={<Calendar className="h-4 w-4 text-primary" aria-hidden="true" />}
                            type="date"
                            autoComplete="bday"
                            value={form.birth_date}
                            error={shown("birth_date")}
                            onChange={(event) => set("birth_date", event.target.value)}
                        />
                        <Input
                            wrapperClassName="lg:col-span-2"
                            label="Correo electrónico"
                            labelIcon={<Mail className="h-4 w-4 text-primary" aria-hidden="true" />}
                            type="email"
                            autoComplete="email"
                            placeholder="ejemplo@correo.com"
                            value={form.email}
                            error={shown("email")}
                            onChange={(event) => set("email", event.target.value)}
                        />
                        <div className="flex flex-col gap-2 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
                            <Input
                                wrapperClassName="lg:col-start-1 lg:row-start-1"
                                label="Contraseña"
                                labelIcon={<Lock className="h-4 w-4 text-primary" aria-hidden="true" />}
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="Crea una contraseña segura"
                                value={form.password}
                                error={shown("password")}
                                onChange={(event) => set("password", event.target.value)}
                                trailing={<PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
                            />
                            <ul className="flex flex-col gap-0.5 text-sm lg:col-span-2 lg:row-start-2" aria-label="Reglas de la contraseña">
                                {PASSWORD_RULES.map((rule) => (
                                    <li
                                        key={rule.id}
                                        className={cn("list-inside list-disc", rule.test(form.password) ? "text-normal" : "text-subtle")}
                                    >
                                        {rule.label}
                                    </li>
                                ))}
                            </ul>
                            <Input
                                wrapperClassName="lg:col-start-2 lg:row-start-1"
                                label="Confirmar contraseña"
                                labelIcon={<Lock className="h-4 w-4 text-primary" aria-hidden="true" />}
                                type={showConfirm ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder="Confirma tu contraseña"
                                value={form.confirm}
                                error={shown("confirm")}
                                onChange={(event) => set("confirm", event.target.value)}
                                trailing={<PasswordToggle visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />}
                            />
                        </div>
                        <div className="flex flex-col gap-1 lg:col-span-2">
                            <label className="flex items-start gap-3 text-base text-foreground">
                                <input
                                    type="checkbox"
                                    className="mt-1 h-5 w-5 shrink-0 rounded border-border accent-primary"
                                    checked={form.terms}
                                    onChange={(event) => set("terms", event.target.checked)}
                                />
                                <span>Acepto los términos y condiciones y la política de privacidad</span>
                            </label>
                            {shown("terms") ? (
                                <p role="alert" className="text-sm text-critical">
                                    {shown("terms")}
                                </p>
                            ) : null}
                        </div>
                        <Button type="submit" loading={busy} className="lg:col-span-2">
                            Registrarse
                        </Button>
                        <p className="text-center text-base text-subtle lg:col-span-2">
                            ¿Ya tienes cuenta?{" "}
                            <button type="button" className="font-medium text-foreground underline" onClick={() => switchMode("login")}>
                                Inicia sesión
                            </button>
                        </p>
                    </form>
                )}
                <p className="mt-8 flex items-center justify-center gap-2 text-sm text-subtle">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Datos protegidos y seguros
                </p>
            </div>
            </div>
        </main>
    );
}
