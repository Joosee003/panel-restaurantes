import assert from "node:assert/strict";
import test from "node:test";
import {
  NEW_TALGO_RESTAURANT_ID,
  claimNewTalgoTestEvents,
  newTalgoSupabaseClaimStore,
} from "../lib/owner-notices/new-talgo-claim.ts";

const now = new Date("2026-10-29T18:00:00.000Z");
const otherRestaurant = "11111111-1111-4111-8111-111111111111";

function event(id, overrides = {}) {
  return {
    event_id: id,
    event_type: "reservation.created",
    reservation_id: null,
    restaurante_id: NEW_TALGO_RESTAURANT_ID,
    cliente_id: null,
    payload: {},
    attempts: 0,
    channel: "email",
    delivery_mode: "test",
    status: "pending",
    scheduled_for: "2026-10-29T17:00:00.000Z",
    next_attempt_at: null,
    locked_at: null,
    lock_token: null,
    ...overrides,
  };
}

function memoryStore(rows, config = { enabled: true, delivery_mode: "test", max_attempts: 5 }) {
  const state = new Map(rows.map((row) => [row.event_id, { ...row }]));
  const attempted = [];
  return {
    state,
    attempted,
    async config() { return config; },
    async candidates() { return [...state.values()].map((row) => ({ ...row })); },
    async claim(candidate, timestamp, token) {
      attempted.push(candidate.event_id);
      const current = state.get(candidate.event_id);
      if (
        !current ||
        current.restaurante_id !== NEW_TALGO_RESTAURANT_ID ||
        current.delivery_mode !== "test" ||
        current.status !== candidate.status ||
        current.attempts !== candidate.attempts ||
        current.locked_at !== candidate.locked_at ||
        current.lock_token !== candidate.lock_token
      ) return null;
      const claimed = {
        ...current,
        status: "processing",
        attempts: current.attempts + 1,
        locked_at: timestamp,
        lock_token: token,
      };
      state.set(candidate.event_id, claimed);
      return claimed;
    },
  };
}

test("concurrent preview dispatches claim one New Talgo event only once", async () => {
  const store = memoryStore([event("reservation.created:new-talgo-concurrent")]);
  const [first, second] = await Promise.all([
    claimNewTalgoTestEvents(store, now),
    claimNewTalgoTestEvents(store, now),
  ]);
  assert.equal(first.length + second.length, 1);
  assert.equal(store.state.get("reservation.created:new-talgo-concurrent").attempts, 1);
  assert.ok(store.state.get("reservation.created:new-talgo-concurrent").lock_token);
});

test("only due New Talgo test events are claimed; retries and stale locks are bounded", async () => {
  const store = memoryStore([
    event("other", { restaurante_id: otherRestaurant }),
    event("live", { delivery_mode: "live" }),
    event("review", { event_type: "visit.review_request" }),
    event("future", { scheduled_for: "2026-10-30T17:00:00.000Z" }),
    event("retry-future", { status: "retrying", attempts: 1, next_attempt_at: "2026-10-29T19:00:00.000Z" }),
    event("retry-due", { status: "retrying", attempts: 1, next_attempt_at: "2026-10-29T17:30:00.000Z" }),
    event("stale", { status: "processing", attempts: 1, locked_at: "2026-10-29T17:30:00.000Z", lock_token: "11111111-1111-4111-8111-111111111111" }),
    event("fresh", { status: "processing", attempts: 1, locked_at: "2026-10-29T17:59:00.000Z", lock_token: "22222222-2222-4222-8222-222222222222" }),
    event("exhausted", { status: "retrying", attempts: 5 }),
  ]);
  const claimed = await claimNewTalgoTestEvents(store, now);
  assert.deepEqual(claimed.map((row) => row.event_id), ["retry-due", "stale"]);
  assert.deepEqual(store.attempted, ["retry-due", "stale"]);
  assert.equal(store.state.get("other").status, "pending");
  assert.equal(store.state.get("live").status, "pending");
  assert.equal(store.state.get("review").status, "pending");
});

test("disabled New Talgo automation never touches its queue", async () => {
  const store = memoryStore(
    [event("disabled")],
    { enabled: false, delivery_mode: "test", max_attempts: 5 },
  );
  assert.deepEqual(await claimNewTalgoTestEvents(store, now), []);
  assert.deepEqual(store.attempted, []);
});

test("Supabase compare-and-swap repeats tenant, mode, state, and lock filters", async () => {
  const queries = [];
  const client = {
    from(table) {
      const record = { table, filters: [], update: null };
      queries.push(record);
      const builder = {
        select() { return builder; },
        update(values) { record.update = values; return builder; },
        eq(key, value) { record.filters.push(["eq", key, value]); return builder; },
        is(key, value) { record.filters.push(["is", key, value]); return builder; },
        in(key, value) { record.filters.push(["in", key, value]); return builder; },
        lte(key, value) { record.filters.push(["lte", key, value]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        async maybeSingle() { return { data: null, error: null }; },
        then(resolve) { resolve({ data: [], error: null }); },
      };
      return builder;
    },
  };
  const store = newTalgoSupabaseClaimStore(client);
  await store.config();
  await store.candidates(10, now.toISOString());
  await store.claim(event("sample"), now.toISOString(), "33333333-3333-4333-8333-333333333333");
  for (const query of queries) {
    assert.ok(query.filters.some(([op, key, value]) =>
      op === "eq" && key === "restaurante_id" && value === NEW_TALGO_RESTAURANT_ID));
  }
  const update = queries.find((query) => query.update);
  for (const [key, value] of [
    ["delivery_mode", "test"],
    ["event_type", "reservation.created"],
    ["status", "pending"],
    ["attempts", 0],
  ]) {
    assert.ok(update.filters.some(([op, field, actual]) =>
      op === "eq" && field === key && actual === value));
  }
  assert.ok(update.filters.some(([op, key]) => op === "is" && key === "lock_token"));
});

