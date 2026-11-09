// @requirement RF-18
// Minimal .xlsx writer (Office Open XML): text as inline strings, numbers as
// numbers, a bold style for the header row and optional column widths.
import { createZip } from "./zip";

export type Cell = string | number | null;

export interface SheetData {
    name: string;
    rows: Cell[][];
    // Bold first row. On by default.
    header?: boolean;
    columnWidths?: number[];
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const escapeXml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function columnLetter(index: number): string {
    let letters = "";
    let rest = index + 1;
    while (rest > 0) {
        const remainder = (rest - 1) % 26;
        letters = String.fromCharCode(65 + remainder) + letters;
        rest = Math.floor((rest - 1) / 26);
    }
    return letters;
}

// Excel rejects \ / ? * [ ] : in sheet names and anything over 31 characters.
const sheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Hoja";

function sheetXml(sheet: SheetData): string {
    const header = sheet.header ?? true;
    const cols = sheet.columnWidths?.length
        ? `<cols>${sheet.columnWidths
              .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
              .join("")}</cols>`
        : "";
    const rows = sheet.rows
        .map((row, rowIndex) => {
            const cells = row
                .map((cell, columnIndex) => {
                    if (cell === null) return "";
                    const ref = `${columnLetter(columnIndex)}${rowIndex + 1}`;
                    if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
                    const style = header && rowIndex === 0 ? ' s="1"' : "";
                    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
                })
                .join("");
            return `<row r="${rowIndex + 1}">${cells}</row>`;
        })
        .join("");
    return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function buildXlsx(sheets: SheetData[]): Uint8Array {
    const encoder = new TextEncoder();
    const names = sheets.map((sheet) => sheetName(sheet.name));

    const contentTypes = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map(
            (_, index) =>
                `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("")}</Types>`;

    const rootRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

    const workbook = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
        .join("")}</sheets></workbook>`;

    const workbookRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
            (_, index) =>
                `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

    return createZip([
        { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
        { name: "_rels/.rels", data: encoder.encode(rootRels) },
        { name: "xl/workbook.xml", data: encoder.encode(workbook) },
        { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels) },
        { name: "xl/styles.xml", data: encoder.encode(STYLES) },
        ...sheets.map((sheet, index) => ({
            name: `xl/worksheets/sheet${index + 1}.xml`,
            data: encoder.encode(sheetXml(sheet)),
        })),
    ]);
}
