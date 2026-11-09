import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "dist");
const port = Number(process.env.PORT ?? 3000);

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".json": "application/json; charset=utf-8",
};

async function send(response, file) {
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(body);
}

createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const file = normalize(join(root, pathname));
    try {
        if (!file.startsWith(root) || pathname.endsWith("/")) throw new Error("fallback");
        await send(response, file);
    } catch {
        // Single-page app: any route that is not a file serves the shell.
        await send(response, join(root, "index.html"));
    }
}).listen(port, "0.0.0.0", () => {
    console.log(`Interfaz web escuchando en el puerto ${port}.`);
});
