// @requirement RF-01
import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, currentUserId, loadSession, saveSession } from "../auth";

const jwt = (payload: object) => {
    // JWT segments are base64url over UTF-8 bytes.
    const encode = (value: object) =>
        btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
};

describe("session storage", () => {
    beforeEach(() => window.localStorage.clear());

    it("round-trips a token pair and clears it", () => {
        saveSession({ access_token: "a", refresh_token: "r", role: "admin" });
        expect(loadSession()).toEqual({ access_token: "a", refresh_token: "r", role: "admin" });

        clearSession();
        expect(loadSession()).toBeNull();
    });

    it("treats corrupt storage as no session", () => {
        window.localStorage.setItem("hta.session", "{broken");
        expect(loadSession()).toBeNull();
    });
});

describe("currentUserId", () => {
    beforeEach(() => window.localStorage.clear());

    it("reads the account id from the access token", () => {
        saveSession({ access_token: jwt({ sub: "11111111-2222-3333-4444-555555555555", role: "admin" }), refresh_token: "r", role: "admin" });
        expect(currentUserId()).toBe("11111111-2222-3333-4444-555555555555");
    });

    it("reads an id whose base64 needed url-safe characters", () => {
        saveSession({ access_token: jwt({ sub: "ñandú?>>", role: "admin" }), refresh_token: "r", role: "admin" });
        expect(currentUserId()).toBe("ñandú?>>");
    });

    it("is null without a session", () => {
        expect(currentUserId()).toBeNull();
    });

    it("is null for a token that is not a JWT or has no subject", () => {
        saveSession({ access_token: "not-a-jwt", refresh_token: "r", role: "admin" });
        expect(currentUserId()).toBeNull();
        saveSession({ access_token: jwt({ role: "admin" }), refresh_token: "r", role: "admin" });
        expect(currentUserId()).toBeNull();
        saveSession({ access_token: `a.${btoa("{not json")}.c`, refresh_token: "r", role: "admin" });
        expect(currentUserId()).toBeNull();
    });
});
