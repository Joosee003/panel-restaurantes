"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { getActiveRestaurant, subscribeActiveRestaurant } from "../lib/activeRestaurant";
import { agencyAccessMessage, readAgencyIdentity, resolveAgencyRestaurant, returnToAgency, type AgencyRestaurant } from "@/app/admin/components/agencyRestaurantAccess";
import styles from "./agency-context.module.css";

// UX gate only: all data continues through the original user's JWT and RLS/RPC.
// A local restaurant ID never constitutes authorization, including on refresh.
export default function AgencyRestaurantContext({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const selected = useSyncExternalStore(subscribeActiveRestaurant, getActiveRestaurant, () => null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; context: AgencyRestaurant | null; error: string }>({ key: "", context: null, error: "" });
  const key = `${pathname}:${selected ?? ""}:${revision}`;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        if (event === "SIGNED_OUT") returnToAgency();
        setRevision(value => value + 1);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    async function verify() {
      try {
        const identity = await readAgencyIdentity(supabase);
        const context = identity.isAgency ? await resolveAgencyRestaurant(supabase, selected || "") : null;
        if (active) setResult({ key, context, error: "" });
      } catch (error) {
        if (active) setResult({ key, context: null, error: agencyAccessMessage(error) });
      }
    }
    void verify();
    return () => { active = false; };
  }, [key, selected]);

  function leave() {
    returnToAgency();
    router.push("/admin/control");
    router.refresh();
  }
  if (result.key !== key) return <div className={styles.state} role="status">Comprobando contexto del restaurante…</div>;
  if (result.error) return <div className={styles.state} role="alert">
    <h1>No se ha abierto el restaurante</h1><p>{result.error}</p>
    <button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar</button>
    <button type="button" onClick={leave}>← Volver a agencia</button>
  </div>;
  return <div className={result.context ? styles.agency : undefined}>
    {result.context && <aside className={styles.bar} aria-label="Contexto de agencia">
      <div><span className={styles.identity}>Sesión de agencia</span><span>Viendo: <strong>{result.context.name}</strong></span></div>
      <button type="button" onClick={leave}>← Volver a agencia</button>
    </aside>}
    {children}
  </div>;
}
