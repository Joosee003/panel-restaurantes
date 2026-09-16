import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import ts from "typescript";
const require = createRequire(import.meta.url);
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
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
  )((name) => imports[name] || require(name), m, m.exports);
  return m.exports;
}
const flow = compile("../lib/reviews/review-flow.ts"),
  reviews = compile("../lib/reviews/review-customers.ts", {
    "./review-flow": flow,
  }),
  model = compile("../lib/admin/overview.ts");
const onboarding = compile("../lib/admin/onboarding.ts", {
  "@/lib/reviews/review-flow": flow,
});
const common = {
  "next/link": {
    default: ({ children, ...props }) =>
      React.createElement("a", props, children),
  },
  "next/navigation": { useRouter: () => ({ push: () => {} }) },
  "@/app/(app)/lib/activeRestaurant": { setActiveRestaurant: () => {} },
  "./useAgencyOverview": {
    useAgencyOverview: () => ({
      data: null,
      loading: false,
      error: "",
      reload: () => {},
    }),
  },
  "@/app/(app)/lib/supabaseClient": { supabase: {} },
};
const contact = compile(
  "../app/admin/components/RestaurantContact.tsx",
  common,
);
const invitationAction = compile("../app/admin/components/InvitationAction.tsx", common);
const views = compile("../app/admin/components/AgencyViews.tsx", {
  ...common,
  "./InvitationAction": invitationAction,
  "./RestaurantContact": contact,
  "@/lib/admin/overview": model,
  "@/lib/reviews/review-customers": reviews,
});
const wizard = compile("../app/admin/components/OnboardingWorkspace.tsx", {
  ...common,
  "./AgencyViews": views,
  "./InvitationAction": invitationAction,
  "@/lib/admin/onboarding": onboarding,
});
const original = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = original;
});
const text = (node) =>
  typeof node === "string"
    ? node
    : Array.isArray(node)
      ? node.map(text).join("")
      : node?.children?.map(text).join("") || "";
const button = (r, label) =>
  r.root
    .findAllByType("button")
    .find((node) => text(node).trim().startsWith(label));
const render = async (component, props) => {
  let r;
  await act(async () => {
    r = create(React.createElement(component, props));
  });
  return r;
};
const submit = async (r) =>
  act(async () =>
    r.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
const change = async (r, label, value) =>
  act(async () =>
    r.root
      .findAllByType("label")
      .find((node) => text(node).startsWith(label))
      .findByType("input")
      .props.onChange({ target: { value } }),
  );
test("the directory defaults to real clients, changes demo scope, and searches by restaurant", async () => {
  const data = model.buildAgencyOverview(
    {
      restaurants: [
        { id: "a", nombre: "Cliente real" },
        { id: "b", nombre: "Demo" },
      ],
      modules: [{ restaurante_id: "b", estado: "demo" }],
      opinionConfig: [{ restaurante_id: "a", active: true, slug: "real" }],
    },
    model.createPeriod(30, new Date("2026-09-15T12:00:00Z")),
  );
  const r = await render(views.OverviewContent, { data });
  assert.equal(r.root.findAllByType("article").length, 1);
  assert.match(text(r.root.findByType("article")), /Cliente real/);
  await act(async () => button(r, "Demos").props.onClick());
  assert.match(text(r.root.findByType("article")), /Demo/);
  await act(async () => button(r, "Todos").props.onClick());
  assert.equal(r.root.findAllByType("article").length, 2);
  await act(async () =>
    r.root
      .findByType("input")
      .props.onChange({ target: { value: "inexistente" } }),
  );
  assert.equal(r.root.findAllByType("article").length, 0);
  assert.ok(button(r, "Limpiar filtros"));
  await act(async () => button(r, "Limpiar filtros").props.onClick());
  assert.equal(r.root.findAllByType("article").length, 2);
  await act(async () => r.unmount());
});
test("onboarding validates each step, sends only at the last step and preserves input after failure", async () => {
  const calls = [];
  let reject, resolve;
  const r = await render(wizard.OnboardingWizard, {
    create: (form) => {
      calls.push(form);
      return new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
    },
  });
  await submit(r);
  assert.match(text(r.toJSON()), /Escribe un nombre/);
  assert.equal(calls.length, 0);
  await change(r, "Nombre del restaurante", "Nuevo restaurante");
  await change(r, "Correo de acceso", "owner@example.invalid");
  await change(r, "Teléfono de contacto", "600000202");
  await change(r, "Dirección", "Dirección de prueba");
  await submit(r);
  await act(async () => button(r, "Reputación").props.onClick());
  await submit(r);
  assert.doesNotMatch(text(r.toJSON()), /Mesas iniciales/);
  await submit(r);
  assert.ok(button(r, "Crear y enviar acceso"));
  assert.equal(calls.length, 0);
  await submit(r);
  await submit(r);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].activarReputacion, true);
  assert.equal(calls[0].activarReservas, false);
  assert.ok(button(r, "Creando restaurante").props.disabled);
  await act(async () => reject(Error("No se ha podido enviar el acceso.")));
  assert.match(text(r.toJSON()), /No se ha podido enviar el acceso/);
  assert.match(text(r.toJSON()), /owner@example.invalid/);
  await submit(r);
  assert.equal(calls.length, 2);
  await act(async () =>
    resolve({ restaurante_id: "new", invited_email: "owner@example.invalid" }),
  );
  assert.match(text(r.toJSON()), /Restaurante creado/);
  assert.ok(
    r.root
      .findAllByType("a")
      .some(
        (node) =>
          node.props.href === "/admin/onboarding-restaurante?restaurante=new",
      ),
  );
  await act(async () => r.unmount());
});

test("reload restores one user's draft and request key; another account never inherits it", async () => {
  const previous = globalThis.sessionStorage;
  const items = new Map();
  globalThis.sessionStorage = {
    get length() { return items.size; }, key: i => [...items.keys()][i],
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key),
  };
  try {
    let r = await render(wizard.OnboardingWizard, { create: async () => {}, draftOwner: "agency-a" });
    await change(r, "Nombre del restaurante", "Borrador sin enviar");
    const first = JSON.parse(items.get("gastrohelp:onboarding:agency-a"));
    await act(async () => r.unmount());
    r = await render(wizard.OnboardingWizard, { create: async () => {}, draftOwner: "agency-a" });
    assert.ok(r.root.findAllByType("input").some(n => n.props.value === "Borrador sin enviar"));
    assert.equal(JSON.parse(items.get("gastrohelp:onboarding:agency-a")).requestId, first.requestId);
    assert.match(text(r.toJSON()), /Hemos recuperado/);
    await act(async () => r.unmount());
    r = await render(wizard.OnboardingWizard, { create: async () => {}, draftOwner: "agency-b" });
    assert.equal(items.has("gastrohelp:onboarding:agency-a"), false);
    assert.ok(!r.root.findAllByType("input").some(n => n.props.value === "Borrador sin enviar"));
    await act(async () => r.unmount());
  } finally { globalThis.sessionStorage = previous; }
});
