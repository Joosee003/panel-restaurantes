"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChefHat,
  Eye,
  Gift,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

const DEMO_EMAIL = "demo@gastrohelp.es";
const DEMO_PASSWORD = "DemoGastroHelp#2026!";
const DEMO_MODE_KEY = "gastrohelp-demo-mode";
const DEMO_STORAGE_KEY = "gastrohelp-demo-auth";

const demoClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: DEMO_STORAGE_KEY,
    },
  },
);

type StepState = "waiting" | "active" | "done";

const features = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: CalendarDays, label: "Reservas" },
  { icon: Users, label: "Clientes" },
  { icon: MessageSquare, label: "Reseñas" },
  { icon: Gift, label: "Fidelización" },
  { icon: BarChart3, label: "Rentabilidad" },
  { icon: QrCode, label: "Carta y QR" },
  { icon: ChefHat, label: "Cocina" },
];

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function mensajeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "No se ha podido preparar la demostración.";
}

export default function DemoPage() {
  const running = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessStep, setAccessStep] = useState<StepState>("active");
  const [dataStep, setDataStep] = useState<StepState>("waiting");
  const [panelStep, setPanelStep] = useState<StepState>("waiting");

  const entrarDemo = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    setLoading(true);
    setError("");
    setAccessStep("active");
    setDataStep("waiting");
    setPanelStep("waiting");

    try {
      window.sessionStorage.setItem(DEMO_MODE_KEY, "1");

      const {
        data: { session: existingSession },
      } = await demoClient.auth.getSession();

      if (existingSession?.user.email !== DEMO_EMAIL) {
        await demoClient.auth.signOut();
      }

      let { data: signInData, error: signInError } =
        await demoClient.auth.signInWithPassword({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        });

      if (signInError || !signInData.session) {
        const { error: signUpError } = await demoClient.auth.signUp({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
          options: {
            data: {
              nombre: "Usuario Demo",
              demo: true,
            },
          },
        });

        const alreadyExists = Boolean(
          signUpError?.message.toLowerCase().includes("already") ||
            signUpError?.message.toLowerCase().includes("registered"),
        );

        if (signUpError && !alreadyExists) throw signUpError;

        const retry = await demoClient.auth.signInWithPassword({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        });

        signInData = retry.data;
        signInError = retry.error;
      }

      if (signInError || !signInData.session) {
        throw signInError ?? new Error("No se ha podido iniciar la sesión demo.");
      }

      await wait(260);
      setAccessStep("done");
      setDataStep("active");

      const { error: refreshError } = await demoClient.rpc("refresh_demo_dates");
      if (refreshError) {
        console.warn("No se pudieron actualizar las fechas demo:", refreshError);
      }

      await wait(340);
      setDataStep("done");
      setPanelStep("active");

      await wait(560);
      setPanelStep("done");
      await wait(260);

      window.location.replace("/dashboard");
    } catch (caughtError) {
      console.error("Error entrando en la demo:", caughtError);
      window.sessionStorage.removeItem(DEMO_MODE_KEY);
      setError(mensajeError(caughtError));
      setAccessStep("waiting");
      setDataStep("waiting");
      setPanelStep("waiting");
      setLoading(false);
      running.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => entrarDemo(), 300);
    return () => window.clearTimeout(timer);
  }, [entrarDemo]);

  return (
    <main className="theme-dark demoRoot relative min-h-screen overflow-hidden bg-[#030814] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#1601ad]/25 blur-[135px]" />
        <div className="absolute -bottom-64 right-[-120px] h-[620px] w-[620px] rounded-full bg-blue-600/20 blur-[150px]" />
        <div className="demoGrid absolute inset-0" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1600px] lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden min-h-screen overflow-hidden border-r border-white/10 bg-transparent lg:block">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(90deg,rgba(3,8,20,.16),rgba(3,8,20,.93)),linear-gradient(0deg,rgba(3,8,20,.98),rgba(3,8,20,.08) 58%),url(https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=88)",
            }}
          />
          <div className="demoImageSheen pointer-events-none absolute inset-0" />

          <div className="absolute inset-x-10 top-9 z-10 flex items-center justify-between xl:inset-x-14">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1601ad] to-blue-500 shadow-xl shadow-blue-700/35">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="text-2xl font-black tracking-[-.05em] text-white">
                  Gastro<span className="text-blue-400">Help</span>
                </div>
                <p className="mt-0.5 text-[9px] font-black uppercase tracking-[.18em] text-slate-300">
                  Sistema para restaurantes
                </p>
              </div>
            </div>
            <span className="rounded-full border border-white/20 bg-black/35 px-4 py-2 text-[11px] font-bold uppercase tracking-[.16em] text-white/85 backdrop-blur-xl">
              Demostración en directo
            </span>
          </div>

          <div className="absolute inset-x-10 bottom-11 z-10 xl:inset-x-14 xl:bottom-14">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-4 py-2 text-xs font-extrabold uppercase tracking-[.16em] text-emerald-100 backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_#6ee7b7]" />
              Restaurante ficticio preparado
            </span>

            <h1 className="mt-6 max-w-3xl !text-white text-5xl font-black leading-[.96] tracking-[-.065em] xl:text-7xl">
              Gestiona un restaurante como si ya fuera tuyo.
            </h1>

            <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-slate-200 xl:text-lg xl:leading-8">
              Estás entrando en el mismo entorno que utiliza un cliente de
              GastroHelp, con reservas, clientes, sala, reseñas, fidelización,
              rentabilidad y pedidos conectados.
            </p>

            <div className="mt-8 flex max-w-2xl flex-wrap gap-2.5">
              {features.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.09] px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-xl"
                >
                  <Icon size={14} className="text-blue-200" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-transparent px-5 py-10 sm:px-9 lg:px-12 xl:px-20">
          <div className="w-full max-w-lg">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1601ad] to-blue-500 shadow-xl shadow-blue-700/35">
                  <ShieldCheck size={22} />
                </div>
                <div className="text-2xl font-black tracking-[-.05em] text-white">
                  Gastro<span className="text-blue-400">Help</span>
                </div>
              </div>
              <span className="rounded-full border border-white/15 bg-white/[.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-white/80">
                Demo real
              </span>
            </div>

            <div className="demoPanel relative overflow-hidden rounded-[32px] border border-blue-200/15 bg-[#081426]/95 p-6 shadow-[0_35px_120px_rgba(0,0,0,.55)] backdrop-blur-2xl sm:p-9">
              <div className="demoPanelGlow pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/15 blur-[80px]" />
              <div className="relative">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-300/25 bg-blue-500/15 text-blue-200 shadow-[0_0_55px_rgba(37,99,235,.22)]">
                  <Eye size={27} />
                </div>

                <p className="mt-7 text-xs font-extrabold uppercase tracking-[.18em] text-blue-300">
                  Acceso público de demostración
                </p>
                <h2 className="mt-3 !text-white text-3xl font-black leading-tight tracking-[-.045em] sm:text-4xl">
                  Preparando tu restaurante demo
                </h2>
                <p className="mt-4 text-sm font-medium leading-6 text-slate-300 sm:text-base">
                  No necesitas registrarte ni introducir datos. El acceso se
                  realiza automáticamente en una sesión separada de tu cuenta.
                </p>

                <div className="mt-8 space-y-3">
                  <ProgressStep
                    state={accessStep}
                    title="Acceso seguro"
                    description="Creando una sesión aislada para esta pestaña"
                  />
                  <ProgressStep
                    state={dataStep}
                    title="Datos actualizados"
                    description="Preparando reservas, clientes y actividad reciente"
                  />
                  <ProgressStep
                    state={panelStep}
                    title="Panel completo"
                    description="Abriendo todos los módulos en modo solo lectura"
                  />
                </div>

                {error ? (
                  <div className="mt-6 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4">
                    <p className="text-sm font-semibold text-rose-100">
                      No se ha podido abrir la demo.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-rose-100/80">
                      {error}
                    </p>
                    <button
                      type="button"
                      onClick={entrarDemo}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-slate-100"
                    >
                      <RefreshCw size={16} />
                      Reintentar acceso
                    </button>
                  </div>
                ) : (
                  <div className="mt-7 flex items-center justify-center gap-3 rounded-2xl border border-blue-300/20 bg-blue-500/10 px-4 py-4 text-sm font-semibold text-white">
                    {loading ? (
                      <LoaderCircle className="animate-spin text-blue-300" size={19} />
                    ) : (
                      <ArrowRight className="text-blue-300" size={19} />
                    )}
                    Entrando al panel de La Reserva
                  </div>
                )}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                    <LockKeyhole className="mt-0.5 shrink-0 text-blue-300" size={18} />
                    <div>
                      <p className="text-sm font-bold text-white">Datos aislados</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        No se accede a ningún restaurante real.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.055] p-4">
                    <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={18} />
                    <div>
                      <p className="text-sm font-bold text-white">Solo lectura</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        Las modificaciones están bloqueadas desde la base de datos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-300">
              <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-blue-300" /> Sin registro</span>
              <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-blue-300" /> Datos ficticios</span>
              <span className="inline-flex items-center gap-1.5"><Check size={13} className="text-blue-300" /> Acceso inmediato</span>
            </div>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .demoRoot { isolation: isolate; }
        .demoRoot::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(circle at 78% 18%, rgba(37,99,235,.2), transparent 29%),
            radial-gradient(circle at 18% 82%, rgba(22,1,173,.24), transparent 32%),
            linear-gradient(145deg, #030814, #061326 58%, #030b18);
        }
        .demoGrid {
          opacity: .36;
          background-image: linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
          background-size: 52px 52px;
          mask-image: linear-gradient(to bottom,#000,transparent 92%);
        }
        .demoImageSheen {
          background: linear-gradient(120deg, transparent 25%, rgba(96,165,250,.08) 46%, transparent 64%);
          transform: translateX(-100%);
          animation: demoSheen 7s ease-in-out infinite;
        }
        .demoPanel { animation: demoPanelIn .72s cubic-bezier(.2,.8,.2,1) both; }
        .demoPanelGlow { animation: demoGlow 4.5s ease-in-out infinite; }
        @keyframes demoPanelIn { from { opacity: 0; transform: translateY(24px) scale(.98); } to { opacity: 1; transform: none; } }
        @keyframes demoGlow { 50% { opacity: .65; transform: scale(1.12); } }
        @keyframes demoSheen { 0%,35% { transform: translateX(-110%); } 70%,100% { transform: translateX(110%); } }
        @media (prefers-reduced-motion: reduce) {
          .demoImageSheen, .demoPanel, .demoPanelGlow { animation: none; }
        }
      `}</style>
    </main>
  );
}

function ProgressStep({
  state,
  title,
  description,
}: {
  state: StepState;
  title: string;
  description: string;
}) {
  return (
    <div
      className={[
        "flex items-start gap-4 rounded-2xl border p-4 transition duration-300",
        state === "active"
          ? "border-blue-300/30 bg-blue-500/12 shadow-[0_12px_35px_rgba(37,99,235,.12)]"
          : state === "done"
            ? "border-emerald-300/25 bg-emerald-500/[.09]"
            : "border-white/10 bg-white/[.035]",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
          state === "active"
            ? "border-blue-300/35 bg-blue-500/20 text-blue-100"
            : state === "done"
              ? "border-emerald-300/30 bg-emerald-500/20 text-emerald-100"
              : "border-white/12 bg-white/[.055] text-slate-400",
        ].join(" ")}
      >
        {state === "active" ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : state === "done" ? (
          <Check size={17} />
        ) : (
          <span className="h-2 w-2 rounded-full bg-current" />
        )}
      </div>

      <div>
        <p
          className={[
            "text-sm font-bold",
            state === "waiting" ? "text-slate-400" : "text-white",
          ].join(" ")}
        >
          {title}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-300">{description}</p>
      </div>
    </div>
  );
}
