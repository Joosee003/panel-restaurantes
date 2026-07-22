"use client";

import { useEffect, useState } from "react";
import { Eye, LogOut, ShieldCheck } from "lucide-react";
import {
  DEMO_MODE_KEY,
  DEMO_STORAGE_KEY,
  supabase,
} from "../lib/supabaseClient";

const WRITE_LABELS = [
  "guardar",
  "crear",
  "añadir",
  "agregar",
  "eliminar",
  "borrar",
  "editar",
  "responder reseña",
  "canjear",
  "publicar",
  "subir",
  "registrar consumo",
  "nueva reserva",
  "nuevo cliente",
  "nuevo producto",
  "nuevo plato",
  "nuevo ingrediente",
  "confirmar reserva",
  "cancelar reserva",
  "enviar mensaje",
  "activar",
  "desactivar",
  "asignar mesa",
  "cerrar mesa",
  "cobrar",
  "cambiar estado",
];

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function pareceAccionDeEscritura(elemento: Element | null) {
  if (!elemento) return false;

  const control = elemento.closest(
    'button, [role="button"], input[type="submit"], input[type="button"]'
  );

  if (!control || control.hasAttribute("data-demo-allow")) return false;

  const texto = normalizar(
    [
      control.textContent ?? "",
      control.getAttribute("aria-label") ?? "",
      control.getAttribute("title") ?? "",
      control.getAttribute("value") ?? "",
    ].join(" ")
  );

  return WRITE_LABELS.some((palabra) => texto.includes(normalizar(palabra)));
}

function limpiarSesionDemo() {
  window.sessionStorage.removeItem(DEMO_MODE_KEY);

  Object.keys(window.localStorage)
    .filter((key) => key === DEMO_STORAGE_KEY || key.startsWith(`${DEMO_STORAGE_KEY}-`))
    .forEach((key) => window.localStorage.removeItem(key));
}

export default function DemoModeGuard() {
  const [isDemo, setIsDemo] = useState(false);
  const [toast, setToast] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    let mounted = true;

    const comprobarDemo = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !mounted) return;

      const { data } = await supabase
        .from("usuarios_restaurantes")
        .select("demo_vista")
        .eq("user_id", user.id)
        .maybeSingle();

      if (mounted) {
        setIsDemo(Boolean(data?.demo_vista));
      }
    };

    comprobarDemo();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isDemo) return;

    const avisar = () => {
      setToast(true);
      window.setTimeout(() => setToast(false), 2400);
    };

    const bloquearClick = (event: MouseEvent) => {
      if (!pareceAccionDeEscritura(event.target as Element | null)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      avisar();
    };

    const bloquearSubmit = (event: SubmitEvent) => {
      const submitter = event.submitter as Element | null;
      if (!pareceAccionDeEscritura(submitter)) return;
      event.preventDefault();
      event.stopPropagation();
      avisar();
    };

    document.addEventListener("click", bloquearClick, true);
    document.addEventListener("submit", bloquearSubmit, true);

    return () => {
      document.removeEventListener("click", bloquearClick, true);
      document.removeEventListener("submit", bloquearSubmit, true);
    };
  }, [isDemo]);

  const salir = async () => {
    setSaliendo(true);

    try {
      await supabase.auth.signOut();
    } finally {
      limpiarSesionDemo();
      window.location.replace("/login");
    }
  };

  if (!isDemo) return null;

  return (
    <>
      <div className="sticky top-3 z-40 mb-5 flex flex-col gap-3 rounded-2xl border border-violet-200 bg-white/95 px-4 py-3 shadow-lg shadow-violet-950/5 backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-violet-500/30 dark:bg-slate-950/95">
        <div className="flex items-start gap-3 sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <Eye size={20} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-slate-950 dark:text-white">Modo demostración</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <ShieldCheck size={13} />
                Solo lectura
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Puedes recorrer todo el panel. Los datos son ficticios y los cambios están desactivados.
            </p>
          </div>
        </div>

        <button
          type="button"
          data-demo-allow
          onClick={salir}
          disabled={saliendo}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          <LogOut size={16} />
          {saliendo ? "Saliendo..." : "Salir de la demo"}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-2xl border border-violet-300 bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-2xl">
          Esta acción está desactivada en la demostración.
        </div>
      )}
    </>
  );
}
