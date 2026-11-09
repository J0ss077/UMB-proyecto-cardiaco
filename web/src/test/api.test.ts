// @requirement RF-01
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createClient } from "../api";
import { clearSession, loadSession, saveSession } from "../auth";

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("api client", () => {
    beforeEach(() => {
        clearSession();
    });

    it("sends the bearer token on authenticated requests", async () => {
        saveSession({ access_token: "a1", refresh_token: "r1", role: "patient" });
        const fetcher = vi.fn().mockResolvedValue(json(200, { items: [], total: 0 }));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await client.listReadings({ limit: 5 });

        const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://api/api/readings?limit=5");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer a1");
    });

    it("rotates once on 401 and repeats the original request once", async () => {
        saveSession({ access_token: "old", refresh_token: "r1", role: "patient" });
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(json(401, { detail: "Sesión inválida o expirada" }))
            .mockResolvedValueOnce(json(200, { access_token: "new", refresh_token: "r2", role: "patient" }))
            .mockResolvedValueOnce(json(200, { items: [], total: 0 }));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await client.listReadings();

        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(loadSession()?.refresh_token).toBe("r2");
    });

    it("clears the session and signals expiry when rotation fails", async () => {
        saveSession({ access_token: "old", refresh_token: "r1", role: "patient" });
        const onExpired = vi.fn();
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(json(401, { detail: "Sesión inválida o expirada" }))
            .mockResolvedValueOnce(json(401, { detail: "Sesión inválida o expirada" }));
        const client = createClient({ baseUrl: "http://api", fetcher, onSessionExpired: onExpired });

        await expect(client.listReadings()).rejects.toBeInstanceOf(ApiError);

        expect(loadSession()).toBeNull();
        expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it("does not retry a request more than once", async () => {
        saveSession({ access_token: "old", refresh_token: "r1", role: "patient" });
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(json(401, { detail: "x" }))
            .mockResolvedValueOnce(json(200, { access_token: "n", refresh_token: "r2", role: "patient" }))
            .mockResolvedValueOnce(json(401, { detail: "x" }));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await expect(client.listReadings()).rejects.toBeInstanceOf(ApiError);
        expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it("surfaces the Spanish detail of an application error", async () => {
        const fetcher = vi.fn().mockResolvedValue(json(409, { detail: "El correo ya está registrado" }));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await expect(
            client.register({ email: "a@b.co", password: "x", full_name: "A", birth_date: "1970-01-01" }),
        ).rejects.toMatchObject({ status: 409, message: "El correo ya está registrado" });
    });

    it("flattens a 422 validation list into one message", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValue(json(422, { detail: [{ type: "missing", loc: ["body", "password"], msg: "Field required" }] }));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await expect(client.login({ email: "a@b.co", password: "" })).rejects.toMatchObject({
            status: 422,
            message: expect.stringContaining("password"),
        });
    });

    it("flags the missing-consent 403 apart from a permission 403", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        const fetcher = vi.fn().mockResolvedValue(json(403, { detail: "No hay consentimiento informado vigente" }));
        const client = createClient({ baseUrl: "http://api", fetcher });

        const error = await client.createReading({ systolic: 120, diastolic: 80 }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).consentRequired).toBe(true);
    });

    it("handles 204 without a body", async () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "patient" });
        const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await expect(client.revokeConsent()).resolves.toBeUndefined();
    });

    it("reads and patches the staff profile with the bearer token", async () => {
        saveSession({ access_token: "a1", refresh_token: "r1", role: "physician" });
        const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json(200, { user_id: "u1" })));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await client.getStaffProfile();
        await client.updateStaffProfile({ specialty: null });

        const [readUrl, readInit] = fetcher.mock.calls[0] as [string, RequestInit];
        expect(readUrl).toBe("http://api/api/staff/profile");
        expect(readInit.method).toBe("GET");
        const [patchUrl, patchInit] = fetcher.mock.calls[1] as [string, RequestInit];
        expect(patchUrl).toBe("http://api/api/staff/profile");
        expect(patchInit.method).toBe("PATCH");
        expect(JSON.parse(patchInit.body as string)).toEqual({ specialty: null });
    });

    it("reads and patches the profile with the bearer token", async () => {
        saveSession({ access_token: "a1", refresh_token: "r1", role: "patient" });
        const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json(200, { user_id: "u1" })));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await client.getProfile();
        await client.updateProfile({ phone: null });

        const [readUrl, readInit] = fetcher.mock.calls[0] as [string, RequestInit];
        expect(readUrl).toBe("http://api/api/profile");
        expect(readInit.method).toBe("GET");
        const [, patchInit] = fetcher.mock.calls[1] as [string, RequestInit];
        expect(patchInit.method).toBe("PATCH");
        expect(patchInit.body).toBe(JSON.stringify({ phone: null }));
    });

    it("sends, lists and answers consultations", async () => {
        saveSession({ access_token: "a1", refresh_token: "r1", role: "patient" });
        const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json(200, { items: [], total: 0 })));
        const client = createClient({ baseUrl: "http://api", fetcher });

        await client.createConsultation({ message: "hola", reason: "other", onset: "today" });
        await client.listRecipients();
        await client.listConsultations({ status: "pending", limit: 1 });
        await client.sendMeetLink("c1", { meet_url: "https://meet.google.com/abc-defg-hij" });
        await client.completeConsultation("c1", {
            response: "ok",
            checkup_general: "Estable",
            checkup_pressure: "150/95",
            checkup_symptoms: "Mareo",
            checkup_conduct: "Registro diario",
        });

        const calls = fetcher.mock.calls as [string, RequestInit][];
        expect(calls[0]![0]).toBe("http://api/api/consultations");
        expect(calls[0]![1].method).toBe("POST");
        expect(calls[0]![1].body).toBe(JSON.stringify({ message: "hola", reason: "other", onset: "today" }));
        expect(calls[1]![0]).toBe("http://api/api/consultations/recipients");
        expect(calls[2]![0]).toBe("http://api/api/consultations?status=pending&limit=1");
        expect(calls[3]![0]).toBe("http://api/api/consultations/c1/meet");
        expect(calls[3]![1].body).toBe(JSON.stringify({ meet_url: "https://meet.google.com/abc-defg-hij" }));
        expect(calls[4]![0]).toBe("http://api/api/consultations/c1/complete");
        expect(calls[4]![1].body).toBe(
            JSON.stringify({
                response: "ok",
                checkup_general: "Estable",
                checkup_pressure: "150/95",
                checkup_symptoms: "Mareo",
                checkup_conduct: "Registro diario",
            }),
        );
    });
});
