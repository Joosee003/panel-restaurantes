// Explicit URLs must match an authorized restaurant. A stale preference from
// another login may be ignored only in favour of the sole assigned restaurant.
export function selectOpinionRestaurant<T extends { restaurante_id: string }>(
  configs: T[], requested: string | null, stored: string | null,
): T | null {
  if (requested) return configs.find((item) => item.restaurante_id === requested) ?? null;
  return configs.find((item) => item.restaurante_id === stored)
    ?? (configs.length === 1 ? configs[0] : null);
}
