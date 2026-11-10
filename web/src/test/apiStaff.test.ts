// @requirement RF-02
// @requirement RF-15
// @requirement RF-16
// @requirement RF-27
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../api";
import { saveSession } from "../auth";

type Call = [string, RequestInit];

function setup(response: () => Response = () => new Response(null, { status: 204 })) {
    saveSession({ access_token: "tok", refresh_token: "ref", role: "admin" });
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response()));
    const client = createClient({ baseUrl: "http://api", fetcher });
    const last = (): Call => fetcher.mock.calls[fetcher.mock.calls.length - 1] as Call;
    return { client, last, fetcher };
}

const jsonPage = () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
const bodyOf = (call: Call) => JSON.parse(String(call[1].body));
const headersOf = (call: Call) => call[1].headers as Record<string, string>;

describe("staff and admin endpoints", () => {
    beforeEach(() => window.localStorage.clear());

    describe("alerts", () => {
        it("reads an alert and lists with the filters", async () => {
            const { client, last } = setup(jsonPage);

            await client.getAlert("a1");
            expect(last()[0]).toBe("http://api/api/alerts/a1");

            await client.listAlerts({ status: "open", severity: "critical", limit: 50 });
            expect(last()[0]).toBe("http://api/api/alerts?status=open&severity=critical&limit=50");
        });

        it("sends a note with an acknowledgement and a validation only when there is one", async () => {
            const { client, last } = setup();

            await client.acknowledgeAlert("a1");
            expect(last()[0]).toBe("http://api/api/alerts/a1/acknowledge");
            expect(last()[1].method).toBe("POST");
            expect(bodyOf(last())).toEqual({});

            await client.acknowledgeAlert("a1", "Paciente contactado");
            expect(bodyOf(last())).toEqual({ note: "Paciente contactado" });

            await client.validateAlert("a1");
            expect(last()[0]).toBe("http://api/api/alerts/a1/validate");
            expect(bodyOf(last())).toEqual({});
            await client.validateAlert("a1", "Confirmada");
            expect(bodyOf(last())).toEqual({ note: "Confirmada" });
        });

        it("always sends the reason of a dismissal", async () => {
            const { client, last } = setup();

            await client.dismissAlert("a1", "Lectura mal tomada");

            expect(last()[0]).toBe("http://api/api/alerts/a1/dismiss");
            expect(bodyOf(last())).toEqual({ note: "Lectura mal tomada" });
        });
    });

    describe("accounts", () => {
        it("lists a page of accounts", async () => {
            const { client, last } = setup(jsonPage);
            await client.listAccounts({ limit: 200, offset: 400 });
            expect(last()[0]).toBe("http://api/api/accounts?limit=200&offset=400");
        });

        it("changes a role with PATCH, deactivates and closes sessions with POST", async () => {
            const { client, last } = setup();

            await client.setAccountRole("u1", "caregiver");
            expect(last()[0]).toBe("http://api/api/accounts/u1/role");
            expect(last()[1].method).toBe("PATCH");
            expect(bodyOf(last())).toEqual({ role: "caregiver" });

            await client.deactivateAccount("u1");
            expect(last()[0]).toBe("http://api/api/accounts/u1/deactivate");
            expect(last()[1].method).toBe("POST");

            await client.revokeSessions("u1");
            expect(last()[0]).toBe("http://api/api/accounts/u1/revoke-sessions");
            expect(last()[1].method).toBe("POST");
        });
    });

    describe("links", () => {
        it("reads the directory of links", async () => {
            const { client, last } = setup(() => new Response(JSON.stringify({ physicians: [], caregivers: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
            await client.listLinks();
            expect(last()[0]).toBe("http://api/api/admin/links");
        });

        it("assigns and removes a physician", async () => {
            const { client, last } = setup();

            await client.assignPhysician("pat", "med");
            expect(last()[0]).toBe("http://api/api/admin/physicians");
            expect(last()[1].method).toBe("POST");
            expect(bodyOf(last())).toEqual({ patient_user_id: "pat", physician_user_id: "med" });

            await client.removePhysician("pat", "med");
            expect(last()[0]).toBe("http://api/api/admin/physicians/pat/med");
            expect(last()[1].method).toBe("DELETE");
        });

        it("lists, authorizes, changes the scope and revokes a patient's caregivers", async () => {
            const link = {
                id: "link1",
                caregiver_user_id: "cui",
                caregiver_name: "Marta Cuidadora",
                caregiver_email: "cuidador@hta.demo",
                authorized_scope: "readings",
                created_at: "2026-10-31T10:00:00Z",
            };
            const { client, last } = setup(() => new Response(JSON.stringify({ items: [link], total: 1 }), { status: 201, headers: { "Content-Type": "application/json" } }));

            expect(await client.listPatientCaregivers("pat")).toEqual({ items: [link], total: 1 });
            expect(last()[0]).toBe("http://api/api/patients/pat/caregivers");
            expect(last()[1].method).toBe("GET");

            await client.authorizePatientCaregiver("pat", "cuidador@hta.demo", "readings");
            expect(last()[0]).toBe("http://api/api/patients/pat/caregivers");
            expect(last()[1].method).toBe("POST");
            expect(bodyOf(last())).toEqual({ caregiver_email: "cuidador@hta.demo", authorized_scope: "readings" });

            await client.changePatientCaregiverScope("pat", "link1", "minimal");
            expect(last()[0]).toBe("http://api/api/patients/pat/caregivers/link1");
            expect(last()[1].method).toBe("PATCH");
            expect(bodyOf(last())).toEqual({ authorized_scope: "minimal" });

            await client.revokePatientCaregiver("pat", "link1");
            expect(last()[0]).toBe("http://api/api/patients/pat/caregivers/link1");
            expect(last()[1].method).toBe("DELETE");
        });
    });

    describe("thresholds and audit", () => {
        it("reads the configuration and changes only the recipients", async () => {
            const { client, last } = setup(jsonPage);

            await client.listAlertConfig();
            expect(last()[0]).toBe("http://api/api/admin/alert-config");

            await client.updateAlertRecipients("c1", ["patient", "physician"]);
            expect(last()[0]).toBe("http://api/api/admin/alert-config/c1/recipients");
            expect(last()[1].method).toBe("PATCH");
            expect(bodyOf(last())).toEqual({ recipients: ["patient", "physician"] });

            await client.updateAlertThresholds("c1", {
                low_threshold: 90,
                high_threshold: 140,
                critical_low: null,
                critical_high: 180,
            });
            expect(last()[0]).toBe("http://api/api/admin/alert-config/c1");
            expect(bodyOf(last())).toEqual({
                low_threshold: 90,
                high_threshold: 140,
                critical_low: null,
                critical_high: 180,
            });
        });

        it("reads the audit trail with its filters and skips the empty ones", async () => {
            const { client, last } = setup(jsonPage);

            await client.listAudit({ action: "accounts.role_changed", since: "2026-11-01T00:00:00.000Z", limit: 50, offset: 0 });

            const url = new URL(last()[0]);
            expect(url.pathname).toBe("/api/admin/audit");
            expect(url.searchParams.get("action")).toBe("accounts.role_changed");
            expect(url.searchParams.get("since")).toBe("2026-11-01T00:00:00.000Z");
            expect(url.searchParams.get("limit")).toBe("50");
            expect(url.searchParams.get("offset")).toBe("0");
            expect(url.searchParams.has("until")).toBe(false);

            await client.listAudit({ action: undefined });
            expect(new URL(last()[0]).search).toBe("");
        });
    });

    it("sends the session token on every one of them", async () => {
        const { client, last } = setup(jsonPage);

        await client.listAudit();
        expect(headersOf(last()).Authorization).toBe("Bearer tok");
        await client.listAlertConfig();
        expect(headersOf(last()).Authorization).toBe("Bearer tok");
    });
});
