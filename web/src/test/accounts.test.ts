// @requirement RF-02
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllAccounts } from "../lib/accounts";
import type { Account } from "../types";

const mocks = vi.hoisted(() => ({ listAccounts: vi.fn() }));

vi.mock("../api", () => ({ listAccounts: mocks.listAccounts }));

const account = (index: number): Account => ({
    id: `a${index}`,
    email: `u${index}@hta.demo`,
    full_name: `Usuario ${index}`,
    role: "patient",
    active: true,
    consent: null,
    active_sessions: 0,
});

describe("fetchAllAccounts", () => {
    beforeEach(() => {
        mocks.listAccounts.mockReset();
    });

    it("returns a single page as it is", async () => {
        mocks.listAccounts.mockResolvedValue({ items: [account(1), account(2)], total: 2 });

        const result = await fetchAllAccounts();

        expect(result).toHaveLength(2);
        expect(mocks.listAccounts).toHaveBeenCalledTimes(1);
        expect(mocks.listAccounts).toHaveBeenCalledWith({ limit: 200, offset: 0 });
    });

    it("keeps asking until every account of the directory is loaded", async () => {
        const all = Array.from({ length: 450 }, (_, index) => account(index));
        mocks.listAccounts.mockImplementation(({ offset = 0, limit }: { offset?: number; limit: number }) =>
            Promise.resolve({ items: all.slice(offset, offset + limit), total: 450 }),
        );

        const result = await fetchAllAccounts();

        expect(result).toHaveLength(450);
        expect(mocks.listAccounts.mock.calls.map((call) => (call[0] as { offset: number }).offset)).toEqual([0, 200, 400]);
    });

    it("stops on an empty page even if the total says there is more", async () => {
        mocks.listAccounts.mockResolvedValueOnce({ items: [account(1)], total: 5 }).mockResolvedValueOnce({ items: [], total: 5 });

        expect(await fetchAllAccounts()).toHaveLength(1);
    });

    it("lets a failure reach the caller", async () => {
        mocks.listAccounts.mockRejectedValue(new Error("boom"));
        await expect(fetchAllAccounts()).rejects.toThrow("boom");
    });
});
