import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Turno vivo preserves the existing dashboard data and refresh contracts", () => {
  const dashboard = source("app/(app)/dashboard/page.tsx");
  for (const table of ["reservas", "clientes", "resenas", "pedidos_qr", "cierres_mesa_qr"]) {
    assert.match(dashboard, new RegExp(`\\.from\\(\\\"${table}\\\"\\)`));
  }
  assert.match(dashboard, /setInterval\(\(\) => cargarDashboard\("refresh"\), 30000\)/);
  assert.match(dashboard, /dashboard-inteligente-/);
});

test("Turno vivo preserves reservation tables, RPCs, realtime and polling", () => {
  const reservations = source("app/(app)/reservas/page.tsx");
  for (const table of ["reservas", "sala_mesas", "bloqueos_reservas", "restaurante_modulos"]) {
    assert.match(reservations, new RegExp(`\\.from\\(\\\"${table}\\\"\\)`));
  }
  for (const rpc of ["marcar_asistencia_reserva", "registrar_consumo_reserva", "gestionar_mesa_reserva"]) {
    assert.match(reservations, new RegExp(`\\.rpc\\(\\\"${rpc}\\\"`));
  }
  assert.match(reservations, /reservas-pro-/);
  assert.match(reservations, /setInterval\(\(\) => \{/);
});

test("Turno vivo preserves customer consent, data and update contracts", () => {
  const customers = source("app/(app)/clientes/page.tsx");
  const detail = source("app/(app)/clientes/[id]/page.tsx");
  for (const value of [
    "vw_clientes_resumen",
    "clientes",
    "cliente_comunicaciones_consentimiento",
    "restaurante_modulos",
    "fidelizacion_config",
    "clientes-ranking-",
  ]) assert.match(customers, new RegExp(value));
  for (const value of [
    "vw_clientes_resumen",
    "reservas",
    "puntos_movimientos",
    "cliente_notificaciones",
    "cliente_comunicaciones_consentimiento",
  ]) assert.match(detail, new RegExp(value));
  assert.match(detail, /\.from\("clientes"\)[\s\S]*\.update\(/);
});

test("portrait is enabled only for the approved first-block routes", () => {
  const landscape = source("app/(app)/components/RequireLandscape.tsx");
  assert.match(landscape, /pathname === "\/dashboard"/);
  assert.match(landscape, /pathname === "\/reservas"/);
  assert.match(landscape, /pathname === "\/clientes"/);
  assert.match(landscape, /pathname\.startsWith\("\/clientes\/"\)/);
  assert.match(landscape, /!allowsPortrait && isMobile && isPortrait/);
});

test("the new visual system stays scoped to the panel and approved surfaces", () => {
  const css = source("app/(app)/components/turno-vivo/turno-vivo.css");
  const layout = source("app/(app)/layout.tsx");
  assert.match(css, /^\.gh-panel-shell/m);
  assert.match(css, /^\.gh-turno-scope/m);
  assert.doesNotMatch(css, /^(?:html|body|main|aside|button|input|select|textarea|a)\s*\{/m);
  assert.match(layout, /pathname === "\/dashboard"/);
  assert.match(layout, /pathname === "\/reservas"/);
  assert.match(layout, /pathname === "\/clientes"/);
  assert.match(layout, /pathname\.startsWith\("\/clientes\/"\)/);
});

test("demo access preserves the current host", () => {
  const login = source("app/(public)/login/page.tsx");
  const demo = source("app/demo/page.tsx");
  assert.match(login, /href="\/demo"/);
  assert.doesNotMatch(login, /href="https:\/\/panel\.gastrohelp\.es\/demo"/);
  assert.match(demo, /window\.location\.replace\("\/dashboard"\)/);
});
