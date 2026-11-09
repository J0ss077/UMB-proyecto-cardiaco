// @requirement RF-18
import { describe, expect, it } from "vitest";
import { createZip, crc32 } from "../lib/zip";

const encode = (text: string) => new TextEncoder().encode(text);
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// Reads the central directory back, the way any unzip tool would.
function readZip(bytes: Uint8Array) {
    const dv = view(bytes);
    const eocd = bytes.length - 22;
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
    const count = dv.getUint16(eocd + 10, true);
    let offset = dv.getUint32(eocd + 16, true);
    const entries: { name: string; data: Uint8Array; crc: number }[] = [];
    for (let index = 0; index < count; index += 1) {
        expect(dv.getUint32(offset, true)).toBe(0x02014b50);
        const crc = dv.getUint32(offset + 16, true);
        const size = dv.getUint32(offset + 24, true);
        const nameLength = dv.getUint16(offset + 28, true);
        const extraLength = dv.getUint16(offset + 30, true);
        const commentLength = dv.getUint16(offset + 32, true);
        const localOffset = dv.getUint32(offset + 42, true);
        const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
        expect(dv.getUint32(localOffset, true)).toBe(0x04034b50);
        const localName = dv.getUint16(localOffset + 26, true);
        const localExtra = dv.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + localName + localExtra;
        entries.push({ name, data: bytes.slice(start, start + size), crc });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

describe("crc32", () => {
    it("matches the standard check value", () => {
        expect(crc32(encode("123456789"))).toBe(0xcbf43926);
    });

    it("is zero for empty input", () => {
        expect(crc32(new Uint8Array())).toBe(0);
    });
});

describe("createZip", () => {
    it("stores every file readably, with its checksum", () => {
        const zip = createZip([
            { name: "a.txt", data: encode("hola") },
            { name: "dir/b.xml", data: encode("<x>ñ</x>") },
        ]);

        const entries = readZip(zip);
        expect(entries.map((entry) => entry.name)).toEqual(["a.txt", "dir/b.xml"]);
        expect(new TextDecoder().decode(entries[0]!.data)).toBe("hola");
        expect(new TextDecoder().decode(entries[1]!.data)).toBe("<x>ñ</x>");
        expect(entries[0]!.crc).toBe(crc32(encode("hola")));
    });

    it("starts with the local header signature", () => {
        expect(view(createZip([{ name: "a", data: encode("x") }])).getUint32(0, true)).toBe(0x04034b50);
    });

    it("handles an empty file", () => {
        expect(readZip(createZip([{ name: "empty", data: new Uint8Array() }]))[0]!.data).toHaveLength(0);
    });
});
