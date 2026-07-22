"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "../(app)/lib/supabaseClient";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  const checkAdmin = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      await supabase.auth.signOut({ scope: "local" });
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const { data, error } = await supabase
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data?.user_id) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setAllowed(true);
  }, [pathname, router]);

  useEffect(() => {
    let mounted = true;

    const runCheck = async () => {
      if (!mounted) return;
      await checkAdmin();
    };

    runCheck();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT" || !session) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        window.setTimeout(runCheck, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkAdmin, pathname, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm font-black">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando acceso de administración
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
