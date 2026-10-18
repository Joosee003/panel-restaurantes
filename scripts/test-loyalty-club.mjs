// Disposable local SQL test. Never reads live credentials or customer data.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { restoreApplicationCatalog, ident } from "./recovery-catalog.mjs";
import { reviewActor } from "./review-schema-checks.mjs";
import { restoreStoragePolicyFixture } from "./storage-policy-fixture.mjs";

const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
const ids = {
  ownerA: "91000000-0000-4000-8000-000000000001",
  ownerB: "91000000-0000-4000-8000-000000000002",
  clientExisting: "91000000-0000-4000-8000-000000000003",
  clientNew: "91000000-0000-4000-8000-000000000004",
  restaurantA: "92000000-0000-4000-8000-000000000001",
  restaurantB: "92000000-0000-4000-8000-000000000002",
  customerExisting: "93000000-0000-4000-8000-000000000001",
  rewardA: "94000000-0000-4000-8000-000000000001",
  rewardA2: "94000000-0000-4000-8000-000000000002",
  rewardLegacy: "94000000-0000-4000-8000-000000000003",
  rewardVip: "94000000-0000-4000-8000-000000000005",
  redemptionLegacy: "94000000-0000-4000-8000-000000000004",
  redemptionUnknown: "94000000-0000-4000-8000-000000000006",
  visitKey: "95000000-0000-4000-8000-000000000001",
  bookedVisitKey: "95000000-0000-4000-8000-000000000002",
  bookedVisitRetryKey: "95000000-0000-4000-8000-000000000003",
  bookedReservation: "96000000-0000-4000-8000-000000000001",
};

const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const insert = async (table, data) => {
  const keys = Object.keys(data);
  return rows(
    `insert into ${table} (${keys.map(ident)}) values (${keys.map((_, index) => `$${index + 1}`)}) returning *`,
    keys.map((key) => data[key]),
  );
};
const actor = (id, role = "authenticated") => reviewActor(db, id, role);

