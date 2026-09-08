import {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewLinkActions from '@/app/r/[token]/ReviewLinkActions';
import ReviewRequestsPanelView,{type ReviewPanelClient} from '@/app/(app)/resenas/ReviewRequestsPanelView';
import {automatic,control,currentToken,customerAction,linkContext,resetDatabase,restaurant,rpc} from './database';
import './style.css';

type Message={token:string;text:string;phone:string};
type Link={active:boolean;optedOut:boolean;restaurantName:string};
function Preview(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[revision,setRevision]=useState(0);
 const [message,setMessage]=useState<Message|null>(null),[token,setToken]=useState(''),[context,setContext]=useState<Link|null>(null),[dark,setDark]=useState(false);
 const client=useMemo<ReviewPanelClient>(()=>({rpc,channelConfigured:async()=>false,reviewLink:t=>`${location.origin}${location.pathname}#cliente/${t}`,preparedMessage:setMessage,inspectGoogle:()=>setNote('Revisión de Google simulada. Puedes marcar «Aún no aparece» o confirmar la reseña en el panel.')}),[]);
 useEffect(()=>{void resetDatabase().then(()=>setReady(true)).catch(e=>setError(e.message));},[]);
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark);},[dark]);
 async function run(operation:()=>Promise<unknown>,success:string){if(busy)return;setBusy(true);setError('');try{await operation();setRevision(n=>n+1);if(success)setNote(success);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function openCustomer(value?:string){const next=value||await currentToken();if(!next){setNote('Primero marca la visita y deja que llegue la hora de la petición.');return;}setContext(await linkContext(next) as Link);setToken(next);}
 const b='rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-40';
 return <main className="mx-auto min-h-screen max-w-[1550px] p-4 sm:p-7">
  <header className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-indigo-700">GASTROHELP · PRUEBA INTERNA</p><h1 className="mt-1 text-2xl font-black">Reseñas después de la visita</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Datos ficticios. Los envíos y la salida a Google se simulan. Al recargar, la prueba empieza de nuevo.</p></div><a className={b} href="./mobile.html">Ver ancho de móvil</a><button className={b} onClick={()=>setDark(v=>!v)}>{dark?'Modo claro':'Modo oscuro'}</button></header>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
  {!ready?<p role="status" className="rounded-2xl border bg-white p-8 text-slate-800">Preparando las reservas de prueba…</p>:<>
   <section className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-slate-900">
    <h2 className="font-bold">Recorrido de prueba</h2><p className="mt-1 text-sm">La reserva inicial es de hace una hora. Marca la visita, comprueba la espera y adelanta el reloj para continuar.</p>
    <div className="mt-3 flex flex-wrap gap-2">
     <button className={b} disabled={busy} onClick={()=>void run(()=>control('attend'),'Visita marcada como realizada.')}>1. Marcar visita realizada</button>
     <button className={b} disabled={busy} onClick={()=>void run(()=>control('due'),'Han pasado cuatro horas desde la reserva.')}>2. Adelantar el reloj</button>
     <button className={b} disabled={busy} onClick={()=>void run(async()=>{const result=await automatic();setMessage(null);setNote(result.sent?`Envío simulado aceptado. Total: ${result.total}.` : result.message);},'')}>3. Probar envío automático</button>
     <button className={b} disabled={busy} onClick={()=>void openCustomer(message?.token)}>4. Ver enlace como cliente</button>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
     <button className={b} disabled={busy} onClick={()=>void run(()=>control('return'),'Otra visita creada. Márcala como realizada y adelanta el reloj.')}>Añadir segunda visita</button>
     <button className={b} disabled={busy} onClick={()=>void run(()=>control('no-consent'),'Permiso de WhatsApp retirado.')}>Retirar permiso</button>
     <button className={b} disabled={busy} onClick={()=>void run(()=>control('consent'),'Permiso de WhatsApp concedido para próximas peticiones.')}>Conceder permiso</button>
     <button className={b} disabled={busy} onClick={()=>void run(()=>control('cancel'),'Reserva actual cancelada.')}>Cancelar reserva</button>
     <button className={b} disabled={busy} onClick={()=>void run(async()=>{await resetDatabase();setMessage(null);setToken('');},'Prueba reiniciada.')}>Reiniciar prueba</button>
    </div>
    {note&&<p role="status" className="mt-3 text-sm font-semibold">{note}</p>}
   </section>
   {message&&<section className="mb-5 rounded-2xl border border-indigo-200 bg-white p-5 text-slate-900"><h2 className="font-bold">Borrador de WhatsApp · Simulación</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p><button className={`${b} mt-3`} onClick={()=>void openCustomer(message.token)}>Abrir enlace de este mensaje</button></section>}
   {token&&context?<section className="mx-auto max-w-lg rounded-3xl border bg-white p-7 text-slate-900"><button className={b} onClick={()=>{setToken('');setRevision(n=>n+1);}}>Volver al panel</button><p className="mt-6 text-sm font-semibold text-indigo-700">{context.restaurantName}</p><h2 className="mt-2 text-2xl font-black">Gracias por tu visita</h2><p className="mt-3 text-sm leading-6 text-slate-500">Cuéntanos tu experiencia. En esta prueba se guarda la pulsación y no se publica ninguna reseña.</p>
    <ReviewLinkActions token={token} active={context.active} optedOut={context.optedOut} transport={{
     async submit(value,action){const result=await customerAction(value,action) as {googleUrl?:string}|boolean;if(action==='stop'){setNote('Baja guardada. Las peticiones pendientes quedan canceladas.');setContext(await linkContext(value) as Link);return {};}return {url:typeof result==='object'?result.googleUrl:undefined};},
     openGoogle(){setNote('Pulsación en Google registrada. La reseña sigue sin confirmar.');},
    }}/>

   </section>:<ReviewRequestsPanelView key={revision} restauranteId={restaurant} dark={dark} client={client}/>}
  </>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
