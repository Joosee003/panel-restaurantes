export type QueryValue = {
  data?: unknown;
  count?: number | null;
  error?: unknown;
};

export function settledQuery<T extends QueryValue>(
  label: string,
  result: PromiseSettledResult<T>,
): { value: T | null; failure: string | null } {
  if (result.status === "rejected") {
    return { value: null, failure: `${label}: sin respuesta` };
  }
  if (result.value?.error) {
    return { value: null, failure: `${label}: no disponible` };
  }
  return { value: result.value, failure: null };
}
