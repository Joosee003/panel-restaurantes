"use client";

import { useEffect, useRef } from "react";

export function useAutoRefresh(
  callback: () => Promise<void> | void,
  options?: {
    enabled?: boolean;
    intervalMs?: number;
    refreshOnFocus?: boolean;
  }
) {
  const runningRef = useRef(false);
  const callbackRef = useRef(callback);

  callbackRef.current = callback;

  useEffect(() => {
    const enabled = options?.enabled ?? true;
    const intervalMs = options?.intervalMs ?? 30000;
    const refreshOnFocus = options?.refreshOnFocus ?? true;

    if (!enabled) return;

    const run = async () => {
      if (runningRef.current) return;

      if (typeof document !== "undefined" && document.hidden) {
        return;
      }

      runningRef.current = true;

      try {
        await callbackRef.current();
      } catch (error) {
        console.warn("Refresco omitido o fallido:", error);
      } finally {
        runningRef.current = false;
      }
    };

    const interval = setInterval(run, intervalMs);

    const onVisibilityChange = () => {
      if (!refreshOnFocus) return;

      if (!document.hidden) {
        run();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [options?.enabled, options?.intervalMs, options?.refreshOnFocus]);
}