import {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewLinkActions from '@/app/r/[token]/ReviewLinkActions';
import ReviewRequestsPanelView,{type ReviewPanelClient} from '@/app/(app)/resenas/ReviewRequestsPanelView';
import {automatic,control,customerAction,linkContext,receivedMessage,resetDatabase,restaurant,rpc,type PreviewMessage} from './database';
import './style.css';

type Link={active:boolean;optedOut:boolean;restaurantName:string};
function Preview(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[revision,setRevision]=useState(0);
 const [message,setMessage]=useState<PreviewMessage|null>(null),[context,setContext]=useState<Link|null>(null),[view,setView]=useState<'panel'|'message'|'link'>('panel'),[dark,setDark]=useState(false);
 const client=useMemo<ReviewPanelClient>(()=>({rpc,channelConfigured:async()=>true,inspectGoogle:()=>setNote('En esta prueba, la revisión de Google se simula. Puedes guardar cualquiera de los dos resultados.')}),[]);
 async function reset(){await resetDatabase();await automatic();setMessage(receivedMessage());setContext(null);setView('panel');}
 useEffect(()=>{void reset().then(()=>setReady(true)).catch(e=>setError(e.message));},[]);
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark);},[dark]);
 async function run(operation:()=>Promise<unknown>,success:string){if(busy)return;setBusy(true);setError('');try{await operation();setRevision(n=>n+1);if(success)setNote(success);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function anotherVisit(){await control('return');const result=await automatic();setMessage(receivedMessage());setNote(result.sent?'Otra visita: se ha enviado una nueva petición automáticamente (simulación).':'No se ha enviado otra petición: comprueba la confirmación de la reseña o el permiso del cliente.');}
 const b='rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-40';
 return <main className="mx-auto min-h-screen max-w-6xl p-4 sm:p-7">
  <header className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-indigo-600">GASTROHELP · VISTA DE PRUEBA</p><h1 className="mt-1 text-3xl font-black">Reseñas</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Datos ficticios. Esta prueba parte de un cliente marcado como «Ha venido» y simula el WhatsApp automático.</p></div><div className="flex flex-wrap gap-2"><a className={b} href="./mobile.html">Ver ancho de móvil</a><button className={b} onClick={()=>setDark(v=>!v)}>{dark?'Modo claro':'Modo oscuro'}</button></div></header>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
  {!ready?<p role="status" className="rounded-2xl border bg-white p-8 text-slate-800">Cargando la prueba automática…</p>:<>
   <nav className="mb-5 flex flex-wrap gap-2" aria-label="Vistas de prueba"><button className={b} aria-pressed={view==='panel'} onClick={()=>{setView('panel');setRevision(n=>n+1);}}>Panel del restaurante</button><button className={b} disabled={!message} aria-pressed={view!=='panel'} onClick={()=>setView('message')}>Ver mensaje del cliente</button></nav>
   {note&&<p role="status" className="mb-4 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900">{note}</p>}
   {view==='panel'?<ReviewRequestsPanelView key={revision} restauranteId={restaurant} dark={dark} client={client}/>:view==='message'&&message?<section className="mx-auto max-w-lg rounded-3xl border bg-white p-6 text-slate-900"><p className="text-sm font-semibold text-emerald-700">WhatsApp · Mensaje simulado</p><h2 className="mt-3 text-xl font-bold">Petición enviada automáticamente</h2><p className="mt-5 text-sm leading-7">Hola {message.firstName}, gracias por tu visita a {message.restaurantName}. ¿Nos cuentas tu experiencia en Google? Tu opinión nos ayuda a mejorar. Desde el enlace también puedes dejar de recibir estas peticiones.</p><button className="mt-5 w-full rounded-xl bg-[#1601ad] px-4 py-3 font-bold text-white" disabled={busy} onClick={()=>void run(async()=>{setContext(await linkContext(message.token) as Link);setView('link');},'')}>Compartir mi opinión</button></section>:context&&message?<section className="mx-auto max-w-lg rounded-3xl border bg-white p-7 text-slate-900"><p className="text-sm font-semibold text-indigo-700">{context.restaurantName}</p><h2 className="mt-2 text-2xl font-black">Gracias por tu visita</h2><p className="mt-3 text-sm leading-6 text-slate-500">Cuéntanos tu experiencia. En esta prueba, Google se simula.</p><ReviewLinkActions token={message.token} active={context.active} optedOut={context.optedOut} transport={{
    async submit(value,action){const result=await customerAction(value,action) as {googleUrl?:string}|boolean;if(action==='stop'){setNote('Baja guardada. Este cliente deja de recibir peticiones.');setContext(await linkContext(value) as Link);return {};}return {url:typeof result==='object'?result.googleUrl:undefined};},
    openGoogle(){setNote('El cliente ha abierto Google. El restaurante puede revisar si publicó la reseña.');},
   }}/></section>:null}
   <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900"><summary className="cursor-pointer text-sm font-semibold">Opciones de esta prueba</summary><p className="mt-3 text-sm text-slate-500">Estos controles simulan lo que sucede con las reservas. El restaurante no tiene que usarlos. Cada pestaña mantiene su propia prueba; al recargar empieza de nuevo.</p><div className="mt-3 flex flex-wrap gap-2"><button className={b} disabled={busy} onClick={()=>void run(anotherVisit,'')}>Simular otra visita</button><button className={b} disabled={busy} onClick={()=>void run(()=>control('no-consent'),'Permiso retirado. Las próximas visitas no enviarán peticiones.')}>Simular baja</button><button className={b} disabled={busy} onClick={()=>void run(async()=>{const result=await automatic();setNote(result.sent?'Petición enviada en la simulación.':'No se ha duplicado el envío.');},'')}>Comprobar que no se duplica</button><button className={b} disabled={busy} onClick={()=>void run(reset,'Prueba reiniciada. La petición se ha enviado automáticamente en la simulación.')}>Reiniciar prueba</button></div></details>
  </>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
