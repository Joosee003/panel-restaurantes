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
  let linked = Boolean(options.existingUser),
    deleted = false;
  const invited = "invited-user";
  let invitedEmail = "owner@example.invalid";
  let reputation = false;
  const db = {
    auth: {
      resetPasswordForEmail: async (email, args) => {
        calls.push(["recovery", email, args]);
        return {error: null};
      },
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
          invitedEmail = email;
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
              email: options.wrongOwner ? "other@example.invalid" : invitedEmail,
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
      if (name === "admin_claim_invitation") return { data: options.unclaimed ? {claimed:false,status:"uncertain"} : { claimed: true, invitation_id: invitation, email: invitedEmail, auth_user_id: options.existingUser ? invited : null, lock: "lock" }, error: null };
      if (name === "admin_finish_invitation") return { data: !options.cleanupError, error: null };
      invitedEmail = args.p_config.email;
      reputation = args.p_config.activarReputacion;
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
        upsert(value) { return chain.insert(value); },
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
              if (table === "opinion_config") return { data: reputation ? {restaurante_id: restaurant} : null, error: null };
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
    "@/lib/admin/invitations": compile("../lib/admin/invitations.ts", { "server-only": {} }),
    "@/lib/admin/authorize": compile("../lib/admin/authorize.ts", {
      "server-only": {},
      "@/app/lib/supabaseAdmin": { getSupabaseAdmin: () => db },
    }),
  });
  return {
    calls,
    resend: async (token = "token") => {
      const retry = compile("../app/api/admin/restaurantes/invitacion/route.ts", {
        "server-only": {}, "next/server": response,
        "@/lib/admin/invitations": compile("../lib/admin/invitations.ts", {"server-only": {}}),
        "@/lib/admin/authorize": compile("../lib/admin/authorize.ts", {"server-only": {}, "@/app/lib/supabaseAdmin": {getSupabaseAdmin: () => db}}),
      });
      const result = await retry.POST(new Request("https://fixture.invalid/api/admin/restaurantes/invitacion", {method:"POST",headers:token?{authorization:`Bearer ${token}`}:{},body:JSON.stringify({restaurante_id:restaurant})}));
      return {status:result.status,body:await result.json()};
    },
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
          body: typeof form === "string" ? form : JSON.stringify({ request_id: "74000000-0000-4000-8000-000000000201", ...form }),
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
  assert.equal(f.calls.filter((c) => c[0] === "rpc" && c[1] === "admin_create_onboarding").length, 1);
  assert.equal(
    f.calls.find((c) => c[0] === "rpc")[1],
    "admin_create_onboarding",
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
test("email failure preserves the saved restaurant and reports a retryable invitation", async () => {
  const f = fixture({ inviteError: true }), r = await f.send();
  assert.equal(r.status, 201);
  assert.equal(r.body.restaurante_id, restaurant);
  assert.equal(r.body.invitation_status, "failed");
  assert.equal(f.calls.some(c => ["delete", "deleteUser"].includes(c[0])), false);
});
test("an invitation timeout after account creation remains uncertain without destructive rollback", async () => {
  const f = fixture({ networkError: true }), r = await f.send();
  assert.equal(r.body.invitation_status, "uncertain");
  assert.equal(r.body.restaurante_id, restaurant);
  assert.equal(f.calls.some(c => ["delete", "deleteUser"].includes(c[0])), false);
});
test("unverified links and unpersisted email outcomes cannot be presented as sent", async () => {
  for (const opts of [{ missingLink: true }, { cleanupError: true }]) {
    const f = fixture(opts), r = await f.send();
    assert.equal(r.body.invitation_status, "uncertain");
    assert.equal(f.calls.some(c => ["delete", "deleteUser"].includes(c[0])), false);
  }
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

test('resend is agency-only, recovers the linked account without creating another, and respects uncertain claims', async () => {
 const denied=fixture({nonAdmin:true});assert.equal((await denied.resend()).status,403);assert.equal(denied.calls.some(c=>c[0]==='recovery'||c[0]==='invite'),false);
 const existing=fixture({existingUser:true});const result=await existing.resend();assert.equal(result.status,200);assert.equal(result.body.invitation_status,'accepted');assert.equal(existing.calls.filter(c=>c[0]==='recovery').length,1);assert.equal(existing.calls.some(c=>c[0]==='invite'),false);assert.equal(existing.calls.find(c=>c[1]==='admin_claim_invitation')[2].p_retry,true);
 const mismatch=fixture({existingUser:true,wrongOwner:true});assert.equal((await mismatch.resend()).body.invitation_status,'failed');assert.equal(mismatch.calls.some(c=>c[0]==='recovery'||c[0]==='invite'),false);
 const uncertain=fixture({unclaimed:true});assert.equal((await uncertain.resend()).body.invitation_status,'uncertain');assert.equal(uncertain.calls.some(c=>c[0]==='recovery'||c[0]==='invite'),false);
});
