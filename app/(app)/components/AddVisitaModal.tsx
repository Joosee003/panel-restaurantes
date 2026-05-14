"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  clienteId: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function AddVisitaModal({
  clienteId,
  onClose,
  onSaved,
}: Props) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  // Detecta el tema real
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const read = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  const guardarVisita = async () => {
    if (!fecha || guardando) return;
    setGuardando(true);

    const { data: cliente, error: clienteError } = await supabase
      .from("clientes")
      .select("restaurante_id")
      .eq("id", clienteId)
      .single();

    if (clienteError || !cliente?.restaurante_id) {
      setGuardando(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("clientes_historial")
      .insert({
        cliente_id: clienteId,
        restaurante_id: cliente.restaurante_id,
        tipo: "visita",
        created_at: `${fecha}T12:00:00`,
      });

    if (insertError) {
      setGuardando(false);
      return;
    }

    await supabase.from("cliente_notificaciones").insert({
      restaurante_id: cliente.restaurante_id,
      cliente_id: clienteId,
      tipo: "info",
      titulo: "Visita registrada",
      mensaje: "El restaurante ha registrado una visita en tu historial.",
      url: null,
      leida: false,
    });

    setGuardando(false);
    onSaved();
    onClose();
  };

  const overlayClass = isDark ? "bg-black/60" : "bg-black/30";

  const modalClass = isDark
    ? "bg-[#0b1220] text-gray-100"
    : "bg-white text-gray-900";

  const inputClass = isDark
    ? "w-full border rounded-lg p-2 text-sm bg-[#050b18] text-gray-100 border-gray-700"
    : "w-full border rounded-lg p-2 text-sm bg-white text-gray-900 border-gray-300";

  const btnClass =
    "w-full py-2 rounded-lg font-bold disabled:opacity-50 " +
    (isDark
      ? "bg-black text-white hover:bg-gray-800"
      : "bg-gray-900 text-white hover:bg-gray-800");

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${overlayClass}`}
    >
      <div className={`rounded-xl p-6 w-full max-w-sm space-y-4 ${modalClass}`}>
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-lg">Añadir visita</h2>
          <button onClick={onClose} className="opacity-70 hover:opacity-100">
            <X />
          </button>
        </div>

        <input
          type="date"
          className={inputClass}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />

        <button
          onClick={guardarVisita}
          disabled={guardando}
          className={btnClass}
        >
          {guardando ? "Guardando…" : "Guardar visita"}
        </button>
      </div>
    </div>
  );
}