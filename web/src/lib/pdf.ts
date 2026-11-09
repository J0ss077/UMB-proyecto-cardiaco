// @requirement RF-18
// Minimal PDF writer: A4 pages, the standard Helvetica fonts with WinAnsi
// encoding (Latin-1 covers Spanish), text blocks, key-value rows and tables
// that break across pages and repeat their header.

export type PdfBlock =
    | { kind: "title"; text: string }
    | { kind: "masthead"; kicker: string; title: string; subtitle: string }
    | { kind: "heading"; text: string }
    | { kind: "paragraph"; text: string }
    | { kind: "callout"; text: string }
    | { kind: "keyValue"; rows: [string, string][] }
    | { kind: "signature"; label: string }
    | { kind: "table"; columns: { title: string; width: number }[]; rows: string[][] };

export interface PdfOptions {
    footer: string;
}

const PAGE = { width: 595, height: 842 };
const MARGIN = { left: 40, right: 40, top: 50, bottom: 55 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const KEY_WIDTH = 300;
const COLUMN_GAP = 16;

// Only Latin-1 survives into a WinAnsi string; anything else becomes "?".
const latin1 = (text: string) =>
    Array.from(text, (char) => (char.charCodeAt(0) <= 255 ? char : "?")).join("");

const escapePdf = (text: string) => latin1(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

// Widths in thousandths of the font size, wide enough that a line wraps
// before it can run into the next column.
function glyphUnits(char: string): number {
    if (char === " ") return 300;
    if (".,:;'`|!".includes(char)) return 320;
    if ("iltjfr".includes(char)) return 360;
    if ("mwMW@".includes(char)) return 940;
    return 600;
}

function textWidth(value: string, size: number, bold: boolean): number {
    const units = Array.from(value).reduce((sum, char) => sum + glyphUnits(char), 0);
    return (units * size * (bold ? 1.08 : 1)) / 1000;
}

function wrap(text: string, width: number, size: number, bold = false): string[] {
    const room = Math.max(8, width);
    const lines: string[] = [];
    const fits = (value: string) => textWidth(value, size, bold) <= room;
    for (const paragraph of text.split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (!fits(word)) {
                if (line) lines.push(line);
                let chunk = "";
                for (const char of word) {
                    if (chunk && !fits(chunk + char)) {
                        lines.push(chunk);
                        chunk = char;
                    } else {
                        chunk += char;
                    }
                }
                line = chunk;
            } else if (!line) {
                line = word;
            } else if (fits(`${line} ${word}`)) {
                line += ` ${word}`;
            } else {
                lines.push(line);
                line = word;
            }
        }
        lines.push(line);
    }
    return lines.length ? lines : [""];
}

interface Page {
    ops: string[];
}

class Writer {
    pages: Page[] = [{ ops: [] }];
    y = PAGE.height - MARGIN.top;

    get page(): Page {
        return this.pages[this.pages.length - 1]!;
    }

    newPage() {
        this.pages.push({ ops: [] });
        this.y = PAGE.height - MARGIN.top;
    }

    ensure(height: number): boolean {
        if (this.y - height < MARGIN.bottom) {
            this.newPage();
            return true;
        }
        return false;
    }

    text(value: string, x: number, size: number, bold = false) {
        this.page.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${this.y.toFixed(2)} Td (${escapePdf(value)}) Tj ET`);
    }

    rule(x1: number, x2: number, y: number, width = 0.5) {
        this.page.ops.push(`${width} w ${x1} ${y.toFixed(2)} m ${x2} ${y.toFixed(2)} l S`);
    }

    box(x: number, y: number, width: number, height: number, fill: number | null) {
        const paint = fill === null ? "S" : "f";
        const color = fill === null ? "" : `${fill} g `;
        const reset = fill === null ? "" : " 0 g";
        this.page.ops.push(`${color}${x} ${y.toFixed(2)} ${width} ${height} re ${paint}${reset}`);
    }
}

function drawTableHeader(writer: Writer, columns: { title: string; width: number }[]) {
    const cells = columns.map((column) => wrap(column.title, column.width - 10, 9, true));
    const lineCount = Math.max(1, ...cells.map((cell) => cell.length));
    const top = writer.y;
    cells.forEach((cell, index) => {
        const x = MARGIN.left + columns.slice(0, index).reduce((sum, column) => sum + column.width, 0);
        cell.forEach((line, lineIndex) => {
            writer.y = top - lineIndex * 13;
            writer.text(line, x + 4, 9, true);
        });
    });
    writer.y = top - (lineCount - 1) * 13;
    writer.rule(MARGIN.left, MARGIN.left + CONTENT_WIDTH, writer.y - 5);
    writer.y -= 16;
}

export function buildPdf(blocks: PdfBlock[], options: PdfOptions): Uint8Array {
    const writer = new Writer();

    for (const block of blocks) {
        if (block.kind === "title") {
            writer.ensure(34);
            writer.text(block.text, MARGIN.left, 18, true);
            writer.y -= 28;
        } else if (block.kind === "masthead") {
            const inner = CONTENT_WIDTH - 28;
            const kicker = wrap(block.kicker, inner, 9, true);
            const title = wrap(block.title, inner, 16, true);
            const subtitle = wrap(block.subtitle, inner, 9);
            const height = 20 + kicker.length * 13 + title.length * 20 + subtitle.length * 14;
            writer.ensure(height + 14);
            const top = writer.y + 6;
            writer.box(MARGIN.left, top - height, CONTENT_WIDTH, height, 0.93);
            writer.y = top - 16;
            for (const line of kicker) {
                writer.text(line, MARGIN.left + 14, 9, true);
                writer.y -= 13;
            }
            writer.y -= 4;
            for (const line of title) {
                writer.text(line, MARGIN.left + 14, 16, true);
                writer.y -= 20;
            }
            writer.y -= 2;
            for (const line of subtitle) {
                writer.text(line, MARGIN.left + 14, 9);
                writer.y -= 14;
            }
            writer.y = top - height - 16;
        } else if (block.kind === "callout") {
            const lines = wrap(block.text, CONTENT_WIDTH - 28, 10);
            const height = lines.length * 15 + 18;
            writer.ensure(height + 10);
            const top = writer.y + 4;
            writer.box(MARGIN.left, top - height, CONTENT_WIDTH, height, null);
            writer.y = top - 16;
            for (const line of lines) {
                writer.text(line, MARGIN.left + 14, 10);
                writer.y -= 15;
            }
            writer.y = top - height - 14;
        } else if (block.kind === "signature") {
            writer.ensure(40);
            writer.y -= 12;
            writer.text(block.label, MARGIN.left, 10, true);
            writer.rule(MARGIN.left + 160, MARGIN.left + 360, writer.y - 8);
            writer.y -= 26;
        } else if (block.kind === "heading") {
            writer.ensure(40);
            writer.y -= 8;
            writer.text(block.text, MARGIN.left, 13, true);
            writer.rule(MARGIN.left, MARGIN.left + CONTENT_WIDTH, writer.y - 4);
            writer.y -= 20;
        } else if (block.kind === "paragraph") {
            for (const line of wrap(block.text, CONTENT_WIDTH, 10)) {
                writer.ensure(16);
                writer.text(line, MARGIN.left, 10);
                writer.y -= 16;
            }
            writer.y -= 6;
        } else if (block.kind === "keyValue") {
            const valueX = MARGIN.left + KEY_WIDTH + COLUMN_GAP;
            const valueWidth = CONTENT_WIDTH - KEY_WIDTH - COLUMN_GAP;
            for (const [key, value] of block.rows) {
                const keyLines = wrap(key, KEY_WIDTH, 10, true);
                const valueLines = wrap(String(value), valueWidth, 10);
                const lineCount = Math.max(keyLines.length, valueLines.length);
                const height = lineCount * 16 + 6;
                writer.ensure(height);
                const top = writer.y;
                keyLines.forEach((line, index) => {
                    writer.y = top - index * 16;
                    writer.text(line, MARGIN.left, 10, true);
                });
                valueLines.forEach((line, index) => {
                    writer.y = top - index * 16;
                    writer.text(line, valueX, 10);
                });
                writer.y = top - height;
            }
            writer.y -= 4;
        } else {
            const columns = block.columns.map((column) => ({ ...column }));
            const used = columns.reduce((sum, column) => sum + column.width, 0);
            if (used > 0 && used !== CONTENT_WIDTH) {
                const scale = CONTENT_WIDTH / used;
                for (const column of columns) column.width *= scale;
            }
            writer.ensure(36);
            drawTableHeader(writer, columns);
            for (const row of block.rows) {
                const cells = row.map((cell, index) => wrap(cell, (columns[index]?.width ?? 80) - 10, 9));
                const lineCount = Math.max(1, ...cells.map((cell) => cell.length));
                const height = lineCount * 14 + 6;
                if (writer.ensure(height + 18)) drawTableHeader(writer, columns);
                const top = writer.y;
                cells.forEach((cell, index) => {
                    const x = MARGIN.left + columns.slice(0, index).reduce((sum, column) => sum + column.width, 0);
                    cell.forEach((line, lineIndex) => {
                        writer.y = top - lineIndex * 14;
                        writer.text(line, x + 4, 9);
                    });
                });
                writer.y = top - height;
            }
            writer.y -= 10;
        }
    }

    // Footer and page numbers, now that the page count is known.
    const total = writer.pages.length;
    writer.pages.forEach((page, index) => {
        page.ops.push(`BT /F1 8 Tf ${MARGIN.left} 30 Td (${escapePdf(options.footer)}) Tj ET`);
        page.ops.push(`BT /F1 8 Tf ${PAGE.width - MARGIN.right - 70} 30 Td (${escapePdf(`Página ${index + 1} de ${total}`)}) Tj ET`);
    });

    // Objects: 1 catalog, 2 pages, 3 and 4 fonts, then a (page, content) pair per page.
    const objects: string[] = [];
    const pageIds = writer.pages.map((_, index) => 5 + index * 2);
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${total} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    writer.pages.forEach((page, index) => {
        const pageId = pageIds[index]!;
        const stream = page.ops.join("\n");
        objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
        objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    let body = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id += 1) {
        offsets[id] = body.length;
        body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = body.length;
    body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    // Every character is single-byte by construction, so offsets equal string lengths.
    return Uint8Array.from(body, (char) => char.charCodeAt(0) & 0xff);
}
