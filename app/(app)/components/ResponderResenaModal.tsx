"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  open: boolean;
  onClose: () => void;
  resenaId: string;
  restauranteId: string;
  initialText: string;
  onSaved: () => void;
};

export default function ResponderResenaModal({
  open,
  onClose,
  resenaId,
  restauranteId,
  initialText,
  onSaved,
}: Props) {
  const [texto, setTexto] = useState(initialText);
  const [saving, setSaving] = useState<"borrador" | "publicada" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!open) return null;

  const guardarRespuesta = async (responded: boolean) => {
    if (!texto.trim()) return;

    setSaving(responded ? "publicada" : "borrador");
    setErrorMsg(null);

    const { error } = await supabase
      .from("resenas")
      .update({
        respuesta_texto: texto.trim(),
        responded,
      })
      .eq("id", resenaId)
      .eq("restaurante_id", restauranteId);

    setSaving(null);

    if (!error) {
      onSaved();
      onClose();
      setTexto("");
      return;
    }

    setErrorMsg("No se pudo guardar la respuesta.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-[#0b1220] rounded-xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Preparar respuesta</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
            GastroHelp guarda el texto, pero no lo publica en Google. Después de copiarlo y publicarlo allí, puedes marcarlo como respondido.
          </p>
        </div>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe la respuesta que quieres usar en Google…"
          rows={5}
          className="w-full border rounded-md p-3 text-sm bg-transparent"
        />

        {errorMsg ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
            {errorMsg}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            disabled={saving !== null}
            className="px-4 py-2 text-sm border rounded-md"
          >
            Cancelar
          </button>

          <button
            onClick={() => guardarRespuesta(false)}
            disabled={saving !== null || !texto.trim()}
            className="px-4 py-2 text-sm rounded-md border border-slate-300 bg-white font-bold text-slate-800 disabled:opacity-50"
          >
            {saving === "borrador" ? "Guardando…" : "Guardar borrador"}
          </button>

          <button
            onClick={() => guardarRespuesta(true)}
            disabled={saving !== null || !texto.trim()}
            className="px-4 py-2 text-sm rounded-md bg-black font-bold text-white disabled:opacity-50"
          >
            {saving === "publicada" ? "Guardando…" : "Ya publicada en Google"}
          </button>
        </div>
      </div>
    </div>
  );
}
