// @requirement none
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("interface assets", () => {
    it("serves the typography with the system stack instead of a third-party font", () => {
        const html = read("../../index.html");
        expect(html).not.toMatch(/fonts\.googleapis\.com/);
        expect(html).not.toMatch(/fonts\.gstatic\.com/);
        expect(html).not.toMatch(/<link[^>]+https:\/\//);

        const config = read("../../tailwind.config.js");
        expect(config).toContain('"system-ui"');
        expect(config).not.toContain('"Inter"');
    });
});
