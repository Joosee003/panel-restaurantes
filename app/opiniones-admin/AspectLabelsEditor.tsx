"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
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

export default function AspectLabelsEditor({
  configId,
  initialLabels,
}: {
  configId: string;
  initialLabels?: Partial<Labels> | null;
}) {
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [labels, setLabels] = useState<Labels>({ ...defaults, ...(initialLabels ?? {}) });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const cleaned = Object.fromEntries(
      Object.entries(labels).map(([key, value]) => [
        key,
        value.trim().slice(0, 40) || defaults[key as keyof Labels],
      ]),
    ) as Labels;

    setSaving(true);
    setSaved(false);
    setError(null);
    const { error: saveError } = await supabase
      .from("opinion_config")
      .update({ aspect_labels: cleaned })
      .eq("id", configId);
    setSaving(false);

    if (saveError) {
      setError("No se pudieron guardar las opciones.");
      return;
    }

    setLabels(cleaned);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-700">
        Formulario de opinión
      </p>
      <h2 className="mt-1 text-xl font-black text-slate-950">
        Opciones que verá el cliente
      </h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        Personaliza las seis opciones del formulario. El cambio se aplicará al formulario público.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(defaults) as Array<keyof Labels>).map((key) => (
          <label key={key} className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              {defaults[key]}
            </span>
            <input
              value={labels[key]}
              onChange={(event) =>
                setLabels((current) => ({
                  ...current,
                  [key]: event.target.value.slice(0, 40),
                }))
              }
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </label>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:opacity-60"
      >
        {saved && <Check className="h-4 w-4" />}
        {saving ? "Guardando…" : saved ? "Guardado" : "Guardar opciones"}
      </button>
    </section>
  );
}
