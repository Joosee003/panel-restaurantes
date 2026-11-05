import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/public/new-talgo/promotions/route.ts";

test("fictional promotion preview is limited to Vercel Preview", async () => {
  const previous = process.env.VERCEL_ENV;
  const request = new Request("https://newtalgo.gastrohelp.es/api/public/new-talgo/promotions?qa=1");
  try {
    process.env.VERCEL_ENV = "preview";
    const qa = await (await GET(request)).json();
    assert.equal(qa.qaFicticia, true);
    assert.deepEqual(qa.promociones.map(item => item.ubicacion).sort(), ["estacion", "partidas", "universitarios"]);
    for (const item of qa.promociones) {
      assert.match(item.titulo, /^EJEMPLO QA/);
      assert.match(item.condiciones, /No es una oferta válida/);
      assert.equal(item.precio, null);
      assert.equal(item.descuentoPorcentaje, null);
      assert.equal(item.descuentoEuros, null);
    }
    process.env.VERCEL_ENV = "production";
    const live = await (await GET(request)).json();
    assert.equal(live.qaFicticia, undefined);
    assert.deepEqual(live.promociones, []);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

