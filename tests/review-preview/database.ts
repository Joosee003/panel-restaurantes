import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {deliverVisitReview, type ReviewEvent} from '@/lib/reviews/review-delivery';

export const restaurant='72000000-0000-4000-8000-000000000001';
const user='71000000-0000-4000-8000-000000000001';
const customer='75000000-0000-4000-8000-000000000001';
let db:PGlite;
let archive:Blob;
let pending:Promise<unknown>=Promise.resolve();
let currentVisit='';
let submitted=0;
export type PreviewMessage={token:string;firstName:string;restaurantName:string};
let lastMessage:PreviewMessage|null=null;
export const receivedMessage=()=>lastMessage;
export const exclusive=<T,>(operation:()=>Promise<T>):Promise<T>=>{
 const next=pending.then(operation,operation);pending=next.catch(()=>undefined);return next;
};
async function actor(role:'authenticated'|'service_role'='authenticated') {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false)",[JSON.stringify({sub:role==='authenticated'?user:null,role}),role==='authenticated'?user:'']);
 await db.exec(`set role ${role}`);
}
const names=new Set(['list_visit_review_requests','visit_review_action','save_visit_review_settings','get_visit_review_link','open_visit_review_link','stop_visit_review_requests','get_visit_review_delivery','complete_visit_review_delivery']);
async function call(name:string,args:Record<string,unknown>,role:'authenticated'|'service_role'='authenticated') {
 if(!names.has(name)||!Object.keys(args).every(k=>/^p_[a-z_]+$/.test(k))) throw new Error('UNKNOWN_PREVIEW_OPERATION');
 await actor(role);
 const result=await db.query<{result:unknown}>(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) result`,Object.values(args));
 return result.rows[0].result;
}
export const rpc=(name:string,args:Record<string,unknown>)=>exclusive(async()=>{
 try{return {data:await call(name,args),error:null};}
 catch(error){return {data:null,error:{message:error instanceof Error?error.message:String(error)}};}
});
async function newVisit() {
 await actor();currentVisit=(await db.query<{id:string}>('select gen_random_uuid() id')).rows[0].id;
 await db.query(`insert into reservas(id,restaurante_id,cliente_id,nombre_cliente,telefono,estado,origen,personas,turno,inicio_at,fin_at,fecha_hora_reserva,atendida)
 values($1,$2,$3,'Cliente de prueba','+34600000001','confirmada','panel_nativo',2,'comida',now()-interval '4 hours',now()-interval '150 minutes',(now()-interval '4 hours') at time zone 'Europe/Madrid',null)`,[currentVisit,restaurant,customer]);
 await db.query('select public.marcar_asistencia_reserva($1,true)',[currentVisit]);
}
export async function resetDatabase() {
 return exclusive(async()=>{
  if(!archive){const response=await fetch('./database.tar.gz');if(!response.ok)throw new Error('No se pudo cargar la base de prueba.');archive=await response.blob();}
  if(db)await db.close();
  db=new PGlite({loadDataDir:archive,extensions:{pgcrypto,uuid_ossp}});await db.waitReady;
  submitted=0;lastMessage=null;await newVisit();
 });
}
export async function control(action:'return'|'cancel'|'consent'|'no-consent') {
 return exclusive(async()=>{
  await actor();
  if(action==='return'){await newVisit();return;}
  if(action==='cancel')await db.query("update reservas set estado='cancelada' where id=$1",[currentVisit]);
  if(action==='consent'||action==='no-consent') {
   await actor('service_role');
   await db.query('update cliente_comunicaciones_consentimiento set review_whatsapp=$1 where cliente_id=$2',[action==='consent',customer]);
  }
 });
}
export const linkContext=(token:string)=>exclusive(()=>call('get_visit_review_link',{p_token:token},'service_role'));
export const customerAction=(token:string,action:'google'|'stop')=>exclusive(()=>call(action==='google'?'open_visit_review_link':'stop_visit_review_requests',{p_token:token},'service_role'));
export const currentToken=()=>exclusive(async()=>{await actor();const result=await db.query<{public_token:string}>('select public_token from visit_review_requests where reserva_id=$1',[currentVisit]);return result.rows[0]?.public_token;});
export const automatic=()=>exclusive(async()=>{
 await actor('service_role');
 const events=await db.query<ReviewEvent & {event_type:string}>('select * from claim_reservation_automation_events(10)');
 const event=events.rows.find(item=>item.event_type==='visit.review_request');
 if(!event)return {sent:0,total:submitted,message:'No hay una petición automática pendiente que cumpla las condiciones.'};
 const before=submitted;
 const report=await deliverVisitReview(event,async(name,args)=>{
  try{return {data:await call(name,args,'service_role'),error:null};}
  catch(error){return {data:null,error:{message:String(error)}};}
 },{
  N8N_REVIEW_WEBHOOK_URL:'https://n8n.gastrohelp.es/webhook/review-fixture',N8N_REVIEW_WEBHOOK_SECRET:'fixture-only-no-external-access',
  WHATSAPP_REVIEW_RESTAURANT_IDS:restaurant,
 },async(_url,options)=>{
  const body=JSON.parse(String(options?.body));
  lastMessage={firstName:body.review.name,restaurantName:body.review.restaurantName,token:body.review.token};
  submitted++;return new Response(JSON.stringify({ok:true,eventId:body.automationEventId,deliveryMode:'live',provider:'whatsapp',outcome:'sent',messageId:`wamid.fixture.${submitted}`}),{status:200});
 });
 return {sent:submitted-before,total:submitted,message:JSON.stringify(report)};
});
