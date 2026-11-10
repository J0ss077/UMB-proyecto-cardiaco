// @requirement RF-01
// @requirement RF-02
// @requirement RF-05
// @requirement RF-15
// @requirement RF-16
// @requirement RF-19
// @requirement RF-21
// @requirement RF-24
// @requirement RF-27
import { clearSession, loadSession, saveSession } from "./auth";
import type {
    Account,
    Alert,
    AlertConfigRow,
    AlertDetail,
    AlertListParams,
    AuditEvent,
    AuditListParams,
    ThresholdUpdate,
    ConsentStatus,
    ConsentDocument,
    Consultation,
    ConsultationInput,
    CheckupReply,
    MeetLink,
    ConsultationListParams,
    CreatedId,
    LinkDirectory,
    ListParams,
    LoginBody,
    Page,
    Patient,
    PatientCaregiver,
    Profile,
    ProfileUpdate,
    PasswordChangeInput,
    PasswordChangeStatus,
    PasswordRequest,
    StaffProfile,
    StaffProfileUpdate,
    Reading,
    ReadingInput,
    Recipient,
    ReadingsSummary,
    RegisterBody,
    Symptom,
    SymptomInput,
    TokenPair,
} from "./types";

export const CONSENT_REQUIRED_DETAIL = "No hay consentimiento informado vigente";

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "ApiError";
    }

    get consentRequired(): boolean {
        return this.status === 403 && this.message === CONSENT_REQUIRED_DETAIL;
    }
}

interface ClientOptions {
    baseUrl: string;
    fetcher?: typeof fetch;
    onSessionExpired?: () => void;
}

interface RequestOptions {
    method?: string;
    query?: object;
    body?: unknown;
    authenticated?: boolean;
}

function describeDetail(detail: unknown): string {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
        return detail
            .map((entry: { loc?: unknown[]; msg?: string }) => {
                const field = Array.isArray(entry.loc) ? entry.loc.filter((part) => part !== "body").join(".") : "";
                return field ? `${field}: ${entry.msg ?? "valor inválido"}` : (entry.msg ?? "valor inválido");
            })
            .join("; ");
    }
    return "No se pudo completar la solicitud";
}

function buildQuery(query: object | undefined): string {
    if (!query) return "";
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
    }
    const text = params.toString();
    return text ? `?${text}` : "";
}

