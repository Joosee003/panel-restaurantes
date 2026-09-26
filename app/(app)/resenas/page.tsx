"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search, Star } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ResponderResenaModal from "../components/ResponderResenaModal";
import { useTheme } from "../components/ThemeProvider";
import { useRestaurante } from "../../hooks/useRestaurante";
import ReviewRequestsPanel from "./ReviewRequestsPanel";
import styles from "../components/product/modules.module.css";

type Resena = {
  id: string;
  nombre_cliente: string | null;
  rating: number | null;
  comentario: string | null;
  responded: boolean | null;
  respuesta_texto: string | null;
  fecha_reseña: string | null;
  created_at: string | null;
};
type Tab = "solicitudes" | "resenas" | "respondidas";

function StoredReviews({ restauranteId, dark, tab }: { restauranteId: string; dark: boolean; tab: Exclude<Tab,"solicitudes"> }) {
  const [reviews, setReviews] = useState<Resena[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Resena | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => { setLoading(true); setError(""); setRevision(value=>value+1); }, []);
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const card = styles.section;
  useEffect(() => {
    let active = true;
    void supabase.from("resenas").select('id,nombre_cliente,rating,comentario,responded,respuesta_texto,"fecha_reseña",created_at')
      .eq("restaurante_id",restauranteId).order("fecha_reseña",{ascending:false,nullsFirst:false})
      .then(({data,error:loadError})=>{
        if (!active) return;
        if (loadError) setError("No se pudieron cargar las reseñas guardadas.");
        else setReviews((data || []) as Resena[]);
        setLoading(false);
      });
    return () => { active = false; };
  },[restauranteId,revision]);
  const visible = reviews.filter(review=>(tab!=="respondidas" || review.responded)
    && `${review.nombre_cliente || ""} ${review.comentario || ""}`.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  return <section className={`${card} space-y-5`}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{tab==="respondidas" ? "Reseñas respondidas" : "Reseñas guardadas"}</h2><p className={`mt-1 text-sm ${muted}`}>Consulta las opiniones y prepara sus respuestas.</p></div><button type="button" onClick={refresh} aria-label="Actualizar reseñas" className="rounded-xl border border-slate-300 p-3"><RefreshCw size={18}/></button></div>
    <label className="relative block"><span className="sr-only">Buscar reseñas</span><Search size={17} className={`absolute left-3 top-3.5 ${muted}`}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar nombre o comentario" className={`w-full rounded-xl border py-3 pr-3 pl-10 text-sm ${dark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-white"}`}/></label>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {loading ? <Loader2 className="mx-auto my-12 animate-spin" aria-label="Cargando reseñas"/> : visible.length ? visible.map(review=>{
      const rating = Math.max(0,Math.min(5,Math.round(Number(review.rating)||0)));
      const date = review.fecha_reseña || review.created_at;
      return <article key={review.id} className={`${styles.reviewArticle} ${dark ? "border-slate-700" : "border-slate-200"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{review.nombre_cliente || "Cliente"}</h3><div className="mt-2 flex gap-1" aria-label={`${rating} de 5 estrellas`}>{Array.from({length:5},(_,i)=><Star key={i} size={16} className={i<rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}/>)}</div></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${review.responded ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{review.responded ? "Respondida" : "Sin responder"}</span></div>
        <p className={`mt-4 whitespace-pre-wrap text-sm leading-6 ${dark ? "text-slate-200" : "text-slate-700"}`}>{review.comentario || "Sin comentario escrito."}</p>
        {date && <p className={`mt-2 text-xs ${muted}`}>{new Date(date).toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"})}</p>}
        {review.respuesta_texto && <div className={`mt-4 rounded-xl p-4 text-sm ${dark ? "bg-slate-950" : "bg-slate-50"}`}><p className="font-bold">{review.responded ? "Respuesta" : "Borrador de respuesta"}</p><p className={`mt-2 whitespace-pre-wrap ${muted}`}>{review.respuesta_texto}</p></div>}
        {!review.responded && <button type="button" onClick={()=>setSelected(review)} className="mt-4 rounded-xl bg-[#1601ad] px-4 py-3 text-sm font-bold text-white">{review.respuesta_texto ? "Editar borrador" : "Preparar respuesta"}</button>}
      </article>;
    }) : <p className={`py-10 text-center text-sm ${muted}`}>No hay reseñas con este filtro.</p>}
    {selected && <ResponderResenaModal open resenaId={selected.id} restauranteId={restauranteId} initialText={selected.respuesta_texto || ""} onClose={()=>setSelected(null)} onSaved={refresh}/>}
  </section>;
}

export default function ResenasPage() {
  const { dark } = useTheme();
  const { data: restaurant, isLoading } = useRestaurante();
  const [tab, setTab] = useState<Tab>("solicitudes");
  const restauranteId = restaurant?.id ? String(restaurant.id) : null;
  return <div className={`${styles.workspace} space-y-5`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Relación con el cliente</p><h1>Reseñas</h1><p className={styles.subtitle}>Consulta las opiniones, revisa cada petición y conserva el contexto de la visita.</p></div></header>
    <nav className={styles.tabs} aria-label="Apartados de reseñas">
      {([["solicitudes","Seguimiento"],["resenas","Reseñas guardadas"],["respondidas","Respondidas"]] as [Tab,string][]).map(([key,label])=><button type="button" key={key} onClick={()=>setTab(key)} aria-current={tab===key ? "page" : undefined} className={styles.tab}>{label}</button>)}
    </nav>
    {isLoading ? <Loader2 className="mx-auto my-20 animate-spin" aria-label="Cargando restaurante"/> : !restauranteId ? <p role="alert">Selecciona el restaurante para ver sus reseñas.</p> : tab==="solicitudes" ? <ReviewRequestsPanel key={restauranteId} restauranteId={restauranteId} dark={dark}/> : <StoredReviews key={restauranteId} restauranteId={restauranteId} dark={dark} tab={tab}/>}
  </div>;
}
