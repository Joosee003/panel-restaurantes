import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadRoute(calls) {
  const source = readFileSync(
    new URL("../app/api/demo/session/route.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  const dependencies = {
    "server-only": {},
    "@supabase/supabase-js": {
      createClient: () => {
        calls.push("public-auth");
        throw new Error("must not create a public auth client");
      },
    },
    "next/server": {
      NextResponse: { json: (body, init = {}) => Response.json(body, init) },
    },
    "@/app/lib/publicRateLimit": {
      consumePublicRateLimit: async () => {
        calls.push("rate-limit");
        return true;
      },
    },
    "@/app/lib/supabaseAdmin": {
      getSupabaseAdmin: () => {
        calls.push("admin-auth");
        throw new Error("must not access admin auth");
      },
    },
  };
  new Function("require", "module", "exports", output)(
    (name) => dependencies[name],
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

test("public demo sessions stay closed until the synthetic dataset is audited", async () => {
  const previous = process.env.DEMO_PUBLIC_SESSION_ENABLED;
  delete process.env.DEMO_PUBLIC_SESSION_ENABLED;
  const calls = [];
  try {
    const route = loadRoute(calls);
    assert.equal(route.publicDemoSessionEnabled({}), false);
    assert.equal(
      route.publicDemoSessionEnabled({
        DEMO_PUBLIC_SESSION_ENABLED: "enabled-after-data-audit",
      }),
      true,
    );
    const response = await route.POST(new Request("https://fixture.invalid/api/demo/session", { method: "POST" }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "DEMO_DISABLED" });
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.deepEqual(calls, []);
  } finally {
    if (previous === undefined) delete process.env.DEMO_PUBLIC_SESSION_ENABLED;
    else process.env.DEMO_PUBLIC_SESSION_ENABLED = previous;
  }
});
