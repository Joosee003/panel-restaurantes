import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/(app)/lib/settledQuery.ts", import.meta.url),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { settledQuery } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

test("settled query returns only complete, error-free values", () => {
  assert.deepEqual(
    settledQuery("Reservas", {
      status: "fulfilled",
      value: { data: [{ id: "safe" }], error: null },
    }),
    {
      value: { data: [{ id: "safe" }], error: null },
      failure: null,
    },
  );
});

test("settled query marks database errors and timeouts as partial", () => {
  assert.deepEqual(
    settledQuery("Clientes", {
      status: "fulfilled",
      value: { data: [], error: { message: "private detail" } },
    }),
    { value: null, failure: "Clientes: no disponible" },
  );
  assert.deepEqual(
    settledQuery("Reseñas", { status: "rejected", reason: new Error("timeout") }),
    { value: null, failure: "Reseñas: sin respuesta" },
  );
});

test("dashboard and metrics keep the last valid value when a source fails", () => {
  const dashboard = readFileSync(
    new URL("../app/(app)/dashboard/page.tsx", import.meta.url),
    "utf8",
  );
  const metrics = readFileSync(
    new URL("../app/(app)/estadisticas/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /Datos parciales\. Conservamos el último dato válido/);
  assert.match(dashboard, /if \(reservas\.value\) setReservasHoy/);
  assert.match(metrics, /Datos parciales\. Conservamos el último dato válido/);
  assert.match(metrics, /if \(reservasState\.value\) setReservas/);
});
