// Disposable local SQL database. Never reads live credentials or customer rows.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {restoreApplicationCatalog,ident} from './recovery-catalog.mjs';
import {reviewActor} from './review-schema-checks.mjs';
import {restoreStoragePolicyFixture} from './storage-policy-fixture.mjs';
const db=new PGlite({extensions:{pgcrypto,uuid_ossp}});
const results=[]; const ids={}; let seq=1;
const id=name=>ids[name]??=("81000000-0000-4000-8000-"+String(seq++).padStart(12,'0'));
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
const insert=async(table,data)=>{const keys=Object.keys(data);return rows(`insert into ${table} (${keys.map(ident)}) values (${keys.map((_,i)=>'$'+(i+1))}) returning *`,keys.map(k=>data[k]));};
const actor=async(name,role='authenticated')=>reviewActor(db,name?id(name):null,role);
async function check(name,fn){await db.exec('reset role;begin');try{await fn();results.push({name,result:'passed'});}catch(e){results.push({name,result:'failed',error:e.message,code:e.code});}finally{await db.exec('rollback;reset role');}}
async function denied(sql,args=[]){await db.exec('savepoint denial');try{const data=await rows(sql,args);assert.equal(data.length,0,'Cross-restaurant operation succeeded');await db.exec('release savepoint denial');}catch(e){await db.exec('rollback to savepoint denial;release savepoint denial');if(['42501','23514','23503','P0001'].includes(e.code))return;throw e;}}
try{
 const catalog=JSON.parse(await readFile(new URL('../tests/fixtures/application-catalog-2026-09-08.json',import.meta.url),'utf8'));assert.equal(catalog.fixture_only,true);await restoreApplicationCatalog(db,catalog);
 await restoreStoragePolicyFixture(db);
 const migrations=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(n=>n>='20260908164431'&&!(process.env.SECURITY_BASELINE==='1'&&n.includes('enforce_restaurant_relations'))).sort();
 for(const file of migrations)await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec('alter role service_role bypassrls;alter table auth.users disable trigger user');
 for(const user of ['ownerA','ownerB','both','agency','demo','outsider'])await insert('auth.users',{id:id(user),email:user.toLowerCase()+'@example.invalid'});
 await db.exec('alter table auth.users enable trigger user');
 await insert('app_admins',{user_id:id('agency')});
 for(const side of ['A','B']){
  await insert('restaurantes',{id:id('restaurant'+side),nombre:'QA aislamiento '+side,slug:'qa-aislamiento-'+side.toLowerCase(),owner_id:id('owner'+side),horario_comida:'13:00-16:00',horario_cena:'20:00-23:00'});
  await insert('usuarios_restaurantes',{user_id:id('owner'+side),restaurante_id:id('restaurant'+side)});
  await insert('usuarios_restaurantes',{user_id:id('both'),restaurante_id:id('restaurant'+side)});
  const rid=id('restaurant'+side);
  await insert('restaurante_modulos',{restaurante_id:rid,estado:'activo',reservas:true,clientes:true,resenas:true,fidelizacion:true,rentabilidad:true,menu_digital:true,camarero_digital:true,automatizaciones:false});
  await insert('clientes',{id:id('customer'+side),restaurante_id:rid,nombre:'Persona ficticia '+side,telefono:'+44770090000'+(side==='A'?'1':'2')});
  await insert('sala_zonas',{id:id('zone'+side),restaurante_id:rid,nombre:'Zona QA'});
  await insert('sala_mesas',{id:id('table'+side),restaurante_id:rid,zona_id:id('zone'+side),nombre:'Mesa QA '+side,capacidad:4});
  await insert('reservas',{id:id('booking'+side),restaurante_id:rid,cliente_id:id('customer'+side),nombre_cliente:'Reserva ficticia '+side,estado:'pendiente',personas:2});
  await insert('clientes_historial',{id:id('history'+side),restaurante_id:rid,cliente_id:id('customer'+side),tipo:'nota',descripcion:'Nota ficticia'});
  await insert('cupones',{id:id('coupon'+side),restaurante_id:rid,nombre:'Cupón QA',beneficio:'Prueba aislada'});
  await insert('cupon_cliente',{id:id('customerCoupon'+side),restaurante_id:rid,cliente_id:id('customer'+side),cupon_id:id('coupon'+side)});
  await insert('premios_puntos',{id:id('reward'+side),restaurante_id:rid,nombre:'Premio QA',puntos_requeridos:10});
  await insert('puntos_movimientos',{id:id('points'+side),restaurante_id:rid,cliente_id:id('customer'+side),tipo:'ajuste',puntos:100,referencia:'fixture-'+side});
  await insert('canjes_puntos',{id:id('redemption'+side),restaurante_id:rid,cliente_id:id('customer'+side),premio_id:id('reward'+side),puntos_usados:10});
  await insert('cartas_digitales',{id:id('menu'+side),restaurante_id:rid,nombre:'Carta QA',estado:'publicada'});
  await insert('carta_categorias',{id:id('category'+side),restaurante_id:rid,carta_id:id('menu'+side),nombre:'Categoría QA'});
  await insert('carta_productos',{id:id('product'+side),restaurante_id:rid,carta_id:id('menu'+side),categoria_id:id('category'+side),nombre:'Producto QA',precio:10});
  await insert('pedidos_qr',{id:id('order'+side),restaurante_id:rid,carta_id:id('menu'+side),mesa_id:id('table'+side)});
  await insert('pedido_qr_items',{id:id('item'+side),pedido_id:id('order'+side),producto_id:id('product'+side),nombre_producto:'Producto QA',precio_unitario:10});
  await insert('platos',{id:id('dish'+side),restaurante_id:rid,nombre:'Plato QA',precio_venta:15});
  await insert('ingredientes',{id:id('ingredient'+side),restaurante_id:rid,nombre:'Ingrediente QA',unidad:'kg'});
  await insert('plato_ingredientes',{id:id('recipe'+side),plato_id:id('dish'+side),ingrediente_id:id('ingredient'+side)});
  await insert('ventas_platos',{id:id('sale'+side),restaurante_id:rid,plato_id:id('dish'+side)});
  await insert('resenas',{id:id('review'+side),restaurante_id:rid});
  await rows("update reservas_horarios set id=$1 where restaurante_id=$2 and dia_semana=1 and turno='comida'",[id('hours'+side),rid]);
  await insert('reservas_excepciones',{id:id('exception'+side),restaurante_id:rid,fecha:'2099-01-01',tipo:'cierre'});
 }
 await insert('usuarios_restaurantes',{user_id:id('demo'),restaurante_id:id('restaurantA'),demo_vista:true});
 const tables={clientes:'customer',reservas:'booking',clientes_historial:'history',cupones:'coupon',cupon_cliente:'customerCoupon',premios_puntos:'reward',canjes_puntos:'redemption',puntos_movimientos:'points',pedidos_qr:'order',pedido_qr_items:'item',cartas_digitales:'menu',carta_categorias:'category',carta_productos:'product',sala_mesas:'table',sala_zonas:'zone',platos:'dish',ingredientes:'ingredient',plato_ingredientes:'recipe',ventas_platos:'sale',resenas:'review',reservas_horarios:'hours',reservas_excepciones:'exception'};
 for(const [table,key]of Object.entries(tables)){
  await check(table+': owner reads own row and cannot read/update/delete foreign row',async()=>{await actor('ownerA');assert.equal((await rows(`select id from ${table} where id=$1`,[id(key+'A')])).length,1);assert.equal((await rows(`select id from ${table} where id=$1`,[id(key+'B')])).length,0);await denied(`update ${table} set id=id where id=$1 returning id`,[id(key+'B')]);await denied(`delete from ${table} where id=$1 returning id`,[id(key+'B')]);});
  await check(table+': unaffiliated account sees no rows',async()=>{await actor('outsider');await denied(`select id from ${table}`);});
  await check(table+': agency reads both assigned fixtures',async()=>{await actor('agency');assert.equal((await rows(`select id from ${table} where id in ($1,$2)`,[id(key+'A'),id(key+'B')])).length,2);});
  await check(table+': demo cannot update/delete even its own row',async()=>{await actor('demo');await denied(`update ${table} set id=id where id=$1 returning id`,[id(key+'A')]);await denied(`delete from ${table} where id=$1 returning id`,[id(key+'A')]);});
 }
 const links=[['reservas','booking','cliente_id','customer'],['reservas','booking','mesa_id','table'],['clientes_historial','history','cliente_id','customer'],['cupon_cliente','customerCoupon','cliente_id','customer'],['cupon_cliente','customerCoupon','cupon_id','coupon'],['canjes_puntos','redemption','cliente_id','customer'],['canjes_puntos','redemption','premio_id','reward'],['pedidos_qr','order','carta_id','menu'],['pedidos_qr','order','mesa_id','table'],['pedido_qr_items','item','producto_id','product'],['sala_mesas','table','zona_id','zone'],['plato_ingredientes','recipe','ingrediente_id','ingredient'],['ventas_platos','sale','plato_id','dish']];
 for(const [table,key,column,parent]of links)for(const user of ['ownerA','both','agency'])await check(`${table}.${column}: ${user} cannot link restaurant A to restaurant B`,async()=>{await actor(user);await denied(`update ${table} set ${column}=$1 where id=$2 returning id`,[id(parent+'B'),id(key+'A')]);});
 await check('points: own restaurant cannot credit foreign customer',async()=>{await actor('ownerA');await denied("insert into puntos_movimientos(cliente_id,restaurante_id,tipo,puntos) values($1,$2,'ajuste',5) returning id",[id('customerB'),id('restaurantA')]);});
 await check('loyalty redemption: unaffiliated account cannot spend another customer balance',async()=>{await actor('outsider');await denied('select rpc_canjear_premio($1,$2,$3)',[id('customerA'),id('restaurantA'),id('rewardA')]);});
 await check('loyalty redemption: anon cannot spend another customer balance',async()=>{await actor(null,'anon');await denied('select rpc_canjear_premio($1,$2,$3)',[id('customerA'),id('restaurantA'),id('rewardA')]);});
 await check('loyalty redemption: demo cannot create a redemption',async()=>{await actor('demo');await denied('select rpc_canjear_premio($1,$2,$3)',[id('customerA'),id('restaurantA'),id('rewardA')]);});
 await check('JWT user_metadata cannot grant agency role',async()=>{await actor('outsider');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id('outsider'),role:'authenticated',user_metadata:{role:'admin',is_admin:true}})]);assert.equal((await rows('select is_app_admin() allowed'))[0].allowed,false);});
 for(const [table,key]of Object.entries(tables))await check(table+': anonymous cannot read private fixture rows',async()=>{await actor(null,'anon');await denied(`select id from ${table} where id=$1`,[id(key+'A')]);});
 for(const bucket of ['menus','premios']){
  const path=side=>(bucket==='menus'?'productos/':'')+id('restaurant'+side)+'/qa.png';
  await insert('storage.objects',{id:id('file'+bucket+'A'),bucket_id:bucket,name:path('A')});
  await insert('storage.objects',{id:id('file'+bucket+'B'),bucket_id:bucket,name:path('B')});
  await check(bucket+': owner can upload, replace and delete own image metadata',async()=>{await actor('ownerA');const data=await insert('storage.objects',{bucket_id:bucket,name:path('A')+'.new'});assert.equal(data.length,1);assert.equal((await rows('update storage.objects set name=name where id=$1 returning id',[data[0].id])).length,1);assert.equal((await rows('delete from storage.objects where id=$1 returning id',[data[0].id])).length,1);});
  await check(bucket+': owner cannot list or modify foreign image metadata',async()=>{await actor('ownerA');await denied('select id from storage.objects where id=$1',[id('file'+bucket+'B')]);await denied('update storage.objects set name=name where id=$1 returning id',[id('file'+bucket+'B')]);await denied('delete from storage.objects where id=$1 returning id',[id('file'+bucket+'B')]);await denied('insert into storage.objects(bucket_id,name) values($1,$2) returning id',[bucket,path('B')+'.new']);});
  await check(bucket+': demo cannot upload image metadata',async()=>{await actor('demo');await denied('insert into storage.objects(bucket_id,name) values($1,$2) returning id',[bucket,path('A')+'.demo']);});
  await check(bucket+': demo cannot replace or delete existing image metadata',async()=>{await actor('demo');await denied('update storage.objects set name=name where id=$1 returning id',[id('file'+bucket+'A')]);await denied('delete from storage.objects where id=$1 returning id',[id('file'+bucket+'A')]);});
 }
 for(const table of ['clientes','reservas','sala_mesas','cupon_cliente','canjes_puntos','puntos_saldos','pedidos_qr','platos','ingredientes'])await check(table+': multiple-local owner cannot reassign linked rows to another restaurant',async()=>{await actor('both');await denied(`update ${table} set restaurante_id=$1 where restaurante_id=$2 returning restaurante_id`,[id('restaurantB'),id('restaurantA')]);});
 const policies=await rows("select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname");
 if(process.env.SECURITY_POLICIES)await writeFile(process.env.SECURITY_POLICIES,JSON.stringify(policies));
 const report={engine:'PGlite/PostgreSQL; local synthetic data; sequential role sessions',migrations,passed:results.filter(x=>x.result==='passed').length,failed:results.filter(x=>x.result==='failed').length,results};
 if(process.env.SECURITY_REPORT)await writeFile(process.env.SECURITY_REPORT,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));process.exitCode=report.failed?1:0;
}catch(e){console.error(JSON.stringify({fatal:e.message,code:e.code}));process.exitCode=1;}finally{await db.close();}
