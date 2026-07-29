"use client";

import { Check, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";

const defaults = {
  comida: "Comida",
  servicio: "Servicio",
  ambiente: "Ambiente",
  espera: "Tiempo de espera",
  limpieza: "Limpieza",
  calidad_precio: "Calidad-precio",
};

type Labels = typeof defaults;

export default function AspectLabelsEditor() {
  const supabase = getOpinionesBrowserClient();
  const [open, setOpen] = useState(false);
  const [configId, setConfigId] = useState("");
  const [labels, setLabels] = useState<Labels>(defaults);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("opinion_config")
      .select("id,aspect_labels")
      .eq("slug", "hispanos-grill")
      .single()
      .then(({ data }) => {
        if (!data) return;
        setConfigId(data.id as string);
        setLabels({ ...defaults, ...((data.aspect_labels ?? {}) as Partial<Labels>) });
      });
  }, [open, supabase]);

  async function save() {
    if (!configId) return;
    setSaving(true);
    setSaved(false);
    const cleaned = Object.fromEntries(
      Object.entries(labels).map(([key, value]) => [key, value.trim() || defaults[key as keyof Labels]]),
    ) as Labels;
    const { error } = await supabase
      .from("opinion_config")
      .update({ aspect_labels: cleaned })
      .eq("id", configId);
    setSaving(false);
    if (!error) {
      setLabels(cleaned);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-xs font-black text-[#1559b6] transition hover:-translate-y-0.5 hover:shadow-md sm:flex"
      >
        <Pencil className="h-4 w-4" /> Palabras clave
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <section className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-700">Formulario de opinión</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Editar palabras clave</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Estas opciones aparecen para que los clientes indiquen qué destacar. Puedes cambiarlas cuando quieras.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {(Object.keys(defaults) as Array<keyof Labels>).map((key) => (
                <label key={key} className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">{defaults[key]}</span>
                  <input
                    value={labels[key]}
                    onChange={(event) => setLabels((current) => ({ ...current, [key]: event.target.value.slice(0, 40) }))}
                    className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setOpen(false)} className="min-h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-600">Cancelar</button>
              <button type="button" disabled={saving} onClick={() => void save()} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:opacity-60">
                {saved && <Check className="h-4 w-4" />}
                {saving ? "Guardando…" : saved ? "Guardado" : "Guardar cambios"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
