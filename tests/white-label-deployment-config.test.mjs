import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const syntheticRef = "aaaaaaaaaaaaaaaaaaaa";
const restaurantId = "11111111-1111-4111-8111-111111111111";

function loadConfig(values) {
  const env = { ...process.env };
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "GASTROHELP_DEPLOYMENT_MODE", "GASTROHELP_APPROVED_PROJECT_REF", "NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID", "NEW_TALGO_PUBLIC_HOST", "NEW_TALGO_PUBLICATION_APPROVED", "NEW_TALGO_PUBLIC_MENU_TOKEN"]) {
    delete env[name];
  }
  Object.assign(env, values);
  return spawnSync(process.execPath, ["--input-type=module", "-e",
    "import('./next.config.ts').then(async m => { const h = await m.default.headers(); console.log(h[0].headers.find(x => x.key === 'Content-Security-Policy').value); console.log(JSON.stringify(await m.default.rewrites())); })"],
    { cwd: new URL("..", import.meta.url), env, encoding: "utf8" });
}

test("isolated build rejects remote Supabase without an explicit approved target", () => {
  const result = loadConfig({ NEXT_PUBLIC_SUPABASE_URL: `https://${syntheticRef}.supabase.co` });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ISOLATED_CLONE_REMOTE_SUPABASE_FORBIDDEN/);
});

test("production mode requires the exact approved project and restaurant UUID", () => {
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${syntheticRef}.supabase.co`,
    GASTROHELP_DEPLOYMENT_MODE: "approved-production",
    GASTROHELP_APPROVED_PROJECT_REF: syntheticRef,
    NEW_TALGO_PUBLIC_HOST: "newtalgo.example",
    NEW_TALGO_PUBLICATION_APPROVED: "yes",
    NEW_TALGO_PUBLIC_MENU_TOKEN: "A".repeat(32),
  };
  const missingRestaurant = loadConfig(base);
  assert.notEqual(missingRestaurant.status, 0);
  assert.match(missingRestaurant.stderr, /NEW_TALGO_RESTAURANT_ID_REQUIRED/);
  const wrongProject = loadConfig({ ...base, GASTROHELP_APPROVED_PROJECT_REF: "bbbbbbbbbbbbbbbbbbbb", NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID: restaurantId });
  assert.notEqual(wrongProject.status, 0);
  assert.match(wrongProject.stderr, /APPROVED_PRODUCTION_PROJECT_REQUIRED/);
  const approved = loadConfig({ ...base, NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID: restaurantId });
  assert.equal(approved.status, 0, approved.stderr);
  assert.match(approved.stdout, new RegExp(`connect-src 'self' https://${syntheticRef}\\.supabase\\.co wss://${syntheticRef}\\.supabase\\.co`));
  assert.match(approved.stdout, /upgrade-insecure-requests/);
});

test("production build refuses New Talgo content without explicit publication and rights approval", () => {
  const denied = loadConfig({
    NEXT_PUBLIC_SUPABASE_URL: `https://${syntheticRef}.supabase.co`,
    GASTROHELP_DEPLOYMENT_MODE: "approved-production",
    GASTROHELP_APPROVED_PROJECT_REF: syntheticRef,
    NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID: restaurantId,
    NEW_TALGO_PUBLIC_HOST: "newtalgo.example",
    NEW_TALGO_PUBLIC_MENU_TOKEN: "A".repeat(32),
  });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /NEW_TALGO_CONTENT_AND_PHOTO_RIGHTS_APPROVAL_REQUIRED/);
});

test("local Supabase remains usable without release mode", () => {
  const result = loadConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /http:\/\/127\.0\.0\.1:54321 ws:\/\/127\.0\.0\.1:54321/);
  assert.match(result.stdout, /img-src 'self' data: blob: https: http:\/\/127\.0\.0\.1:54321/);
});

test("public restaurant domain routing requires explicit approval and stays scoped to that host", () => {
  const host = "newtalgo.example";
  const denied = loadConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEW_TALGO_PUBLIC_HOST: host });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /NEW_TALGO_PUBLIC_HOST_REQUIRES_APPROVED_PRODUCTION/);
  const approved = loadConfig({
    NEXT_PUBLIC_SUPABASE_URL: `https://${syntheticRef}.supabase.co`,
    GASTROHELP_DEPLOYMENT_MODE: "approved-production",
    GASTROHELP_APPROVED_PROJECT_REF: syntheticRef,
    NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID: restaurantId,
    NEW_TALGO_PUBLIC_HOST: host,
    NEW_TALGO_PUBLICATION_APPROVED: "yes",
    NEW_TALGO_PUBLIC_MENU_TOKEN: "A".repeat(32),
  });
  assert.equal(approved.status, 0, approved.stderr);
  const rewrites = JSON.parse(approved.stdout.trim().split("\n").at(-1));
  assert.ok(rewrites.some(route => route.source === "/" && route.destination === "/new-talgo/index.html"));
  assert.ok(rewrites.some(route => route.source === "/menu-live.js" && route.destination === "/new-talgo/menu-live.js"));
  assert.ok(rewrites.some(route => route.source === "/promotions-live.js" && route.destination === "/new-talgo/promotions-live.js"));
  assert.ok(rewrites.every(route => route.has?.[0]?.value === host));
});