try {
  const catalog = JSON.parse(await readFile(new URL("../tests/fixtures/application-catalog-2026-09-08.json", import.meta.url), "utf8"));
  await restoreApplicationCatalog(db, catalog);
  await restoreStoragePolicyFixture(db);
  const migrations = (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter((name) => name >= "20260908164431").sort();
  for (const migration of migrations) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
  await db.exec("alter role service_role bypassrls; alter table auth.users disable trigger user");
  await insert("auth.users", { id: ids.ownerA, email: "owner-a@example.invalid" });
  await insert("auth.users", { id: ids.ownerB, email: "owner-b@example.invalid" });
  await insert("auth.users", { id: ids.clientExisting, phone: "+34600000001" });
  await insert("auth.users", { id: ids.clientNew, phone: "+34600000002" });
  await db.exec("alter table auth.users enable trigger user");

  await actor(null, "service_role");
  for (const side of ["A", "B"]) {
    const restaurantId = side === "A" ? ids.restaurantA : ids.restaurantB;
    const ownerId = side === "A" ? ids.ownerA : ids.ownerB;
    await insert("restaurantes", { id: restaurantId, nombre: `Club QA ${side}`, slug: `club-qa-${side.toLowerCase()}`, owner_id: ownerId });
    await insert("usuarios_restaurantes", { user_id: ownerId, restaurante_id: restaurantId });
    await insert("restaurante_modulos", { restaurante_id: restaurantId, estado: "activo", reservas: true, clientes: true, fidelizacion: true });
  }
  await insert("clientes", {
    id: ids.customerExisting,
    restaurante_id: ids.restaurantA,
    nombre: "Cliente WhatsApp",
    telefono: "600 000 001",
    origen_principal: "chatbot_whatsapp",
    puntos_totales: 100,
  });
  await insert("premios_puntos", { id: ids.rewardA, restaurante_id: ids.restaurantA, nombre: "Postre QA", puntos_requeridos: 30, activo: true });
  await insert("premios_puntos", { id: ids.rewardA2, restaurante_id: ids.restaurantA, nombre: "Café QA", puntos_requeridos: 20, activo: true });
  await insert("premios_puntos", { id: ids.rewardLegacy, restaurante_id: ids.restaurantA, nombre: "Legacy QA", puntos_requeridos: 10, activo: true });
  await insert("premios_puntos", { id: ids.rewardVip, restaurante_id: ids.restaurantA, nombre: "VIP QA", puntos_requeridos: 10, nivel_minimo: "vip", activo: true });
  await rows("insert into puntos_saldos(cliente_id,restaurante_id,puntos) values($1,$2,100) on conflict(cliente_id,restaurante_id) do update set puntos=100", [ids.customerExisting, ids.restaurantA]);

  // A session alone is not proof of ownership of an unconfirmed phone.
  await actor(ids.clientExisting);
  await assert.rejects(rows("select club_join_restaurant($1,null,$2)", ["club-qa-a", "club-loyalty-2026-10-04"]), /CLUB_VERIFIED_PHONE_REQUIRED/);
  await db.exec("reset role");
  assert.equal((await rows("select count(*)::int n from cliente_club_identities"))[0].n, 0);
  await rows("update auth.users set phone_confirmed_at=now() where id in ($1,$2)", [ids.clientExisting, ids.clientNew]);

  // Existing WhatsApp identity is linked, never duplicated.
  await actor(ids.clientExisting);
  const joined = (await rows("select club_join_restaurant($1,null,$2) result", ["club-qa-a", "club-loyalty-2026-10-04"]))[0].result;
  assert.equal(joined.clienteId, ids.customerExisting);
  await actor(null, "service_role");
  assert.equal((await rows("select count(*)::int n from clientes where restaurante_id=$1", [ids.restaurantA]))[0].n, 1);

  // A new verified phone creates one customer and retrying is idempotent.
  await actor(ids.clientNew);
  const created = (await rows("select club_join_restaurant($1,$2,$3) result", ["club-qa-a", "Cliente QR", "club-loyalty-2026-10-04"]))[0].result;
  const retried = (await rows("select club_join_restaurant($1,$2,$3) result", ["club-qa-a", "Cliente QR", "club-loyalty-2026-10-04"]))[0].result;
  assert.equal(created.clienteId, retried.clienteId);
  await actor(null, "service_role");
  assert.equal((await rows("select count(*)::int n from clientes where restaurante_id=$1", [ids.restaurantA]))[0].n, 2);
  await assert.rejects(insert("clientes", {
    restaurante_id: ids.restaurantA, nombre: "Duplicado WhatsApp", telefono: "+34 600 000 001",
  }), /CUSTOMER_PHONE_ALREADY_EXISTS/);
  await insert("clientes", {
    restaurante_id: ids.restaurantB, nombre: "Otro restaurante", telefono: "+34 600 000 001",
  });
  await actor(ids.clientExisting);
  await assert.rejects(rows("select club_get_dashboard($1)", ["club-qa-b"]), /CLUB_MEMBERSHIP_REQUIRED/);

  // The fixed restaurant QR only reads public configuration.
  const beforePublic = (await rows("select count(*)::int n from clientes_historial where restaurante_id=$1", [ids.restaurantA]))[0].n;
  await actor(null, "anon");
  assert.equal((await rows("select club_public_restaurant($1) result", ["club-qa-a"]))[0].result.name, "Club QA A");
  await actor(null, "service_role");
  assert.equal((await rows("select count(*)::int n from clientes_historial where restaurante_id=$1", [ids.restaurantA]))[0].n, beforePublic);

  // Enough points never bypass the restaurant's reward-level requirement.
  await actor(ids.clientExisting);
  const dashboard = (await rows("select club_get_dashboard($1) result", ["club-qa-a"]))[0].result;
  assert.equal(dashboard.rewards.some((reward) => reward.id === ids.rewardVip), false);
  await assert.rejects(rows("select club_create_redemption($1,$2)", ["club-qa-a", ids.rewardVip]), /REWARD_LEVEL_REQUIRED/);
  await actor(null, "service_role");
  await assert.rejects(rows("select club_create_redemption_for_customer($1,$2,$3)", [ids.customerExisting, ids.restaurantA, ids.rewardVip]), /REWARD_LEVEL_REQUIRED/);
  await assert.rejects(rows("select rpc_canjear_premio($1,$2,$3)", [ids.customerExisting, ids.restaurantA, ids.rewardVip]), /REWARD_LEVEL_REQUIRED/);
  await db.exec("reset role");
  assert.equal((await rows("select count(*)::int n from canjes_puntos where premio_id=$1", [ids.rewardVip]))[0].n, 0);
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 100);

  // Request creates a short-lived hashed token and does not debit points.
  await actor(ids.clientExisting);
  const request = (await rows("select club_create_redemption($1,$2) result", ["club-qa-a", ids.rewardA]))[0].result;
  assert.match(request.token, /^ghr_[A-Za-z0-9_-]{30,}$/);
  await db.exec("reset role");
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 100);
  assert.equal((await rows("select count(*)::int n from loyalty_redemption_tokens where token_hash=$1", [request.token]))[0].n, 0);

  // Other restaurant gets no data from the token.
  await actor(ids.ownerB);
  const foreignPreview = (await rows("select rpc_previsualizar_canje_qr($1,$2) result", [request.token, ids.restaurantB]))[0].result;
  assert.deepEqual(foreignPreview, { valid: false, reason: "INVALID" });

  // Confirmation debits exactly once; reuse and a concurrent retry fail closed.
  await actor(ids.ownerA);
  const preview = (await rows("select rpc_previsualizar_canje_qr($1,$2) result", [request.token, ids.restaurantA]))[0].result;
  assert.equal(preview.valid, true);
  const attempts = await Promise.allSettled([
    rows("select rpc_confirmar_canje_qr($1,$2)", [request.token, ids.restaurantA]),
    rows("select rpc_confirmar_canje_qr($1,$2)", [request.token, ids.restaurantA]),
  ]);
  assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
  await db.exec("reset role");
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 70);

  // Both legacy server entry points now request a reward without an early debit.
  await actor(null, "service_role");
  const legacyPageRequest = (await rows("select club_create_redemption_for_customer($1,$2,$3) result", [ids.customerExisting, ids.restaurantA, ids.rewardA2]))[0].result;
  const legacyRpcRequest = (await rows("select rpc_canjear_premio($1,$2,$3) result", [ids.customerExisting, ids.restaurantA, ids.rewardA2]))[0].result;
  assert.equal(legacyPageRequest.redemptionId, legacyRpcRequest);
  await db.exec("reset role");
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 70);
  await actor(ids.ownerA);
  await rows("select public.rpc_cancelar_canje($1,$2)", [legacyRpcRequest, ids.restaurantA]);
  await db.exec("reset role");

  assert.equal((await rows("select count(*)::int n from loyalty_redemption_debits where canje_id=$1", [request.redemptionId]))[0].n, 1);
  assert.equal((await rows("select count(*)::int n from puntos_movimientos where referencia=$1", [`canje-confirmado:${request.redemptionId}`]))[0].n, 1);
  await actor(ids.ownerA);
  const used = (await rows("select rpc_previsualizar_canje_qr($1,$2) result", [request.token, ids.restaurantA]))[0].result;
  assert.equal(used.valid, false);
  assert.equal(used.reason, "ALREADY_USED");

  // Expired reward QR is rejected without changing balance.
  await actor(ids.clientExisting);
  const expiring = (await rows("select club_create_redemption($1,$2) result", ["club-qa-a", ids.rewardA2]))[0].result;
  await db.exec("reset role");
  await rows("update loyalty_redemption_tokens set created_at=now()-interval '10 minutes',expires_at=now()-interval '1 second' where canje_id=$1", [expiring.redemptionId]);
  await actor(ids.ownerA);
  await assert.rejects(rows("select rpc_confirmar_canje_qr($1,$2)", [expiring.token, ids.restaurantA]), /EXPIRED/);
  await rows("select public.rpc_cancelar_canje($1,$2)", [expiring.redemptionId, ids.restaurantA]);
  await db.exec("reset role");
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 70);

  // A migrated legacy redemption that was already debited is never debited twice.
  await insert("canjes_puntos", { id: ids.redemptionLegacy, restaurante_id: ids.restaurantA, cliente_id: ids.customerExisting, premio_id: ids.rewardLegacy, puntos_usados: 10, estado: "pendiente", puntos_descontados_en: new Date().toISOString() });
  await insert("puntos_movimientos", { restaurante_id: ids.restaurantA, cliente_id: ids.customerExisting, tipo: "canje", puntos: -10, referencia: ids.redemptionLegacy, nota: "Débito legado de prueba" });
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 60);
  await actor(ids.ownerA);
  await rows("select public.rpc_confirmar_canje($1,$2)", [ids.redemptionLegacy, ids.restaurantA]);
  await db.exec("reset role");
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 60);

  // Personal QR only identifies; explicit visit is idempotent and no spend means no points.
  const memberCode = joined.memberCode;
  const historyBeforeScan = (await rows("select count(*)::int n from clientes_historial where cliente_id=$1", [ids.customerExisting]))[0].n;
  await actor(ids.ownerA);
  const member = (await rows("select rpc_identificar_cliente_club($1,$2) result", [memberCode, ids.restaurantA]))[0].result;
  assert.equal(member.found, true);
  await db.exec("reset role");
  assert.equal((await rows("select count(*)::int n from clientes_historial where cliente_id=$1", [ids.customerExisting]))[0].n, historyBeforeScan);
  await actor(ids.ownerA);
  await rows("select rpc_registrar_visita_cliente_club($1,$2,$3,null)", [memberCode, ids.restaurantA, ids.visitKey]);
  await rows("select rpc_registrar_visita_cliente_club($1,$2,$3,null)", [memberCode, ids.restaurantA, ids.visitKey]);
  await assert.rejects(rows("select rpc_registrar_visita_cliente_club($1,$2,$3,null)", [created.memberCode, ids.restaurantA, ids.visitKey]), /VISIT_IDEMPOTENCY_MISMATCH/);
  await db.exec("reset role");
  assert.equal((await rows("select count(*)::int n from loyalty_manual_visits where cliente_id=$1", [ids.customerExisting]))[0].n, 1);
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 60);

  // A historical pending row with no matching debit evidence is never guessed.
  await insert("canjes_puntos", { id: ids.redemptionUnknown, restaurante_id: ids.restaurantA, cliente_id: ids.customerExisting, premio_id: ids.rewardLegacy, puntos_usados: 10, estado: "pendiente" });
  await actor(ids.clientExisting);
  await assert.rejects(rows("select club_create_redemption($1,$2)", ["club-qa-a", ids.rewardLegacy]), /REDEMPTION_LEGACY_RECONCILIATION_REQUIRED/);
  await actor(ids.ownerA);
  await assert.rejects(rows("select public.rpc_confirmar_canje($1,$2)", [ids.redemptionUnknown, ids.restaurantA]), /REDEMPTION_LEGACY_RECONCILIATION_REQUIRED/);
  await db.exec("reset role");
  assert.equal((await rows("select puntos from puntos_saldos where cliente_id=$1 and restaurante_id=$2", [ids.customerExisting, ids.restaurantA]))[0].puntos, 60);
  // A personal QR and "Ha venido" must resolve to one reservation visit.
  await insert("reservas", {
    id: ids.bookedReservation, restaurante_id: ids.restaurantA, cliente_id: created.clienteId,
    estado: "confirmada", atendida: false,
    inicio_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  });
  const bookedHistoryBefore = (await rows("select count(*)::int n from clientes_historial where cliente_id=$1", [created.clienteId]))[0].n;
  await actor(ids.ownerA);
  const bookedVisit = (await rows("select rpc_registrar_visita_cliente_club($1,$2,$3,null) result", [created.memberCode, ids.restaurantA, ids.bookedVisitKey]))[0].result;
  assert.equal(bookedVisit.duplicate, false);
  assert.equal(bookedVisit.reservationId, ids.bookedReservation);
  assert.equal((await rows("select atendida from reservas where id=$1", [ids.bookedReservation]))[0].atendida, true);
  const bookedRetry = (await rows("select rpc_registrar_visita_cliente_club($1,$2,$3,null) result", [created.memberCode, ids.restaurantA, ids.bookedVisitRetryKey]))[0].result;
  assert.equal(bookedRetry.duplicate, true);
  await rows("select marcar_asistencia_reserva($1,true)", [ids.bookedReservation]);
  await db.exec("reset role");
  assert.equal((await rows("select count(*)::int n from clientes_historial where cliente_id=$1", [created.clienteId]))[0].n, bookedHistoryBefore);
  assert.equal((await rows("select count(*)::int n from loyalty_manual_visits where reserva_id=$1", [ids.bookedReservation]))[0].n, 1);
  assert.equal((await rows("select visitas_reales from vw_clientes_resumen where id=$1", [created.clienteId]))[0].visitas_reales, 1);
  await actor(ids.ownerB);
  assert.equal((await rows("select rpc_identificar_cliente_club($1,$2) result", [memberCode, ids.restaurantB]))[0].result.found, false);

  // Restaurant settings must control both new QR requests and confirmations.
  await actor(ids.clientExisting);
  const pendingWhileActive = (await rows("select club_create_redemption($1,$2) result", ["club-qa-a", ids.rewardA2]))[0].result;
  await actor(null, "service_role");
  await rows("update restaurante_modulos set fidelizacion=false where restaurante_id=$1", [ids.restaurantA]);
  await assert.rejects(rows("select club_create_redemption_for_customer($1,$2,$3)", [ids.customerExisting, ids.restaurantA, ids.rewardA]), /CLUB_NOT_AVAILABLE/);
  await actor(ids.ownerA);
  await assert.rejects(rows("select rpc_confirmar_canje_qr($1,$2)", [pendingWhileActive.token, ids.restaurantA]), /CLUB_NOT_AVAILABLE/);

  console.log(JSON.stringify({
    status: "passed",
    checks: [
      "unconfirmed phone cannot claim customer identity",
      "reward level enforced in catalog and all three redemption entry points",
      "existing WhatsApp customer reused",
      "new customer retry creates no duplicate",
      "normalized duplicate blocked within one restaurant only",
      "customer identity cannot read another restaurant",
      "public restaurant QR creates no visit",
      "redemption request does not debit",
      "foreign restaurant sees no redemption data",
      "double confirmation debits once",
      "used and expired QR rejected",
      "both legacy reward entry points request without debit",
      "legacy debited redemption is not debited twice",
      "unreconciled legacy redemption cannot debit again",
      "member scan creates no visit",
      "manual visit idempotent",
      "visit idempotency key cannot be reused for another member",
      "QR confirmation and reservation attendance count one visit",
      "disabled club blocks new rewards and confirmation",
    ],
  }, null, 2));
} finally {
  await db.close();
}
