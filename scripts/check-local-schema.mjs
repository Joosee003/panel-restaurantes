import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), "local-schema", "generated");
const files = (await readdir(root)).filter((name) => name.endsWith(".sql")).sort();
if (!files.length) throw new Error("SCHEMA_METADATA_MISSING");
const chunks = [];
let bytes = 0;
for (const name of files) {
  const file = join(root, name);
  bytes += (await stat(file)).size;
  if (bytes > 50_000_000) throw new Error("SCHEMA_SNAPSHOT_UNEXPECTEDLY_LARGE");
  chunks.push(await readFile(file, "utf8"));
}
const sql = chunks.join("\n");

// A schema dump is metadata/definitions only. Never accept a data export here.
if (/^(?:COPY\s+\S+\s+FROM\s+stdin|INSERT\s+INTO\s+\S+\s+VALUES|--\s*Data for Name:)/im.test(sql)) {
  throw new Error("DATA_EXPORT_REJECTED");
}
// Function bodies can contain hard-coded credentials even in schema-only dumps.
// Report only the class of finding, never the matched value.
const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{12,}\b/],
  ["JWT token", /\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{15,}\b/],
  ["credential URI", /(?:postgres(?:ql)?|https?):\/\/[^\s'"@]+:[^\s'"@]+@/i],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
];
const findings = secretPatterns.filter(([, pattern]) => pattern.test(sql)).map(([label]) => label);
if (findings.length) throw new Error(`EMBEDDED_SECRET_REVIEW_REQUIRED: ${findings.join(", ")}`);
const required = [
  ["restaurantes", /CREATE TABLE\s+"?public"?\."?restaurantes"?\s*\(/i],
  ["clientes", /CREATE TABLE\s+"?public"?\."?clientes"?\s*\(/i],
  ["reservas", /CREATE TABLE\s+"?public"?\."?reservas"?\s*\(/i],
  ["crear_reserva_manual", /CREATE(?: OR REPLACE)? FUNCTION\s+"?public"?\."?crear_reserva_manual"?\s*\(/i],
  ["obtener_disponibilidad_manual", /CREATE(?: OR REPLACE)? FUNCTION\s+"?public"?\."?obtener_disponibilidad_manual"?\s*\(/i],
  ["puede_acceder_restaurante", /CREATE(?: OR REPLACE)? FUNCTION\s+"?public"?\."?puede_acceder_restaurante"?\s*\(/i],
  ["RLS", /ENABLE ROW LEVEL SECURITY/i],
  ["políticas", /CREATE POLICY/i],
];
const missing = required.filter(([, pattern]) => !pattern.test(sql)).map(([name]) => name);
if (missing.length) throw new Error(`SCHEMA_DEFINITIONS_MISSING: ${missing.join(", ")}`);

const expectedCounts = [
  ["tables", /^CREATE TABLE\s+/gim, 63],
  ["functions", /^CREATE OR REPLACE FUNCTION\s+/gim, 193],
  ["views", /^CREATE OR REPLACE VIEW\s+/gim, 5],
  ["indexes", /^CREATE (?:UNIQUE )?INDEX\s+/gim, 138],
  ["constraints", /^ALTER TABLE\s+.+\s+ADD CONSTRAINT\s+/gim, 359],
  ["triggers", /^CREATE TRIGGER\s+/gim, 75],
  ["policies", /^CREATE POLICY\s+/gim, 244],
];
for (const [name, pattern, expected] of expectedCounts) {
  const actual = [...sql.matchAll(pattern)].length;
  if (actual !== expected) throw new Error(`SCHEMA_OBJECT_COUNT_MISMATCH: ${name} ${actual}/${expected}`);
}

process.stdout.write(`Metadatos sin filas ni patrones de secreto: ${files.length} archivos SQL; tablas, RPC, permisos, índices, restricciones, disparadores y RLS completos.\n`);
