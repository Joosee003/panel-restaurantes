// Serving food does not settle the table's bill.
export const closedOrderStates = ["cobrado", "cobrada", "cerrado", "cerrada", "cancelado", "cancelada"];

export function isOrderClosed(state?: string | null) {
  return closedOrderStates.includes(String(state || "").trim().toLowerCase());
}

export function dashboardOrderFilter(start: string, end: string) {
  return `and(created_at.gte.${start},created_at.lte.${end}),estado.not.in.(${closedOrderStates.join(",")}),estado.is.null`;
}
