"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  Layers3,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { supabase } from "../../(app)/lib/supabaseClient";

type PublicMetrics = {
  restaurant_count: number;
  active_modules: number;
  operational_records: number;
};

type WelcomePhase = "hidden" | "visible" | "leaving";

const FALLBACK_METRICS: PublicMetrics = {
  restaurant_count: 4,
  active_modules: 36,
  operational_records: 60,
};

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
  const [fromWebsite, setFromWebsite] = useState(false);
  const [welcomePhase, setWelcomePhase] = useState<WelcomePhase>("hidden");
  const [metricsTarget, setMetricsTarget] = useState<PublicMetrics>(FALLBACK_METRICS);
  const [metrics, setMetrics] = useState<PublicMetrics>({
    restaurant_count: 0,
    active_modules: 0,
    operational_records: 0,
  });

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
      const arrivedFromWebsite = params.get("from") === "website";
      setNextPath(currentNext);
      setFromWebsite(arrivedFromWebsite);

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

  useEffect(() => {
    if (checkingSession) return;
    let mounted = true;

    const loadMetrics = async () => {
      const { data, error: metricsError } = await supabase
        .rpc("get_public_gastrohelp_metrics")
        .maybeSingle();

      if (!mounted || metricsError || !data) return;
      const row = data as Partial<PublicMetrics>;
      setMetricsTarget({
        restaurant_count: Number(row.restaurant_count ?? FALLBACK_METRICS.restaurant_count),
        active_modules: Number(row.active_modules ?? FALLBACK_METRICS.active_modules),
        operational_records: Number(
          row.operational_records ?? FALLBACK_METRICS.operational_records,
        ),
      });
    };

    loadMetrics();
    return () => {
      mounted = false;
    };
  }, [checkingSession]);

  useEffect(() => {
    if (checkingSession) return;
    const startedAt = performance.now();
    const duration = 1050;
    let animationFrame = 0;

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setMetrics({
        restaurant_count: Math.round(metricsTarget.restaurant_count * eased),
        active_modules: Math.round(metricsTarget.active_modules * eased),
        operational_records: Math.round(metricsTarget.operational_records * eased),
      });
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [checkingSession, metricsTarget]);

  useEffect(() => {
    if (checkingSession || !fromWebsite) return;
    setWelcomePhase("visible");
    const leaveTimer = window.setTimeout(() => setWelcomePhase("leaving"), 1550);
    const hideTimer = window.setTimeout(() => setWelcomePhase("hidden"), 2150);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, [checkingSession, fromWebsite]);

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
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-100/75">
            Comprobando sesión
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="theme-dark loginRoot relative min-h-screen overflow-hidden bg-[#030814] text-white">
      <div className="loginGrid pointer-events-none absolute inset-0" />
      <div className="loginOrb loginOrbOne pointer-events-none absolute rounded-full" />
      <div className="loginOrb loginOrbTwo pointer-events-none absolute rounded-full" />
      <div className="loginNoise pointer-events-none absolute inset-0" />

      {welcomePhase !== "hidden" ? (
        <div
          className={`clientWelcome pointer-events-none fixed inset-0 z-[80] grid place-items-center px-5 ${welcomePhase}`}
          aria-hidden="true"
        >
          <div className="clientWelcomeBackdrop absolute inset-0" />
          <div className="clientWelcomeCard relative w-full max-w-[720px] overflow-hidden rounded-[2.2rem] border border-blue-300/20 bg-[#071326]/95 p-7 text-center shadow-[0_45px_160px_rgba(0,0,0,.65)] backdrop-blur-3xl sm:p-10">
            <div className="welcomeGrid absolute inset-0" />
            <div className="relative">
              <div className="welcomeLogo mx-auto flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-gradient-to-br from-[#1601ad] to-blue-500 text-white shadow-2xl shadow-blue-600/35">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">
                Red GastroHelp conectada
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-5xl">
                Bienvenido al área de clientes.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm font-semibold leading-6 text-slate-300 sm:text-base">
                Acceso privado, métricas reales y todos los módulos del restaurante en un único entorno.
              </p>
              <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-3">
                <WelcomeMetric value={metrics.restaurant_count} label="restaurantes reales" />
                <WelcomeMetric value={metrics.active_modules} label="módulos activos" prefix="+" />
                <WelcomeMetric value={metrics.operational_records} label="registros conectados" prefix="+" />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <a
        href="https://gastrohelp.es"
        className="absolute left-5 top-5 z-30 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-4 py-2.5 text-xs font-black text-white/85 backdrop-blur-xl transition hover:border-blue-300/40 hover:bg-white/[0.1] hover:text-white md:left-8 md:top-8"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a GastroHelp
      </a>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 items-center gap-8 px-4 py-28 lg:grid-cols-[1.04fr_.96fr] lg:gap-16 lg:px-10 lg:py-16 xl:px-16">
        <section className="hidden bg-transparent lg:block">
          <div className="mb-10 inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1601ad] to-blue-500 shadow-xl shadow-blue-700/30">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] text-white">
                Gastro<span className="text-blue-400">Help</span>
              </div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Área privada de clientes
              </div>
            </div>
          </div>

          <div className="max-w-[680px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">
              <Sparkles className="h-3.5 w-3.5" /> Tu restaurante, conectado
            </div>
            <h1 className="!text-white text-[clamp(3.4rem,6vw,6.2rem)] font-black leading-[0.9] tracking-[-0.075em]">
              Todo el control.
              <span className="block bg-gradient-to-r from-white via-blue-200 to-blue-500 bg-clip-text text-transparent">
                En un único lugar.
              </span>
            </h1>
            <p className="mt-7 max-w-[610px] text-lg font-medium leading-8 text-slate-300">
              Accede a reservas, clientes, fidelización, reputación, sala y
              rentabilidad desde un sistema diseñado específicamente para
              hostelería.
            </p>
          </div>

          <div className="mt-9 grid max-w-[680px] grid-cols-3 gap-3">
            <LiveMetric icon={<Building2 className="h-5 w-5" />} value={metrics.restaurant_count} label="Restaurantes reales" />
            <LiveMetric icon={<Layers3 className="h-5 w-5" />} value={metrics.active_modules} label="Módulos activos" prefix="+" />
            <LiveMetric icon={<Activity className="h-5 w-5" />} value={metrics.operational_records} label="Registros operativos" prefix="+" />
          </div>

          <div className="mt-4 grid max-w-[680px] grid-cols-2 gap-3">
            <FeatureCard icon={<CalendarDays className="h-5 w-5" />} title="Reservas y sala" text="Turnos, estados, mesas y ocupación." />
            <FeatureCard icon={<UsersRound className="h-5 w-5" />} title="Clientes" text="Historial, frecuencia y recurrencia." />
            <FeatureCard icon={<Sparkles className="h-5 w-5" />} title="Fidelización" text="Puntos, recompensas y cupones." />
            <FeatureCard icon={<BarChart3 className="h-5 w-5" />} title="Rentabilidad" text="Costes, márgenes y decisiones." />
          </div>

          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-slate-300">
            <TrustItem>Acceso solo por invitación</TrustItem>
            <TrustItem>Sesión protegida</TrustItem>
            <TrustItem>Soporte directo</TrustItem>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[510px] bg-transparent">
          <form
            onSubmit={entrar}
            className="loginForm relative overflow-hidden rounded-[2rem] border border-white/70 bg-white p-6 text-slate-950 shadow-[0_45px_130px_rgba(0,0,0,.55)] sm:p-9"
          >
            <div className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-blue-100/90 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-20 h-60 w-60 rounded-full bg-sky-100/75 blur-3xl" />

            <div className="relative">
              <div className="mb-8 flex items-start justify-between gap-5">
                <div>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1601ad] to-blue-500 text-white shadow-xl shadow-blue-700/25 lg:hidden">
                    <ShieldCheck className="h-7 w-7" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
                    Área privada
                  </p>
                  <h2 className="mt-2 !text-slate-950 text-3xl font-black tracking-[-0.045em]">
                    Accede a tu panel
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Introduce las credenciales asignadas a tu restaurante.
                  </p>
                </div>
                <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 sm:flex">
                  <LockKeyhole className="h-5 w-5" />
                </div>
              </div>

              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">Email</span>
                  <div className="group relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-700" />
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold text-slate-950 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
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
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">Contraseña</span>
                  <div className="group relative">
                    <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-700" />
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold text-slate-950 outline-none transition placeholder:font-semibold placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100"
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

              <div className="mt-7 border-t border-slate-200 pt-6 text-center">
                <p className="text-xs font-semibold leading-5 text-slate-600">
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
            <MobileMetric value={metrics.restaurant_count} label="Restaurantes" />
            <MobileMetric value={metrics.active_modules} label="Módulos" prefix="+" />
            <MobileMetric value={metrics.operational_records} label="Registros" prefix="+" />
          </div>
        </section>
      </div>

      <style jsx global>{`
        .loginRoot { isolation: isolate; }
        .loginRoot::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(circle at 72% 26%, rgba(37,99,235,.24), transparent 29%),
            radial-gradient(circle at 13% 78%, rgba(22,1,173,.22), transparent 31%),
            linear-gradient(145deg, #030814 0%, #061326 55%, #030b18 100%);
        }
        .loginGrid {
          opacity: 0.42;
          background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
          background-size: 58px 58px;
          mask-image: linear-gradient(to bottom, black, transparent 94%);
        }
        .loginNoise {
          opacity: .025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.8'/%3E%3C/svg%3E");
        }
        .loginOrb { border: 1px solid rgba(96,165,250,.16); box-shadow: inset 0 0 150px rgba(37,99,235,.09); }
        .loginOrbOne { width: 720px; height: 720px; right: -310px; top: -180px; animation: loginOrbit 24s linear infinite; }
        .loginOrbTwo { width: 390px; height: 390px; left: -210px; bottom: -100px; animation: loginOrbit 18s linear infinite reverse; }
        .loginForm input { background: #f8fafc !important; color: #0f172a !important; }
        .loginForm input:focus { background: #ffffff !important; }
        .clientWelcome { opacity: 0; transition: opacity .5s ease; }
        .clientWelcome.visible { opacity: 1; }
        .clientWelcome.leaving { opacity: 0; }
        .clientWelcomeBackdrop { background: rgba(3,8,20,.82); backdrop-filter: blur(16px); }
        .clientWelcomeCard { transform: translateY(22px) scale(.965); opacity: 0; }
        .clientWelcome.visible .clientWelcomeCard { animation: welcomeIn .72s cubic-bezier(.2,.8,.2,1) forwards; }
        .clientWelcome.leaving .clientWelcomeCard { animation: welcomeOut .48s ease forwards; }
        .welcomeGrid { opacity: .32; background-image: linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px); background-size: 36px 36px; mask-image: radial-gradient(circle at center,#000,transparent 80%); }
        .welcomeLogo { position: relative; animation: welcomePulse 2s ease-in-out infinite; }
        .welcomeLogo::after { content: ""; position: absolute; inset: -14px; border: 1px solid rgba(96,165,250,.28); border-radius: 1.8rem; animation: welcomeRing 1.8s ease-out infinite; }
        @keyframes loginOrbit { to { transform: rotate(360deg); } }
        @keyframes welcomeIn { to { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes welcomeOut { to { transform: translateY(-16px) scale(.985); opacity: 0; } }
        @keyframes welcomePulse { 50% { transform: translateY(-4px); box-shadow: 0 30px 80px rgba(37,99,235,.42); } }
        @keyframes welcomeRing { from { transform: scale(.82); opacity: 0; } 35% { opacity: .85; } to { transform: scale(1.24); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .loginOrbOne, .loginOrbTwo, .welcomeLogo, .welcomeLogo::after { animation: none; }
          .clientWelcomeCard { transform: none; opacity: 1; }
        }
      `}</style>
    </main>
  );
}

function FeatureCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="group rounded-[1.35rem] border border-white/15 bg-white/[0.065] p-4 backdrop-blur-xl transition hover:-translate-y-1 hover:border-blue-300/35 hover:bg-white/[0.09]">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-500/15 text-blue-200">{icon}</div>
      <h3 className="!text-white text-sm font-black">{title}</h3>
      <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-300">{text}</p>
    </div>
  );
}

function LiveMetric({ icon, value, label, prefix = "" }: { icon: ReactNode; value: number; label: string; prefix?: string }) {
  return (
    <div className="relative overflow-hidden rounded-[1.3rem] border border-blue-300/15 bg-blue-500/[0.08] p-4 backdrop-blur-xl">
      <div className="absolute -right-7 -top-7 h-20 w-20 rounded-full bg-blue-500/15 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-200">{icon}</div>
        <div>
          <strong className="block text-xl font-black tracking-[-0.04em] text-white">{prefix}{value.toLocaleString("es-ES")}</strong>
          <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-300">{label}</span>
        </div>
      </div>
    </div>
  );
}

function WelcomeMetric({ value, label, prefix = "" }: { value: number; label: string; prefix?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-2 py-4 backdrop-blur-xl sm:px-4">
      <strong className="block text-2xl font-black tracking-[-0.05em] text-white sm:text-3xl">{prefix}{value.toLocaleString("es-ES")}</strong>
      <span className="mt-1 block text-[8px] font-black uppercase tracking-[0.12em] text-slate-300 sm:text-[10px]">{label}</span>
    </div>
  );
}

function TrustItem({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-2"><Check className="h-3.5 w-3.5 text-blue-300" />{children}</span>;
}

function MobileMetric({ value, label, prefix = "" }: { value: number; label: string; prefix?: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/[0.07] px-2 py-3 text-center backdrop-blur-xl">
      <strong className="block text-sm font-black text-white">{prefix}{value.toLocaleString("es-ES")}</strong>
      <span className="mt-1 block text-[8px] font-black uppercase tracking-[0.1em] text-slate-300">{label}</span>
    </div>
  );
}
