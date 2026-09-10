import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../tests/sql/node_modules/@electric-sql/pglite/dist/index.js';
import { pgcrypto } from '../tests/sql/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';
import { uuid_ossp } from '../tests/sql/node_modules/@electric-sql/pglite/dist/contrib/uuid_ossp.js';
import { restoreApplicationCatalog } from './recovery-catalog.mjs';
import { reviewActor, reviewIds as I } from './review-schema-checks.mjs';

const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
const checks=[];
const rows=async (sql,args=[]) => (await db.query(sql,args)).rows;
const calendar=id=>rows('select dia_semana,turno,hora_inicio,hora_fin,activo,capacidad_override from reservas_horarios where restaurante_id=$1 order by dia_semana,turno',[id]);
try {
  const catalog=JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json',import.meta.url),'utf8'));
  assert.equal(catalog.fixture_only,true);
  await restoreApplicationCatalog(db,catalog);
  await db.exec(`alter role service_role bypassrls;
    alter table auth.users disable trigger user;
    insert into auth.users(id,email) values('${I.user}','hours-a@example.invalid'),('${I.otherUser}','hours-b@example.invalid');
    alter table auth.users enable trigger user;
    insert into restaurantes(id,nombre,slug,owner_id,horario_comida,horario_cena) values
      ('${I.restaurant}','Hours A','hours-a','${I.user}','13:30-15:30','19:30-23:00'),
      ('${I.otherRestaurant}','Hours B','hours-b','${I.otherUser}','13:00 - 16:00','20:00 - 23:30');
    insert into usuarios_restaurantes(user_id,restaurante_id) values('${I.user}','${I.restaurant}'),('${I.otherUser}','${I.otherRestaurant}');
    insert into reservas_horarios(restaurante_id,dia_semana,turno,hora_inicio,hora_fin,activo,capacidad_override)
      select r.id,d,s.turno,s.a::time,s.b::time,d<>0,17 from restaurantes r cross join generate_series(0,6) d
      cross join (values('comida','12:30','17:00'),('cena','19:00','23:30')) s(turno,a,b);
    update reservas_config set activo=true,zona_horaria='Europe/Madrid',duracion_minutos=60,intervalo_minutos=30,antelacion_minutos=0;
    update restaurante_webs set publicada=true;
  `);
  const flagsBefore=await rows('select id,restaurante_id,dia_semana,turno,activo,capacidad_override from reservas_horarios order by id');
  await db.exec(await readFile(new URL('../supabase/migrations/20260910230639_panel_service_hours_source.sql',import.meta.url),'utf8'));
  assert.deepEqual(await rows('select id,restaurante_id,dia_semana,turno,activo,capacidad_override from reservas_horarios order by id'),flagsBefore);
  const a=await calendar(I.restaurant), b=await calendar(I.otherRestaurant);
  assert.equal(a.length,14);assert.equal(b.length,14);
  assert.ok(a.every(r=>r.turno==='comida'?r.hora_inicio==='13:30:00'&&r.hora_fin==='15:30:00':r.hora_inicio==='19:30:00'&&r.hora_fin==='23:00:00'));
  assert.ok(b.every(r=>r.turno==='comida'?r.hora_inicio==='13:00:00'&&r.hora_fin==='16:00:00':r.hora_inicio==='20:00:00'&&r.hora_fin==='23:30:00'));
  checks.push('Backfill uses each restaurant’s own panel values and preserves row IDs, closed Sundays and capacity overrides.');

  await reviewActor(db);
  await db.query("update restaurantes set horario_comida='18:00-19:00',horario_cena='19:00-22:00' where id=$1",[I.restaurant]);
  const changed=await calendar(I.restaurant);
  assert.ok(changed.every(r=>r.hora_inicio===(r.turno==='comida'?'18:00:00':'19:00:00')));
  await db.exec('reset role');assert.deepEqual(await calendar(I.otherRestaurant),b);
  await reviewActor(db);
  for (const invalid of ['13:60-15:30','24:00-25:00','15:00-13:00','foo','13:00-24:00']) {
    await assert.rejects(db.query('update restaurantes set horario_comida=$1 where id=$2',[invalid,I.restaurant]),/INVALID_PANEL_SERVICE_HOURS/);
  }
  await assert.rejects(db.query("update restaurantes set horario_comida='18:00-20:00' where id=$1",[I.restaurant]),/OVERLAPPING_PANEL_SERVICE_HOURS/);
  assert.deepEqual(await calendar(I.restaurant),changed);
  await db.query("update restaurantes set horario_comida='13:30-15:30',horario_cena='19:30-23:00' where id=$1",[I.restaurant]);
  checks.push('Owner saves update both services atomically, including moves across previous ranges; invalid/overlapping input rolls back.');

  const target=(await rows("select (current_date+1+((8-extract(dow from current_date+1)::int)%7))::text d"))[0].d;
  const slug=(await rows('select slug from restaurante_webs where restaurante_id=$1',[I.restaurant]))[0].slug;
  const manual=await rows('select hora_local,turno,capacidad_disponible from obtener_disponibilidad_manual($1,$2,2)',[I.restaurant,target]);
  await reviewActor(db,null,'service_role');
  const chatbot=await rows('select hora_local,turno,capacidad_disponible from obtener_disponibilidad_chatbot($1,$2,2)',[I.restaurant,target]);
  // Public HTTP endpoints call this protected RPC with the server role.
  const web=await rows('select hora_local,turno,capacidad_disponible from obtener_disponibilidad_reservas($1,$2,2)',[slug,target]);
  assert.ok(manual.length>0);assert.deepEqual(chatbot,manual);assert.deepEqual(web,manual);
  assert.equal(manual[0].hora_local,'13:30');assert.ok(manual.every(r=>r.capacidad_disponible===17));
  assert.ok(manual.every(r=>r.turno==='comida'?r.hora_local>='13:30'&&r.hora_local<='14:30':r.hora_local>='19:30'&&r.hora_local<='22:00'));
  checks.push('Real web, manual and chatbot availability RPCs return identical slots inside panel hours with the same capacity.');

  await reviewActor(db);
  await db.query("insert into reservas_excepciones(restaurante_id,fecha,tipo,motivo) values($1,$2,'cierre','Synthetic closure')",[I.restaurant,target]);
  await db.query("update restaurantes set horario_comida='13:00-15:00' where id=$1",[I.restaurant]);
  await reviewActor(db,null,'service_role');
  assert.equal((await rows('select * from obtener_disponibilidad_chatbot($1,$2,2)',[I.restaurant,target])).length,0);
  assert.ok((await rows('select * from obtener_disponibilidad_chatbot($1,$2,2)',[I.otherRestaurant,target])).length>0);
  checks.push('A dated closure survives an hours change and affects only its restaurant.');

  await reviewActor(db);
  const staleSchedule=[{dia_semana:1,turno:'comida',hora_inicio:'09:00',hora_fin:'12:00',activo:true,capacidad_override:11}];
  const save=(rid=I.restaurant)=>db.query('select guardar_configuracion_web_reservas($1,$2,$3,$4)',[rid,JSON.stringify({nombre_publico:'Hours A',publicada:true}),JSON.stringify({activo:true,zona_horaria:'Europe/Madrid'}),JSON.stringify(staleSchedule)]);
  await save();
  const staleResult=await calendar(I.restaurant);
  assert.equal(staleResult.length,14);assert.equal(staleResult.filter(r=>r.activo).length,1);
  assert.equal(staleResult.find(r=>r.activo).hora_inicio,'13:00:00');assert.equal(staleResult.find(r=>r.activo).capacidad_override,11);
  await db.query("update reservas_horarios set hora_inicio='01:00',hora_fin='02:00' where restaurante_id=$1",[I.restaurant]);
  assert.deepEqual(await calendar(I.restaurant),staleResult);
  await assert.rejects(save(I.otherRestaurant),/ACCESS_DENIED/);
  await assert.rejects(db.query('select sync_panel_service_hours($1)',[I.otherRestaurant]),/ACCESS_DENIED/);
  await db.query("update restaurantes set horario_comida='09:00-10:00' where id=$1",[I.otherRestaurant]);
  await db.exec('reset role');assert.deepEqual(await calendar(I.otherRestaurant),b);
  checks.push('Stale web payloads and direct calendar writes cannot reintroduce other hours; closed days and tenant boundaries remain enforced.');

  await db.query('update usuarios_restaurantes set demo_vista=true where user_id=$1',[I.user]);
  await reviewActor(db);
  await assert.rejects(save(),/DEMO|demo|lectura/);
  assert.equal((await rows("update restaurantes set horario_comida='10:00-11:00' where id=$1 returning id",[I.restaurant])).length,0);
  await reviewActor(db,null,'anon');await assert.rejects(db.query('select sync_panel_service_hours($1)',[I.restaurant]),/permission denied/);
  checks.push('Read-only demo and anonymous callers cannot change schedules.');

  await db.exec('reset role');
  assert.deepEqual(await calendar(I.restaurant),staleResult);
  await db.query("insert into restaurantes(nombre,slug) values('Unconfigured fixture','unconfigured-fixture')");
  assert.equal((await rows("select count(*)::int n from reservas_horarios h join restaurantes r on r.id=h.restaurante_id where r.slug='unconfigured-fixture'"))[0].n,0);
  assert.equal((await rows("select c.activo from reservas_config c join restaurantes r on r.id=c.restaurante_id where r.slug='unconfigured-fixture'"))[0].activo,false);
  console.log(JSON.stringify({status:'passed',checks},null,2));
} catch(error) { console.error(JSON.stringify({status:'failed',message:error.message,code:error.code,where:error.where,stack:error.stack}));process.exitCode=1; }
finally {await db.close();}
