import assert from "node:assert/strict";
import test from "node:test";
import { resolveNewTalgoWebhookTarget } from "../lib/owner-notices/new-talgo-routing.ts";

const restaurantId = "408f0cff-68a0-40a7-b975-d2ed8e2dbfcc";
const endpoint = "https://n8n.gastrohelp.es/webhook/new-talgo-reservas";
const fixture = {
  restaurantId,
  configuredRestaurantId: restaurantId,
  url: endpoint,
  secret: "fixture-secret-for-isolated-routing-only-0001",
};

test("New Talgo uses only its dedicated authenticated webhook", () => {
  assert.deepEqual(resolveNewTalgoWebhookTarget(fixture), {
    url: endpoint,
    secret: fixture.secret,
  });
});

test("other restaurants keep their existing routing", () => {
  assert.equal(resolveNewTalgoWebhookTarget({ ...fixture, restaurantId: "11111111-1111-4111-8111-111111111111" }), null);
  assert.equal(resolveNewTalgoWebhookTarget({ ...fixture, configuredRestaurantId: undefined }), null);
});

test("New Talgo fails closed without its own URL or secret", () => {
  assert.throws(() => resolveNewTalgoWebhookTarget({ ...fixture, url: undefined }), /NEW_TALGO_WEBHOOK_NOT_CONFIGURED/);
  assert.throws(() => resolveNewTalgoWebhookTarget({ ...fixture, secret: undefined }), /NEW_TALGO_WEBHOOK_SECRET_NOT_CONFIGURED/);
  assert.throws(() => resolveNewTalgoWebhookTarget({ ...fixture, secret: "short" }), /NEW_TALGO_WEBHOOK_SECRET_NOT_CONFIGURED/);
});

test("New Talgo refuses the shared endpoint and URL redirects", () => {
  for (const url of [
    "https://n8n.gastrohelp.es/webhook/gastrohelp-reservas-native",
    "https://n8n.gastrohelp.es.evil.invalid/webhook/new-talgo-reservas",
    "http://n8n.gastrohelp.es/webhook/new-talgo-reservas",
    `${endpoint}?secret=fixture`,
    `${endpoint}#fragment`,
    "https://user:pass@n8n.gastrohelp.es/webhook/new-talgo-reservas",
  ]) {
    assert.throws(() => resolveNewTalgoWebhookTarget({ ...fixture, url }), /NEW_TALGO_WEBHOOK_INVALID/, url);
  }
});

