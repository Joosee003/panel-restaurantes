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
  }
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
            signUpError?.message.toLowerCase().includes("registered")
        );

        if (signUpError && !alreadyExists) {
          throw signUpError;
        }

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

      setAccessStep("done");
      setDataStep("active");

      const { error: refreshError } = await demoClient.rpc(
        "refresh_demo_dates"
      );

      if (refreshError) {
        console.warn("No se pudieron actualizar las fechas demo:", refreshError);
      }

      setDataStep("done");
      setPanelStep("active");

      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setPanelStep("done");

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
    const timer = window.setTimeout(() => {
      entrarDemo();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [entrarDemo]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070a13] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-violet-600/20 blur-[130px]" />
        <div className="absolute -bottom-64 right-[-120px] h-[620px] w-[620px] rounded-full bg-blue-600/15 blur-[150px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_86%)]" />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1500px] lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden min-h-screen overflow-hidden border-r border-white/10 lg:block">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "linear-gradient(90deg,rgba(7,10,19,.2),rgba(7,10,19,.92)),linear-gradient(0deg,rgba(7,10,19,.96),rgba(7,10,19,.08) 58%),url(https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=88)",
            }}
          />

          <div className="absolute inset-x-10 top-9 z-10 flex items-center justify-between xl:inset-x-14">
            <div className="text-2xl font-black tracking-[-.05em]">
              Gastro<span className="text-violet-400">Help</span>
            </div>
            <span className="rounded-full border border-white/15 bg-black/25 px-4 py-2 text-[11px] font-bold uppercase tracking-[.16em] text-white/70 backdrop-blur-xl">
              Demostración en directo
            </span>
          </div>

          <div className="absolute inset-x-10 bottom-11 z-10 xl:inset-x-14 xl:bottom-14">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[.16em] text-emerald-200 backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_#6ee7b7]" />
              Restaurante ficticio preparado
            </span>

            <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[.96] tracking-[-.065em] xl:text-7xl">
              Gestiona un restaurante como si ya fuera tuyo.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-white/65 xl:text-lg xl:leading-8">
              Estás entrando en el mismo panel que utiliza un cliente de
              GastroHelp, con reservas, clientes, sala, reseñas, fidelización,
              rentabilidad y pedidos conectados.
            </p>

            <div className="mt-8 flex max-w-2xl flex-wrap gap-2.5">
              {features.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.07] px-3 py-2 text-xs font-semibold text-white/75 backdrop-blur-xl"
                >
                  <Icon size={14} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-9 lg:px-12 xl:px-20">
          <div className="w-full max-w-lg">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <div className="text-2xl font-black tracking-[-.05em]">
                Gastro<span className="text-violet-400">Help</span>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-white/60">
                Demo real
              </span>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-white/[.055] p-6 shadow-[0_30px_100px_rgba(0,0,0,.38)] backdrop-blur-2xl sm:p-9">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-500/15 text-violet-300 shadow-[0_0_50px_rgba(139,92,246,.18)]">
                <Eye size={27} />
              </div>

              <p className="mt-7 text-xs font-extrabold uppercase tracking-[.18em] text-violet-300">
                Acceso público de demostración
              </p>
              <h2 className="mt-3 text-3xl font-black leading-tight tracking-[-.045em] sm:text-4xl">
                Preparando tu restaurante demo
              </h2>
              <p className="mt-4 text-sm leading-6 text-white/55 sm:text-base">
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
                <div className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                  <p className="text-sm font-semibold text-rose-200">
                    No se ha podido abrir la demo.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-rose-200/65">
                    {error}
                  </p>
                  <button
                    type="button"
                    onClick={entrarDemo}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
                  >
                    <RefreshCw size={16} />
                    Reintentar acceso
                  </button>
                </div>
              ) : (
                <div className="mt-7 flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm font-semibold text-white/70">
                  {loading ? (
                    <LoaderCircle className="animate-spin text-violet-300" size={19} />
                  ) : (
                    <ArrowRight className="text-violet-300" size={19} />
                  )}
                  Entrando al panel de La Reserva
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[.035] p-4">
                  <LockKeyhole className="mt-0.5 shrink-0 text-violet-300" size={18} />
                  <div>
                    <p className="text-sm font-bold">Datos aislados</p>
                    <p className="mt-1 text-xs leading-5 text-white/45">
                      No se accede a ningún restaurante real.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[.035] p-4">
                  <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300" size={18} />
                  <div>
                    <p className="text-sm font-bold">Solo lectura</p>
                    <p className="mt-1 text-xs leading-5 text-white/45">
                      Las modificaciones están bloqueadas desde la base de datos.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/35">
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} /> Sin registro
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} /> Datos ficticios
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} /> Acceso inmediato
              </span>
            </div>
          </div>
        </section>
      </div>
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
          ? "border-violet-400/30 bg-violet-500/10"
          : state === "done"
            ? "border-emerald-400/20 bg-emerald-500/[.07]"
            : "border-white/8 bg-white/[.025]",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
          state === "active"
            ? "border-violet-300/30 bg-violet-500/15 text-violet-200"
            : state === "done"
              ? "border-emerald-300/25 bg-emerald-500/15 text-emerald-200"
              : "border-white/10 bg-white/[.04] text-white/30",
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
            state === "waiting" ? "text-white/40" : "text-white",
          ].join(" ")}
        >
          {title}
        </p>
        <p className="mt-1 text-xs leading-5 text-white/40">{description}</p>
      </div>
    </div>
  );
}