export function createClient({ baseUrl, fetcher = (...args) => fetch(...args), onSessionExpired }: ClientOptions) {
    let refreshing: Promise<boolean> | null = null;

    async function send(path: string, options: RequestOptions): Promise<Response> {
        const headers: Record<string, string> = {};
        if (options.body !== undefined) headers["Content-Type"] = "application/json";
        if (options.authenticated) {
            const session = loadSession();
            if (session) headers.Authorization = `Bearer ${session.access_token}`;
        }
        return fetcher(`${baseUrl}${path}${buildQuery(options.query)}`, {
            method: options.method ?? "GET",
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });
    }

    // Returns false only when the refresh token is no longer accepted. Any other
    // failure is a server or permission problem, not the end of the session: it is
    // surfaced as an ApiError so the caller keeps the tokens and shows the error.
    async function rotate(): Promise<boolean> {
        const session = loadSession();
        if (!session) return false;
        const response = await send("/api/auth/refresh", {
            method: "POST",
            body: { refresh_token: session.refresh_token },
        });
        if (response.status === 401) return false;
        if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { detail?: unknown };
            throw new ApiError(response.status, describeDetail(payload.detail));
        }
        saveSession((await response.json()) as TokenPair);
        return true;
    }

    // A single in-flight rotation: a rotated refresh token cannot be presented twice.
    function rotateOnce(): Promise<boolean> {
        refreshing ??= rotate().finally(() => {
            refreshing = null;
        });
        return refreshing;
    }

    async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        const authenticated = options.authenticated ?? true;
        let response = await send(path, { ...options, authenticated });

        if (response.status === 401 && authenticated) {
            let expired = !(await rotateOnce());
            if (!expired) {
                response = await send(path, { ...options, authenticated });
                // A rotation that succeeds but whose replay is rejected again leaves
                // unusable tokens in storage; sign out instead of showing an empty screen.
                expired = response.status === 401;
            }
            if (expired) {
                clearSession();
                onSessionExpired?.();
            }
        }

        if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { detail?: unknown };
            throw new ApiError(response.status, describeDetail(payload.detail));
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
    }

    return {
        login: (body: LoginBody) =>
            request<TokenPair>("/api/auth/login", { method: "POST", body, authenticated: false }),
        register: (body: RegisterBody) =>
            request<CreatedId>("/api/accounts/register", { method: "POST", body, authenticated: false }),
        logout: async () => {
            const session = loadSession();
            if (session) {
                await request<void>("/api/auth/logout", {
                    method: "POST",
                    body: { refresh_token: session.refresh_token },
                    authenticated: false,
                }).catch(() => undefined);
            }
            clearSession();
        },
        getConsent: (requiredVersion?: number) =>
            request<ConsentStatus>("/api/consent", { query: { required_version: requiredVersion } }),
        getConsentDocument: () => request<ConsentDocument>("/api/consent/document"),
        acceptConsent: () => request<CreatedId>("/api/consent", { method: "POST" }),
        revokeConsent: () => request<void>("/api/consent/revoke", { method: "POST" }),
        getProfile: () => request<Profile>("/api/profile"),
        updateProfile: (body: ProfileUpdate) => request<Profile>("/api/profile", { method: "PATCH", body }),
        getStaffProfile: () => request<StaffProfile>("/api/staff/profile"),
        updateStaffProfile: (body: StaffProfileUpdate) =>
            request<StaffProfile>("/api/staff/profile", { method: "PATCH", body }),
        getPasswordChange: () => request<PasswordChangeStatus>("/api/account/password-change"),
        requestPasswordChange: (body: PasswordChangeInput) =>
            request<PasswordChangeStatus>("/api/account/password-change", { method: "POST", body }),
        cancelPasswordChange: () => request<void>("/api/account/password-change", { method: "DELETE" }),
        listPasswordRequests: () => request<{ items: PasswordRequest[] }>("/api/admin/password-requests"),
        approvePasswordRequest: (userId: string) =>
            request<void>(`/api/admin/password-requests/${userId}/approve`, { method: "POST" }),
        rejectPasswordRequest: (userId: string) =>
            request<void>(`/api/admin/password-requests/${userId}/reject`, { method: "POST" }),
        createConsultation: (input: ConsultationInput) =>
            request<Consultation>("/api/consultations", { method: "POST", body: input }),
        listRecipients: () => request<Page<Recipient>>("/api/consultations/recipients"),
        listConsultations: (params: ConsultationListParams = {}) =>
            request<Page<Consultation>>("/api/consultations", { query: params }),
        sendMeetLink: (id: string, body: MeetLink) =>
            request<Consultation>(`/api/consultations/${id}/meet`, { method: "POST", body }),
        completeConsultation: (id: string, body: CheckupReply) =>
            request<Consultation>(`/api/consultations/${id}/complete`, { method: "POST", body }),
        listPatients: (params: ListParams = {}) => request<Page<Patient>>("/api/patients", { query: params }),
        listReadings: (params: ListParams = {}) => request<Page<Reading>>("/api/readings", { query: params }),
        getReadingsSummary: (patientId?: string) =>
            request<ReadingsSummary>("/api/readings/summary", { query: { patient_id: patientId } }),
        createReading: (body: ReadingInput) => request<Reading>("/api/readings", { method: "POST", body }),
        listSymptoms: (params: ListParams = {}) => request<Page<Symptom>>("/api/symptoms", { query: params }),
        createSymptom: (body: SymptomInput) => request<CreatedId>("/api/symptoms", { method: "POST", body }),
        listAlerts: (params: AlertListParams = {}) => request<Page<Alert>>("/api/alerts", { query: params }),
        getAlert: (id: string) => request<AlertDetail>(`/api/alerts/${id}`),
        acknowledgeAlert: (id: string, note?: string) =>
            request<void>(`/api/alerts/${id}/acknowledge`, { method: "POST", body: note ? { note } : {} }),
        validateAlert: (id: string, note?: string) =>
            request<void>(`/api/alerts/${id}/validate`, { method: "POST", body: note ? { note } : {} }),
        dismissAlert: (id: string, note: string) =>
            request<void>(`/api/alerts/${id}/dismiss`, { method: "POST", body: { note } }),
        listAccounts: (params: ListParams = {}) => request<Page<Account>>("/api/accounts", { query: params }),
        setAccountRole: (id: string, role: string) =>
            request<void>(`/api/accounts/${id}/role`, { method: "PATCH", body: { role } }),
        deactivateAccount: (id: string) => request<void>(`/api/accounts/${id}/deactivate`, { method: "POST" }),
        revokeSessions: (id: string) => request<void>(`/api/accounts/${id}/revoke-sessions`, { method: "POST" }),
        listLinks: () => request<LinkDirectory>("/api/admin/links"),
        assignPhysician: (patientUserId: string, physicianUserId: string) =>
            request<void>("/api/admin/physicians", {
                method: "POST",
                body: { patient_user_id: patientUserId, physician_user_id: physicianUserId },
            }),
        removePhysician: (patientUserId: string, physicianUserId: string) =>
            request<void>(`/api/admin/physicians/${patientUserId}/${physicianUserId}`, { method: "DELETE" }),
        listPatientCaregivers: (patientId: string) => request<Page<PatientCaregiver>>(`/api/patients/${patientId}/caregivers`),
        authorizePatientCaregiver: (patientId: string, caregiverEmail: string, scope: PatientCaregiver["authorized_scope"]) =>
            request<PatientCaregiver>(`/api/patients/${patientId}/caregivers`, {
                method: "POST",
                body: { caregiver_email: caregiverEmail, authorized_scope: scope },
            }),
        changePatientCaregiverScope: (patientId: string, linkId: string, scope: PatientCaregiver["authorized_scope"]) =>
            request<void>(`/api/patients/${patientId}/caregivers/${linkId}`, {
                method: "PATCH",
                body: { authorized_scope: scope },
            }),
        revokePatientCaregiver: (patientId: string, linkId: string) =>
            request<void>(`/api/patients/${patientId}/caregivers/${linkId}`, { method: "DELETE" }),
        listAlertConfig: () => request<Page<AlertConfigRow>>("/api/admin/alert-config"),
        updateAlertRecipients: (id: string, recipients: string[]) =>
            request<void>(`/api/admin/alert-config/${id}/recipients`, { method: "PATCH", body: { recipients } }),
        updateAlertThresholds: (id: string, body: ThresholdUpdate) =>
            request<void>(`/api/admin/alert-config/${id}`, { method: "PATCH", body }),
        listAudit: (params: AuditListParams = {}) => request<Page<AuditEvent>>("/api/admin/audit", { query: params }),
    };
}

