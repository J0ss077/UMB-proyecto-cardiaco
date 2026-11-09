// @requirement RF-18
import { describe, expect, it } from "vitest";
import { buildXlsx } from "../lib/xlsx";

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function files(bytes: Uint8Array): Record<string, string> {
    const dv = view(bytes);
    const eocd = bytes.length - 22;
    const count = dv.getUint16(eocd + 10, true);
    let offset = dv.getUint32(eocd + 16, true);
    const out: Record<string, string> = {};
    for (let index = 0; index < count; index += 1) {
        const size = dv.getUint32(offset + 24, true);
        const nameLength = dv.getUint16(offset + 28, true);
        const extraLength = dv.getUint16(offset + 30, true);
        const commentLength = dv.getUint16(offset + 32, true);
        const localOffset = dv.getUint32(offset + 42, true);
        const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
        const start = localOffset + 30 + dv.getUint16(localOffset + 26, true) + dv.getUint16(localOffset + 28, true);
        out[name] = new TextDecoder().decode(bytes.slice(start, start + size));
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return out;
}

describe("buildXlsx", () => {
    const book = buildXlsx([
        { name: "Resumen", rows: [["Dato", "Valor"], ["Promedio", 135.5], ["Nota", "a < b & \"c\""]] },
        { name: "Lecturas", rows: [["Fecha"], ["2026-11-09 15:00"]], columnWidths: [20] },
    ]);
    const parts = files(book);

    it("contains the parts of a spreadsheet package", () => {
        expect(Object.keys(parts).sort()).toEqual([
            "[Content_Types].xml",
            "_rels/.rels",
            "xl/_rels/workbook.xml.rels",
            "xl/styles.xml",
            "xl/workbook.xml",
            "xl/worksheets/sheet1.xml",
            "xl/worksheets/sheet2.xml",
        ]);
    });

    it("names the sheets in the workbook", () => {
        expect(parts["xl/workbook.xml"]).toContain('name="Resumen"');
        expect(parts["xl/workbook.xml"]).toContain('name="Lecturas"');
    });

    it("writes text as inline strings and numbers as numbers", () => {
        const sheet = parts["xl/worksheets/sheet1.xml"]!;
        expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Promedio</t></is></c>');
        expect(sheet).toContain('<c r="B2"><v>135.5</v></c>');
    });

    it("escapes characters that are special in XML", () => {
        expect(parts["xl/worksheets/sheet1.xml"]).toContain("a &lt; b &amp; &quot;c&quot;");
    });

    it("styles the header row and sets column widths", () => {
        const sheet = parts["xl/worksheets/sheet2.xml"]!;
        expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">');
        expect(sheet).toContain('<col min="1" max="1" width="20" customWidth="1"/>');
    });

    it("keeps accents and the n with tilde intact", () => {
        const accented = files(buildXlsx([{ name: "Síntomas", rows: [["Descripción"], ["niño mareado"]] }]));
        expect(accented["xl/workbook.xml"]).toContain("Síntomas");
        expect(accented["xl/worksheets/sheet1.xml"]).toContain("niño mareado");
    });

    it("cleans sheet names Excel rejects and caps them at 31 characters", () => {
        const odd = files(buildXlsx([{ name: "a/b\\c?d*e[f]g:h" + "x".repeat(40), rows: [["x"]] }]));
        const name = /name="([^"]*)"/.exec(odd["xl/workbook.xml"]!)![1]!;
        expect(name).not.toMatch(/[\\/?*[\]:]/);
        expect(name.length).toBeLessThanOrEqual(31);
    });

    it("leaves null cells empty and handles a sheet without rows", () => {
        const sheet = files(buildXlsx([{ name: "Vacía", rows: [] }, { name: "N", rows: [["a", null, "c"]] }]))["xl/worksheets/sheet2.xml"]!;
        expect(sheet).toContain('r="A1"');
        expect(sheet).not.toContain('r="B1"');
        expect(sheet).toContain('r="C1"');
    });

    it("uses column letters beyond Z", () => {
        const sheet = files(buildXlsx([{ name: "Ancha", rows: [Array.from({ length: 28 }, (_, i) => i)] }]))["xl/worksheets/sheet1.xml"]!;
        expect(sheet).toContain('r="AB1"');
    });
});
