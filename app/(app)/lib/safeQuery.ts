type SafeError = {
  message: string;
};

type SupabaseLikeResult<T = any> = {
  data?: T | null;
  error?: SafeError | null;
  count?: number | null;
};

export async function withTimeout<T>(
  query: PromiseLike<T> | Promise<T>,
  ms = 20000
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutResult = {
    data: null,
    error: {
      message: "Tiempo de carga agotado",
    },
    count: null,
  } as T;

  try {
    return await Promise.race([
      Promise.resolve(query),
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn("Consulta omitida por tardar demasiado");
          resolve(timeoutResult);
        }, ms);
      }),
    ]);
  } catch (error: any) {
    console.warn("Consulta fallida:", error);

    return {
      data: null,
      error: {
        message: error?.message || "Error cargando datos",
      },
      count: null,
    } as T;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function safeQuery<T = any>(
  query: PromiseLike<SupabaseLikeResult<T>> | Promise<SupabaseLikeResult<T>>,
  options?: {
    timeoutMs?: number;
    fallback?: T | null;
    label?: string;
  }
): Promise<{
  data: T | null;
  error: string | null;
  count: number | null;
}> {
  const result = await withTimeout(query, options?.timeoutMs ?? 20000);

  if (result?.error) {
    console.warn(options?.label || "Consulta omitida:", result.error);

    return {
      data: options?.fallback ?? null,
      error: result.error.message || "Error cargando datos",
      count: result.count ?? null,
    };
  }

  return {
    data: result?.data ?? options?.fallback ?? null,
    error: null,
    count: result?.count ?? null,
  };
}