import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { restoreApplicationCatalog } from "./recovery-catalog.mjs";
const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
const adminId = "71000000-0000-4000-8000-000000000101",
  userId = "71000000-0000-4000-8000-000000000102";
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const base = {
  nombre: "Restaurante de prueba",
  telefono: "+34600000100",
  direccion: "Dirección de prueba",
  email: "onboarding@example.invalid",
  capacidad: 24,
  mesas: 6,
  plan: "basico",
  cartaNombre: "Carta principal",
  zonaHoraria: "Atlantic/Canary",
  googleReviewUrl: null,
  activarReservas: true,
  activarClientes: true,
  activarResenas: true,
  activarFidelizacion: false,
  activarMetricas: true,
  activarChatbot: true,
  activarCamarero: false,
  activarMenuDigital: false,
  activarAutomatizaciones: true,
  activarReputacion: false,
};
const checks = [];
try {
  const catalog = JSON.parse(
    await readFile(
      new URL(
        "../tests/fixtures/application-catalog-2026-09-08.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(catalog.fixture_only, true);
  await restoreApplicationCatalog(db, catalog);
  const migrations = (
    await readdir(new URL("../supabase/migrations/", import.meta.url))
  )
    .filter(
      (name) =>
        name >= "20260908164431" &&
        name <= "20260915001030_agency_onboarding_foundation.sql",
    )
    .sort();
  for (const name of migrations)
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `alter role service_role bypassrls;alter table auth.users disable trigger user;insert into auth.users(id,email) values('${adminId}','agency@example.invalid');alter table auth.users enable trigger user;insert into app_admins(user_id) values('${adminId}');`,
  );
  const create = async (config, actor = adminId) =>
    (
      await query(
        "select public.admin_crear_instalacion_restaurante_v2($1,$2) result",
        [actor, config],
      )
    )[0].result;
  await db.exec("set role anon");
  await assert.rejects(create(base), /permission denied/);
  await db.exec("reset role;set role authenticated");
  await assert.rejects(create(base), /permission denied/);
  await db.exec("reset role;set role service_role");
  await assert.rejects(create(base, userId), /ADMIN_REQUIRED/);
  checks.push("only the authenticated agency server can create installations");
  await assert.rejects(
    create({ ...base, activarClientes: false }),
    /INVALID_SERVICE_DEPENDENCIES/,
  );
  const before = Number(
    (await query("select count(*) n from restaurantes"))[0].n,
  );
  await assert.rejects(
    create({ ...base, zonaHoraria: "invalid" }),
    /INVALID_TIMEZONE/,
  );
  assert.equal(
    Number((await query("select count(*) n from restaurantes"))[0].n),
    before,
  );
  checks.push("invalid services and timezone leave no partial restaurant");
  const first = await create(base),
    id = first.restaurante_id;
  const config = (
    await query("select * from reservas_config where restaurante_id=$1", [id])
  )[0];
  assert.equal(config.zona_horaria, "Atlantic/Canary");
  assert.equal(config.capacidad_por_turno, 24);
  assert.equal(config.activo, false);
  assert.equal(
    Number(
      (
        await query(
          "select count(*) n from menus_dia_qr where restaurante_id=$1",
          [id],
        )
      )[0].n,
    ),
    0,
  );
  assert.equal(
    Number(
      (
        await query(
          "select count(*) n from cartas_digitales where restaurante_id=$1",
          [id],
        )
      )[0].n,
    ),
    0,
  );
  const channel = (
    await query("select * from whatsapp_channels where restaurante_id=$1", [id])
  )[0];
  assert.equal(channel.enabled, false);
  assert.equal(channel.status, "STOPPED");
  assert.match(channel.session_name, /^gh_[a-f0-9]{32}$/);
  const automation = (
    await query(
      "select * from automatizaciones_config where restaurante_id=$1",
      [id],
    )
  )[0];
  assert.equal(automation.enabled, false);
  assert.equal(automation.delivery_mode, "test");
  assert.equal(
    (
      await query(
        "select publicada from restaurante_webs where restaurante_id=$1",
        [id],
      )
    )[0].publicada,
    false,
  );
  checks.push(
    "chatbot and review foundations exist, inactive until configured; no sample menu",
  );
  await assert.rejects(create(base), /INVITATION_ALREADY_EXISTS/);
  assert.equal(
    Number((await query("select count(*) n from restaurantes"))[0].n),
    before + 1,
  );
  checks.push("repeated submission does not duplicate the restaurant");
  // Exercise the real invitation trigger without sending an email or contacting any provider.
  await db.exec("reset role");
  await query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [
      userId,
      base.email,
      { invitation_id: first.invitation_id, restaurante_id: id },
    ],
  );
  assert.equal(
    (await query("select owner_id from restaurantes where id=$1", [id]))[0]
      .owner_id,
    userId,
  );
  assert.equal(
    (
      await query("select status from restaurant_invitations where id=$1", [
        first.invitation_id,
      ])
    )[0].status,
    "sent",
  );
  assert.equal(
    (
      await query(
        "select restaurante_id from usuarios_restaurantes where user_id=$1",
        [userId],
      )
    )[0].restaurante_id,
    id,
  );
  checks.push("invitation trigger assigns exactly the invited restaurant");
  await query(
    "select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false)",
    [JSON.stringify({ sub: userId, role: "authenticated" }), userId],
  );
  await db.exec("set role authenticated");
  await query("select completar_invitacion_restaurante()");
  await db.exec("reset role");
  assert.equal(
    (
      await query("select status from restaurant_invitations where id=$1", [
        first.invitation_id,
      ])
    )[0].status,
    "accepted",
  );
  await db.exec("reset role;set role service_role");
  const reputation = {
    ...base,
    email: "reputation-new@example.invalid",
    activarReservas: false,
    activarClientes: false,
    activarResenas: false,
    activarMetricas: false,
    activarChatbot: false,
    activarAutomatizaciones: false,
    activarReputacion: true,
  };
  const rep = await create(reputation);
  const repConfig = (
    await query("select * from opinion_config where restaurante_id=$1", [
      rep.restaurante_id,
    ])
  )[0];
  assert.deepEqual(repConfig.seo_keywords, []);
  assert.equal(repConfig.google_review_url, "");
  assert.equal(
    Number(
      (
        await query(
          "select count(*) n from sala_mesas where restaurante_id=$1",
          [rep.restaurante_id],
        )
      )[0].n,
    ),
    0,
  );
  checks.push(
    "reputation-only setup carries no other restaurant content or unused tables",
  );
  await db.exec("reset role");
  const repUser = "71000000-0000-4000-8000-000000000103";
  await query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [
      repUser,
      reputation.email,
      { invitation_id: rep.invitation_id, restaurante_id: rep.restaurante_id },
    ],
  );
  await query(
    "insert into opinion_usuarios_restaurantes(user_id,restaurante_id,role,active) values($1,$2,$3,true)",
    [repUser, rep.restaurante_id, "restaurante"],
  );
  await query(
    "select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false)",
    [JSON.stringify({ sub: repUser, role: "authenticated" }), repUser],
  );
  await db.exec("set role authenticated");
  assert.deepEqual(
    (await query("select restaurante_id from opinion_config")).map(
      (r) => r.restaurante_id,
    ),
    [rep.restaurante_id],
  );
  assert.equal(
    (await query("select id from restaurantes where id=$1", [id])).length,
    0,
  );
  checks.push(
    "restaurant accounts cannot read another restaurant or reputation configuration",
  );
  await db.exec("reset role;set role service_role");
  await query("delete from restaurantes where id=$1", [rep.restaurante_id]);
  for (const table of [
    "restaurante_modulos",
    "restaurant_invitations",
    "opinion_config",
    "opinion_usuarios_restaurantes",
    "restaurante_webs",
    "reservas_config",
    "automatizaciones_config",
  ])
    assert.equal(
      Number(
        (
          await query(
            `select count(*) n from ${table} where restaurante_id=$1`,
            [rep.restaurante_id],
          )
        )[0].n,
      ),
      0,
      table,
    );
  checks.push("rollback cascades through every installation record");
  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      message: error.message,
      code: error.code,
      where: error.where,
    }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
