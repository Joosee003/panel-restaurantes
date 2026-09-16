"use client";
import { useRef, useState } from "react";
import { supabase } from "@/app/(app)/lib/supabaseClient";

export const invitationMessages: Record<string, string> = {
  not_requested: "Alta guardada. Falta solicitar el correo de acceso.",
  sending: "El correo se está procesando. Consulta el estado antes de reintentar.",
  accepted: "El proveedor ha aceptado el correo. Falta comprobar que el responsable lo reciba y active su acceso.",
  failed: "Alta guardada. El correo no se ha podido enviar; puedes reintentarlo sin crear otro restaurante.",
  uncertain: "Alta guardada. No se ha podido confirmar el resultado del correo. Revisa la bandeja antes de reenviar.",
  account_ready: "El responsable ya ha activado su acceso.",
};
export function InvitationAction({ restaurantId, onSaved }: { restaurantId: string; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const pending = useRef(false);
  async function resend() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
      const response = await fetch("/api/admin/restaurantes/invitacion", {
        method: "POST", headers: {"Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`},
        body: JSON.stringify({restaurante_id: restaurantId}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error("No se ha podido consultar el acceso. El restaurante sigue guardado.");
      setMessage(invitationMessages[result.invitation_status] || invitationMessages.uncertain);
      onSaved?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : invitationMessages.uncertain); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div>
    <button type="button" className="agency-button secondary" disabled={busy} onClick={() => void resend()}>{busy ? "Comprobando acceso…" : "Reenviar acceso"}</button>
    <p className="agency-footnote">Usa el correo ya asignado. No crea otro restaurante ni otra cuenta.</p>
    {message && <p role="status">{message}</p>}
  </div>;
}
