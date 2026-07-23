"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { supabase } from "../../(app)/lib/supabaseClient";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/login") || value.startsWith("/auth/")) return null;
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sendingReset, setSendingReset] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);

  const resolveDestination = async (
    userId: string,
    desiredPath: string | null = nextPath,
  ) => {
    const [adminResult, restaurantResult] = await Promise.all([
      supabase.from("app_admins").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase
        .from("usuarios_restaurantes")
        .select("restaurante_id")
        .eq("user_id", userId)
        .limit(1),
    ]);

    if (adminResult.error || restaurantResult.error) {
      throw new Error("No se ha podido comprobar el acceso del usuario.");
    }

    const isAdmin = Boolean(adminResult.data?.user_id);
    const hasRestaurant = Boolean(restaurantResult.data?.length);

    if (!isAdmin && !hasRestaurant) {
      throw new Error("Este usuario todavía no tiene un restaurante asignado.");
    }

    if (desiredPath?.startsWith("/admin")) return isAdmin ? desiredPath : "/dashboard";
    if (desiredPath && hasRestaurant) return desiredPath;
    if (isAdmin) return "/admin/restaurantes";
    if (hasRestaurant) return "/dashboard";
    return "/admin/restaurantes";
  };

  useEffect(() => {
    let mounted = true;

    const checkExistingSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const currentNext = safeNextPath(params.get("next"));
      setNextPath(currentNext);
      if (params.get("password") === "updated") {
        setNotice("Contraseña cambiada. Ya puedes entrar con la nueva contraseña.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;
      if (!session?.user) {
        setCheckingSession(false);
        return;
      }

      try {
        const destination = await resolveDestination(session.user.id, currentNext);
        router.replace(destination);
        router.refresh();
      } catch {
        await supabase.auth.signOut({ scope: "local" });
        if (mounted) setCheckingSession(false);
      }
    };

    checkExistingSession();
    return () => {
      mounted = false;
    };
    // La comprobación solo debe hacerse al abrir el login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entrar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError("Escribe tu email y tu contraseña.");
      return;
    }

    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError || !data.session || !data.user) {
      const message = signInError?.message.toLowerCase() || "";
      setError(
        message.includes("confirm")
          ? "Debes confirmar tu correo antes de acceder."
          : "Email o contraseña incorrectos.",
      );
      setLoading(false);
      return;
    }

    try {
      const destination = await resolveDestination(data.user.id);
      router.replace(destination);
      router.refresh();
    } catch (accessError) {
      await supabase.auth.signOut({ scope: "local" });
      setError(
        accessError instanceof Error
          ? accessError.message
          : "Este usuario no tiene acceso al panel.",
      );
      setLoading(false);
    }
  };

  const sendPasswordReset = async () => {
    setError("");
    setNotice("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Escribe primero el email de tu cuenta.");
      return;
    }

    setSendingReset(true);
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      cleanEmail,
      { redirectTo },
    );

    if (resetError) {
      setError("No se ha podido enviar el correo. Inténtalo dentro de unos minutos.");
    } else {
      setNotice("Si el email tiene acceso, recibirá un enlace para cambiar la contraseña.");
    }
    setSendingReset(false);
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030814]">
        <div className="flex flex-col items-center gap-4 text-white">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-[#1601ad] to-blue-500 shadow-2xl shadow-blue-700/30">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-200/60">
            Comprobando sesión
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="loginRoot relative min-h-screen overflow-hidden bg-[#030814] text-white">
      <div className="loginGrid pointer-events-none absolute inset-0" />
      <div className="loginOrb loginOrbOne pointer-events-none absolute rounded-full" />
      <div className="loginOrb loginOrbTwo pointer-events-none absolute rounded-full" />
      <div className="loginNoise pointer-events-none absolute inset-0" />

      <a
        href="https://gastrohelp.es"
        className="absolute left-5 top-5 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-black text-white/70 backdrop-blur-xl transition hover:border-blue-400/30 hover:text-white md:left-8 md:top-8"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a GastroHelp
      </a>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 items-center gap-8 px-4 py-28 lg:grid-cols-[1.04fr_.96fr] lg:gap-16 lg:px-10 lg:py-16 xl:px-16">
        <section className="hidden lg:block">
          <div className="mb-10 inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1601ad] to-blue-500 shadow-xl shadow-blue-700/30">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em]">
                Gastro<span className="text-blue-400">Help</span>
              </div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
                Área privada de clientes
              </div>
            </div>
          </div>

          <div className="max-w-[680px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">
              <Sparkles className="h-3.5 w-3.5" /> Tu restaurante, conectado
            </div>
            <h1 className="text-[clamp(3.4rem,6vw,6.2rem)] font-black leading-[0.9] tracking-[-0.075em]">
              Todo el control.
              <span className="block bg-gradient-to-r from-white via-blue-200 to-blue-500 bg-clip-text text-transparent">
                En un único lugar.
              </span>
            </h1>
            <p className="mt-7 max-w-[600px] text-lg font-medium leading-8 text-slate-300/65">
              Accede a reservas, clientes, fidelización, reputación, sala y
              rentabilidad desde un sistema diseñado específicamente para
              hostelería.
            </p>
          </div>

          <div className="mt-10 grid max-w-[680px] grid-cols-2 gap-3">
            <FeatureCard icon={<CalendarDays className="h-5 w-5" />} title="Reservas y sala" text="Turnos, estados, mesas y ocupación." />
            <FeatureCard icon={<UsersRound className="h-5 w-5" />} title="Clientes" text="Historial, frecuencia y recurrencia." />
            <FeatureCard icon={<Sparkles className="h-5 w-5" />} title="Fidelización" text="Puntos, recompensas y cupones." />
            <FeatureCard icon={<BarChart3 className="h-5 w-5" />} title="Rentabilidad" text="Costes, márgenes y decisiones." />
          </div>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-white/45">
            <TrustItem>Acceso solo por invitación</TrustItem>
            <TrustItem>Sesión protegida</TrustItem>
            <TrustItem>Soporte directo</TrustItem>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[510px]">
          <form
            onSubmit={entrar}
            className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-white p-6 text-slate-950 shadow-[0_45px_130px_rgba(0,0,0,.5)] sm:p-9"
          >
            <div className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-blue-100/80 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-20 h-60 w-60 rounded-full bg-indigo-100/60 blur-3xl" />

            <div className="relative">
              <div className="mb-8 flex items-start justify-between gap-5">
                <div>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1601ad] to-blue-500 text-white shadow-xl shadow-blue-700/25 lg:hidden">
                    <ShieldCheck className="h-7 w-7" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
                    Área privada
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] text-slate-950">
                    Accede a tu panel
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    Introduce las credenciales asignadas a tu restaurante.
                  </p>
                </div>
                <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 sm:flex">
                  <LockKeyhole className="h-5 w-5" />
                </div>
              </div>

              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Email</span>
                  <div className="group relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-700" />
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-4 pl-12 pr-4 text-sm font-bold text-slate-950 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      type="email"
                      autoComplete="email"
                      placeholder="restaurante@email.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={loading}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Contraseña</span>
                  <div className="group relative">
                    <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-700" />
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-4 pl-12 pr-4 text-sm font-bold text-slate-950 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Tu contraseña"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={loading}
                    />
                  </div>
                </label>
              </div>

              {error ? (
                <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-center text-sm font-bold text-red-700">{error}</p>
              ) : null}
              {notice ? (
                <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-center text-sm font-bold text-emerald-700">{notice}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#1601ad] to-blue-600 px-5 py-4 text-sm font-black text-white shadow-xl shadow-blue-700/25 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-blue-700/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                {loading ? "Comprobando acceso" : "Entrar de forma segura"}
                {!loading ? <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /> : null}
              </button>

              <button
                type="button"
                onClick={sendPasswordReset}
                disabled={sendingReset || loading}
                className="mt-4 w-full text-center text-sm font-black text-blue-700 transition hover:text-blue-950 disabled:opacity-50"
              >
                {sendingReset ? "Enviando correo..." : "He olvidado mi contraseña"}
              </button>

              <div className="mt-7 border-t border-slate-100 pt-6 text-center">
                <p className="text-xs font-semibold leading-5 text-slate-500">
                  Las cuentas se activan únicamente mediante invitación de GastroHelp.
                </p>
                <a
                  href="https://panel.gastrohelp.es/demo"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-blue-700 transition hover:text-blue-950"
                >
                  ¿Todavía no eres cliente? Explora la demo <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </form>

          <div className="mt-5 grid grid-cols-3 gap-2 lg:hidden">
            <MobileTrust>Invitación</MobileTrust>
            <MobileTrust>Protegido</MobileTrust>
            <MobileTrust>Hostelería</MobileTrust>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .loginGrid {
          opacity: 0.34;
          background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
          background-size: 58px 58px;
          mask-image: linear-gradient(to bottom, black, transparent 92%);
        }
        .loginNoise {
          opacity: .035;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E");
        }
        .loginOrb { border: 1px solid rgba(96,165,250,.14); box-shadow: inset 0 0 130px rgba(37,99,235,.08); }
        .loginOrbOne { width: 720px; height: 720px; right: -310px; top: -180px; animation: loginOrbit 24s linear infinite; }
        .loginOrbTwo { width: 390px; height: 390px; left: -210px; bottom: -100px; animation: loginOrbit 18s linear infinite reverse; }
        @keyframes loginOrbit { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .loginOrbOne, .loginOrbTwo { animation: none; } }
      `}</style>
    </main>
  );
}

function FeatureCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="group rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl transition hover:-translate-y-1 hover:border-blue-400/25 hover:bg-white/[0.07]">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10 text-blue-300">{icon}</div>
      <h3 className="text-sm font-black text-white">{title}</h3>
      <p className="mt-1.5 text-xs font-semibold leading-5 text-white/40">{text}</p>
    </div>
  );
}

function TrustItem({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-blue-400" />{children}</span>;
}

function MobileTrust({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.045] px-2 py-3 text-center text-[9px] font-black uppercase tracking-[0.12em] text-white/55">{children}</div>;
}
