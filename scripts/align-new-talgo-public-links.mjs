import { readFile, writeFile } from "node:fs/promises";

const homePath = new URL("../public/new-talgo/index.html", import.meta.url);
const visitPath = new URL("../public/new-talgo/visitanos.html", import.meta.url);
let home = await readFile(homePath, "utf8");
// The published category IDs come from the original database, so the static
// homepage must never assume a matching hard-coded anchor.
home = home.replace(/href="carta\.html#[^"]+"/g, 'href="carta.html"');
home = home.replace(/Ver categoría/g, "Ver carta");
await writeFile(homePath, home, "utf8");
let visit = await readFile(visitPath, "utf8");
visit = visit.replace("Ver carta provisional", "Ver carta");
await writeFile(visitPath, visit, "utf8");
