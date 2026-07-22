"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type GuardState = "checking" | "allowed" | "error";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GuardState>("checking");
  const [message, setMessage] = useState("");

  const sendToLogin = useCallback(() => {
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : pathname;

    router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
    router.refresh();
  }, [pathname, router]);

  const checkAccess = useCallback(async () => {
    setState("checking");
    setMessage("");

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      sendToLogin();
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      await supabase.auth.signOut({ scope: "local" });
      sendToLogin();
      return;
    }

    const [adminResult, restaurantResult] = await Promise.all([
      supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("usuarios_restaurantes")
        .select("restaurante_id")
        .eq("user_id", user.id)
        .limit(1),
    ]);

    if (adminResult.error || restaurantResult.error) {
      console.error("No se pudo comprobar el acceso", {
        admin: adminResult.error,
        restaurant: restaurantResult.error,
      });
      setMessage("No se ha podido comprobar tu acceso. Reinténtalo.");
      setState("error");
      return;
    }

    const isAdmin = Boolean(adminResult.data?.user_id);
    const hasRestaurant = Boolean(restaurantResult.data?.length);

    if (!hasRestaurant && isAdmin) {
      router.replace("/admin/restaurantes");
      router.refresh();
      return;
    }

    if (!hasRestaurant) {
      await supabase.auth.signOut({ scope: "local" });
      setMessage("Tu usuario no tiene ningún restaurante asignado.");
      setState("error");
      return;
    }

    setState("allowed");
  }, [router, sendToLogin]);

  useEffect(() => {
    let mounted = true;

    const runCheck = async () => {
      if (!mounted) return;
      await checkAccess();
    };

    runCheck();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT" || !session) {
        sendToLogin();
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
  }, [checkAccess, sendToLogin]);

  if (state === "allowed") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white">
          {state === "checking" ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <LockKeyhole className="h-7 w-7" />
          )}
        </div>
        <h1 className="mt-5 text-2xl font-black text-slate-950">
          {state === "checking" ? "Comprobando acceso" : "Acceso no disponible"}
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          {state === "checking"
            ? "Estamos verificando tu sesión y tu restaurante."
            : message}
        </p>
        {state === "error" ? (
          <button
            type="button"
            onClick={checkAccess}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        ) : null}
      </div>
    </div>
  );
}
