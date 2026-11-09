// @requirement RF-01
import type { TokenPair } from "./types";

const STORAGE_KEY = "hta.session";

export function loadSession(): TokenPair | null {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as TokenPair) : null;
    } catch {
        return null;
    }
}

export function saveSession(pair: TokenPair): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pair));
}

export function clearSession(): void {
    window.localStorage.removeItem(STORAGE_KEY);
}

// Account id carried by the access token (its `sub` claim). It is read only so the
// interface can protect the signed-in account (for example, an administrator cannot
// deactivate themselves); the server remains the authority and verifies the token.
export function currentUserId(): string | null {
    const token = loadSession()?.access_token;
    const payload = token?.split(".")[1];
    if (!payload) return null;
    try {
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
        const claims = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown };
        return typeof claims.sub === "string" ? claims.sub : null;
    } catch {
        return null;
    }
}
