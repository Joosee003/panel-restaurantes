import assert from "node:assert/strict";
import test from "node:test";
import { allowsNewTalgoOwnerNotice } from "../lib/owner-notices/eligibility.ts";

const base = {
  deliveryMode: "live",
  deploymentMode: "approved-production",
  channel: "n8n",
  restaurantId: "11111111-1111-4111-8111-111111111111",
  configuredRestaurantId: "11111111-1111-4111-8111-111111111111",
  eventType: "reservation.created",
  emailEnabled: true,
  ownerEmail: "newtalgo@gmail.com",
  payloadRestaurantEmail: "newtalgo@gmail.com",
};

test("existing n8n owner notice permits the four operational reservation events", () => {
  for (const eventType of ["reservation.created", "reservation.rescheduled",
    "reservation.cancelled", "reservation.status_changed"]) {
    assert.equal(allowsNewTalgoOwnerNotice({ ...base, eventType }), true, eventType);
  }
  assert.equal(allowsNewTalgoOwnerNotice({ ...base, eventType: "reservation.reminder" }), false);
});

test("owner notice cannot route another restaurant, test mode, or wrong recipient", () => {
  for (const change of [
    { restaurantId: "22222222-2222-4222-8222-222222222222" },
    { deliveryMode: "test" },
    { deploymentMode: undefined },
    { channel: undefined },
    { emailEnabled: false },
    { ownerEmail: "" },
    { payloadRestaurantEmail: "someone@example.invalid" },
  ]) {
    assert.equal(allowsNewTalgoOwnerNotice({ ...base, ...change }), false, JSON.stringify(change));
  }
});