export type ApiClient = ReturnType<typeof createClient>;

let sessionExpiredListener: (() => void) | null = null;

export function setSessionExpiredListener(listener: (() => void) | null): void {
    sessionExpiredListener = listener;
}

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const api: ApiClient = createClient({
    baseUrl,
    onSessionExpired: () => sessionExpiredListener?.(),
});

export const {
    login,
    register,
    logout,
    getConsent,
    getConsentDocument,
    acceptConsent,
    revokeConsent,
    getProfile,
    updateProfile,
    getStaffProfile,
    getPasswordChange,
    requestPasswordChange,
    cancelPasswordChange,
    listPasswordRequests,
    approvePasswordRequest,
    rejectPasswordRequest,
    updateStaffProfile,
    createConsultation,
    listRecipients,
    listConsultations,
    sendMeetLink,
    completeConsultation,
    listPatients,
    listReadings,
    getReadingsSummary,
    createReading,
    listSymptoms,
    createSymptom,
    listAlerts,
    getAlert,
    acknowledgeAlert,
    validateAlert,
    dismissAlert,
    listAccounts,
    setAccountRole,
    deactivateAccount,
    revokeSessions,
    listLinks,
    assignPhysician,
    removePhysician,
    listPatientCaregivers,
    authorizePatientCaregiver,
    changePatientCaregiverScope,
    revokePatientCaregiver,
    listAlertConfig,
    updateAlertRecipients,
    updateAlertThresholds,
    listAudit,
} = api;
