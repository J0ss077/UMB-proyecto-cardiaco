// @requirement RF-02
import { listAccounts } from "../api";
import type { Account } from "../types";

const PAGE_SIZE = 200;

// The directory is paged by the API; the administrator's lists and counts need all of it.
export async function fetchAllAccounts(): Promise<Account[]> {
    const all: Account[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await listAccounts({ limit: PAGE_SIZE, offset });
        all.push(...page.items);
        if (page.items.length === 0 || all.length >= page.total) return all;
    }
}
