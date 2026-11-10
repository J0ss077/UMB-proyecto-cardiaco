// @requirement RF-03
// @requirement RF-05
// @requirement RF-19
// @requirement RF-21
import { Bot, ChartLine, ClipboardPlus, House, LifeBuoy, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getConsent, getProfile, getReadingsSummary, listAlerts, listReadings, listSymptoms, ApiError } from "../api";
import type { Alert, ConsentStatus, Profile, Reading, ReadingsSummary, Symptom } from "../types";
import { AppShell, type NavItem } from "./AppShell";
import { ChatbotPanel } from "./ChatbotPanel";
import { EmergencyGuideDialog } from "./EmergencyGuideDialog";
import { NotificationBell } from "./NotificationBell";
import { useNotifications } from "./useNotifications";
import { ConnectDeviceScreen } from "./ConnectDeviceScreen";
import { ConsentGate } from "./ConsentGate";
import { HelpScreen } from "./patient/HelpScreen";
import { PatientData } from "./patient/PatientData";
import { PatientHome } from "./patient/PatientHome";
import { PatientLog } from "./patient/PatientLog";
import { PatientProfile } from "./patient/PatientProfile";
import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

type Tab = "home" | "data" | "log" | "chatbot" | "help" | "profile";
type View = Tab | "devices";

const TABS: NavItem<Tab>[] = [
    { id: "home", label: "Inicio", icon: House },
    { id: "data", label: "Datos", icon: ChartLine },
    { id: "log", label: "Registrar", icon: ClipboardPlus },
    { id: "chatbot", label: "Chatbot", icon: Bot },
    { id: "help", label: "Ayuda", icon: LifeBuoy },
    { id: "profile", label: "Perfil", icon: User, desktopOnly: true },
];

interface Snapshot {
    recent: Reading[];
    history: Reading[];
    openAlert: Alert | null;
    openAlerts: Alert[];
    symptoms: Symptom[];
    summary: ReadingsSummary | null;
    summaryNote: string | null;
    summaryBlocked: boolean;
}

const EMPTY_READINGS: Reading[] = [];
const EMPTY_SYMPTOMS: Symptom[] = [];
const EMPTY_ALERTS: Alert[] = [];

