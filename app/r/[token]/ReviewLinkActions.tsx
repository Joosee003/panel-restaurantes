"use client";

import { useState } from "react";
import { googleReviewUrl } from "@/lib/reviews/review-flow";

export default function ReviewLinkActions({ token, active, optedOut }: { token: string; active: boolean; optedOut: boolean }) {
  const [stopped, setStopped] = useState(optedOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(action: "google" | "stop") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("action", action);
      const response = await fetch(`/api/public/review-requests/${token}`, { method: "POST", body: form });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      if (action === "stop") setStopped(true);
      else {
        const target = googleReviewUrl(result.url);
        if (!target) throw new Error("El enlace de Google no está disponible.");
        window.location.assign(target);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo completar la solicitud."); }
    finally { setBusy(false); }
  }
  return <>
    <button onClick={() => void act("google")} disabled={busy || !active} type="button" className="mt-7 w-full rounded-2xl bg-[#1601ad] px-5 py-4 text-base font-bold text-white hover:bg-indigo-800 disabled:opacity-50">{active ? "Escribir una reseña en Google" : "El enlace de Google ya no está disponible"}</button>
    <p className="mt-3 text-sm leading-6 text-slate-500">Al pulsar, se registra que has abierto el enlace. El restaurante no recibe tu valoración desde esta página.</p>
    <div className="mt-8 border-t border-slate-100 pt-5">
      {stopped ? <p role="status" className="text-sm font-semibold text-emerald-800">Ya no recibirás más peticiones de reseña por WhatsApp de este restaurante.</p> : <button onClick={() => void act("stop")} disabled={busy} type="button" className="text-sm text-slate-600 underline underline-offset-4 disabled:opacity-50">No recibir más peticiones de reseña</button>}
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
  </>;
}
