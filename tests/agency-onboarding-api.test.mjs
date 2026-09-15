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
      throw Error("Unexpected import " + name);
    },
    m,
    m.exports,
  );
  return m.exports;
}
const flow = compile("../lib/reviews/review-flow.ts");
const onboarding = compile("../lib/admin/onboarding.ts", {
  "@/lib/reviews/review-flow": flow,
});
const response = {
  NextResponse: {
    json: (body, init = {}) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...init.headers },
      }),
  },
};
const restaurant = "72000000-0000-4000-8000-000000000201",
  invitation = "73000000-0000-4000-8000-000000000201";
function fixture(options = {}) {
  const calls = [];
  let linked = false,
    deleted = false;
  const invited = "invited-user";
  const db = {
    auth: {
      getUser: async () => ({
        data: {
          user: options.invalidSession
            ? null
            : { id: "agency-user", user_metadata: { admin: true } },
        },
        error: null,
      }),
      admin: {
        inviteUserByEmail: async (email, args) => {
          calls.push(["invite", email, args]);
          if (options.inviteError)
            return { data: {}, error: { code: "mail_failed" } };
          linked = true;
          if (options.networkError) throw Error("network");
          return { data: { user: { id: invited } }, error: null };
        },
        getUserById: async () => ({
          data: {
            user: {
              user_metadata: {
                restaurante_id: options.wrongOwner ? "another" : restaurant,
              },
            },
          },
          error: null,
        }),
        deleteUser: async (id) => {
          calls.push(["deleteUser", id]);
          return { error: null };
        },
      },
    },
    rpc: async (name, args) => {
      calls.push(["rpc", name, args]);
      return options.duplicate
        ? { data: null, error: { message: "EMAIL_ALREADY_REGISTERED" } }
        : {
            data: { restaurante_id: restaurant, invitation_id: invitation },
            error: null,
          };
    },
    from(table) {
      let action = "read";
      const filters = {};
      const chain = {
        select() {
          return chain;
        },
        eq(k, v) {
          filters[k] = v;
          return chain;
        },
        insert(value) {
          action = "insert";
          calls.push(["insert", table, value]);
          return chain;
        },
        update(value) {
          action = "update";
          calls.push(["update-values", table, value]);
          return chain;
        },
        delete() {
          action = "delete";
          return chain;
        },
        maybeSingle() {
          return chain;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              calls.push([action, table, filters]);
              if (action === "delete") {
                deleted = true;
                return {
                  error: options.cleanupError
                    ? { code: "cleanup_failed" }
                    : null,
                };
              }
              if (action === "insert")
                return {
                  error: options.assignmentError
                    ? { code: "assignment_failed" }
                    : null,
                };
              if (table === "app_admins")
                return {
                  data: options.nonAdmin ? null : { user_id: "agency-user" },
                  error: null,
                };
              if (table === "restaurant_invitations")
                return {
                  data: deleted
                    ? null
                    : {
                        status: linked ? "sent" : "pending",
                        auth_user_id: linked ? invited : null,
                      },
                  error: null,
                };
              if (table === "usuarios_restaurantes")
                return {
                  data: options.missingLink ? null : { user_id: invited },
                  error: null,
                };
              if (table === "restaurantes")
                return { data: { owner_id: invited }, error: null };
              return { data: null, error: null };
            })
            .then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const route = compile("../app/api/admin/restaurantes/route.ts", {
    "server-only": {},
    "next/server": response,
    "@/app/lib/supabaseAdmin": { getSupabaseAdmin: () => db },
    "@/lib/reviews/review-flow": flow,
    "@/lib/admin/onboarding": onboarding,
    "@/lib/admin/authorize": compile("../lib/admin/authorize.ts", {
      "server-only": {},
      "@/app/lib/supabaseAdmin": { getSupabaseAdmin: () => db },
    }),
  });
  return {
    calls,
    send: async (
      form = {
        ...onboarding.emptyForm,
        nombre: "Prueba",
        email: "owner@example.invalid",
        telefono: "+34600000201",
        direccion: "Dirección",
      },
      token = "token",
      method = "POST",
    ) => {
      const r = await route[method](
        new Request("https://fixture.invalid/api/admin/restaurantes", {
          method,
          headers: token ? { authorization: `Bearer ${token}` } : {},
          body: typeof form === "string" ? form : JSON.stringify(form),
        }),
      );
      return { status: r.status, body: await r.json(), headers: r.headers };
    },
  };
}
test("rejects unauthenticated users and user-editable admin metadata before any writes", async () => {
  for (const opts of [{ nonAdmin: true }, { invalidSession: true }]) {
    const f = fixture(opts),
      r = await f.send();
    assert.equal(r.status, opts.nonAdmin ? 403 : 401);
    assert.equal(
      f.calls.some((c) => c[0] === "rpc" || c[0] === "invite"),
      false,
    );
  }
  const f = fixture();
  assert.equal((await f.send(undefined, "")).status, 401);
  assert.equal(f.calls.length, 0);
});
test("contact changes require agency access and cannot modify owner or another restaurant", async () => {
  const payload = {
    restaurante_id: restaurant,
    telefono: "+34 600 000 201",
    direccion: "Nueva dirección",
    owner_id: "attacker",
  };
  const denied = fixture({ nonAdmin: true });
  assert.equal((await denied.send(payload, "token", "PATCH")).status, 403);
  assert.equal(
    denied.calls.some((c) => c[0] === "update-values"),
    false,
  );
  const allowed = fixture();
  assert.equal((await allowed.send(payload, "token", "PATCH")).status, 200);
  assert.deepEqual(allowed.calls.find((c) => c[0] === "update-values")[2], {
    telefono: payload.telefono,
    direccion: payload.direccion,
  });
  assert.deepEqual(allowed.calls.find((c) => c[0] === "update")[2], {
    id: restaurant,
  });
  const invalid = fixture();
  assert.equal(
    (await invalid.send({ ...payload, telefono: "invalid" }, "token", "PATCH"))
      .status,
    400,
  );
});
test("validates actual body length, service dependencies and review destination", async () => {
  const valid = {
    ...onboarding.emptyForm,
    nombre: "Prueba",
    email: "owner@example.invalid",
  };
  for (const bad of [
    { ...valid, activarClientes: false },
    { ...valid, googleReviewUrl: "javascript:alert(1)" },
    { ...valid, zonaHoraria: "unknown" },
    "{",
  ]) {
    const f = fixture();
    assert.equal((await f.send(bad)).status, 400);
    assert.equal(
      f.calls.some((c) => c[0] === "rpc"),
      false,
    );
  }
  const f = fixture();
  assert.equal((await f.send(" ".repeat(32001))).status, 413);
});
test("creates through the transaction, sends one invitation and checks its exact assignment", async () => {
  const f = fixture(),
    r = await f.send();
  assert.equal(r.status, 201);
  assert.equal(r.body.restaurante_id, restaurant);
  assert.match(r.headers.get("cache-control"), /no-store/);
  assert.equal(f.calls.filter((c) => c[0] === "rpc").length, 1);
  assert.equal(
    f.calls.find((c) => c[0] === "rpc")[1],
    "admin_crear_instalacion_restaurante_v2",
  );
  assert.equal(f.calls.filter((c) => c[0] === "invite").length, 1);
  assert.equal(
    f.calls.some((c) => c[0] === "delete"),
    false,
  );
});
test("duplicate email cannot send another invitation", async () => {
  const f = fixture({ duplicate: true });
  assert.equal((await f.send()).status, 409);
  assert.equal(
    f.calls.some((c) => c[0] === "invite"),
    false,
  );
});
test("a failed invitation removes the new installation without deleting an unrelated user", async () => {
  const f = fixture({ inviteError: true }),
    r = await f.send();
  assert.equal(r.body.error, "INVITE_SEND_FAILED");
  assert.equal(f.calls.filter((c) => c[0] === "delete").length, 1);
  assert.equal(
    f.calls.some((c) => c[0] === "deleteUser"),
    false,
  );
});
test("lost invitation response recovers the created user from the exact restaurant linkage and cleans up", async () => {
  const f = fixture({ networkError: true }),
    r = await f.send();
  assert.equal(r.status, 500);
  assert.equal(r.body.error, "INVITE_SEND_FAILED");
  assert.equal(f.calls.filter((c) => c[0] === "deleteUser").length, 1);
});
test("cleanup failure is reported truthfully and never deletes a mismatched user", async () => {
  for (const opts of [
    { networkError: true, cleanupError: true },
    { networkError: true, wrongOwner: true },
  ]) {
    const f = fixture(opts),
      r = await f.send();
    assert.equal(r.body.error, "CLEANUP_REQUIRED");
    assert.equal(
      f.calls.some((c) => c[0] === "deleteUser"),
      false,
    );
  }
});
test("a missing invitation linkage is never reported as a completed installation", async () => {
  const f = fixture({ missingLink: true }),
    r = await f.send();
  assert.equal(r.body.error, "INVITE_SEND_FAILED");
  assert.equal(
    f.calls.some((c) => c[0] === "deleteUser"),
    true,
  );
});
test("reputation onboarding explicitly assigns the new owner to that restaurant only", async () => {
  const f = fixture(),
    form = onboarding.applyServicePreset(
      {
        ...onboarding.emptyForm,
        nombre: "Prueba",
        email: "rep@example.invalid",
      },
      "reputation",
    );
  assert.equal((await f.send(form)).status, 201);
  const assignment = f.calls.find((c) => c[0] === "insert");
  assert.equal(assignment[1], "opinion_usuarios_restaurantes");
  assert.equal(assignment[2].restaurante_id, restaurant);
  assert.equal(assignment[2].user_id, "invited-user");
});
test("preset changes retain contact details and require dependent modules when customized", () => {
  const form = onboarding.applyServicePreset(
    { ...onboarding.emptyForm, nombre: "Restaurante" },
    "reputation",
  );
  assert.equal(form.nombre, "Restaurante");
  assert.equal(form.activarReservas, false);
  assert.equal(form.activarReputacion, true);
  assert.equal(onboarding.serviceDependencies(form), null);
  assert.match(
    onboarding.serviceDependencies({ ...form, activarCamarero: true }),
    /Carta QR/,
  );
});
