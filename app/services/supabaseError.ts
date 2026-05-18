export function getSupabaseErrorMessage(error: unknown) {
  if (!error) return "Error desconocido";

  if (typeof error === "string") return error;

  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    return message || "Error desconocido";
  }

  return "Error desconocido";
}

export function throwSupabaseError(error: unknown, fallback: string): never {
  const message = getSupabaseErrorMessage(error);
  throw new Error(message || fallback);
}