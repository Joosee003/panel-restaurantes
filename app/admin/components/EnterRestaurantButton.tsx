"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { agencyAccessMessage, enterAgencyRestaurant, returnToAgency } from "./agencyRestaurantAccess";

export default function EnterRestaurantButton({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function enter() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    returnToAgency();
    try {
      await enterAgencyRestaurant(supabase, restaurantId, controller.signal);
      if (controller.signal.aborted) return;
      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(agencyAccessMessage(cause));
      setPending(false);
    }
  }
  return <div>
    <button type="button" className="agency-button agency-card-action" disabled={pending} onClick={enter}>
      {pending ? "Verificando acceso…" : "Entrar al panel"}
      {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
    </button>
    {error && <p role="alert" className="agency-footnote">{error}</p>}
  </div>;
}
