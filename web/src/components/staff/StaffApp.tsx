// @requirement RF-02
// @requirement RF-14
// @requirement RF-16
// @requirement RF-19
// @requirement RF-24
import { BookOpen, House, Link2, MessageSquare, ScrollText, SlidersHorizontal, TriangleAlert, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getStaffProfile, listAlerts, listPasswordRequests, listConsultations, listPatients, listReadings } from "../../api";
import { useNotifications } from "../useNotifications";
import type { Alert, Reading, Role } from "../../types";
import { AppShell, type NavItem } from "../AppShell";
import { EmergencyGuideDialog } from "../EmergencyGuideDialog";
import { NotificationBell } from "../NotificationBell";
import { PhysicianView } from "../PhysicianView";
import { AdminAccounts } from "./AdminAccounts";
import { AdminAudit } from "./AdminAudit";
import { AdminLinks } from "./AdminLinks";
import { AdminThresholds } from "./AdminThresholds";
import { AlertInbox } from "./AlertInbox";
import { CaregiverGuide } from "./CaregiverGuide";
import { ConsultationInbox } from "./ConsultationInbox";
import { StaffHome } from "./StaffHome";
import { StaffProfile } from "./StaffProfile";
import { initialsOf } from "../AvatarPicker";
import type { StaffProfile as StaffProfileData } from "../../types";

type StaffRole = Exclude<Role, "patient">;

const NAV: Record<StaffRole, NavItem[]> = {
    physician: [
        { id: "home", label: "Inicio", icon: House },
        { id: "patients", label: "Pacientes", icon: Users },
        { id: "alerts", label: "Alertas", icon: TriangleAlert },
        { id: "consultations", label: "Consultas", icon: MessageSquare },
    ],
    caregiver: [
        { id: "home", label: "Inicio", icon: House },
        { id: "patients", label: "Pacientes", icon: Users },
        { id: "alerts", label: "Alertas", icon: TriangleAlert },
        { id: "guide", label: "Guía", icon: BookOpen },
    ],
    admin: [
        { id: "accounts", label: "Cuentas", icon: Users },
        { id: "links", label: "Vínculos", icon: Link2 },
        { id: "thresholds", label: "Umbrales", icon: SlidersHorizontal },
        { id: "audit", label: "Auditoría", icon: ScrollText },
    ],
};

const INITIALS: Record<StaffRole, string> = {
    physician: "Me",
    caregiver: "Cu",
    admin: "Ad",
};

