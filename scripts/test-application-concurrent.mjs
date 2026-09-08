// Complete captured application schema, fictional identities and a fresh PG17
// cluster. No DATABASE_URL, Supabase credentials, real data or outbound traffic.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile,mkdtemp,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { restoreApplicationCatalog } from './recovery-catalog.mjs';
import { ids,actor,seedApplication,closeAccount,consumeManually,linkedSnapshot,checkApplicationFlows } from './application-schema-checks.mjs';

const [catalogPath,binPath,pgPath,reportPath]=process.argv.slice(2);
assert.ok(catalogPath && binPath && pgPath,'Pass sanitized fixture, PostgreSQL binaries and pg module');
const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
assert.equal(catalog.fixture_only,true,'Only a reviewed, sanitized fixture may run in CI');
if(process.getuid?.()===0){console.error('Run this new private cluster as an ordinary local user. No existing database is accepted.');process.exit(2);}
const {default:pg}=await import(pathToFileURL(path.resolve(pgPath,'lib/index.js')).href);
const bin=path.resolve(binPath);
const cluster=await mkdtemp(path.join(tmpdir(),'gastrohelp-application-'));
const data=path.join(cluster,'data');
const clients=[];
let server;
const report={status:'incomplete',checked_at:new Date().toISOString(),
  catalog_captured_at:catalog.captured_at,source_sha256:catalog.source_sha256,
  redactions:catalog.redactions,checks:[],races:[],
  limitations:['Authentication service, HTTP extensions, Storage and deployed browser flows are not tested.']};
