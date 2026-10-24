import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(await readFile(new URL("../local-schema/supabase-status.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../local-schema/fixture-credentials.json", import.meta.url), "utf8"));
const target = new URL(status.API_URL);
assert.equal(target.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
assert.equal(target.port, "54321");
const env = await readFile(new URL("../.env.local", import.meta.url), "utf8");
const secret = env.match(/^OWNER_NOTICE_DISPATCH_SECRET=(.+)$/m)?.[1];
assert.ok(secret && secret.length >= 32);
const client = key => createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = client(status.SERVICE_ROLE_KEY);
const owner = client(status.ANON_KEY);
const other = client(status.ANON_KEY);
for (const [api, user] of [[owner, fixture.users.newTalgo], [other, fixture.users.mesaNorte]]) {
  const { error } = await api.auth.signInWithPassword({ email: user.email, password: user.password });
  assert.ifError(error);
}
const restaurantId = fixture.restaurants.newTalgo;
const fakeInbox = "new-talgo-local@example.invalid";
function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code || result.error.message}`);
  return result.data;
}
must(await admin.from("restaurant_owner_notice_config").upsert({
  restaurante_id: restaurantId, email: fakeInbox, enabled: true, mobile_verified_at: null,
}), "LOCAL_OWNER_NOTICE_CONFIG");
let start;
let bookingArgs;
let booked;
const suffix = randomUUID().slice(0, 8);
for (let offset = 2; offset < 25 && !booked; offset++) {
  const date = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const slots = must(await owner.rpc("obtener_disponibilidad_manual", {
    p_restaurante_id: restaurantId, p_fecha: date, p_personas: 1,
  }), "LOCAL_AVAILABILITY");
  for (const slot of [...(slots || [])].reverse()) {
    const args = {
      p_restaurante_id: restaurantId, p_inicio_at: slot.inicio_at, p_personas: 1,
      p_nombre: `Reserva ficticia aviso ${suffix}`,
      p_telefono: "+34600000093", p_email: `owner-notice-${suffix}@example.invalid`,
      p_notas: null, p_idempotency_key: randomUUID(),
    };
    const result = await owner.rpc("crear_reserva_manual", args);
    if (!result.error) { start = slot.inicio_at; bookingArgs = args; booked = result.data; break; }
  }
}
assert.ok(start && booked && bookingArgs, "A fictional local booking slot is required");
assert.equal(booked.ok, true);
const repeat = must(await owner.rpc("crear_reserva_manual", bookingArgs), "LOCAL_IDEMPOTENCY");
assert.equal(repeat.reserva_id, booked.reserva_id);
const reservationId = booked.reserva_id;
const eventId = `reservation.created:${reservationId}`;
const notices = must(await admin.from("restaurant_owner_notice_deliveries")
  .select("event_id,status,attempts").eq("event_id", eventId), "NOTICE_ENQUEUED");
assert.equal(notices.length, 1);
assert.equal(notices[0].status, "pending");
const foreign = await other.from("restaurant_owner_notice_deliveries").select("event_id").eq("event_id", eventId);
assert.ok(foreign.error || foreign.data?.length === 0, "Notification outbox is service-only");
const url = "http://127.0.0.1:4176/api/owner-notices/dispatch";
const denied = await fetch(url, { method: "POST" });
assert.equal(denied.status, 401);
let delivered;
for (let attempt = 0; attempt < 12; attempt++) {
  const worker = spawnSync(process.execPath, ["scripts/run-owner-notice-worker-local.mjs", "--once"],
    { encoding: "utf8", timeout: 60_000 });
  assert.equal(worker.status, 0, worker.stderr || "Local worker must dispatch without an open panel");
  delivered = must(await admin.from("restaurant_owner_notice_deliveries")
    .select("status,attempts,delivered_at,smtp_message_id").eq("event_id", eventId).single(), "DELIVERY_STATE");
  if (delivered.status === "delivered") break;
}
assert.equal(delivered.status, "delivered");
assert.equal(delivered.attempts, 1);
assert.ok(delivered.delivered_at && delivered.smtp_message_id);
const after = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
assert.equal(after.status, 200);
assert.equal((await after.json()).claimed, 0, "A delivered event must not be sent twice");
const mailbox = await fetch("http://127.0.0.1:54324/api/v1/messages");
assert.equal(mailbox.status, 200, "Local SMTP receiver must be reachable");
const messages = (await mailbox.json()).messages;
assert.ok(Array.isArray(messages) && messages.some(message =>
  String(message.Subject || "").includes("Nueva reserva") &&
  message.To?.some(address => address.Address === fakeInbox)), "Mail must reach the real local mailbox");
must(await owner.from("reservas").update({ estado: "pendiente" })
  .eq("id", reservationId).eq("restaurante_id", restaurantId).select("id").single(), "LOCAL_STATUS_CHANGE");
const statusNotice = must(await admin.from("restaurant_owner_notice_deliveries")
  .select("event_id,status").eq("reservation_id", reservationId)
  .eq("event_type", "reservation.status_changed").single(), "STATUS_NOTICE_ENQUEUED");
must(await admin.from("restaurant_owner_notice_config").update({ email: "invalid-destination@example.com" })
  .eq("restaurante_id", restaurantId), "TEST_WRONG_DESTINATION");
const failed = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
assert.equal(failed.status, 200);
assert.ok((await failed.json()).results.some(row =>
  row.eventId === statusNotice.event_id && row.status === "retrying"));
const retry = must(await admin.from("restaurant_owner_notice_deliveries")
  .select("status,attempts,next_attempt_at").eq("event_id", statusNotice.event_id).single(), "RETRY_STATE");
assert.equal(retry.status, "retrying");
assert.equal(retry.attempts, 1);
assert.ok(Date.parse(retry.next_attempt_at) > Date.now());
must(await admin.from("restaurant_owner_notice_config").update({ email: fakeInbox })
  .eq("restaurante_id", restaurantId), "RESTORE_TEST_DESTINATION");
must(await admin.from("restaurant_owner_notice_deliveries").update({ next_attempt_at: new Date().toISOString() })
  .eq("event_id", statusNotice.event_id), "ADVANCE_LOCAL_RETRY");
const retried = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
assert.equal(retried.status, 200);
assert.ok((await retried.json()).results.some(row =>
  row.eventId === statusNotice.event_id && row.status === "delivered"));
assert.equal(must(await admin.from("restaurant_owner_notice_deliveries")
  .select("attempts").eq("event_id", statusNotice.event_id).single(), "RETRY_COUNT").attempts, 2);
must(await owner.from("reservas").update({ estado: "cancelada", atendida: null, mesa_id: null })
  .eq("id", reservationId).eq("restaurante_id", restaurantId).select("id").single(), "LOCAL_CANCELLATION");
const cancellation = must(await admin.from("restaurant_owner_notice_deliveries")
  .select("event_id").eq("reservation_id", reservationId)
  .eq("event_type", "reservation.cancelled").single(), "CANCELLATION_ENQUEUED");
const cancellationSent = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
assert.equal(cancellationSent.status, 200);
assert.ok((await cancellationSent.json()).results.some(row =>
  row.eventId === cancellation.event_id && row.status === "delivered"));
process.stdout.write("Reserva original, avisos de alta/cambio/cancelación, SMTP y buzón local, reintento, deduplicación y aislamiento: OK.\n");
