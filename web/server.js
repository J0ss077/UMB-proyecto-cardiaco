import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "index.html"));
const port = Number(process.env.PORT ?? 3000);

createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(page);
}).listen(port, "0.0.0.0", () => {
    console.log(`Interfaz web escuchando en el puerto ${port}.`);
});
