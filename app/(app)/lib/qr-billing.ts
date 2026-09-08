export const FINAL_QR_STATES = [
  "cobrado", "cobrada", "cerrado", "cerrada", "cancelado", "cancelada",
] as const;

export type QrOrderIdentity = {
  id: string;
  restaurante_id: string;
  mesa_id: string | null;
  mesa_session_id: string | null;
  total: number;
};

// Table labels are not identities. Never pool bills across tenants or sessions.
// Legacy orders without a protected session remain separate and cannot be closed.
export function qrBillKey(order: QrOrderIdentity): string {
  return JSON.stringify([
    order.restaurante_id,
    order.mesa_id,
    order.mesa_session_id,
    !order.mesa_id || !order.mesa_session_id ? order.id : null,
  ]);
}

export function qrQuoteSignature(orders: QrOrderIdentity[]): string {
  return JSON.stringify(orders.map((order) => [
    order.id, qrBillKey(order), order.total,
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function qrTotal(orders: QrOrderIdentity[]): number {
  return orders.reduce((cents, order) => {
    if (!Number.isFinite(order.total) || order.total < 0) {
      throw new Error("Hay un importe de pedido no válido. Revisa la cuenta antes de cerrarla.");
    }
    return cents + Math.round(order.total * 100);
  }, 0) / 100;
}

// Fetch open orders separately from bounded history. Fail closed at the safety
// ceiling: displaying a truncated bill as complete is worse than a visible error.
export async function readAllActiveQrOrders<T extends { id: string }>(
  readPage: (afterId: string | null, limit: number) => Promise<T[]>,
  pageSize = 250,
  maxPages = 20,
): Promise<T[]> {
  const rows = new Map<string, T>();
  let afterId: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    // Keyset pagination does not skip existing open orders when an earlier
    // order closes during the read (offset pagination shifts that boundary).
    const batch = await readPage(afterId, pageSize);
    for (const row of batch) rows.set(row.id, row);
    if (batch.length < pageSize) return Array.from(rows.values());
    const nextId = batch.at(-1)?.id;
    if (!nextId || (afterId !== null && nextId <= afterId)) {
      throw new Error("No se pudo comprobar la lista completa de pedidos. Vuelve a cargarla.");
    }
    afterId = nextId;
  }
  throw new Error("No se han podido cargar todos los pedidos abiertos. No cierres una cuenta incompleta; revisa los pedidos con soporte.");
}
