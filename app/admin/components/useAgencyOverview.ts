"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import type { AgencyOverview } from "@/lib/admin/overview";

export function useAgencyOverview(days: number) {
  const [data, setData] = useState<AgencyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session)
          throw new Error("Tu sesión ha caducado. Vuelve a entrar.");
        const response = await fetch(`/api/admin/overview?days=${days}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? "Esta pantalla solo está disponible para GastroHelp."
              : "No se han podido cargar los datos. Vuelve a intentarlo.",
          );
        const result = (await response.json()) as AgencyOverview;
        if (active) setData(result);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se han podido cargar los datos.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [days, revision]);
  return {
    data,
    loading,
    error,
    reload: () => setRevision((value) => value + 1),
  };
}
