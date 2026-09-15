import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const module = { exports: {} };
new Function(
  "module",
  "exports",
  ts.transpileModule(
    readFileSync(new URL("../lib/admin/overview.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
)(module, module.exports);
const { createPeriod, buildAgencyOverview, metricChange, agencyDay } =
  module.exports;
const period = createPeriod(7, new Date("2026-09-15T12:00:00Z"));
const fixture = (extra) => ({
  restaurants: [
    {
      id: "a",
      nombre: "Cliente real",
      telefono: "600123123",
      direccion: "Dirección",
    },
    { id: "b", nombre: "Demo" },
  ],
  modules: [
    {
      restaurante_id: "b",
      reservas: true,
      clientes: true,
      resenas: true,
      chatbot: true,
    },
  ],
  opinionConfig: [
    {
      restaurante_id: "a",
      slug: "cliente",
      active: true,
      google_review_url: "https://g.page/r/fixture/review",
    },
  ],
  webs: [{ restaurante_id: "b", es_demo: true }],
  ...extra,
});
test("all restaurants drive the directory, including reputation-only clients; demos remain explicit", () => {
  const result = buildAgencyOverview(fixture(), period).restaurants;
  assert.equal(result.length, 2);
  assert.equal(result[0].reputationOnly, true);
  assert.equal(result[0].demo, false);
  assert.equal(result[1].demo, true);
  assert.deepEqual(
    result[0].setup.map((t) => t.id),
    ["profile", "access", "google", "opinion"],
  );
  assert.equal(result[1].setup.find((t) => t.id === "chatbot").ready, false);
});
test("equal complete periods exclude today, handle local midnight and survive daylight-saving transitions", () => {
  assert.deepEqual(
    [period.previousStart, period.start, period.end],
    ["2026-09-01", "2026-09-08", "2026-09-15"],
  );
  assert.equal(agencyDay("2026-09-14T22:30:00Z"), "2026-09-15");
  assert.equal(
    createPeriod(7, new Date("2026-03-30T12:00:00Z")).start,
    "2026-03-23",
  );
  const r = buildAgencyOverview(
    fixture({
      opinions: [
        { restaurante_id: "a", created_at: "2026-09-07T12:00:00Z", rating: 3 },
        { restaurante_id: "a", created_at: "2026-09-08T12:00:00Z", rating: 5 },
        { restaurante_id: "a", created_at: "2026-09-14T22:30:00Z", rating: 1 },
        { restaurante_id: "b", created_at: "2026-09-09T12:00:00Z", rating: 1 },
      ],
    }),
    period,
  ).restaurants[0];
  assert.deepEqual(r.metrics.opinions, { current: 1, previous: 1 });
  assert.deepEqual(r.metrics.rating, { current: 5, previous: 3 });
  assert.equal(
    r.series.reduce((s, d) => s + d.opinions, 0),
    1,
  );
  assert.throws(() => createPeriod(365), /INVALID_PERIOD/);
});
test("unknown and zero baselines never become an invented growth rate", () => {
  assert.equal(metricChange({ current: 5, previous: 0 }), "Sin base anterior");
  assert.equal(
    metricChange({ current: 0, previous: 0 }),
    "Sin actividad en ambos periodos",
  );
  assert.equal(
    metricChange({ current: 15, previous: 10 }),
    "+50% respecto al periodo anterior",
  );
  const r = buildAgencyOverview(fixture(), period).restaurants[0];
  assert.equal(r.metrics.rating.current, null);
});
test("review openings are not confirmations; lost consent does not hide pending verification", () => {
  const requests = [
    {
      restaurante_id: "b",
      sent_at: "2026-09-10T10:00:00Z",
      google_opened_at: "2026-09-11T10:00:00Z",
      confirmed_at: null,
      status: "cancelled",
      last_error: "review_consent_missing",
    },
    {
      restaurante_id: "b",
      sent_at: "2026-08-01T10:00:00Z",
      confirmed_at: "2026-09-12T10:00:00Z",
      status: "sent",
    },
    {
      restaurante_id: "b",
      sent_at: "2026-09-09T10:00:00Z",
      confirmed_at: "2026-09-13T10:00:00Z",
      status: "sent",
    },
  ];
  const r = buildAgencyOverview(fixture({ requests }), period).restaurants[1];
  assert.deepEqual(r.reviews, {
    sent: 2,
    opened: 1,
    confirmedFromSent: 1,
    pending: 1,
    failed: 0,
    undatedSent: 0,
  });
  assert.equal(r.metrics.confirmed.current, 2);
});
test("legacy requests remain pending, repeated visits count once and customer confirmation settles all visits", () => {
  const customers = [
    { id: "old-pending", restaurante_id: "b", ya_dejo_resena: false },
    { id: "confirmed", restaurante_id: "b", ya_dejo_resena: true },
    { id: "new-pending", restaurante_id: "b", ya_dejo_resena: false },
  ];
  const bookings = [
    { id: "old-visit", cliente_id: "old-pending" },
    { id: "old-second-visit", cliente_id: "old-pending" },
    { id: "confirmed-visit", cliente_id: "confirmed" },
  ].map((row) => ({ ...row, restaurante_id: "b", resena_solicitada: true }));
  const requests = [
    {
      id: "1",
      cliente_id: "confirmed",
      reserva_id: "confirmed-visit",
      sent_at: "2026-09-10T10:00:00Z",
      confirmed_at: "2026-09-12T10:00:00Z",
    },
    {
      id: "2",
      cliente_id: "confirmed",
      sent_at: "2026-09-11T10:00:00Z",
      confirmed_at: "2026-09-13T10:00:00Z",
    },
    {
      id: "3",
      cliente_id: "new-pending",
      sent_at: "2026-09-10T10:00:00Z",
      status: "cancelled",
    },
    {
      id: "4",
      cliente_id: "new-pending",
      google_opened_at: "2026-09-11T10:00:00Z",
      status: "uncertain",
    },
  ].map((row) => ({ ...row, restaurante_id: "b" }));
  const r = buildAgencyOverview(
    fixture({ bookings, requests, customers }),
    period,
  ).restaurants[1];
  assert.deepEqual(r.reviews, {
    sent: 2,
    opened: 0,
    confirmedFromSent: 1,
    pending: 2,
    failed: 1,
    undatedSent: 1,
  });
  assert.equal(r.metrics.confirmed.current, 1);
  assert.equal(
    r.series.reduce((sum, day) => sum + day.confirmed, 0),
    1,
  );
});
test("attendance categories are exclusive and never infer visits from unmarked bookings", () => {
  const rows = [
    { estado: "cancelada", atendida: true },
    { estado: "no-show", atendida: true },
    { estado: "confirmada", atendida: true },
    { estado: "confirmada", atendida: false },
  ].map((row) => ({
    ...row,
    restaurante_id: "b",
    fecha_hora_reserva: "2026-09-12T20:00:00",
    created_at: "2026-09-10T10:00:00Z",
  }));
  const r = buildAgencyOverview(fixture({ bookings: rows }), period)
    .restaurants[1];
  assert.deepEqual(r.attendance, {
    total: 4,
    attended: 1,
    cancelled: 1,
    noShow: 1,
    unmarked: 1,
  });
});
test("private-number readiness does not erase an active shared number during migration", () => {
  const r = buildAgencyOverview(
    fixture({
      channels: [{ restaurante_id: "b", status: "FAILED", enabled: false }],
      routes: [{ restaurante_id: "b", enabled: true, delivery_mode: "live" }],
    }),
    period,
  ).restaurants[1];
  assert.equal(r.channel.label, "Número compartido activo");
  assert.equal(r.setup.find((t) => t.id === "chatbot").ready, true);
});
test("an invitation awaiting acceptance never counts as delivered access", () => {
  const r = buildAgencyOverview(
    fixture({
      access: [{ restaurante_id: "b" }],
      invitations: [{ restaurante_id: "b", status: "sent" }],
    }),
    period,
  ).restaurants[1];
  assert.equal(r.setup.find((t) => t.id === "access").ready, false);
});
test("a private shared pilot is visible as a working test, without claiming public readiness", () => {
  const r = buildAgencyOverview(
    fixture({
      routes: [
        { restaurante_id: "b", enabled: true, delivery_mode: "private_live" },
      ],
      channels: [{ restaurante_id: "b", enabled: false, status: "FAILED" }],
    }),
    period,
  ).restaurants[1];
  assert.equal(r.channel.label, "Compartido en prueba privada");
  assert.equal(r.setup.find((task) => task.id === "chatbot").ready, false);
});
test("follow-up aspects use the restaurant labels and only low ratings, with no invented advice", () => {
  const base = fixture();
  base.opinionConfig[0].aspect_labels = { comida: "Cocina" };
  const r = buildAgencyOverview(
    {
      ...base,
      opinions: [
        {
          restaurante_id: "a",
          created_at: "2026-09-10T12:00:00Z",
          rating: 2,
          aspectos: ["comida", "comida"],
        },
        {
          restaurante_id: "a",
          created_at: "2026-09-11T12:00:00Z",
          rating: 5,
          aspectos: ["servicio"],
        },
      ],
      openOpinions: [
        { restaurante_id: "a", seguimiento: "pendiente" },
        { restaurante_id: "b", seguimiento: "pendiente" },
      ],
    },
    period,
  ).restaurants[0];
  assert.deepEqual(r.opinion.aspects, [{ label: "Cocina", count: 1 }]);
  assert.equal(r.opinion.unresolved, 1);
});
