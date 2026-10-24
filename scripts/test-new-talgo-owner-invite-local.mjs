import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(await readFile(new URL("../local-schema/supabase-status.json", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../local-schema/fixture-credentials.json", import.meta.url), "utf8"));
const api = new URL(status.API_URL);
const app = new URL(process.env.GH_LOCAL_APP_URL || "http://127.0.0.1:4176");
const mail = new URL(status.MAILPIT_URL || status.INBUCKET_URL);
for (const value of [api, app, mail]) {
  assert.equal(value.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(value.hostname), "LOCAL_ONLY");
}
assert.equal(api.port, "54321");
assert.equal(mail.port, "54324");

const client = (key) => createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = client(status.SERVICE_ROLE_KEY);
const agency = client(status.ANON_KEY);
const owner = client(status.ANON_KEY);
const other = client(status.ANON_KEY);
const stamp = randomUUID().slice(0, 12);
const email = `propietario-local-${stamp}@example.invalid`;
const password = `Local-${randomUUID()}!Ab2`;
let restaurantId = null;
let ownerId = null;

function data(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code || result.error.message}`);
  return result.data;
}

async function mailLinks(excludeIds = new Set()) {
  const search = new URL("/api/v1/search", mail);
  search.searchParams.set("query", `to:${email}`);
  for (let attempt = 0; attempt < 25; attempt++) {
    const response = await fetch(search);
    if (!response.ok) throw new Error("LOCAL_MAILPIT_UNAVAILABLE");
    const result = await response.json();
    const messageId = result.messages?.find(message => !excludeIds.has(message.ID))?.ID;
    if (messageId) {
      const messageResponse = await fetch(new URL(`/api/v1/message/${encodeURIComponent(messageId)}`, mail));
      if (!messageResponse.ok) throw new Error("LOCAL_INVITE_MESSAGE_UNAVAILABLE");
      const message = await messageResponse.json();
      const body = `${message.Text || ""}\n${message.HTML || ""}`.replaceAll("&amp;", "&");
      const candidates = body.match(/https?:\/\/[^\s<>"']+/g) || [];
      const link = candidates.map(value => { try { return new URL(value); } catch { return null; } })
        .find(value => value?.origin === api.origin && value.pathname.endsWith("/auth/v1/verify"));
      if (!link) throw new Error("LOCAL_AUTH_LINK_MISSING");
      return { link, messageId };
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("LOCAL_AUTH_EMAIL_NOT_CAPTURED");
}

try {
  data(await agency.auth.signInWithPassword(fixture.users.agency), "AGENCY_LOGIN");
  data(await other.auth.signInWithPassword(fixture.users.mesaNorte), "OTHER_LOGIN");
  const token = data(await agency.auth.getSession(), "AGENCY_SESSION").session?.access_token;
  assert.ok(token);
  const creation = await fetch(new URL("/api/admin/restaurantes", app), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      request_id: randomUUID(), nombre: `Alta local ${stamp}`, email,
      telefono: null, direccion: null, capacidad: 8, mesas: 2,
      plan: "basico", cartaNombre: "Carta local", zonaHoraria: "Europe/Madrid", googleReviewUrl: null,
      activarReservas: true, activarClientes: true, activarResenas: false,
      activarFidelizacion: false, activarMetricas: false, activarChatbot: false,
      activarCamarero: false, activarMenuDigital: false, activarAutomatizaciones: false,
      activarReputacion: false,
    }),
  });
  const created = await creation.json();
  assert.equal(creation.status, 201, `LOCAL_ONBOARDING_${created.error || creation.status}`);
  restaurantId = created.restaurante_id;
  assert.match(restaurantId, /^[a-f0-9-]{36}$/i);
  const { link: invite, messageId: inviteMessageId } = await mailLinks();
  assert.equal(invite.searchParams.get("type"), "invite");
  const redirect = invite.searchParams.get("redirect_to");
  assert.equal(redirect, `${app.origin}/auth/accept-invite`);
  const verify = await fetch(invite, { redirect: "manual" });
  assert.ok([302, 303].includes(verify.status), "LOCAL_INVITE_VERIFICATION_FAILED");
  const location = new URL(verify.headers.get("location"));
  assert.equal(location.origin, app.origin);
  assert.equal(location.pathname, "/auth/accept-invite");
  const hash = new URLSearchParams(location.hash.slice(1));
  assert.equal(hash.get("type"), "invite");
  const access = hash.get("access_token");
  const refresh = hash.get("refresh_token");
  assert.ok(access && refresh);
  const session = data(await owner.auth.setSession({ access_token: access, refresh_token: refresh }), "INVITE_SESSION");
  ownerId = session.user.id;
  const assigned = data(await owner.from("usuarios_restaurantes").select("restaurante_id").eq("user_id", ownerId), "OWNER_ASSIGNMENT");
  assert.deepEqual(assigned.map(item => item.restaurante_id), [restaurantId]);
  data(await owner.auth.updateUser({ password }), "SET_OWNER_PASSWORD");
  data(await owner.rpc("completar_invitacion_restaurante"), "COMPLETE_INVITATION");
  data(await owner.auth.signOut(), "OWNER_SIGNOUT");
  data(await owner.auth.signInWithPassword({ email, password }), "OWNER_LOGIN");
  assert.equal(data(await owner.from("restaurantes").select("id").eq("id", restaurantId).single(), "OWNER_RESTAURANT").id, restaurantId);
  assert.equal(data(await owner.from("restaurantes").select("id").eq("id", fixture.restaurants.newTalgo), "FOREIGN_RESTAURANT").length, 0);
  assert.equal(data(await owner.from("reservas").select("id").eq("restaurante_id", fixture.restaurants.newTalgo), "FOREIGN_BOOKINGS").length, 0);
  assert.equal(data(await other.from("restaurantes").select("id").eq("id", restaurantId), "OTHER_RESTAURANT").length, 0);
  const changedName = `Ajustes local ${stamp}`;
  assert.equal(data(await owner.from("restaurantes").update({ nombre: changedName, capacidad_total: 9 }).eq("id", restaurantId).select("id,nombre,capacidad_total").single(), "OWNER_SETTINGS").nombre, changedName);
  assert.equal(data(await other.from("restaurantes").update({ nombre: "No autorizado" }).eq("id", restaurantId).select("id"), "OTHER_SETTINGS").length, 0);
  assert.equal(data(await owner.from("restaurantes").select("nombre,capacidad_total").eq("id", restaurantId).single(), "SETTINGS_PERSISTENCE").capacidad_total, 9);
  assert.equal(data(await agency.from("restaurantes").select("id").eq("id", restaurantId).single(), "AGENCY_RESTAURANT").id, restaurantId);
  data(await owner.auth.resetPasswordForEmail(email, { redirectTo: `${app.origin}/auth/reset-password` }), "PASSWORD_RECOVERY_REQUEST");
  const { link: recovery } = await mailLinks(new Set([inviteMessageId]));
  assert.equal(recovery.searchParams.get("type"), "recovery");
  assert.equal(recovery.searchParams.get("redirect_to"), `${app.origin}/auth/reset-password`);
  const recoveryVerify = await fetch(recovery, { redirect: "manual" });
  assert.ok([302, 303].includes(recoveryVerify.status), "LOCAL_RECOVERY_VERIFICATION_FAILED");
  const recoveryLocation = new URL(recoveryVerify.headers.get("location"));
  assert.equal(recoveryLocation.origin, app.origin);
  assert.equal(recoveryLocation.pathname, "/auth/reset-password");
  const recoveryHash = new URLSearchParams(recoveryLocation.hash.slice(1));
  data(await owner.auth.setSession({ access_token: recoveryHash.get("access_token"), refresh_token: recoveryHash.get("refresh_token") }), "RECOVERY_SESSION");
  const recoveredPassword = `Recovered-${randomUUID()}!Ab2`;
  data(await owner.auth.updateUser({ password: recoveredPassword }), "RECOVERY_PASSWORD_UPDATE");
  data(await owner.auth.signOut(), "RECOVERY_SIGNOUT");
  data(await owner.auth.signInWithPassword({ email, password: recoveredPassword }), "RECOVERY_LOGIN");
  process.stdout.write("Invitación, contraseña, ajustes, recuperación, aislamiento RLS y acceso de agencia locales: correctos.\n");
} finally {
  if (restaurantId) {
    const removed = await admin.from("restaurantes").delete().eq("id", restaurantId);
    if (removed.error) throw new Error(`LOCAL_FIXTURE_CLEANUP_RESTAURANT:${removed.error.code}`);
  }
  if (ownerId) {
    const removed = await admin.auth.admin.deleteUser(ownerId);
    if (removed.error) throw new Error(`LOCAL_FIXTURE_CLEANUP_USER:${removed.error.message}`);
  }
}
