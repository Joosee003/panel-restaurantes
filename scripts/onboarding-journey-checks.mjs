// SQL journey after a real local onboarding/invitation trigger. No provider transport.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {reviewActor} from './review-schema-checks.mjs';
export async function checkOnboardingJourney(db, restaurantId, userId) {
 const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await reviewActor(db,userId);
 await rows("update restaurantes set google_review_url='https://g.page/r/fixture/review',puntos_activo=true,puntos_por_euro=1 where id=$1",[restaurantId]);
 await rows("insert into fidelizacion_config(restaurante_id,puntos_por_euro) values($1,1) on conflict(restaurante_id) do update set puntos_por_euro=1",[restaurantId]);
 await rows("update reservas_config set activo=true,antelacion_minutos=0,confirmacion_automatica=true where restaurante_id=$1",[restaurantId]);
 await rows("update restaurante_webs set publicada=true where restaurante_id=$1",[restaurantId]);
 await rows("update automatizaciones_config set enabled=true,delivery_mode='test',review_enabled=true,review_delay_hours=3,confirmation_enabled=false,reminder_enabled=false where restaurante_id=$1",[restaurantId]);
 await rows("insert into reservas_excepciones(restaurante_id,fecha,tipo,turno,hora_inicio,hora_fin) values($1,current_date+1,'horario_especial','comida','12:00','18:00')",[restaurantId]);
 const slug=(await rows('select slug from restaurante_webs where restaurante_id=$1',[restaurantId]))[0].slug;
 await reviewActor(db,null,'service_role');
 const slot=(await rows('select * from obtener_disponibilidad_reservas($1,current_date+1,2) limit 1',[slug]))[0];
 assert.ok(slot,'An owner-configured new installation must expose bookable availability');
 await reviewActor(db,null,'service_role');
 const book=async()=> (await rows("select crear_reserva_publica_con_resena($1,$2,2,'Cliente ficticio','+447700900141',null,null,'77000000-0000-4000-8000-000000000151',true,true,'2026-08-03',true) result",[slug,slot.inicio_at]))[0].result;
 const booking=await book(),repeat=await book();
 assert.equal(booking.ok,true);assert.equal(repeat.duplicate,true);assert.equal(repeat.reserva_id,booking.reserva_id);
 await reviewActor(db,userId);
 let reservation=(await rows('select * from reservas where id=$1',[booking.reserva_id]))[0];
 assert.equal(reservation.restaurante_id,restaurantId);
 assert.equal((await rows('select count(*)::int n from reservas where restaurante_id=$1',[restaurantId]))[0].n,1);
 await assert.rejects(rows('select marcar_asistencia_reserva($1,true)',[booking.reserva_id]),/FUTURE|FUTURA|NO_INICIADA/);
 // Advance this synthetic visit into the past. This is fixture clock setup,
 // not an application feature and never executes against production.
 await db.exec('reset role');
 await rows("update reservas set inicio_at=now()-interval '1 hour',fin_at=now()+interval '30 minutes',fecha_hora_reserva=(now()-interval '1 hour') at time zone 'Atlantic/Canary' where id=$1",[booking.reserva_id]);
 await reviewActor(db,userId);
 await rows('select marcar_asistencia_reserva($1,true)',[booking.reserva_id]);
 await rows('select marcar_asistencia_reserva($1,true)',[booking.reserva_id]);
 assert.equal((await rows('select count(*)::int n from visit_review_requests where reserva_id=$1',[booking.reserva_id]))[0].n,1);
 const review=(await rows('select * from visit_review_requests where reserva_id=$1',[booking.reserva_id]))[0];
 assert.equal(review.status,'scheduled');assert.equal(review.sent_at,null);
 const delay=(await rows('select extract(epoch from (q.scheduled_for-r.inicio_at))::int seconds from visit_review_requests q join reservas r on r.id=q.reserva_id where r.id=$1',[booking.reserva_id]))[0].seconds;
 assert.equal(delay,10800);
 const consume=async()=>(await rows('select registrar_consumo_reserva($1,$2,35) result',[booking.reserva_id,restaurantId]))[0].result;
 const consumed=await consume();assert.equal(consumed.ok,true);
 assert.equal((await consume()).error,'CONSUMO_YA_REGISTRADO');
 assert.equal((await rows('select count(*)::int n from clientes_historial where reserva_id=$1',[booking.reserva_id]))[0].n,1);
 assert.equal((await rows('select count(*)::int n from puntos_movimientos where cliente_id=$1',[reservation.cliente_id]))[0].n,1);
 const customer=(await rows('select * from clientes where id=$1',[reservation.cliente_id]))[0];
 assert.equal(customer.puntos_totales,consumed.puntos_generados);assert.equal(customer.permite_email,false);
 // The agency API authorizes its caller then reads technical channel state
 // through the server role; owners must never read that private table.
 await reviewActor(db,null,'service_role');
 const all=async(table)=>rows(`select * from ${table} where ${table==='restaurantes'?'id':'restaurante_id'}=$1`,[restaurantId]);
 const data={restaurants:await all('restaurantes'),modules:await all('restaurante_modulos'),bookings:await all('reservas'),customers:await all('clientes'),requests:await all('visit_review_requests'),invitations:await all('restaurant_invitations'),access:await all('usuarios_restaurantes'),channels:await all('whatsapp_channels')};
 const m={exports:{}};new Function('module','exports',ts.transpileModule(await readFile(new URL('../lib/admin/overview.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports);
 // PostgREST serializes timestamps to JSON strings; PGlite returns Date objects.
 const overview=m.exports.buildAgencyOverview(JSON.parse(JSON.stringify(data)),m.exports.createPeriod(7,new Date(Date.now()+86400000))).restaurants[0];
 assert.equal(overview.attendance.attended,1);assert.equal(overview.reviews.sent,0);assert.equal(overview.metrics.confirmed.current,0);assert.equal(overview.setup.find(t=>t.id==='chatbot').ready,false);
 return 'SQL journey: new installation → invitation trigger and owner role → own configuration → idempotent public booking → visible reservation → attendance → one consumption/points entry → scheduled unsent review → persisted agency metrics. Auth transport and browser remain separate gates.';
}
