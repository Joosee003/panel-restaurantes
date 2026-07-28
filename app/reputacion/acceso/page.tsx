"use client";

import { ArrowRight, Loader2, LockKeyhole, ShieldCheck, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";

const REPUTATION_EMAIL = "reputacion@gastrohelp.es";
const REPUTATION_SLUG = "hispanos-grill";

export default function ReputationAccessPage() {
  const router = useRouter();
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [email, setEmail] = useState(REPUTATION_EMAIL);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) {
        await activateAccess();
        router.replace("/opiniones-admin");
        return;
      }
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function activateAccess() {
    const { error } = await supabase.rpc("activate_reputation_access", {
      p_slug: REPUTATION_SLUG,
    });
    if (error) throw error;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail !== REPUTATION_EMAIL) {
      setMessage("Este acceso está reservado para la cuenta de Reputation Suite.");
      setLoading(false);
      return;
    }

    const signIn = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (!signIn.error && signIn.data.session) {
      try {
        await activateAccess();
        router.replace("/opiniones-admin");
      } catch {
        await supabase.auth.signOut();
        setMessage("La cuenta existe, pero no tiene acceso asignado a este restaurante.");
        setLoading(false);
      }
      return;
    }

    const signUp = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          nombre: "Hispanos Grill",
          acceso: "reputacion",
        },
      },
    });

    if (signUp.error) {
      setMessage("No se pudo iniciar sesión. Revisa la contraseña.");
      setLoading(false);
      return;
    }

    if (!signUp.data.session) {
      setMessage(
        "La cuenta se ha creado, pero Supabase exige confirmar el correo antes del primer acceso.",
      );
      setLoading(false);
      return;
    }

    try {
      await activateAccess();
      router.replace("/opiniones-admin");
    } catch {
      await supabase.auth.signOut();
      setMessage("No se pudo terminar de preparar el acceso independiente.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6fb] px-6">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-blue-700" />
          <p className="mt-4 text-sm font-bold text-slate-500">Comprobando acceso…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f6fb] px-4 py-8 sm:px-6 sm:py-14">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-slate-900/5 blur-3xl" />

      <section className="relative mx-auto grid min-h-[calc(100vh-7rem)] w-full max-w-5xl overflow-hidden rounded-[2.25rem] border border-white bg-white shadow-[0_30px_100px_rgba(15,23,42,.14)] lg:grid-cols-[1.1fr_.9fr]">
        <div className="hidden bg-gradient-to-br from-blue-800 via-blue-700 to-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em]">
              <Star className="h-4 w-4" fill="currentColor" />
              GastroHelp Reputation
            </div>
            <h1 className="mt-10 max-w-md text-5xl font-black leading-[1.03] tracking-tight">
              Tu reputación, separada del resto del panel.
            </h1>
            <p className="mt-5 max-w-md text-base font-semibold leading-7 text-blue-100/85">
              Acceso exclusivo a opiniones, estadísticas, seguimientos, alertas y materiales QR de Hispanos Grill.
            </p>
          </div>

          <div className="space-y-3 text-sm font-bold text-blue-50/90">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /> Solo datos de este restaurante</div>
            <div className="flex items-center gap-3"><LockKeyhole className="h-5 w-5" /> Sin acceso al panel general</div>
          </div>
        </div>

        <div className="flex items-center p-6 sm:p-10 lg:p-12">
          <div className="w-full">
            <div className="lg:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
                <Star className="h-6 w-6" fill="currentColor" />
              </div>
            </div>

            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-blue-700 lg:mt-0">
              Acceso independiente
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              Panel de reputación
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              Introduce las credenciales exclusivas de este servicio.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">Correo</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  className="min-h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-600">Contraseña</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  minLength={8}
                  className="min-h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  required
                />
              </label>

              {message && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-5 text-amber-800">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LockKeyhole className="h-5 w-5" />}
                Entrar al panel
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
              La primera vez, estas credenciales crean automáticamente el acceso exclusivo. Después funcionarán como un inicio de sesión normal.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
