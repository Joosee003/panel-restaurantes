import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";

const require = createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Execute production helpers. Only Supabase I/O and browser storage are replaced;
// no hosted project, credentials, customer rows or Auth mutation is involved.
function compile(relative, imports = {}) {
  const compiledModule = { exports: {} };
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", compiled)(
    (name) => {
      // Import specifiers are portable; never match native Windows paths with '/'.
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unexpected import: ${name}`);
    },
    compiledModule,
    compiledModule.exports,
  );
  return compiledModule.exports;
}

const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
};
const browser = new EventTarget();
browser.sessionStorage = memory();
browser.localStorage = memory();
globalThis.window = browser;
const selection = compile("../app/(app)/lib/activeRestaurant.ts");
const access = compile("../app/admin/components/agencyRestaurantAccess.ts", {
  "@/app/(app)/lib/activeRestaurant": selection,
});
const A = "83000000-0000-4000-8000-000000000001";
const B = "83000000-0000-4000-8000-000000000002";
const MISSING = "83000000-0000-4000-8000-000000000099";
const AGENCY = "84000000-0000-4000-8000-000000000001";
const OWNER = "84000000-0000-4000-8000-000000000002";

function fixture(options = {}) {
  const calls = [];
  const actor = options.owner ? OWNER : AGENCY;
  const restaurants = new Map([
    [A, { id: A, nombre: "Restaurante ficticio A" }],
    [B, { id: B, nombre: "Restaurante ficticio B" }],
  ]);
  const forbidden = (name) => () => {
    calls.push({ kind: "mutation", name });
    throw new Error(`Forbidden mutation: ${name}`);
  };
  const client = {
    auth: {
      async getUser() {
        calls.push({ kind: "auth", name: "getUser" });
        return {
          data: {
            user: options.anonymous ? null : {
              id: actor,
              // A hostile owner-controlled claim must not grant agency rights.
              user_metadata: { role: "agency", is_admin: true },
            },
          },
          error: options.authError ? new Error("auth unavailable") : null,
        };
      },
      async getSession() {
        calls.push({ kind: "auth", name: "getSession" });
        return {
          data: {
            session: options.loggedOut ? null : {
              user: { id: options.changedActor ? OWNER : actor },
            },
          },
          error: options.sessionError ? new Error("session unavailable") : null,
        };
      },
      signOut: forbidden("signOut"),
      signInWithPassword: forbidden("signInWithPassword"),
      setSession: forbidden("setSession"),
      updateUser: forbidden("updateUser"),
      resetPasswordForEmail: forbidden("resetPasswordForEmail"),
      admin: new Proxy({}, { get: (_, name) => forbidden(`auth.admin.${String(name)}`) }),
    },
    async rpc(name, args) {
      calls.push({ kind: "rpc", name, args });
      assert.equal(name, "puede_acceder_restaurante", "Only permission RPC is allowed");
      assert.ok(restaurants.has(args.p_restaurante_id) || args.p_restaurante_id === MISSING);
      return {
        data: options.denied ? false : true,
        error: options.rpcError ? new Error("access unavailable") : null,
      };
    },
    from(table) {
      assert.ok(["app_admins", "restaurantes", "restaurante_modulos"].includes(table));
      const filters = {};
      const call = { kind: "read", table, filters };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          if (options.waitForTable === table) await options.readGate;
          if (options.readError === table) return { data: null, error: new Error("read unavailable") };
          if (table === "app_admins") {
            assert.equal(filters.user_id, actor, "Role lookup must be bound to verified identity");
            return { data: options.owner || options.revoked ? null : { user_id: actor }, error: null };
          }
          if (table === "restaurantes") {
            assert.ok(filters.id, "Restaurant lookup must be explicitly scoped");
            return { data: restaurants.get(filters.id) ?? null, error: null };
          }
          assert.ok(filters.restaurante_id, "Modules lookup must be explicitly scoped");
          return {
            data: options.missingModules ? null : { estado: Object.hasOwn(options, "state") ? options.state : "activo" },
            error: null,
          };
        },
        insert: forbidden(`${table}.insert`),
        update: forbidden(`${table}.update`),
        upsert: forbidden(`${table}.upsert`),
        delete: forbidden(`${table}.delete`),
      };
      return query;
    },
  };
  return { client, calls };
}

const rejectsCode = (operation, code) => assert.rejects(operation, (error) => {
  assert.equal(error.code, code);
  return true;
});

test("agency enters A, returns, and enters B without changing Auth identity", async () => {
  selection.setActiveRestaurant(null);
  const { client, calls } = fixture();
  const first = await access.enterAgencyRestaurant(client, A);
  assert.deepEqual(first, { userId: AGENCY, id: A, name: "Restaurante ficticio A" });
  assert.equal(selection.getActiveRestaurant(), A);
  access.returnToAgency();
  assert.equal(selection.getActiveRestaurant(), null);
  const second = await access.enterAgencyRestaurant(client, B);
  assert.deepEqual(second, { userId: AGENCY, id: B, name: "Restaurante ficticio B" });
  assert.equal(selection.getActiveRestaurant(), B);
  assert.equal(calls.some((call) => call.kind === "mutation"), false);
  assert.deepEqual(calls.filter((call) => call.kind === "rpc").map((call) => call.args.p_restaurante_id), [A, B]);
});

test("resolving A/B only requests the selected restaurant and its modules", async () => {
  for (const id of [A, B]) {
    const { client, calls } = fixture();
    assert.equal((await access.resolveAgencyRestaurant(client, id)).id, id);
    const reads = calls.filter((call) => call.kind === "read" && call.table !== "app_admins");
    assert.deepEqual(reads.map((call) => call.filters), [{ id }, { restaurante_id: id }]);
  }
});

test("owner cannot enter either their own or a foreign restaurant via agency access", async () => {
  for (const id of [A, B]) {
    selection.setActiveRestaurant(null);
    const { client, calls } = fixture({ owner: true });
    await rejectsCode(() => access.enterAgencyRestaurant(client, id), "AGENCY_REQUIRED");
    assert.equal(selection.getActiveRestaurant(), null);
    assert.equal(calls.some((call) => call.kind === "rpc"), false);
    assert.equal(calls.some((call) => call.table === "restaurantes"), false);
  }
});

test("identity verification ignores owner-controlled admin claims", async () => {
  const owner = fixture({ owner: true });
  assert.deepEqual(await access.readAgencyIdentity(owner.client), { userId: OWNER, isAgency: false });
  assert.deepEqual(await access.readAgencyIdentity(fixture().client), { userId: AGENCY, isAgency: true });
});

test("tampered non-UUID selection is rejected before restaurant reads", async () => {
  for (const id of ["", "foreign", `${A}&restaurante_id=${B}`, "../admin", null]) {
    const { client, calls } = fixture();
    await rejectsCode(() => access.resolveAgencyRestaurant(client, id), "INVALID_RESTAURANT");
    assert.equal(calls.some((call) => call.table === "restaurantes"), false);
  }
});

test("arbitrary valid UUID does not bypass restaurant existence checks", async () => {
  const { client } = fixture();
  await rejectsCode(() => access.resolveAgencyRestaurant(client, MISSING), "RESTAURANT_NOT_FOUND");
});

test("permission RPC denial fails closed even for an agency identity", async () => {
  const { client } = fixture({ denied: true });
  await rejectsCode(() => access.resolveAgencyRestaurant(client, A), "ACCESS_CHECK_FAILED");
});

test("only active and demo restaurant states may open", async () => {
  for (const state of ["activo", "demo"]) {
    assert.equal((await access.resolveAgencyRestaurant(fixture({ state }).client, A)).id, A);
  }
  for (const state of ["inactivo", "suspendido", "cancelado", "", null, "unknown"]) {
    await rejectsCode(() => access.resolveAgencyRestaurant(fixture({ state }).client, A), "RESTAURANT_INACTIVE");
  }
  await rejectsCode(() => access.resolveAgencyRestaurant(fixture({ missingModules: true }).client, A), "RESTAURANT_INACTIVE");
});

test("missing or invalid session never grants agency access", async () => {
  for (const options of [{ anonymous: true }, { authError: true }]) {
    await rejectsCode(() => access.resolveAgencyRestaurant(fixture(options).client, A), "INVALID_SESSION");
  }
});

test("all permission and restaurant read failures fail closed", async () => {
  for (const options of [
    { rpcError: true },
    { readError: "app_admins" },
    { readError: "restaurantes" },
    { readError: "restaurante_modulos" },
  ]) {
    await rejectsCode(() => access.resolveAgencyRestaurant(fixture(options).client, A), "ACCESS_CHECK_FAILED");
  }
});

test("session change or logout during validation cannot install a restaurant context", async () => {
  for (const options of [{ changedActor: true }, { loggedOut: true }, { sessionError: true }]) {
    selection.setActiveRestaurant(null);
    await rejectsCode(() => access.enterAgencyRestaurant(fixture(options).client, A), "STALE_SESSION");
    assert.equal(selection.getActiveRestaurant(), null);
  }
});

test("refresh revalidates role and restaurant status instead of trusting persisted ID", async () => {
  selection.setActiveRestaurant(A);
  assert.equal((await access.resolveAgencyRestaurant(fixture().client, selection.getActiveRestaurant())).id, A);
  await rejectsCode(() => access.resolveAgencyRestaurant(fixture({ revoked: true }).client, A), "AGENCY_REQUIRED");
  await rejectsCode(() => access.resolveAgencyRestaurant(fixture({ state: "inactivo" }).client, A), "RESTAURANT_INACTIVE");
});

test("return to agency clears tab selection and retired shared selection, not session", () => {
  selection.setActiveRestaurant(A);
  browser.localStorage.setItem(selection.ACTIVE_RESTAURANT_KEY, B);
  let changes = 0;
  const unsubscribe = selection.subscribeActiveRestaurant(() => changes++);
  access.returnToAgency();
  assert.equal(selection.getActiveRestaurant(), null);
  assert.equal(browser.localStorage.getItem(selection.ACTIVE_RESTAURANT_KEY), null);
  assert.equal(changes, 1);
  unsubscribe();
});

test("late A entry cannot replace the newer B selection", async () => {
  selection.setActiveRestaurant(null);
  let release;
  const readGate = new Promise((resolve) => { release = resolve; });
  const pendingA = access.enterAgencyRestaurant(fixture({ waitForTable: "app_admins", readGate }).client, A);
  const rejected = rejectsCode(() => pendingA, "STALE_SESSION");
  await access.enterAgencyRestaurant(fixture().client, B);
  assert.equal(selection.getActiveRestaurant(), B);
  release();
  await rejected;
  assert.equal(selection.getActiveRestaurant(), B);
});

test("return to agency invalidates an in-flight entry before it can store a selection", async () => {
  selection.setActiveRestaurant(null);
  let release;
  const readGate = new Promise((resolve) => { release = resolve; });
  const pending = access.enterAgencyRestaurant(fixture({ waitForTable: "app_admins", readGate }).client, A);
  const rejected = rejectsCode(() => pending, "STALE_SESSION");
  access.returnToAgency();
  release();
  await rejected;
  assert.equal(selection.getActiveRestaurant(), null);
});

test("aborting an in-flight entry prevents persisting its eventual validated result", async () => {
  selection.setActiveRestaurant(null);
  let release;
  const readGate = new Promise((resolve) => { release = resolve; });
  const controller = new AbortController();
  const pending = access.enterAgencyRestaurant(fixture({ waitForTable: "app_admins", readGate }).client, A, controller.signal);
  const rejected = rejectsCode(() => pending, "STALE_SESSION");
  controller.abort();
  release();
  await rejected;
  assert.equal(selection.getActiveRestaurant(), null);
});

const text = (node) => typeof node === "string" ? node :
  Array.isArray(node) ? node.map(text).join("") : node?.children?.map(text).join("") || "";

function boundaryFixture(options = {}) {
  const state = fixture(options);
  const authListeners = new Set();
  const navigation = [];
  let pathname = "/dashboard";
  state.client.auth.onAuthStateChange = (listener) => {
    authListeners.add(listener);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
  };
  const Boundary = compile("../app/(app)/components/AgencyRestaurantContext.tsx", {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/navigation": {
      usePathname: () => pathname,
      useRouter: () => ({ push: (path) => navigation.push(path), refresh: () => navigation.push("refresh") }),
    },
    "../lib/supabaseClient": { supabase: state.client },
    "../lib/activeRestaurant": selection,
    "@/app/admin/components/agencyRestaurantAccess": access,
    "./agency-context.module.css": { default: {} },
  }).default;
  const panel = () => React.createElement(Boundary, null,
    React.createElement("output", { "data-private-panel": true }, "Private panel mounted"));
  return {
    ...state, navigation, panel,
    setPath: (path) => { pathname = path; },
    emit: (event) => { for (const listener of authListeners) listener(event); },
  };
}

test("boundary waits for permission validation before mounting private panel and shows agency identity", async () => {
  selection.setActiveRestaurant(A);
  let allow;
  const readGate = new Promise((resolve) => { allow = resolve; });
  const state = boundaryFixture({ waitForTable: "app_admins", readGate });
  let renderer;
  await act(async () => { renderer = create(state.panel()); });
  assert.equal(renderer.root.findAllByType("output").length, 0);
  assert.match(text(renderer.toJSON()), /Comprobando contexto/);
  await act(async () => { allow(); });
  assert.equal(renderer.root.findAllByType("output").length, 1);
  assert.match(text(renderer.toJSON()), /Sesión de agencia/);
  assert.match(text(renderer.toJSON()), /Viendo: Restaurante ficticio A/);
  await act(async () => renderer.unmount());
});

test("boundary revalidates on internal navigation and blocks inactive restaurant without mounting page", async () => {
  selection.setActiveRestaurant(A);
  const options = {};
  const state = boundaryFixture(options);
  let renderer;
  await act(async () => { renderer = create(state.panel()); });
  assert.equal(renderer.root.findAllByType("output").length, 1);
  const before = state.calls.filter((call) => call.kind === "rpc").length;
  await act(async () => { state.setPath("/reservas"); renderer.update(state.panel()); });
  assert.ok(state.calls.filter((call) => call.kind === "rpc").length > before);
  assert.match(text(renderer.toJSON()), /Viendo: Restaurante ficticio A/);
  options.state = "inactivo";
  await act(async () => { state.setPath("/clientes"); renderer.update(state.panel()); });
  assert.equal(renderer.root.findAllByType("output").length, 0);
  assert.match(text(renderer.toJSON()), /No se ha abierto el restaurante/);
  await act(async () => renderer.unmount());
});

test("boundary direct route without selection fails safely; owner receives no agency identity", async () => {
  selection.setActiveRestaurant(null);
  const agency = boundaryFixture();
  let renderer;
  await act(async () => { renderer = create(agency.panel()); });
  assert.equal(renderer.root.findAllByType("output").length, 0);
  assert.match(text(renderer.toJSON()), /Selecciona un restaurante/);
  await act(async () => renderer.unmount());
  const owner = boundaryFixture({ owner: true });
  await act(async () => { renderer = create(owner.panel()); });
  assert.equal(renderer.root.findAllByType("output").length, 1);
  assert.equal(renderer.root.findAllByType("aside").length, 0);
  await act(async () => renderer.unmount());
});

test("persistent return action clears context and navigates to agency without signing out", async () => {
  selection.setActiveRestaurant(A);
  const state = boundaryFixture();
  let renderer;
  await act(async () => { renderer = create(state.panel()); });
  const back = renderer.root.findByType("button");
  assert.match(text(back), /Volver a agencia/);
  await act(async () => back.props.onClick());
  assert.equal(selection.getActiveRestaurant(), null);
  assert.deepEqual(state.navigation, ["/admin/control", "refresh"]);
  assert.equal(state.calls.some((call) => call.kind === "mutation"), false);
  await act(async () => renderer.unmount());
});

test("SIGNED_OUT clears restaurant context and removes private children", async () => {
  selection.setActiveRestaurant(A);
  const options = {};
  const state = boundaryFixture(options);
  let renderer;
  await act(async () => { renderer = create(state.panel()); });
  assert.equal(renderer.root.findAllByType("output").length, 1);
  options.anonymous = true;
  options.loggedOut = true;
  await act(async () => state.emit("SIGNED_OUT"));
  assert.equal(selection.getActiveRestaurant(), null);
  assert.equal(renderer.root.findAllByType("output").length, 0);
  assert.equal(state.calls.some((call) => call.kind === "mutation"), false);
  await act(async () => renderer.unmount());
});

test("logout while boundary verification is pending cannot mount stale private content", async () => {
  selection.setActiveRestaurant(A);
  let release;
  const readGate = new Promise((resolve) => { release = resolve; });
  const options = { waitForTable: "app_admins", readGate };
  const state = boundaryFixture(options);
  let renderer;
  await act(async () => { renderer = create(state.panel()); });
  assert.equal(renderer.root.findAllByType("output").length, 0);
  options.anonymous = true;
  options.loggedOut = true;
  await act(async () => state.emit("SIGNED_OUT"));
  await act(async () => release());
  assert.equal(selection.getActiveRestaurant(), null);
  assert.equal(renderer.root.findAllByType("output").length, 0);
  assert.equal(renderer.root.findAllByType("aside").length, 0);
  await act(async () => renderer.unmount());
});

test("retry after temporary access failure revalidates before mounting private content", async () => {
  selection.setActiveRestaurant(A);
  const options = { rpcError: true };
  const state = boundaryFixture(options);
  let renderer;
  await act(async () => { renderer = create(state.panel()); });
  assert.equal(renderer.root.findAllByType("output").length, 0);
  assert.match(text(renderer.toJSON()), /No se ha abierto el restaurante/);
  options.rpcError = false;
  const retry = renderer.root.findAllByType("button").find((node) => text(node) === "Reintentar");
  await act(async () => retry.props.onClick());
  assert.equal(renderer.root.findAllByType("output").length, 1);
  assert.match(text(renderer.toJSON()), /Viendo: Restaurante ficticio A/);
  await act(async () => renderer.unmount());
});

test("unmounting Entrar al panel aborts pending selection and prevents delayed navigation", async () => {
  selection.setActiveRestaurant(null);
  let release;
  const readGate = new Promise((resolve) => { release = resolve; });
  const state = fixture({ waitForTable: "app_admins", readGate });
  const navigation = [];
  const EnterButton = compile("../app/admin/components/EnterRestaurantButton.tsx", {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/navigation": {
      useRouter: () => ({ push: (path) => navigation.push(path), refresh: () => navigation.push("refresh") }),
    },
    "lucide-react": { ArrowRight: () => null, Loader2: () => null },
    "@/app/(app)/lib/supabaseClient": { supabase: state.client },
    "./agencyRestaurantAccess": access,
  }).default;
  let renderer;
  let pending;
  await act(async () => { renderer = create(React.createElement(EnterButton, { restaurantId: A })); });
  await act(async () => { pending = renderer.root.findByType("button").props.onClick(); });
  assert.equal(renderer.root.findByType("button").props.disabled, true);
  assert.match(text(renderer.toJSON()), /Verificando acceso/);
  await act(async () => renderer.unmount());
  await act(async () => { release(); await pending; });
  assert.equal(selection.getActiveRestaurant(), null);
  assert.deepEqual(navigation, []);
  assert.equal(state.calls.some((call) => call.kind === "mutation"), false);
});
