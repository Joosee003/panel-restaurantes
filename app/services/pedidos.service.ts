import { supabase } from "../(app)/lib/supabaseClient";

export async function getPedidosByRestaurante(restauranteId: string) {
  if (!restauranteId) throw new Error("Selecciona un restaurante para ver sus pedidos.");
  const { data, error } = await supabase
    .from("pedidos_qr")
    .select(`*, pedido_qr_items (
      id, pedido_id, producto_id, nombre_producto, precio_unitario,
      cantidad, notas, created_at
    )`)
    .eq("restaurante_id", restauranteId)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return data ?? [];
}
