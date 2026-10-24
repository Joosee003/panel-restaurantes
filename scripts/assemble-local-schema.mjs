import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "local-schema");
const generated = join(root, "generated");
const groups = [
  ["tables", 8], ["functions", 29], ["private-functions", 4],
  ["defaults", 4], ["constraints", 10], ["indexes", 7],
  ["triggers", 4], ["policies", 7],
];
const extensionFunctions = JSON.parse(await readFile(join(generated, "extension-functions.json"), "utf8"));
const extensionNames = new Set(extensionFunctions.map(({ proname }) => proname));
const pieces = [
  "BEGIN;",
  "SET LOCAL check_function_bodies = off;",
  "CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA public;",
  await readFile(join(generated, "00-schemas-domains.sql"), "utf8"),
];
for (const [prefix, count] of groups.slice(0, 3)) {
  for (let i = 0; i < count; i++) {
    let sql = await readFile(join(generated, `${prefix}-${String(i).padStart(2, "0")}.sql`), "utf8");
    if (prefix === "functions" || prefix === "private-functions") {
      sql = sql.split(/(?=CREATE OR REPLACE FUNCTION )/g).filter((block) => {
        const match = /^CREATE OR REPLACE FUNCTION\s+public\.([a-zA-Z_][a-zA-Z_0-9]*)\(/.exec(block);
        return !match || !extensionNames.has(match[1]);
      }).map((block) => {
        if (!block.startsWith("CREATE OR REPLACE FUNCTION ")) return block;
        const definition = block.trimEnd();
        return `${definition.endsWith(";") ? definition : definition + ";"}\n\n`;
      }).join("");
    }
    pieces.push(sql);
  }
}
for (const [prefix, count] of groups.slice(3, 4)) {
  for (let i = 0; i < count; i++) pieces.push(await readFile(join(generated, `${prefix}-${String(i).padStart(2, "0")}.sql`), "utf8"));
}
const constraints = [];
for (let i = 0; i < 10; i++) constraints.push(await readFile(join(generated, `constraints-${String(i).padStart(2, "0")}.sql`), "utf8"));
pieces.push(constraints.join("\n").split("\n").filter((line) => !line.includes("FOREIGN KEY")).join("\n"));
for (let i = 0; i < 7; i++) pieces.push(await readFile(join(generated, `indexes-${String(i).padStart(2, "0")}.sql`), "utf8"));
pieces.push(await readFile(join(generated, "indexes-referenced.sql"), "utf8"));
pieces.push(constraints.join("\n").split("\n").filter((line) => line.includes("FOREIGN KEY")).join("\n"));
pieces.push(await readFile(join(generated, "views.sql"), "utf8"));
for (let i = 0; i < 4; i++) pieces.push(await readFile(join(generated, `triggers-${String(i).padStart(2, "0")}.sql`), "utf8"));
pieces.push(await readFile(join(generated, "rls-flags.sql"), "utf8"));
for (let i = 0; i < 7; i++) pieces.push(await readFile(join(generated, `policies-${String(i).padStart(2, "0")}.sql`), "utf8"));
pieces.push(await readFile(join(generated, "private-grants.sql"), "utf8"));
pieces.push(await readFile(join(generated, "grants.sql"), "utf8"));
pieces.push("COMMIT;");
const sql = pieces.join("\n\n");
if (/^(?:COPY\s+\S+\s+FROM\s+stdin|INSERT\s+INTO\s+\S+\s+VALUES)/im.test(sql)) throw new Error("DATA_EXPORT_REJECTED");
await writeFile(join(root, "gastrohelp-schema-only.sql"), sql);
process.stdout.write("Esquema de metadatos ensamblado para PostgreSQL local.\n");
