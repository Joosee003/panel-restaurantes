import { createClient } from "@supabase/supabase-js";

export const DEMO_MODE_KEY = "gastrohelp-demo-mode";
export const DEMO_STORAGE_KEY = "gastrohelp-demo-auth";

const isDemoTab =
  typeof window !== "undefined" &&
  window.sessionStorage.getItem(DEMO_MODE_KEY) === "1";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(isDemoTab ? { storageKey: DEMO_STORAGE_KEY } : {}),
    },
  }
);
