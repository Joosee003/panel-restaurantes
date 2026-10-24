import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("White Label routes mount the original GastroHelp screens", () => {
  const routes = [
    ["../app/(white-label)/panel-personalizado/page.tsx", "../../(app)/dashboard/page"],
    ["../app/(white-label)/panel-personalizado/reservas/page.tsx", "../../../(app)/reservas/page"],
    ["../app/(white-label)/panel-personalizado/clientes/page.tsx", "../../../(app)/clientes/page"],
    ["../app/(white-label)/panel-personalizado/clientes/[id]/page.tsx", "../../../../(app)/clientes/[id]/page"],
    ["../app/(white-label)/panel-personalizado/carta/page.tsx", "../../../(app)/panel/carta-productos/page"],
    ["../app/(white-label)/panel-personalizado/promociones/page.tsx", "../../../(app)/panel/promociones/page"],
  ];
  for (const [route, original] of routes) {
    const code = source(route);
    assert.match(code, new RegExp(`export \\{ default \\} from ["']${original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
    assert.doesNotMatch(code, /createClient|PanelData|mock|adapter/i);
  }
});

test("White Label shell shares GastroHelp Auth, restaurant scope and agency access", () => {
  const code = source("../app/(white-label)/panel-personalizado/WhiteLabelLayoutClient.tsx");
  for (const original of ["AuthGuard", "RestaurantScope", "AgencyRestaurantContext", "ModuleRouteGuard", "DemoModeGuard", "ThemeProvider", "getRestauranteUsuario"]) {
    assert.match(code, new RegExp(original));
  }
  assert.match(code, /getWhiteLabelBrand\(id\)/);
  assert.match(code, /if \(!brand\)/);
  assert.doesNotMatch(code, /service_role|SUPABASE_SERVICE_ROLE/);
  const modules = source("../app/(app)/lib/restaurantModules.ts");
  assert.match(modules, /"\/panel-personalizado\/reservas"/);
  assert.match(modules, /"\/panel-personalizado\/clientes"/);
  assert.match(modules, /"\/panel-personalizado\/carta"/);
  assert.match(code, /href: "\/panel-personalizado\/carta"/);
  assert.match(code, /href: "\/panel-personalizado\/promociones"/);
});

test("private routes are excluded from caches and search engines", () => {
  const config = source("../next.config.ts");
  assert.match(config, /source: "\/panel-personalizado\/:path\*"/);
  assert.match(config, /private, no-store, max-age=0/);
  assert.match(config, /noindex, nofollow, noarchive/);
});