export function StaffApp({ role, onLogout }: { role: StaffRole; onLogout: () => void }) {
    const items = NAV[role];
    const [tab, setTab] = useState(items[0]?.id ?? "home");
    const [profileOpen, setProfileOpen] = useState(false);
    const [staff, setStaff] = useState<StaffProfileData | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);
    const [readings, setReadings] = useState<Reading[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [counts, setCounts] = useState({ openAlerts: 0, pendingConsultations: 0, passwordRequests: 0 });
    const [countsKey, setCountsKey] = useState(0);
    const refreshCounts = useCallback(() => setCountsKey((key) => key + 1), []);

    // The header shows the photo and initials of the loaded profile; a failure keeps the role initials.
    useEffect(() => {
        let cancelled = false;
        getStaffProfile().then(
            (loaded) => {
                if (!cancelled) setStaff(loaded);
            },
            () => undefined,
        );
        return () => {
            cancelled = true;
        };
    }, []);

    // Pending work shown as a count on the navigation. A failed count shows nothing.
    useEffect(() => {
        let cancelled = false;
        if (role === "admin") {
            listPasswordRequests().then(
                (page) => {
                    if (!cancelled) setCounts((c) => ({ ...c, passwordRequests: page.items.length }));
                },
                () => undefined,
            );
            return () => {
                cancelled = true;
            };
        }
        Promise.all([
            listAlerts({ status: "open", limit: 1 }).then((page) => page.total, () => 0),
            role === "physician"
                ? Promise.all([
                      listConsultations({ status: "in_review", limit: 1 }).then((page) => page.total, () => 0),
                      listConsultations({ status: "pending", limit: 1 }).then((page) => page.total, () => 0),
                  ]).then(([review, waiting]) => review + waiting)
                : Promise.resolve(0),
        ]).then(([openAlerts, pendingConsultations]) => {
            if (!cancelled) setCounts((c) => ({ ...c, openAlerts, pendingConsultations }));
        });
        return () => {
            cancelled = true;
        };
    }, [role, countsKey]);

    const navItems = useMemo(
        () =>
            items.map((item) => ({
                ...item,
                badge: item.id === "alerts" ? counts.openAlerts : item.id === "consultations" ? counts.pendingConsultations : item.id === "accounts" ? counts.passwordRequests : undefined,
            })),
        [items, counts],
    );

    const open = (id: string) => {
        setProfileOpen(false);
        setTab(id);
    };

    useEffect(() => {
        if (role === "admin") return;
        let cancelled = false;
        async function load() {
            try {
                const [alertPage, patients] = await Promise.all([
                    listAlerts({ status: "open", severity: "critical", limit: 50 }),
                    listPatients({ limit: 200 }),
                ]);
                const pages = await Promise.all(
                    patients.items.map((patient) => listReadings({ patient_id: patient.user_id, limit: 20 }).catch(() => ({ items: [], total: 0 }))),
                );
                if (cancelled) return;
                setAlerts(alertPage.items);
                setReadings(pages.flatMap((page) => page.items));
            } catch {
                if (!cancelled) {
                    setAlerts([]);
                    setReadings([]);
                }
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [role]);

    const notices = useNotifications({ readings, symptoms: [], alerts });

    function renderTab() {
        if (profileOpen) return <StaffProfile role={role} onProfileChange={setStaff} onPasswordChangedNow={onLogout} />;
        if (role === "physician") {
            if (tab === "patients") return <PhysicianView onOpenAlerts={() => open("alerts")} onOpenConsultations={() => open("consultations")} />;
            if (tab === "alerts") return <AlertInbox canAct onChanged={refreshCounts} />;
            if (tab === "consultations") return <ConsultationInbox onChanged={refreshCounts} />;
            return (
                <StaffHome
                    role="physician"
                    onOpenPatients={() => open("patients")}
                    onOpenAlerts={() => open("alerts")}
                    onOpenConsultations={() => open("consultations")}
                />
            );
        }
        if (role === "caregiver") {
            if (tab === "patients") {
                return (
                    <PhysicianView
                        heading="Pacientes autorizados"
                        patientsLabel="Pacientes autorizados"
                        includeConsultations={false}
                        notice="Estas cifras las revisa el médico. Tú no cierras alertas ni respondes consultas."
                        emptyMessage="Todavía nadie te autorizó a acompañar a un paciente."
                        onOpenAlerts={() => open("alerts")}
                    />
                );
            }
            if (tab === "alerts") return <AlertInbox canAct={false} />;
            if (tab === "guide") return <CaregiverGuide />;
            return <StaffHome role="caregiver" onOpenPatients={() => open("patients")} onOpenAlerts={() => open("alerts")} />;
        }
        if (tab === "links") return <AdminLinks />;
        if (tab === "thresholds") return <AdminThresholds />;
        if (tab === "audit") return <AdminAudit />;
        return <AdminAccounts onRequestsChanged={refreshCounts} />;
    }

    return (
        <AppShell
            items={navItems}
            active={tab}
            onChange={open}
            onLogout={onLogout}
            profile={{ initials: staff ? initialsOf(staff.full_name) : INITIALS[role], avatar: staff?.avatar ?? null, onOpen: () => setProfileOpen(true) }}
            notifications={
                <NotificationBell
                    notifications={role === "admin" ? [] : notices.notifications}
                    readIds={notices.readIds}
                    unread={role === "admin" ? 0 : notices.unread}
                    permission={notices.permission}
                    onSetRead={notices.setRead}
                    onDismiss={notices.dismiss}
                    onEmergency={() => setGuideOpen(true)}
                    onRequestPermission={() => void notices.requestPermission()}
                    emptyMessage={role === "admin" ? "Esta cuenta no recibe avisos clínicos." : undefined}
                />
            }
        >
            {renderTab()}
            {guideOpen ? <EmergencyGuideDialog onClose={() => setGuideOpen(false)} /> : null}
        </AppShell>
    );
}
