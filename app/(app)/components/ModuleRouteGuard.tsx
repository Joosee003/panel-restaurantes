"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";
import {
  parseRestaurantModules,
  requiredModuleForPath,
  restaurantModuleColumns,
} from "../lib/restaurantModules";
import { supabase } from "../lib/supabaseClient";

type GuardState = "checking" | "allowed" | "denied" | "error";
type GuardResult = { pathname: string; state: GuardState };

export default function ModuleRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const requiredModule = requiredModuleForPath(pathname);
  const [result, setResult] = useState<GuardResult>({
    pathname,
    state: requiredModule ? "checking" : "allowed",
  });
  const state: GuardState = requiredModule
    ? result.pathname === pathname
      ? result.state
      : "checking"
    : "allowed";

  const checkModule = useCallback(async () => {
    const currentRequiredModule = requiredModuleForPath(pathname);
    if (!currentRequiredModule) {
      setResult({ pathname, state: "allowed" });
      return;
    }

    setResult({ pathname, state: "checking" });
    const restauranteId = await getRestauranteUsuario();

    if (!restauranteId) {
      setResult({ pathname, state: "error" });
      return;
    }

    const { data, error } = await supabase
      .from("restaurante_modulos")
      .select(restaurantModuleColumns)
      .eq("restaurante_id", restauranteId)
      .maybeSingle();

    if (error) {
      console.error("No se pudo comprobar el módulo", error);
      setResult({ pathname, state: "error" });
      return;
    }

    const modules = parseRestaurantModules(data);
    setResult({
      pathname,
      state: modules[currentRequiredModule.key] ? "allowed" : "denied",
    });
  }, [pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkModule();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [checkModule]);

  if (state === "allowed") return <>{children}</>;

  return (
    <div className="flex min-h-[65vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-2xl font-black text-slate-950">
          {state === "denied"
            ? `${requiredModule?.label || "Este módulo"} no está contratado`
            : state === "checking"
              ? "Comprobando módulo"
              : "No se pudo comprobar el módulo"}
        </h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          {state === "denied"
            ? "Esta función es opcional y está desactivada para este restaurante."
            : state === "checking"
              ? "Estamos revisando las funciones activas del restaurante."
              : "Revisa la conexión y vuelve a intentarlo."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {state === "error" ? (
            <button
              type="button"
              onClick={checkModule}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900"
            >
              <RefreshCw className="h-4 w-4" /> Reintentar
            </button>
          ) : null}
          <Link
            href="/dashboard"
            className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white"
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