export function PatientApp({ onLogout }: { onLogout: () => void }) {
    const toast = useToast();
    const [consent, setConsent] = useState<ConsentStatus | null>(null);
    const [view, setView] = useState<View>("home");
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    // The consent gate is the initial screen; dismissing it lets the patient read
    // the history that ADR 0003 keeps available. Writes and the summary stay closed.
    const [gateDismissed, setGateDismissed] = useState(false);

    const loadConsent = useCallback(async () => {
        try {
            setConsent(await getConsent());
        } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "No se pudo consultar el consentimiento");
        }
    }, [toast]);

    useEffect(() => {
        void loadConsent();
    }, [loadConsent]);

    const consentActive = consent?.active === true;
    const consentLoaded = consent !== null;

    useEffect(() => {
        // The history is readable without consent (ADR 0003), so the snapshot loads
        // as soon as the consent status is known. Only the summary is refused; the
        // 403 is what marks it as blocked.
        if (!consentLoaded) return;
        let cancelled = false;
        async function load() {
            const [readings, alerts, symptoms, summary] = await Promise.allSettled([
                listReadings({ limit: 90 }),
                listAlerts({ status: "open", limit: 50 }),
                listSymptoms({ limit: 20 }),
                getReadingsSummary(),
            ]);
            if (cancelled) return;
            const summaryBlocked = summary.status === "rejected" && summary.reason instanceof ApiError && summary.reason.consentRequired;
            setSnapshot({
                recent: readings.status === "fulfilled" ? readings.value.items.slice(0, 14) : [],
                history: readings.status === "fulfilled" ? readings.value.items : [],
                openAlert: alerts.status === "fulfilled" ? (alerts.value.items[0] ?? null) : null,
                openAlerts: alerts.status === "fulfilled" ? alerts.value.items : [],
                symptoms: symptoms.status === "fulfilled" ? symptoms.value.items : [],
                summary: summary.status === "fulfilled" ? summary.value : null,
                summaryBlocked,
                summaryNote:
                    summary.status === "rejected"
                        ? summaryBlocked
                            ? "El resumen de siete días necesita consentimiento informado vigente. Tu historia sigue disponible, pero no se analiza."
                            : "No se pudo cargar el resumen de siete días."
                        : null,
            });
            if (readings.status === "rejected") toast.error("No se pudo cargar tu última lectura");
            // The consent status was fetched before the summary; if the summary rejects
            // with the consent detail, the status is stale. Reload it so the gate opens.
            // When the status already says there is no consent, there is nothing to reload.
            if (summaryBlocked && consentActive) void loadConsent();
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [consentLoaded, consentActive, refreshKey, toast, loadConsent]);

    const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

    const [headerProfile, setHeaderProfile] = useState<{ initials: string | null; avatar: string | null }>({ initials: null, avatar: null });
    const [guideOpen, setGuideOpen] = useState(false);

    const showInHeader = useCallback((profile: Profile) => {
        setHeaderProfile({
            initials: profile.full_name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0).toUpperCase())
                .join(""),
            avatar: profile.avatar,
        });
    }, []);

    useEffect(() => {
        let cancelled = false;
        getProfile()
            .then((profile) => {
                if (!cancelled && profile) showInHeader(profile);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [showInHeader]);

    const alerts = useNotifications({
        readings: snapshot?.history ?? EMPTY_READINGS,
        symptoms: snapshot?.symptoms ?? EMPTY_SYMPTOMS,
        alerts: snapshot?.openAlerts ?? EMPTY_ALERTS,
    });

    if (consent === null) return <p className="p-6 text-subtle">Cargando...</p>;
    if (!consent.active && !gateDismissed) {
        return (
            <ConsentGate
                version={consent.requires_acceptance_of_version}
                onAccepted={() => {
                    setGateDismissed(false);
                    void loadConsent();
                }}
                onDismiss={() => setGateDismissed(true)}
            />
        );
    }

    return (
        <AppShell
            items={TABS}
            active={view === "devices" ? "home" : view}
            onChange={setView}
            onLogout={onLogout}
            profile={{ ...headerProfile, onOpen: () => setView("profile") }}
            notifications={
                <NotificationBell
                    notifications={alerts.notifications}
                    readIds={alerts.readIds}
                    unread={alerts.unread}
                    permission={alerts.permission}
                    onSetRead={alerts.setRead}
                    onDismiss={alerts.dismiss}
                    onEmergency={() => setGuideOpen(true)}
                    onRequestPermission={() => void alerts.requestPermission()}
                />
            }
        >
            {!consentActive ? (
                <div
                    role="status"
                    className="mb-4 flex flex-col gap-3 rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
                >
                    <p>
                        Tu consentimiento informado no está vigente. Puedes leer tu historia, pero no registrar
                        lecturas ni síntomas; el resumen de siete días no se calcula.
                    </p>
                    <Button variant="outline" onClick={() => setGateDismissed(false)}>
                        Revisar consentimiento
                    </Button>
                </div>
            ) : null}
            {snapshot === null ? (
                <p className="p-6 text-center text-subtle">Cargando tus datos...</p>
            ) : view === "devices" ? (
                <ConnectDeviceScreen onBack={() => setView("home")} />
            ) : view === "home" ? (
                <PatientHome
                    recent={snapshot.recent}
                    history={snapshot.history}
                    symptoms={snapshot.symptoms}
                    summary={snapshot.summary}
                    summaryNote={snapshot.summaryNote}
                    summaryBlocked={snapshot.summaryBlocked}
                    openAlert={snapshot.openAlert}
                    onRegister={() => setView("log")}
                    onSymptoms={() => setView("log")}
                    onConnectDevice={() => setView("devices")}
                    onChatbot={() => setView("chatbot")}
                />
            ) : view === "data" ? (
                <PatientData refreshKey={refreshKey} canWrite={consentActive} onSymptoms={() => setView("log")} />
            ) : view === "log" ? (
                <PatientLog
                    symptoms={snapshot.symptoms}
                    consentActive={consentActive}
                    onReadingSaved={refresh}
                    onSymptomSaved={refresh}
                    onConsentRequired={() => void loadConsent()}
                    onReviewConsent={() => setGateDismissed(false)}
                />
            ) : view === "chatbot" ? (
                <ChatbotPanel />
            ) : view === "help" ? (
                <HelpScreen onConsentRequired={() => void loadConsent()} />
            ) : (
                <PatientProfile
                    summary={snapshot.summary}
                    summaryBlocked={snapshot.summaryBlocked}
                    onOpenData={() => setView("data")}
                    onProfileChange={showInHeader}
                    onConsentRevoked={() => void loadConsent()}
                />
            )}
            {guideOpen ? <EmergencyGuideDialog onClose={() => setGuideOpen(false)} onRequestHelp={() => setView("help")} /> : null}
        </AppShell>
    );
}
