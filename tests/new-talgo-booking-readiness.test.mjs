import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const config = {
  activo: true,
  confirmacion_automatica: true,
  confirmacion_automatica_hasta: 4,
  personas_minimas: 1,
  personas_maximas: 32,
  mesas_activas_en_disponibilidad: true,
};
const restaurantId = "11111111-1111-4111-8111-111111111111";
let currentConfig = config;
let emailEnabled = true;
let tables = Array.from({ length: 8 }, () => ({ capacidad: 4 }));
const client = {
  from(table) {
    return { select() {
      return { eq() {
        if (table === "sala_mesas") return { eq: async () => ({ data: tables, error: null }) };
        return { maybeSingle: async () => ({
          data: table === "reservas_config" ? currentConfig : { email_enabled: emailEnabled }, error: null,
        }) };
      } };
    } };
  },
};
const module = { exports: {} };
const source = readFileSync(new URL("../app/lib/newTalgoBookingReadiness.ts", import.meta.url), "utf8");
new Function("require", "module", "exports", ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)((name) => {
  if (name === "server-only") return {};
  if (name === "./supabaseAdmin") return { getSupabaseAdmin: () => client };
  throw Error(name);
}, module, module.exports);
const { newTalgoBookingReady } = module.exports;

test("New Talgo bookings stay closed until every group and notice gate is ready", async () => {
  const previous = Object.fromEntries([
    "NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID", "GASTROHELP_DEPLOYMENT_MODE",
    "NEW_TALGO_OWNER_NOTICE_CHANNEL", "NEW_TALGO_OWNER_EMAIL",
    "N8N_NATIVE_BOOKING_WEBHOOK_SECRET",
  ].map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID: restaurantId,
      GASTROHELP_DEPLOYMENT_MODE: "restricted-preview",
      NEW_TALGO_OWNER_NOTICE_CHANNEL: "n8n",
      NEW_TALGO_OWNER_EMAIL: "owner@example.invalid",
      N8N_NATIVE_BOOKING_WEBHOOK_SECRET: "fixture-only",
    });
    assert.equal(await newTalgoBookingReady(restaurantId), false);
    process.env.GASTROHELP_DEPLOYMENT_MODE = "approved-production";
    assert.equal(await newTalgoBookingReady(restaurantId), true);
    currentConfig = { ...config, confirmacion_automatica_hasta: null };
    assert.equal(await newTalgoBookingReady(restaurantId), false);
    currentConfig = config;
    emailEnabled = false;
    assert.equal(await newTalgoBookingReady(restaurantId), false);
    emailEnabled = true;
    tables = tables.slice(0, 7);
    assert.equal(await newTalgoBookingReady(restaurantId), false);
    assert.equal(await newTalgoBookingReady("22222222-2222-4222-8222-222222222222"), true);
  } finally {
    currentConfig = config;
    emailEnabled = true;
    tables = Array.from({ length: 8 }, () => ({ capacidad: 4 }));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
