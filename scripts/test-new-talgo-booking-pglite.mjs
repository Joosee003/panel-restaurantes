import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { restoreApplicationCatalog } from "./recovery-catalog.mjs";
import { reviewActor, reviewIds as I } from "./review-schema-checks.mjs";

const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
try {
  const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/application-catalog-2026-09-08.json", import.meta.url), "utf8"));
  assert.equal(fixture.fixture_only, true);
  await restoreApplicationCatalog(db, fixture);
  await db.exec(await readFile(new URL("../supabase/migrations/20260908164431_post_visit_review_requests.sql", import.meta.url), "utf8"));
  const names = [
    "20261024120000_new_talgo_booking_tables.sql",
    "20261024123000_new_talgo_booking_support.sql",
    "20261024124500_new_talgo_settings_bridge.sql",
    "20261024130000_new_talgo_group_tables.sql",
    "20261024131500_new_talgo_group_availability.sql",
    "20261024133000_new_talgo_room_guards.sql",
    "20261024134500_new_talgo_manage_party.sql",
    "20261024140000_new_talgo_manual_tables.sql",
    "20261024141500_new_talgo_manual_availability.sql",
    "20261027001000_new_talgo_reschedule_notice_fix.sql",
  ];
  for (const name of names) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"));
  }
  await db.exec(`
    alter role service_role bypassrls;
    alter table auth.users disable trigger user;
    insert into auth.users(id,email) values
      ('${I.user}','talgo-owner@example.invalid'),
      ('${I.otherUser}','other-owner@example.invalid');
    alter table auth.users enable trigger user;
    insert into restaurantes(id,nombre,slug,owner_id,capacidad_total,capacidad_comida,capacidad_cena)
      values ('${I.restaurant}','New Talgo isolated','new-talgo-isolated','${I.user}',32,32,32),
        ('${I.otherRestaurant}','Other isolated','other-isolated','${I.otherUser}',16,16,16);
    insert into usuarios_restaurantes(user_id,restaurante_id)
      values ('${I.user}','${I.restaurant}'),('${I.otherUser}','${I.otherRestaurant}');
    insert into restaurante_modulos(restaurante_id,reservas,clientes,automatizaciones,estado)
      values ('${I.restaurant}',true,true,true,'activo'),('${I.otherRestaurant}',true,true,true,'activo');
    update restaurante_webs set publicada=true where restaurante_id in ('${I.restaurant}','${I.otherRestaurant}');
    update reservas_config set activo=true,zona_horaria='Europe/Madrid',duracion_minutos=60,
      intervalo_minutos=30,antelacion_minutos=0,dias_maximos_antelacion=60,
      personas_minimas=1,personas_maximas=32,capacidad_por_turno=32,
      confirmacion_automatica=true,confirmacion_automatica_hasta=4,
      mesas_activas_en_disponibilidad=true,solicitudes_pendientes_no_ocupan=true,
      requiere_telefono=true,requiere_email=false
      where restaurante_id='${I.restaurant}';
    update reservas_config set activo=true,zona_horaria='Europe/Madrid',duracion_minutos=60,
      intervalo_minutos=30,antelacion_minutos=0,dias_maximos_antelacion=60,
      personas_minimas=1,personas_maximas=16,capacidad_por_turno=16,
      mesas_activas_en_disponibilidad=false
      where restaurante_id='${I.otherRestaurant}';
    update automatizaciones_config set enabled=true,delivery_mode='test',email_enabled=true,
      confirmation_enabled=true,reminder_enabled=false where restaurante_id='${I.restaurant}';
    delete from reservas_horarios where restaurante_id='${I.restaurant}';
    insert into reservas_horarios(restaurante_id,dia_semana,turno,hora_inicio,hora_fin,activo,capacidad_override)
      select '${I.restaurant}',d,'comida','12:00','17:00',true,32 from generate_series(0,6) d;
    insert into reservas_horarios(restaurante_id,dia_semana,turno,hora_inicio,hora_fin,activo,capacidad_override)
      select '${I.otherRestaurant}',d,'comida','12:00','17:00',true,16 from generate_series(0,6) d;
    insert into sala_mesas(restaurante_id,nombre,capacidad,orden,activa,bloqueada)
      select '${I.restaurant}','Mesa '||i,4,i,true,false from generate_series(1,8) i;
  `);
  await reviewActor(db, null, "service_role");
  const setup = (await db.query("select w.slug,w.publicada,c.personas_maximas,c.confirmacion_automatica_hasta,(select count(*) from sala_mesas m where m.restaurante_id=w.restaurante_id) mesas from restaurante_webs w join reservas_config c on c.restaurante_id=w.restaurante_id where w.restaurante_id=$1", [I.restaurant])).rows[0];
  assert.equal(setup.publicada, true);
  assert.equal(setup.personas_maximas, 32);
  assert.equal(setup.confirmacion_automatica_hasta, 4);
  assert.equal(Number(setup.mesas), 8);
  let slots;
  for (let offset = 2; offset <= 12; offset++) {
    const date = (await db.query("select (current_date+$1::integer)::text date", [offset])).rows[0].date;
    const found = (await db.query("select * from obtener_disponibilidad_reservas($1,$2,2)", [setup.slug, date])).rows;
    if (found.length >= 3) { slots = found; break; }
  }
  assert.ok(slots?.length >= 3, "Fixture must offer a future service");
  const start = slots.at(-1).inicio_at;
  const create = async (party, name, key = randomUUID(), at = start) => (await db.query(
    "select crear_reserva_publica_con_resena($1,$2,$3,$4,$5,$6,$7,$8,true,true,'2026-08-03',false) result",
    [setup.slug, at, party, name, "+34600000091", null, null, key],
  )).rows[0].result;
  await assert.rejects(create(33, "Too large ficticio"), /INVALID_BOOKING_REQUEST/);
  const individualKey = randomUUID();
  const individual = await create(2, "Individual ficticio", individualKey);
  assert.equal(individual.estado, "confirmada");
  const saved = (await db.query("select estado,mesa_id,personas from reservas where id=$1", [individual.reserva_id])).rows[0];
  assert.equal(saved.estado, "confirmada");
  assert.ok(saved.mesa_id);
  const group = await create(5, "Grupo ficticio");
  assert.equal(group.estado, "pendiente");
  for (let party = 6; party <= 31; party++) {
    const request = await create(party, `Grupo ${party} ficticio`, randomUUID(), slots[0].inicio_at);
    assert.equal(request.estado, "pendiente", `${party} people must await approval`);
    await db.query("select cancelar_reserva_publica_gestion($1)", [request.gestion_token]);
  }
  const groupRow = (await db.query("select estado,mesa_id,personas from reservas where id=$1", [group.reserva_id])).rows[0];
  assert.equal(groupRow.mesa_id, null);
  const repeated = await create(2, "Individual ficticio", individualKey);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.reserva_id, individual.reserva_id);
  const moved = (await db.query("select modificar_reserva_publica_gestion($1,$2,3) result", [individual.gestion_token, slots.at(-2).inicio_at])).rows[0].result;
  assert.equal(moved.personas, 3);
  assert.equal((await db.query("select personas from reservas where id=$1", [individual.reserva_id])).rows[0].personas, 3);
  const cancelled = (await db.query("select cancelar_reserva_publica_gestion($1) result", [individual.gestion_token])).rows[0].result;
  assert.equal((await db.query("select estado from reservas where id=$1", [individual.reserva_id])).rows[0].estado, "cancelada");
  const repeatedCancel = (await db.query("select cancelar_reserva_publica_gestion($1) result", [individual.gestion_token])).rows[0].result;
  assert.equal(repeatedCancel.estado, "cancelada");
  const individualEvents = (await db.query("select event_type,status,event_id from reservation_webhook_deliveries where reservation_id=$1 and event_type in ('reservation.created','reservation.rescheduled','reservation.cancelled')", [individual.reserva_id])).rows;
  assert.equal(individualEvents.filter(event => event.event_type === "reservation.created").length, 1, "Idempotent create must enqueue once");
  assert.equal(individualEvents.filter(event => event.event_type === "reservation.rescheduled").length, 1);
  assert.equal(individualEvents.filter(event => event.event_type === "reservation.cancelled").length, 1, "Reschedule must not enqueue a cancellation");
  assert.equal(individualEvents.find(event => event.event_type === "reservation.cancelled").status, "pending", "Actual cancellation must remain dispatchable");
  assert.equal(new Set(individualEvents.map(event => event.event_id)).size, individualEvents.length);
  const tableIds = (await db.query("select id from sala_mesas where restaurante_id=$1 order by orden", [I.restaurant])).rows.map(row => row.id);
  await reviewActor(db, I.otherUser);
  await assert.rejects(db.query("select confirmar_reserva_grupo($1,$2::uuid[]) result", [group.reserva_id, tableIds.slice(0, 2)]), /RESTAURANT_ACCESS_DENIED/);
  await reviewActor(db, I.user);
  const approved = (await db.query("select confirmar_reserva_grupo($1,$2::uuid[]) result", [group.reserva_id, tableIds.slice(0, 2)])).rows[0].result;
  assert.equal(approved.estado, "confirmada");
  assert.equal((await db.query("select count(*)::int n from reserva_mesas_grupo where reserva_id=$1", [group.reserva_id])).rows[0].n, 2);
  await reviewActor(db, null, "service_role");
  let fullStart;
  for (let offset = 13; offset <= 24; offset++) {
    const date = (await db.query("select (current_date+$1::integer)::text date", [offset])).rows[0].date;
    const found = (await db.query("select * from obtener_disponibilidad_reservas($1,$2,32)", [setup.slug, date])).rows;
    if (found.length) { fullStart = found.at(-1).inicio_at; break; }
  }
  assert.ok(fullStart, "Eight tables must make 32 places available");
  const fullGroup = await create(32, "Full group ficticio", randomUUID(), fullStart);
  assert.equal(fullGroup.estado, "pendiente");
  await reviewActor(db, I.user);
  const fullApproval = (await db.query("select confirmar_reserva_grupo($1,$2::uuid[]) result", [fullGroup.reserva_id, tableIds])).rows[0].result;
  assert.equal(fullApproval.estado, "confirmada");
  assert.equal((await db.query("select count(*)::int n from reserva_mesas_grupo where reserva_id=$1", [fullGroup.reserva_id])).rows[0].n, 8);
  await reviewActor(db, null, "service_role");
  await assert.rejects(create(2, "Overbook ficticio", randomUUID(), fullStart), /SLOT_NOT_AVAILABLE/);
  await db.query("select cancelar_reserva_publica_gestion($1)", [fullGroup.gestion_token]);
  const reopened = await create(2, "Reopened ficticio", randomUUID(), fullStart);
  assert.equal(reopened.estado, "confirmada");
  const manualStart = slots[0].inicio_at;
  await reviewActor(db, I.otherUser);
  await assert.rejects(db.query("select crear_reserva_manual($1,$2,2,'Manual ficticio',$3,null,null,$4) result", [I.restaurant, manualStart, "+34600000092", randomUUID()]), /RESTAURANT_ACCESS_DENIED/);
  await reviewActor(db, I.user);
  const manual = (await db.query("select crear_reserva_manual($1,$2,2,'Manual ficticio',$3,null,null,$4) result", [I.restaurant, manualStart, "+34600000092", randomUUID()])).rows[0].result;
  assert.equal(manual.estado, "confirmada");
  assert.ok((await db.query("select mesa_id from reservas where id=$1", [manual.reserva_id])).rows[0].mesa_id);
  await reviewActor(db, null, "service_role");
  const otherSlug = (await db.query("select slug from restaurante_webs where restaurante_id=$1", [I.otherRestaurant])).rows[0].slug;
  const otherSlots = (await db.query("select * from obtener_disponibilidad_reservas($1,$2,2)", [otherSlug, slots[0].inicio_at.toISOString().slice(0, 10)])).rows;
  assert.ok(otherSlots.length >= 2, "Other restaurant availability must remain intact");
  const other = (await db.query("select crear_reserva_publica_con_resena($1,$2,2,'Other ficticio',$3,null,null,$4,true,true,'2026-08-03',false) result", [otherSlug, otherSlots[0].inicio_at, "+34600000093", randomUUID()])).rows[0].result;
  const otherMoved = (await db.query("select modificar_reserva_publica_gestion($1,$2,2) result", [other.gestion_token, otherSlots[1].inicio_at])).rows[0].result;
  assert.equal(otherMoved.reserva_id, other.reserva_id, "Shared reschedule function must preserve other tenant booking");
  assert.equal((await db.query("select count(*)::int n from reservation_webhook_deliveries where reservation_id=$1 and event_type='reservation.cancelled'", [other.reserva_id])).rows[0].n, 0);
  const notices = (await db.query("select event_type,status,delivery_mode,count(*)::int n from reservation_webhook_deliveries where restaurante_id=$1 group by event_type,status,delivery_mode order by event_type", [I.restaurant])).rows;
  console.log({ individual: individual.estado, group: group.estado, modified: moved.personas,
    cancelled: cancelled?.estado, approved: approved.estado, fullGroup: fullApproval.estado,
    manual: manual.estado, availableSlots: slots.length, notices });
  console.log(`Applied ${names.length} New Talgo migrations to isolated PGlite`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
