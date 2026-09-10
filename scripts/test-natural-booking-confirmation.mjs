import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../tests/sql/node_modules/@electric-sql/pglite/dist/index.js';
import {pgcrypto} from '../tests/sql/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';
import {uuid_ossp} from '../tests/sql/node_modules/@electric-sql/pglite/dist/contrib/uuid_ossp.js';
import {restoreApplicationCatalog} from './recovery-catalog.mjs';
import {reviewActor,reviewIds as I} from './review-schema-checks.mjs';
const db=new PGlite({extensions:{pgcrypto,uuid_ossp}}), checks=[];
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
const migration='20260910233843_natural_booking_confirmation.sql';
try {
 const catalog=JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json',import.meta.url),'utf8'));
 assert.equal(catalog.fixture_only,true);await restoreApplicationCatalog(db,catalog);
 await db.exec(`alter role service_role bypassrls;
  alter table auth.users disable trigger user;
  insert into auth.users(id,email) values('${I.user}','confirmation-a@example.invalid'),('${I.otherUser}','confirmation-b@example.invalid');
  alter table auth.users enable trigger user;
  insert into restaurantes(id,nombre,slug,owner_id) values
   ('${I.restaurant}','Confirmation A','confirmation-a','${I.user}'),('${I.otherRestaurant}','Confirmation B','confirmation-b','${I.otherUser}');
  insert into restaurante_modulos(restaurante_id,chatbot,reservas,estado) values
   ('${I.restaurant}',true,true,'activo'),('${I.otherRestaurant}',true,true,'activo')
   on conflict(restaurante_id) do update set chatbot=true,reservas=true,estado='activo';
  update reservas_config set activo=true,zona_horaria='Europe/Madrid',duracion_minutos=60,intervalo_minutos=30,
   antelacion_minutos=0,confirmacion_automatica=true,personas_maximas=12,
   aviso_reserva='Internal terms '||restaurante_id::text,politica_cancelacion='Cancellation '||restaurante_id::text;
  insert into reservas_horarios(restaurante_id,dia_semana,turno,hora_inicio,hora_fin,activo,capacidad_override)
   select r.id,d,'cena','19:30'::time,'23:00'::time,true,10 from restaurantes r cross join generate_series(0,6) d;
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
 await reviewActor(db,null,'service_role');
 const valid=['sí','si, todo correcto','correcto','todo bien','vale','de acuerdo','perfecto','sí por favor','adelante','Sí, está bien.','Sí,correcto'];
 for(const text of valid) assert.equal((await rows('select is_booking_details_confirmation($1) ok',[text]))[0].ok,true,text);
 for(const text of ['no','no sé','sí, pero a las 20:30','no confirmo','creo que sí','correcto no','si no está mal'])
  assert.equal((await rows('select is_booking_details_confirmation($1) ok',[text]))[0].ok,false,text);
 const day=(await rows('select (current_date+2)::text d'))[0].d;
 const slot=(await rows('select inicio_at from obtener_disponibilidad_chatbot($1,$2,2)',[I.restaurant,day]))[0].inicio_at;
 const audit={prompt:'Comprueba la reserva: Prueba, 2 personas. ¿Son correctos estos datos?',response:'Sí, está bien.',version:'booking-details-v1',messageId:'fixture-confirmation-1'};
 const create=(rid,key,confirmation=audit,people=2)=>rows('select crear_reserva_chatbot_confirmada($1,$2,$3,$4,$5,$6,$7,$8) result',
  [rid,slot,people,'Prueba','+447700900131',null,key,JSON.stringify(confirmation)]).then(r=>r[0].result);
 const keyA='77000000-0000-4000-8000-000000000001',keyB='77000000-0000-4000-8000-000000000002';
 for(const confirmation of [{...audit,response:'no'},{...audit,response:'sí pero a las 20:30'},{...audit,version:'old'}, {...audit,messageId:''}])
  await assert.rejects(create(I.restaurant,keyA,confirmation),/BOOKING_CONFIRMATION_REQUIRED/);
 assert.equal((await rows('select count(*)::int n from reservas'))[0].n,0);
 checks.push('Only an ordinary affirmative to the current booking summary can create a reservation.');
 const a=await create(I.restaurant,keyA);assert.equal(a.ok,true);assert.equal(a.duplicate,false);assert.ok(a.cliente_app_token);
 const saved=(await rows('select r.*,c.public_token,c.permite_whatsapp,c.permite_email from reservas r join clientes c on c.id=r.cliente_id where r.id=$1',[a.reserva_id]))[0];
 assert.equal(saved.restaurante_id,I.restaurant);assert.equal(saved.privacidad_informada_at,null);assert.equal(saved.condiciones_aceptadas_at,null);assert.ok(saved.datos_confirmados_at);
 assert.equal(saved.confirmacion_reserva.prompt,audit.prompt);assert.equal(saved.confirmacion_reserva.response,audit.response);assert.equal(saved.confirmacion_reserva.messageId,audit.messageId);
 assert.equal(saved.confirmacion_reserva.conditionsAccepted,false);assert.equal(saved.confirmacion_reserva.privacyNoticeShown,false);
 assert.equal(saved.confirmacion_reserva.termsSnapshot.aviso_reserva,'Internal terms '+I.restaurant);
 assert.equal(saved.confirmacion_reserva.termsSnapshot.politica_cancelacion,'Cancellation '+I.restaurant);
 assert.equal(saved.public_token,a.cliente_app_token);assert.equal(saved.permite_whatsapp,false);assert.equal(saved.permite_email,false);
 checks.push('The exact confirmation and internal terms are retained without recording unseen notices, accepted conditions or marketing permission.');
 const b=await create(I.otherRestaurant,keyB);assert.equal(b.ok,true);assert.notEqual(b.cliente_app_token,a.cliente_app_token);
 const ownerB=(await rows('select restaurante_id from clientes where public_token=$1',[b.cliente_app_token]))[0];assert.equal(ownerB.restaurante_id,I.otherRestaurant);
 const repeat=await create(I.restaurant,keyA);assert.equal(repeat.duplicate,true);assert.equal(repeat.reserva_id,a.reserva_id);assert.equal(repeat.cliente_app_token,a.cliente_app_token);
 assert.equal((await rows('select count(*)::int n from reservas'))[0].n,2);
 checks.push('Each restaurant returns its own customer app token, even for the same phone; retries create no duplicate.');
 await assert.rejects(create(I.restaurant,'77000000-0000-4000-8000-000000000003',audit,10),/SLOT_NOT_AVAILABLE/);
 assert.equal((await rows('select count(*)::int n from reservas'))[0].n,2);
 checks.push('The writer rechecks live capacity under the restaurant/date lock.');
 for(const role of ['anon','authenticated']) {
  await reviewActor(db,I.user,role);
  await assert.rejects(create(I.restaurant,keyA),/permission denied/);
  await assert.rejects(rows('select is_booking_details_confirmation($1)',['sí']),/permission denied/);
 }
 checks.push('Browser roles cannot invoke the booking writer or confirmation helper.');
 console.log(JSON.stringify({status:'passed',checks},null,2));
} catch(error) {console.error(JSON.stringify({status:'failed',message:error.message,code:error.code,where:error.where,stack:error.stack}));process.exitCode=1;}
finally {await db.close();}
