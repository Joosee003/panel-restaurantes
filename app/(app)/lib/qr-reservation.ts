// The browser filters suggestions only. The closing RPC repeats every check
// under locks; neither names, phone numbers nor table proximity identify a guest.
export type QrReservation = {
  id: string;
  restaurante_id: string;
  mesa_id: string | null;
  cliente_id: string | null;
  nombre_cliente: string | null;
  estado: string | null;
  inicio_at: string | null;
  fin_at: string | null;
  consumo_registrado_en: string | null;
};

export function eligibleQrReservations(
  rows: QrReservation[], restaurantId: string, tableId: string,
  orderDates: string[], now: number,
): QrReservation[] {
  if (!orderDates.length) return [];
  const dates = orderDates.map((value) => Date.parse(value));
  if (dates.some((date) => !Number.isFinite(date))) return [];
  return rows.filter((row) => {
    const start = Date.parse(row.inicio_at || "");
    const end = Date.parse(row.fin_at || "");
    return row.restaurante_id === restaurantId && row.mesa_id === tableId
      && Boolean(row.cliente_id) && !row.consumo_registrado_en
      && ["pendiente", "confirmada", "confirmado"].includes(row.estado || "")
      && start <= now && now < end
      && dates.every((date) => start <= date && date < end);
  });
}

export type QrCloseRequest = {
  p_operacion_id: string;
  p_mesa_id: string;
  p_pedidos_ids: string[];
  p_mesa_session_id: string;
  p_total_esperado: number;
  p_descuento: number;
  p_propina: number;
  p_metodo_pago: string;
  p_notas: string;
  p_reserva_id: string | null;
};
export type PendingQrClose = { restaurantId: string; request: QrCloseRequest };
export const pendingQrCloseKey = (restaurantId: string) => `qr-close-v1:${restaurantId}`;

export function clearStoredQrClose(
  storage: Pick<Storage, "getItem" | "removeItem">, pending: PendingQrClose,
): boolean {
  const key = pendingQrCloseKey(pending.restaurantId);
  const raw = storage.getItem(key);
  if (!raw) return false;
  const current = parsePendingQrClose(raw, pending.restaurantId);
  // A response from an unmounted page must never erase a later operation.
  if (current.request.p_operacion_id !== pending.request.p_operacion_id) return false;
  storage.removeItem(key);
  return true;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (value: unknown): value is number => typeof value === "number"
  && Number.isFinite(value) && value >= 0
  && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

export function qrAdjustment(raw: string, maximum: number): number {
  const text = raw.trim();
  const value = text ? Number(text.replace(",", ".")) : 0;
  if ((text && !/^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(text))
    || !money(value) || value > maximum) {
    throw new Error("Revisa descuento y propina: importes no negativos y máximo dos decimales. El descuento no puede superar la cuenta y la propina no puede superar 10.000 €.");
  }
  return value;
}

// Fail closed on corrupt storage, never silently discard an unresolved write.
export function parsePendingQrClose(raw: string, restaurantId: string): PendingQrClose {
  const pending = JSON.parse(raw) as PendingQrClose;
  const r = pending?.request;
  if (pending?.restaurantId !== restaurantId || !r
    || ![r.p_operacion_id, r.p_mesa_id, r.p_mesa_session_id].every((v) => typeof v === "string" && uuid.test(v))
    || (r.p_reserva_id !== null && (typeof r.p_reserva_id !== "string" || !uuid.test(r.p_reserva_id)))
    || !Array.isArray(r.p_pedidos_ids) || !r.p_pedidos_ids.length
    || r.p_pedidos_ids.length > 1000 || !r.p_pedidos_ids.every((v) => typeof v === "string" && uuid.test(v))
    || new Set(r.p_pedidos_ids).size !== r.p_pedidos_ids.length
    || ![r.p_total_esperado, r.p_descuento, r.p_propina].every(money)
    || r.p_descuento > r.p_total_esperado || r.p_propina > 10000
    || !["tarjeta", "efectivo", "bizum", "mixto"].includes(r.p_metodo_pago)
    || typeof r.p_notas !== "string" || r.p_notas.length > 500) {
    throw new Error("Hay un cierre pendiente que no se puede recuperar. Revisa el historial con soporte antes de registrar otro pago.");
  }
  return pending;
}

// These are explicit transaction/API rejections. A transport failure or an
// unreadable response is ambiguous and must retain the original operation ID.
export function qrCloseRejected(code: string | undefined): boolean {
  // Class 08 includes unknown transaction outcomes; never clear those. Only
  // known SQL rollback/auth/validation classes and pre-execution API errors.
  return Boolean(code && (/^(22|23|28|40|42|44|55|P0)[0-9A-Z]{3}$/.test(code)
    || ["PGRST100", "PGRST102", "PGRST202", "PGRST203", "PGRST204"].includes(code)));
}

export function qrCloseError(message: string): string {
  if (/CONSUMO_YA_REGISTRADO|CONSUMO_PREVIO|RESERVA_YA_VINCULADA|PUNTOS_PREVIOS/.test(message)) return "Esta reserva ya tiene consumo, puntos o una cuenta vinculada. No se ha cerrado: revisa el registro existente, sin duplicarlo.";
  if (/CAMARERO_DIGITAL_NO_ACTIVO|QR_MODULE_DISABLED|MODULO_/.test(message)) return "El módulo QR no está activo. No se ha registrado el cierre.";
  if (/RESERVA_|CLIENTE_|SERVICIO_|CONSUMO_/.test(message)) return "La reserva ya no cumple los requisitos de mesa, cliente o servicio. Revisa la selección; no se ha cerrado la cuenta.";
  if (/PEDIDOS_|CUENTA_|SESION_|SESSION_|IMPORTE_CAMBIADO/.test(message)) return "La cuenta o su sesión ha cambiado. Actualiza y revisa el importe antes de registrar el pago.";
  if (/IMPORTES_|TOTAL_ESPERADO_|METODO_PAGO_/.test(message)) return "Revisa los importes (máximo dos decimales) y el método de pago. No se ha cerrado la cuenta.";
  return "El servidor ha rechazado el cierre. No se ha guardado; actualiza y revisa la cuenta.";
}
