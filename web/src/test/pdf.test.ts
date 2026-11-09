// @requirement RF-18
import { describe, expect, it } from "vitest";
import { buildPdf, type PdfBlock } from "../lib/pdf";

const text = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

const table = (rows: number): PdfBlock => ({
    kind: "table",
    columns: [
        { title: "Fecha", width: 120 },
        { title: "Valor", width: 100 },
    ],
    rows: Array.from({ length: rows }, (_, index) => [`2026-11-${index}`, `${100 + index}`]),
});

describe("buildPdf", () => {
    it("is a well-formed PDF: header, trailer and an xref that points at each object", () => {
        const pdf = text(buildPdf([{ kind: "title", text: "Informe" }], { footer: "pie" }));

        expect(pdf.startsWith("%PDF-1.4")).toBe(true);
        expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
        const startxref = Number(/startxref\s+(\d+)/.exec(pdf)![1]);
        expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
        const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) \d{5} n/gm)].map((match) => Number(match[1]));
        entries.forEach((offset, index) => {
            expect(pdf.slice(offset, offset + 12)).toMatch(new RegExp(`^${index + 1} 0 obj`));
        });
    });

    it("declares one object per entry in the xref and a matching size", () => {
        const pdf = text(buildPdf([{ kind: "title", text: "Informe" }], { footer: "pie" }));
        const size = Number(/\/Size (\d+)/.exec(pdf)![1]);
        const entries = [...pdf.matchAll(/^\d{10} \d{5} n/gm)].length;
        expect(size).toBe(entries + 1);
    });

    it("writes the text with the standard fonts and WinAnsi accents as single bytes", () => {
        const bytes = buildPdf([{ kind: "paragraph", text: "Presión sistólica ñ" }], { footer: "" });
        const pdf = text(bytes);

        expect(pdf).toContain("/BaseFont /Helvetica");
        expect(pdf).toContain("/WinAnsiEncoding");
        expect(pdf).toContain("Presi\xF3n sist\xF3lica \xF1");
    });

    it("escapes parentheses and backslashes", () => {
        const pdf = text(buildPdf([{ kind: "paragraph", text: "a (b) \\ c" }], { footer: "" }));
        expect(pdf).toContain("a \\(b\\) \\\\ c");
    });

    it("replaces characters outside Latin-1 instead of corrupting the file", () => {
        const pdf = text(buildPdf([{ kind: "paragraph", text: "ok → fin" }], { footer: "" }));
        expect(pdf).toContain("ok ? fin");
    });

    it("breaks a long table over several pages and repeats the header", () => {
        const pdf = text(buildPdf([table(120)], { footer: "pie" }));
        const pages = (pdf.match(/\/Type \/Page\b/g) ?? []).length;

        expect(pages).toBeGreaterThan(1);
        expect((pdf.match(/\(Fecha\) Tj/g) ?? []).length).toBe(pages);
    });

    it("numbers the pages in the footer", () => {
        const pdf = text(buildPdf([table(120)], { footer: "Registro de automonitoreo" }));
        expect(pdf).toContain("Registro de automonitoreo");
        expect(pdf).toMatch(/P\xE1gina 1 de \d+/);
    });

    it("wraps a long cell instead of running off the page", () => {
        const long = "palabra ".repeat(60);
        const pdf = text(
            buildPdf(
                [{ kind: "table", columns: [{ title: "Texto", width: 150 }], rows: [[long]] }],
                { footer: "" },
            ),
        );
        expect((pdf.match(/\(palabra/g) ?? []).length).toBeGreaterThan(3);
    });

    it("keeps a long label clear of its value and of the next row", () => {
        const pdf = text(
            buildPdf(
                [
                    {
                        kind: "keyValue",
                        rows: [
                            ["Variabilidad sistólica (desviación estándar)", "18"],
                            ["Presión de pulso promedio (mmHg)", "49"],
                        ],
                    },
                ],
                { footer: "" },
            ),
        );
        const placed: { x: number; y: number; raw: string }[] = [];
        const marks = /Tf ([\d.]+) ([\d.]+) Td \(/g;
        for (let mark = marks.exec(pdf); mark; mark = marks.exec(pdf)) {
            let raw = "";
            for (let index = mark.index + mark[0].length; index < pdf.length; index += 1) {
                const char = pdf[index]!;
                if (char === "\\") {
                    raw += pdf[index + 1] ?? "";
                    index += 1;
                    continue;
                }
                if (char === ")") break;
                raw += char;
            }
            placed.push({ x: Number(mark[1]), y: Number(mark[2]), raw });
        }
        const label = placed.find((item) => item.raw.startsWith("Variabilidad"));
        const value = placed.find((item) => item.raw === "18");
        const next = placed.find((item) => item.raw.startsWith("Presi"));
        expect(label).toBeDefined();
        expect(value).toBeDefined();
        expect(next).toBeDefined();
        expect(value!.x).toBeGreaterThan(label!.x + 220);
        expect(value!.y).toBe(label!.y);
        expect(label!.y - next!.y).toBeGreaterThanOrEqual(20);
    });

    it("renders key-value blocks and headings", () => {
        const pdf = text(
            buildPdf(
                [
                    { kind: "heading", text: "Resumen" },
                    { kind: "keyValue", rows: [["Lecturas", "24"]] },
                ],
                { footer: "" },
            ),
        );
        expect(pdf).toContain("(Resumen) Tj");
        expect(pdf).toContain("(Lecturas) Tj");
        expect(pdf).toContain("(24) Tj");
    });
});
