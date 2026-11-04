import assert from "node:assert/strict";
import test from "node:test";
import { NEW_TALGO_RESTAURANT_ID } from "../lib/owner-notices/new-talgo-claim.ts";
import { claimNewTalgoLiveEvents, isDueNewTalgoLiveEvent } from "../lib/owner-notices/new-talgo-live-claim.ts";

const now = new Date("2026-11-04T18:00:00.000Z");
const sample = {
  event_id: "reservation.created:fixture", event_type: "reservation.created",
  reservation_id: null, restaurante_id: NEW_TALGO_RESTAURANT_ID,
  cliente_id: null, payload: {}, attempts: 0, channel: "email",
  delivery_mode: "live", status: "pending",
  scheduled_for: "2026-11-04T17:00:00.000Z", next_attempt_at: null,
  locked_at: null, lock_token: null,
};

test("live claim eligibility keeps tenant, event, timing and lock gates", () => {
  assert.equal(isDueNewTalgoLiveEvent(sample, now, 3), true);
  for (const change of [
    { restaurante_id: "11111111-1111-4111-8111-111111111111" },
    { delivery_mode: "test" }, { event_type: "reservation.reminder" },
    { status: "skipped" }, { attempts: 3 },
    { scheduled_for: "2026-11-04T19:00:00.000Z" },
    { next_attempt_at: "2026-11-04T19:00:00.000Z" },
    { status: "processing", locked_at: "2026-11-04T17:59:00.000Z" },
  ]) assert.equal(isDueNewTalgoLiveEvent({ ...sample, ...change }, now, 3), false);
  assert.equal(isDueNewTalgoLiveEvent({ ...sample, status: "processing", locked_at: "2026-11-04T17:00:00.000Z" }, now, 3), true);
});

function fakeClient({ enabled = true, mode = "live", email = true, module = true } = {}) {
  const queries = [];
  return {
    queries,
    from(table) {
      const record = { table, filters: [], update: null };
      queries.push(record);
      const builder = {
        select() { return builder; },
        update(value) { record.update = value; return builder; },
        eq(key, value) { record.filters.push(["eq", key, value]); return builder; },
        is(key, value) { record.filters.push(["is", key, value]); return builder; },
        in(key, value) { record.filters.push(["in", key, value]); return builder; },
        lte(key, value) { record.filters.push(["lte", key, value]); return builder; },
        order() { return builder; }, limit() { return builder; },
        async maybeSingle() {
          if (table === "automatizaciones_config") return { data: { enabled, delivery_mode: mode, email_enabled: email, max_attempts: 3 }, error: null };
          if (table === "restaurante_modulos") return { data: { automatizaciones: module }, error: null };
          return { data: { ...sample, ...record.update, lock_token: record.update.lock_token }, error: null };
        },
        then(resolve) { resolve({ data: [sample], error: null }); },
      };
      return builder;
    },
  };
}

test("disabled config, test mode, disabled email or module never reads queue", async () => {
  for (const options of [{ enabled: false }, { mode: "test" }, { email: false }, { module: false }]) {
    const client = fakeClient(options);
    assert.deepEqual(await claimNewTalgoLiveEvents(client, now), []);
    assert.equal(client.queries.some((query) => query.table === "reservation_webhook_deliveries"), false);
  }
});

test("live claim repeats tenant, mode and state in atomic update", async () => {
  const client = fakeClient();
  const claimed = await claimNewTalgoLiveEvents(client, now);
  assert.equal(claimed.length, 1);
  const queue = client.queries.filter((query) => query.table === "reservation_webhook_deliveries");
  assert.equal(queue.length, 2);
  for (const query of queue) {
    assert.ok(query.filters.some(([op, key, value]) => op === "eq" && key === "restaurante_id" && value === NEW_TALGO_RESTAURANT_ID));
    assert.ok(query.filters.some(([op, key, value]) => op === "eq" && key === "delivery_mode" && value === "live"));
  }
  for (const [key, value] of [["status", "pending"], ["attempts", 0], ["event_type", "reservation.created"]]) {
    assert.ok(queue[1].filters.some(([op, field, actual]) => op === "eq" && field === key && actual === value));
  }
});

