import assert from "node:assert/strict";
import { test } from "node:test";
import { qrBillKey, qrQuoteSignature, qrTotal, readAllActiveQrOrders } from "../app/(app)/lib/qr-billing.ts";

const order = { id: "one", restaurante_id: "a", mesa_id: "t1", mesa_session_id: "s1", total: 20 };

test("groups only the same restaurant, table and session", () => {
  assert.equal(qrBillKey(order), qrBillKey({ ...order, id: "two" }));
  for (const change of [{ restaurante_id: "b" }, { mesa_id: "t2" }, { mesa_session_id: "s2" }]) {
    assert.notEqual(qrBillKey(order), qrBillKey({ ...order, ...change }));
  }
});

test("unprotected orders stay separate", () => {
  for (const change of [{ mesa_id: null }, { mesa_session_id: null }]) {
    assert.notEqual(qrBillKey({ ...order, ...change }), qrBillKey({ ...order, ...change, id: "two" }));
  }
});

test("quote accepts reordering but detects price, session, added and removed orders", () => {
  const second = { ...order, id: "two", total: 5 };
  const signature = qrQuoteSignature([order, second]);
  assert.equal(signature, qrQuoteSignature([second, order]));
  assert.notEqual(signature, qrQuoteSignature([order]));
  assert.notEqual(signature, qrQuoteSignature([order, { ...second, total: 6 }]));
  assert.notEqual(signature, qrQuoteSignature([order, { ...second, mesa_session_id: "next" }]));
});

test("totals use cents and reject invalid money", () => {
  assert.equal(qrTotal([{ ...order, total: 0.1 }, { ...order, total: 0.2 }]), 0.3);
  for (const total of [NaN, Infinity, -1]) assert.throws(() => qrTotal([{ ...order, total }]));
});

test("open-order pagination is independent of the history limit", async () => {
  const source = Array.from({ length: 620 }, (_, i) => ({ id: String(i).padStart(4, "0") }));
  const result = await readAllActiveQrOrders(async (after, limit) => source.filter((row) => after === null || row.id > after).slice(0, limit));
  assert.equal(result.length, 620);
});

test("pagination deduplicates boundary movement and rejects an incomplete result", async () => {
  let page = 0;
  const result = await readAllActiveQrOrders(async () => ++page === 1 ? [{ id: "1" }, { id: "2" }] : [{ id: "2" }], 2);
  assert.equal(result.length, 2);
  await assert.rejects(readAllActiveQrOrders(async () => [{ id: "1" }, { id: "2" }], 2, 1), /todos los pedidos/);
});

test("closing an earlier-page order cannot hide the next active order", async () => {
  let source = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }];
  const result = await readAllActiveQrOrders(async (after, limit) => {
    if (after) source = source.filter((row) => row.id !== "1");
    return source.filter((row) => after === null || row.id > after).slice(0, limit);
  }, 2);
  assert.deepEqual(result.map((row) => row.id), ["1", "2", "3", "4"]);
});

test("a non-advancing page fails visibly instead of hanging", async () => {
  await assert.rejects(readAllActiveQrOrders(async () => [{ id: "1" }], 1), /lista completa/);
});
