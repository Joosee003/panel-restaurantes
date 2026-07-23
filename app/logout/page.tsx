"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  DEMO_MODE_KEY,
  DEMO_STORAGE_KEY,
  supabase,
} from "../(app)/lib/supabaseClient";

function clearPanelSessionStorage() {
  window.localStorage.removeItem("gastrohelp_restaurante_activo");
  window.localStorage.removeItem(DEMO_STORAGE_KEY);
  window.sessionStorage.removeItem(DEMO_MODE_KEY);

  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keys: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && (key.includes("-auth-token") || key === DEMO_STORAGE_KEY)) {
        keys.push(key);
      }
    }

    keys.forEach((key) => storage.removeItem(key));
  }
}

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const logout = async () => {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        clearPanelSessionStorage();

        if (mounted) {
          router.replace("/login");
          router.refresh();
        }
      }
    };

    logout();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 shadow-lg">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cerrando sesión
      </div>
    </div>
  );
}