const bounded=(promise,ms,label)=>{
  let timeout;
  return Promise.race([promise,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error(`${label} timed out`)),ms);})])
    .finally(()=>clearTimeout(timeout));
};
async function command(executable,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error(`${path.basename(executable)} timed out`));},20000);
    let output='';
    child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('exit',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new Error(`${path.basename(executable)}: ${output}`));});
  });
}
async function connect(){
  const client=new pg.Client({host:cluster,port:5432,user:'postgres',database:'postgres',ssl:false,
    connectionTimeoutMillis:3000,query_timeout:7000});
  await client.connect();
  client.on('error',error=>console.error(`Rehearsal connection: ${error.code||'closed'}`));
  clients.push(client);
  await client.query("set statement_timeout='5s'; set lock_timeout='4s'; set search_path=public,extensions");
  return {query:(...args)=>client.query(...args),exec:sql=>client.query(sql)};
}
try{
  await command(path.join(bin,'initdb'),['-D',data,'--auth=trust','--username=postgres','--locale=C','--encoding=UTF8']);
  server=spawn(path.join(bin,'postgres'),['-D',data,'-c','listen_addresses=',
    '-c',`unix_socket_directories=${cluster}`,'-c','unix_socket_permissions=0700',
    '-c','max_connections=10','-c','shared_buffers=16MB'],{stdio:['ignore','ignore','pipe']});
  await bounded(new Promise((resolve,reject)=>{
    let log='';server.on('error',reject);server.on('exit',code=>reject(new Error(`PostgreSQL startup exited ${code}`)));
    server.stderr.on('data',chunk=>{log+=chunk;if(log.includes('database system is ready to accept connections'))resolve();});
  }),10000,'PostgreSQL startup');
  const a=await connect(),b=await connect(),observer=await connect();
  report.engine=(await a.query('select version() version')).rows[0].version;
  report.backends=await Promise.all([a,b,observer].map(async db=>(await db.query('select pg_backend_pid() pid')).rows[0].pid));
  assert.equal(new Set(report.backends).size,3);
  report.restored=await restoreApplicationCatalog(a,catalog);
  for(const file of ['harden-qr-close','connect-qr-reservation','align-manual-consumption-points',
    'preserve-qr-menu-origin','connect-qr-profitability','connect-room-capacity']) {
    await a.exec(await readFile(new URL(`../docs/sql/${file}.sql`,import.meta.url),'utf8'));
  }
  await checkApplicationFlows(a,report);
  const reset=async()=>{
    await Promise.all([a.exec('rollback'),b.exec('rollback')]);
    await seedApplication(a);await actor(b);await observer.exec('reset role');
  };
  const state=async()=>{const snapshot=await linkedSnapshot(observer);await observer.exec('reset role');return snapshot;};
  async function assertState(kind,{sales=kind==='linked'?1:0}={}){
    const s=await state();
    const closed=kind==='linked'||kind==='unlinked';
    const visited=kind==='linked'||kind==='manual';
    assert.equal(s.closes,closed?1:0);assert.equal(s.operations,closed?1:0);
    assert.equal(s.visits,visited?1:0);assert.equal(s.point_movements,visited?1:0);
    assert.equal(s.customer_visits,visited?1:0);
    assert.deepEqual([s.customer_points,s.balance_points,s.ledger_points],Array(3).fill(visited?70:0));
    assert.equal(s.sales,sales);assert.equal(s.contact_consent,false);
    if(sales){assert.equal(Number(s.sales_net),35.3);assert.equal(Number(s.sales_cost),4);}
    assert.equal(s.order_state,closed?'cobrado':'nuevo');
    return s;
  }
  async function race(label,body){
    await reset();
    try{await body();report.races.push(label);console.log(`PASS ${label}`);}
    finally{await Promise.all([a.exec('rollback'),b.exec('rollback')]);}
  }
  async function afterLock(operation,release){
    let settled=false;
    const pending=operation().then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
    try{
      const deadline=Date.now()+2500;
      let blocked=false;
      while(Date.now()<deadline){
        const row=(await observer.query(`select wait_event_type,pg_blocking_pids(pid) blockers
          from pg_stat_activity where pid=$1`,[report.backends[1]])).rows[0];
        if(row?.wait_event_type==='Lock'&&row.blockers.includes(report.backends[0])){blocked=true;break;}
        if(settled)break;
        await new Promise(resolve=>setTimeout(resolve,15));
      }
      assert.equal(blocked,true,'Independent observer must see B blocked by A before release');
      await release();return await pending;
    }finally{await a.exec('rollback');await pending;}
  }
  async function advisory(key){
    const row=(await observer.query(`select count(*)::int n from pg_locks
      where pid=$1 and locktype='advisory' and granted and objsubid=1
      and classid::bigint=((hashtextextended($2,0)>>32)&4294967295)
      and objid::bigint=(hashtextextended($2,0)&4294967295)`,[report.backends[0],key])).rows[0];
    assert.equal(row.n,1,'Writer A must own the exact operation lock');
  }
  const close=db=>closeAccount(db);
  const manual=db=>consumeManually(db);
  const configure=(db,enabled)=>db.query('select public.configurar_rentabilidad_qr($1,$2)',[ids.restaurant,enabled]);
  const changedOperation='7d000000-0000-4000-8000-000000000099';
  for(const first of ['manual','linked'])for(const finish of ['commit','rollback']){
    await race(`${first} first / ${finish} / competing consumption`,async()=>{
      const before=await state();await a.exec('begin');
      assert.equal((await(first==='manual'?manual(a):close(a))).ok,true);
      assert.deepEqual(await state(),before,'Uncommitted records must remain invisible');
      const outcome=await afterLock(()=>first==='manual'?close(b):manual(b),()=>a.exec(finish));
      if(finish==='rollback'){
        assert.equal(outcome.error,undefined);assert.equal(outcome.value.ok,true);
        await assertState(first==='manual'?'linked':'manual');
      }else if(first==='manual'){
        assert.match(outcome.error?.message||'',/CONSUMO_PREVIO_REQUIERE_REVISION/);await assertState('manual');
      }else{
        assert.equal(outcome.error,undefined);assert.equal(outcome.value.error,'CONSUMO_YA_REGISTRADO');await assertState('linked');
      }
    });
  }
  for(const finish of ['commit','rollback'])await race(`same operation / ${finish} / retry`,async()=>{
    const before=await state();await a.exec('begin');const first=await close(a);
    await advisory(`qr-operation:${ids.operation}`);
    await assert.rejects(close(b),/QR_CIERRE_EN_CURSO/);
    assert.deepEqual(await state(),before);
    await a.exec(finish);const retry=await close(b);
    assert.equal(retry.ok,true);assert.equal(retry.replayed,finish==='commit');
    if(finish==='commit')assert.equal(retry.cierre_id,first.cierre_id);
    else assert.notEqual(retry.cierre_id,first.cierre_id);
    const saved=await assertState('linked');await close(a);assert.deepEqual(await state(),saved);
  });
  await race('same operation / altered money / retry',async()=>{
    await a.exec('begin');await close(a);await advisory(`qr-operation:${ids.operation}`);
    await assert.rejects(closeAccount(b,{tip:3}),/QR_CIERRE_EN_CURSO/);await a.exec('commit');
    const saved=await assertState('linked');
    await assert.rejects(closeAccount(b,{tip:3}),/OPERACION_REUTILIZADA_CON_OTROS_DATOS/);
    assert.deepEqual(await state(),saved);
  });
  for(const finish of ['commit','rollback'])await race(`different operations / ${finish}`,async()=>{
    await a.exec('begin');await close(a);
    const outcome=await afterLock(()=>closeAccount(b,{operation:changedOperation}),()=>a.exec(finish));
    if(finish==='commit')assert.match(outcome.error?.message||'',/CONSUMO_PREVIO_REQUIERE_REVISION/);
    else{assert.equal(outcome.error,undefined);assert.equal(outcome.value.ok,true);}
    await assertState('linked');
  });
  await race('customer locked / retry',async()=>{
    const before=await state();await a.exec('begin');
    await a.query('select id from clientes where id=$1 for update',[ids.customer]);
    await assert.rejects(close(b),error=>error.code==='55P03');assert.deepEqual(await state(),before);
    await a.exec('rollback');assert.equal((await close(b)).ok,true);await assertState('linked');
  });
  await race('profit snapshots invisible until commit and unchanged on replay',async()=>{
    await a.exec('begin');const original=await close(a);
    assert.equal((await state()).sales,0);await advisory(`qr-operation:${ids.operation}`);
    await assert.rejects(close(b),/QR_CIERRE_EN_CURSO/);await a.exec('commit');
    const saved=await assertState('linked');assert.equal((await close(b)).cierre_id,original.cierre_id);
    assert.deepEqual(await state(),saved);
  });
  for(const finish of ['commit','rollback'])await race(`close / ${finish} / disable profitability`,async()=>{
    await a.exec('begin');await close(a);
    const outcome=await afterLock(()=>configure(b,false),()=>a.exec(finish));assert.equal(outcome.error,undefined);
    if(finish==='rollback')await close(b);
    await assertState('linked',{sales:finish==='commit'?1:0});
  });
  await race('disable profitability before waiting close',async()=>{
    await a.exec('begin');await configure(a,false);
    const outcome=await afterLock(()=>close(b),()=>a.exec('commit'));
    assert.equal(outcome.error,undefined);assert.equal(outcome.value.ok,true);await assertState('linked',{sales:0});
  });
  const unlinked=db=>closeAccount(db,{reservation:null});
  const newOrder=db=>db.query(`with o as(insert into pedidos_qr(id,restaurante_id,carta_id,mesa_id,mesa_session_id,total)
    values('77000000-0000-4000-8000-000000000099',$1,$2,$3,$4,10) returning id)
    insert into pedido_qr_items(pedido_id,producto_id,nombre_producto,precio_unitario,cantidad)
    select id,$5,'Competing fictional product',10,1 from o`,[ids.restaurant,ids.card,ids.table,ids.session,ids.product]);
  await race('new order before QR close rejects stale account',async()=>{
    await a.exec('begin');await newOrder(a);
    const outcome=await afterLock(()=>unlinked(b),()=>a.exec('commit'));
    assert.match(outcome.error?.message||'',/PEDIDOS_CAMBIADOS_ACTUALIZA|IMPORTE_CAMBIADO_ACTUALIZA/);assert.equal((await state()).closes,0);
  });
  await race('QR close before new order rejects obsolete session',async()=>{
    await a.exec('begin');await unlinked(a);
    const outcome=await afterLock(()=>newOrder(b),()=>a.exec('commit'));
    assert.match(outcome.error?.message||'',/SESION_MESA_NO_VALIDA/);await assertState('unlinked',{sales:1});
  });
  await race('two account closes produce one receipt',async()=>{
    await a.exec('begin');await unlinked(a);
    const outcome=await afterLock(()=>closeAccount(b,{reservation:null,operation:changedOperation}),()=>a.exec('commit'));
    assert.match(outcome.error?.message||'',/SESION_MESA_CAMBIADA|SESION_MESA_NO_VALIDA|PEDIDO_QR_YA_CERRADO/);await assertState('unlinked',{sales:1});
  });
  await race('kitchen cancels before QR close',async()=>{
    await a.exec('begin');await a.query("update pedidos_qr set estado='cancelado' where id=$1",[ids.order]);
    const outcome=await afterLock(()=>unlinked(b),()=>a.exec('commit'));
    assert.match(outcome.error?.message||'',/PEDIDOS_CAMBIADOS_ACTUALIZA|PEDIDO_QR_YA_CERRADO|IMPORTE_CAMBIADO_ACTUALIZA/);assert.equal((await state()).closes,0);
  });
  await race('QR close before kitchen update protects paid order',async()=>{
    await a.exec('begin');await unlinked(a);
    const outcome=await afterLock(()=>b.query("update pedidos_qr set estado='preparando' where id=$1",[ids.order]),()=>a.exec('commit'));
    assert.match(outcome.error?.message||'',/PEDIDO_QR_FINALIZADO/);await assertState('unlinked',{sales:1});
  });
  await race('module disabled before QR close',async()=>{
    await a.exec('reset role; begin');
    await a.query('update restaurante_modulos set camarero_digital=false where restaurante_id=$1',[ids.restaurant]);
    const outcome=await afterLock(()=>unlinked(b),()=>a.exec('commit'));
    assert.match(outcome.error?.message||'',/QR_MODULE_DISABLED/);assert.equal((await state()).closes,0);
  });
  await race('QR close before module disable finishes the receipt',async()=>{
    await a.exec('begin');await unlinked(a);await b.exec('reset role');
    const outcome=await afterLock(()=>b.query('update restaurante_modulos set camarero_digital=false where restaurante_id=$1',[ids.restaurant]),()=>a.exec('commit'));
    assert.equal(outcome.error,undefined);await assertState('unlinked',{sales:1});
  });
  const capacitySetup=async(enabled=true)=>{
    await a.exec('reset role');await a.query('delete from reservas where id=$1',[ids.reservation]);
    await a.query('update sala_mesas set capacidad=8 where id=$1',[ids.table]);
    await a.query('update reservas_config set capacidad_vinculada_sala=$1 where restaurante_id=$2',[enabled,ids.restaurant]);
    await actor(a);
  };
  const reserve=(db,people)=>db.query(`insert into reservas(restaurante_id,personas,estado,origen,inicio_at,fin_at,fecha_hora_reserva)
    values($1,$2,'confirmada','panel_nativo',now()+interval '1 hour',now()+interval '150 minutes',
      (now()+interval '1 hour') at time zone 'Europe/Madrid')`,[ids.restaurant,people]);
  const block=db=>db.query('update sala_mesas set bloqueada=true where id=$1',[ids.table]);
  const enable=db=>db.query('update reservas_config set capacidad_vinculada_sala=true where restaurante_id=$1',[ids.restaurant]);
  const count=async()=>Number((await observer.query('select count(*)::int n from reservas')).rows[0].n);
  await race('capacity / two simultaneous bookings',async()=>{
    await capacitySetup();await a.exec('begin');await reserve(a,6);await advisory(`${ids.restaurant}:room-capacity`);
    await assert.rejects(reserve(b,6),/CAPACITY_BUSY/);await a.exec('commit');
    await assert.rejects(reserve(b,6),/SLOT_NOT_AVAILABLE/);assert.equal(await count(),1);
  });
  await race('capacity / physical block before booking',async()=>{
    await capacitySetup();await a.exec('begin');await block(a);await advisory(`${ids.restaurant}:room-capacity`);
    await assert.rejects(reserve(b,6),/CAPACITY_BUSY/);await a.exec('commit');
    await assert.rejects(reserve(b,6),/SLOT_NOT_AVAILABLE/);assert.equal(await count(),0);
  });
  await race('capacity / accepted booking before physical block',async()=>{
    await capacitySetup();await a.exec('begin');await reserve(a,6);await advisory(`${ids.restaurant}:room-capacity`);
    await assert.rejects(block(b),/CAPACITY_BUSY/);await a.exec('commit');await block(b);
    assert.equal(await count(),1);await assert.rejects(reserve(b,1),/SLOT_NOT_AVAILABLE/);
  });
  await race('capacity / booking before opt-in preserves accepted reservation',async()=>{
    await capacitySetup(false);await a.exec('begin');await reserve(a,9);await advisory(`${ids.restaurant}:room-capacity`);
    await assert.rejects(enable(b),/CAPACITY_BUSY/);await a.exec('commit');await enable(b);
    assert.equal(await count(),1);await assert.rejects(reserve(b,1),/SLOT_NOT_AVAILABLE/);
  });
  await race('capacity / opt-in before oversized booking',async()=>{
    await capacitySetup(false);await a.exec('begin');await enable(a);await advisory(`${ids.restaurant}:room-capacity`);
    await assert.rejects(reserve(b,9),/CAPACITY_BUSY/);await a.exec('commit');
    await assert.rejects(reserve(b,9),/SLOT_NOT_AVAILABLE/);assert.equal(await count(),0);
  });
  assert.equal(report.races.length,26);
  report.status='passed';
  console.log(JSON.stringify({status:report.status,restored:report.restored,
    checks:report.checks.length,real_concurrent_cases:report.races.length,backends:report.backends}));
}catch(error){
  report.error={message:error.message,code:error.code||error.cause?.code};
  console.error(JSON.stringify({status:'failed',...report.error}));process.exitCode=1;
}finally{
  if(reportPath)await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  if(server?.pid && server.exitCode===null && server.signalCode===null){
    const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGINT');
    try{await bounded(exited,5000,'PostgreSQL shutdown');}catch{server.kill('SIGKILL');}
  }
  await Promise.allSettled(clients.map(client=>bounded(client.end(),3000,'connection close')));
}
