// @requirement RF-18
// Minimal ZIP writer: stores files uncompressed (method 0). A spreadsheet
// package is a handful of small XML files, so compression would add code and
// nothing the reader notices.

const TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        table[index] = value >>> 0;
    }
    return table;
})();

export function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
    name: string;
    data: Uint8Array;
}

// Fixed timestamp (1980-01-01): the package content must not depend on the clock.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const UTF8_FLAG = 0x0800;

export function createZip(files: ZipFile[]): Uint8Array {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const crc = crc32(file.data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, UTF8_FLAG, true);
        local.setUint16(8, 0, true);
        local.setUint16(10, DOS_TIME, true);
        local.setUint16(12, DOS_DATE, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, file.data.length, true);
        local.setUint32(22, file.data.length, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        chunks.push(new Uint8Array(local.buffer), name, file.data);

        const entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, 0x02014b50, true);
        entry.setUint16(4, 20, true);
        entry.setUint16(6, 20, true);
        entry.setUint16(8, UTF8_FLAG, true);
        entry.setUint16(10, 0, true);
        entry.setUint16(12, DOS_TIME, true);
        entry.setUint16(14, DOS_DATE, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, file.data.length, true);
        entry.setUint32(24, file.data.length, true);
        entry.setUint16(28, name.length, true);
        entry.setUint32(42, offset, true);
        central.push(new Uint8Array(entry.buffer), name);

        offset += 30 + name.length + file.data.length;
    }

    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    const all = [...chunks, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((sum, chunk) => sum + chunk.length, 0));
    let position = 0;
    for (const chunk of all) {
        out.set(chunk, position);
        position += chunk.length;
    }
    return out;
}
