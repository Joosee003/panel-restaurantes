import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const id = "11111111-1111-4111-8111-111111111111";
const whatsappUrl = "https://wa.me/34643970267";
const restaurant = { restauranteId: id, demo: false, booking: { enabled: true } };
const json = (body, options = {}) => new Response(JSON.stringify(body), options);

function compile(path, imports) {
  const module = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  new Function("require", "module", "exports", ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)((name) => {
    if (name in imports) return imports[name];
    throw Error(name);
  }, module, module.exports);
  return module.exports;
}

test("New Talgo routes direct parties above ten to the confirmed WhatsApp before storage", async () => {
  const previousId = process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID;
  process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID = id;
  let writes = 0;
  const common = {
    "next/server": { NextResponse: { json } },
    "../../../../../lib/publicRestaurant": { getPublicRestaurant: async () => restaurant },
    "../../../../../lib/newTalgoBookingReadiness": { newTalgoBookingReady: async () => true },
    "../../../../../lib/publicRateLimit": { consumePublicRateLimit: async () => true },
    "../../../../../lib/supabaseAdmin": { getSupabaseAdmin: () => { writes++; throw Error("Unexpected storage"); } },
  };
  try {
    const bookings = compile("../app/api/public/restaurants/[slug]/bookings/route.ts", {
      ...common,
      "../../../../../lib/bookingDate": { isBookingStartAllowed: () => true },
      "../../../../../lib/publicLegal": { BOOKING_LEGAL_VERSION: "2026-08-03" },
    });
    const request = new Request("https://fixture.invalid/api/public/restaurants/new-talgo/bookings", {
      method: "POST",
      body: JSON.stringify({
        start: "2026-11-04T11:30:00Z", party: 11, name: "Grupo ficticio",
        phone: "+34600000000", privacyInformed: true, conditionsAccepted: true,
        legalVersion: "2026-08-03", idempotencyKey: id,
      }),
    });
    const response = await bookings.POST(request, { params: Promise.resolve({ slug: "new-talgo" }) });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: "WHATSAPP_CONTACT_REQUIRED", whatsappUrl });

    const availability = compile("../app/api/public/restaurants/[slug]/availability/route.ts", {
      ...common,
      "../../../../../lib/bookingDate": { isBookingDateAllowed: () => true },
    });
    const url = new URL("https://fixture.invalid/api/public/restaurants/new-talgo/availability?date=2026-11-04&party=11");
    const slotsResponse = await availability.GET({ nextUrl: url }, { params: Promise.resolve({ slug: "new-talgo" }) });
    assert.equal(slotsResponse.status, 400);
    assert.deepEqual(await slotsResponse.json(), { ok: false, error: "WHATSAPP_CONTACT_REQUIRED", whatsappUrl });
    assert.equal(writes, 0);
  } finally {
    if (previousId === undefined) delete process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID;
    else process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID = previousId;
  }
});
