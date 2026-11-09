// @requirement RF-01
// @requirement RF-02
import { useCallback, useEffect, useState } from "react";
import { logout, setSessionExpiredListener } from "./api";
import { loadSession, saveSession } from "./auth";
import { AuthForm } from "./components/AuthForm";
import { PatientApp } from "./components/PatientApp";
import { StaffApp } from "./components/staff/StaffApp";
import { ToastProvider } from "./components/ui/Toast";
import type { TokenPair } from "./types";

function Routes() {
    const [session, setSession] = useState<TokenPair | null>(() => loadSession());

    useEffect(() => {
        setSessionExpiredListener(() => setSession(null));
        return () => setSessionExpiredListener(null);
    }, []);

    const handleLogout = useCallback(async () => {
        await logout();
        setSession(null);
    }, []);

    if (!session) {
        return (
            <AuthForm
                onAuthenticated={(pair) => {
                    saveSession(pair);
                    setSession(pair);
                }}
            />
        );
    }

    if (session.role === "patient") return <PatientApp onLogout={handleLogout} />;
    return <StaffApp role={session.role} onLogout={handleLogout} />;
}

export default function App() {
    return (
        <ToastProvider>
            <Routes />
        </ToastProvider>
    );
}
