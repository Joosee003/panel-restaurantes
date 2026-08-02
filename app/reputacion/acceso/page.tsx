"use client";

import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";

export default function ReputationAccessPage() {
  const router = useRouter();
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        router.replace("/opiniones-admin");
        return;
      }
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();

    const signIn = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (!signIn.error && signIn.data.session) {
      router.replace("/opiniones-admin");
      return;
    }

    setMessage("No se pudo iniciar sesión. Revisa el correo y la contraseña.");
    setLoading(false);
  }

  if (checking) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#031b3b] px-6 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(73,159,255,.32),transparent_32%),linear-gradient(135deg,#031b3b,#062b5c_58%,#1559b6)]" />
        <div className="relative text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-blue-200" />
          <p className="mt-4 text-sm font-bold text-blue-100">Comprobando acceso…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#031b3b] px-3 py-4 sm:px-6 sm:py-8">
      <div className="fixed inset-0 bg-[linear-gradient(108deg,#031b3b,#062b5c_56%,#1559b6)]" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_80%_12%,rgba(73,159,255,.24),transparent_34%)]" />

      <section className="relative mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-[2.6rem] border border-white/20 bg-white shadow-[0_40px_130px_rgba(0,0,0,.38)] lg:grid-cols-[1.14fr_.86fr]">
        <div className="relative hidden overflow-hidden bg-[#062b5c] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-12">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(3,27,59,.98),rgba(6,43,92,.88),rgba(21,89,182,.56))]" />
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-blue-300/20 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-4">
              <BrandMark className="h-24 w-24 rounded-[1.7rem]" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.22em] text-blue-100">GastroHelp Reputation</p>
                <p className="mt-1 text-2xl font-black text-white">Panel de reputación</p>
              </div>
            </div>

            <div className="mt-16 max-w-lg">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-blue-100 backdrop-blur-xl">
                <Sparkles className="h-3.5 w-3.5" /> Acceso independiente
              </div>
              <h1 className="mt-5 text-5xl font-black leading-[1.02] tracking-[-.045em] !text-white xl:text-6xl">Tu reputación, en un espacio hecho para tu restaurante.</h1>
              <p className="mt-5 max-w-md text-base font-semibold leading-7 text-blue-100">Opiniones, estadísticas, seguimientos, insights y materiales de impresión, sin acceso al panel general.</p>
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-3">
            <AccessPromise icon={<ShieldCheck />} title="Datos protegidos" text="Solo la información de tu restaurante" />
            <AccessPromise icon={<LockKeyhole />} title="Acceso exclusivo" text="Independiente del panel general" />
          </div>
        </div>

        <div className="flex items-center bg-white p-6 sm:p-10 lg:p-12 xl:p-14">
          <div className="w-full">
            <div className="flex items-center gap-3 lg:hidden">
              <BrandMark className="h-16 w-16 rounded-2xl" compact />
              <div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#1559b6]">GastroHelp Reputation</p><p className="font-black text-[#10233d]">Panel de reputación</p></div>
            </div>

            <p className="mt-8 text-[10px] font-black uppercase tracking-[.2em] text-[#1559b6] lg:mt-0">Área privada</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.03em] text-[#10233d] sm:text-4xl">Bienvenido al panel de reputación</h2>
            <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-slate-500">Introduce tus credenciales para acceder al sistema de reputación de tu restaurante.</p>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Correo</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" className="min-h-14 w-full rounded-2xl border border-slate-200 bg-[#f7fbff] px-4 text-sm font-bold text-[#10233d] outline-none transition focus:border-[#1559b6] focus:bg-white focus:ring-4 focus:ring-blue-100" required />
              </label>

              <label className="block">
                <span className="mb-2 block text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Contraseña</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} className="min-h-14 w-full rounded-2xl border border-slate-200 bg-[#f7fbff] px-4 text-sm font-bold text-[#10233d] outline-none transition focus:border-[#1559b6] focus:bg-white focus:ring-4 focus:ring-blue-100" required />
              </label>

              {message && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-5 text-amber-800">{message}</div>}

              <button type="submit" disabled={loading} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#1559b6] px-5 text-sm font-black text-white shadow-[0_18px_40px_rgba(21,89,182,.28)] transition hover:-translate-y-0.5 hover:bg-[#0d478f] disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LockKeyhole className="h-5 w-5" />}
                Entrar al panel
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-[#f7fbff] px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1559b6]" /> Acceso protegido y limitado al sistema de reputación de tu restaurante.
            </div>
            <p className="mt-6 text-center text-[9px] font-black uppercase tracking-[.18em] text-slate-300">Reputation System by GastroHelp</p>
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandMark({ className, compact = false }: { className: string; compact?: boolean }) {
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden border border-white/30 bg-white shadow-2xl ${className}`}>
      <Image
        src="/brand/gastrohelp-logo.jpg"
        alt="Logo de GastroHelp"
        width={150}
        height={150}
        priority
        className={`h-full w-full object-contain mix-blend-multiply ${compact ? "p-1.5" : "p-2"}`}
      />
    </div>
  );
}

function AccessPromise({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[.08] p-4 backdrop-blur-xl">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-blue-100 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <p className="mt-3 text-xs font-black text-white">{title}</p>
      <p className="mt-1 text-[10px] font-semibold leading-4 text-blue-100">{text}</p>
    </div>
  );
}
