"use client";

import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { getActiveRestaurant, subscribeActiveRestaurant } from "../lib/activeRestaurant";
import { queryClientConfig } from "../../query/queryClientConfig";

// A new scope owns both its query cache and all local page state. Late responses
// from an unmounted restaurant can only reach the discarded scope.
export function ScopedRestaurantCache({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: queryClientConfig }));
  useEffect(() => () => { client.clear(); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export default function RestaurantScope({ children }: { children: ReactNode }) {
  const selected = useSyncExternalStore(subscribeActiveRestaurant, getActiveRestaurant, () => null);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // Supabase emits INITIAL_SESSION on subscription, then sign-in/out changes.
    // Token refreshes for the same account do not reset the panel.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (userId === undefined) {
    return <div className="p-8 text-center" role="status">Comprobando acceso…</div>;
  }

  return (
    <Fragment key={JSON.stringify([userId, selected])}>
      <ScopedRestaurantCache>{children}</ScopedRestaurantCache>
    </Fragment>
  );
}
