import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
function compile(path, imports = {}) {
  const m = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )(
    (name) => {
      if (name in imports) return imports[name];
      throw Error(name);
    },
    m,
    m.exports,
  );
  return m.exports;
}
const model = compile("../lib/admin/overview.ts");
function fixture(options = {}) {
  const reads = [];
  const db = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.invalid
            ? null
            : { id: "actor", user_metadata: { admin: true } },
        },
        error: null,
      }),
    },
    from(table) {
      let offset = 0,
        columns = "";
      const chain = {
        select(value) {
          columns = value;
          return chain;
        },
        eq() {
          return chain;
        },
        maybeSingle() {
          return chain;
        },
        order() {
          return chain;
        },
        gte() {
          return chain;
        },
        or() {
          return chain;
        },
        is() {
          return chain;
        },
        neq() {
          return chain;
        },
        range(from) {
          offset = from;
          return chain;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              reads.push({ table, columns, offset });
              if (table === "app_admins")
                return {
                  data: options.nonAdmin ? null : { user_id: "actor" },
                  error: null,
                };
              if (options.fail === table)
                return { data: null, error: { code: "fixture_failure" } };
              if (table === "restaurantes")
                return {
                  data: Array.from(
                    { length: options.many ? 1001 : 1 },
                    (_, i) => ({
                      id: `restaurant-${i}`,
                      nombre: `Restaurant ${i}`,
                      amelia_api_key: "must-not-escape",
                    }),
                  ).slice(offset, offset + 1000),
                  error: null,
                };
              return { data: [], error: null };
            })
            .then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const auth = compile("../lib/admin/authorize.ts", {
    "server-only": {},
    "@/app/lib/supabaseAdmin": { getSupabaseAdmin: () => db },
  });
  const route = compile("../app/api/admin/overview/route.ts", {
    "server-only": {},
    "next/server": {
      NextResponse: {
        json: (body, options = {}) =>
          new Response(JSON.stringify(body), options),
      },
    },
    "@/lib/admin/authorize": auth,
    "@/lib/admin/overview": model,
  });
  return {
    reads,
    send: async (token = "token", days = 30) => {
      const response = await route.GET(
        new Request(`https://fixture.invalid/api/admin/overview?days=${days}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        }),
      );
      return {
        status: response.status,
        body: await response.json(),
        headers: response.headers,
      };
    },
  };
}
test("the cross-restaurant API rejects non-agency accounts regardless of editable metadata", async () => {
  const f = fixture({ nonAdmin: true });
  assert.equal((await f.send()).status, 403);
  assert.deepEqual(
    f.reads.map((r) => r.table),
    ["app_admins"],
  );
});
test("missing or expired credentials cannot read restaurant data", async () => {
  let f = fixture();
  assert.equal((await f.send("")).status, 401);
  assert.equal(f.reads.length, 0);
  f = fixture({ invalid: true });
  assert.equal((await f.send()).status, 401);
  assert.equal(f.reads.length, 0);
});
test("every page is loaded and only aggregated fields reach the browser", async () => {
  const f = fixture({ many: true }),
    r = await f.send();
  assert.equal(r.status, 200);
  assert.equal(r.body.restaurants.length, 1001);
  assert.ok(
    f.reads.some((q) => q.table === "restaurantes" && q.offset === 1000),
  );
  assert.equal(JSON.stringify(r.body).includes("must-not-escape"), false);
  assert.ok(f.reads.every((q) => !q.columns.includes("*")));
  assert.match(r.headers.get("cache-control"), /no-store/);
});
test("one failed source produces an explicit error instead of false zero metrics", async () => {
  const f = fixture({ fail: "opiniones_qr" }),
    r = await f.send();
  assert.equal(r.status, 503);
  assert.equal(r.body.restaurants, undefined);
  assert.equal(r.body.error, "OVERVIEW_UNAVAILABLE");
});
test("invalid time ranges are rejected before business data is read", async () => {
  const f = fixture(),
    r = await f.send("token", 10000);
  assert.equal(r.status, 400);
  assert.deepEqual(
    f.reads.map((r) => r.table),
    ["app_admins"],
  );
});
