import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type CrearNotificacionClienteParams = {
  restaurante_id: string;
  cliente_id: string;
  tipo: "reserva" | "cupon" | "premio" | "canje" | "puntos" | "info";
  titulo: string;
  mensaje: string;
  url?: string | null;
};

export async function crearNotificacionCliente({
  restaurante_id,
  cliente_id,
  tipo,
  titulo,
  mensaje,
  url = null,
}: CrearNotificacionClienteParams) {
  if (!restaurante_id || !cliente_id || !titulo || !mensaje) return;

  const { error } = await supabaseAdmin.from("cliente_notificaciones").insert({
    restaurante_id,
    cliente_id,
    tipo,
    titulo,
    mensaje,
    url,
    leida: false,
  });

  if (error) {
    console.error("Error creando notificación cliente:", error.message);
  }
}