"use client";

import { ArrowDown, ArrowUp, Check, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";

const defaults = [
  "carne a la brasa",
  "restaurante en Castellón",
  "comida colombiana",
  "hamburguesas",
  "buen servicio",
  "ambiente familiar",
];

function cleanKeywords(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 12);
}

export default function AspectLabelsEditor() {
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [configId, setConfigId] = useState("");
  const [keywords, setKeywords] = useState<string[]>(defaults);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void supabase
      .from("opinion_config")
      .select("id,seo_keywords")
      .eq("slug", "hispanos-grill")
      .single()
      .then(({ data, error: loadError }) => {
        if (loadError || !data) {
          setError("No se pudieron cargar las palabras clave.");
          return;
        }
        setConfigId(data.id as string);
        const stored = Array.isArray(data.seo_keywords)
          ? data.seo_keywords.filter((item): item is string => typeof item === "string")
          : [];
        setKeywords(cleanKeywords(stored.length ? stored : defaults));
      });
  }, [open, supabase]);

  function addKeyword() {
    const value = draft.trim();
    if (!value || keywords.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    setKeywords((current) => [...current, value].slice(0, 12));
    setDraft("");
  }

  function move(index: number, direction: -1 | 1) {
    setKeywords((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    if (!configId) return;
    const cleaned = cleanKeywords(keywords);
    setSaving(true);
    setSaved(false);
    setError(null);
    const { error: saveError } = await supabase
      .from("opinion_config")
      .update({ seo_keywords: cleaned })
      .eq("id", configId);
    setSaving(false);
    if (saveError) {
      setError("No se pudieron guardar los cambios.");
      return;
    }
    setKeywords(cleaned);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="hidden h-10 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-xs font-black text-[#1559b6] transition hover:-translate-y-0.5 hover:shadow-md sm:flex">
        <Search className="h-4 w-4" /> Palabras SEO
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-700">Reseñas de Google</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Palabras clave del restaurante</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Añade y ordena términos reales que ayuden al cliente a describir su experiencia. Aparecerán como sugerencias, nunca se publicarán automáticamente.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-6 flex gap-2">
              <input value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 60))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addKeyword(); } }} placeholder="Ej.: parrilla colombiana en Castellón" className="min-h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              <button type="button" onClick={addKeyword} disabled={!draft.trim() || keywords.length >= 12} className="flex min-h-12 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:opacity-40"><Plus className="h-4 w-4" /> Añadir</button>
            </div>
            <p className="mt-2 text-[11px] font-semibold text-slate-400">Máximo 12 palabras o frases. Evita repetir la misma palabra de forma artificial.</p>

            <div className="mt-5 space-y-2">
              {keywords.map((keyword, index) => (
                <div key={`${keyword}-${index}`} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-xs font-black text-slate-400">{index + 1}</span>
                  <input value={keyword} onChange={(event) => setKeywords((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value.slice(0, 60) : item))} className="min-h-10 flex-1 bg-transparent px-2 text-sm font-bold text-slate-800 outline-none" />
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500 disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === keywords.length - 1} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500 disabled:opacity-30" aria-label="Bajar"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setKeywords((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {!keywords.length && <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-sm font-bold text-slate-400">Añade al menos una sugerencia para los clientes.</div>}
            </div>

            {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setOpen(false)} className="min-h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-600">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void save()} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:opacity-60">{saved && <Check className="h-4 w-4" />}{saving ? "Guardando…" : saved ? "Guardado" : "Guardar cambios"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
