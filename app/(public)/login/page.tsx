"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
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
      supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle(),
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

    if (desiredPath?.startsWith("/admin")) {
      return isAdmin ? desiredPath : "/dashboard";
    }

    if (desiredPath && hasRestaurant) return desiredPath;
    if (isAdmin) return "/admin/restaurantes";
    if (hasRestaurant) return "/dashboard";
    return "/admin/restaurantes";
  };

  useEffect(() => {
    let mounted = true;

    const checkExistingSession = async () => {
      const currentNext = safeNextPath(
        new URLSearchParams(window.location.search).get("next"),
      );
      const passwordChanged =
        new URLSearchParams(window.location.search).get("password") === "updated";
      setNextPath(currentNext);
      if (passwordChanged) {
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
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="diagonalWrap absolute inset-0">
          <div className="diagonalTrack diagonalA">
            {Array.from({ length: 8 }).map((_, index) => (
              <BrandTile key={`a-${index}`} />
            ))}
          </div>
          <div className="diagonalTrack diagonalB">
            {Array.from({ length: 8 }).map((_, index) => (
              <BrandTile key={`b-${index}`} />
            ))}
          </div>
        </div>
        <div className="absolute inset-0 bg-white/75" />
      </div>

      <form
        onSubmit={entrar}
        className="relative z-10 w-full max-w-sm space-y-5 rounded-[2rem] bg-white p-8 shadow-2xl ring-1 ring-black/5"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
          <ShieldCheck className="h-7 w-7" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black text-gray-950">Panel Restaurante</h1>
          <p className="mt-1 text-sm font-semibold text-gray-500">
            Acceso privado de GastroHelp
          </p>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">
            Email
          </span>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-4 text-sm font-bold text-gray-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
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
          <span className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">
            Contraseña
          </span>
          <div className="relative">
            <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-4 text-sm font-bold text-gray-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
            />
          </div>
        </label>

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-center text-sm font-bold text-red-700">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {loading ? "Comprobando acceso" : "Entrar de forma segura"}
        </button>

        <button
          type="button"
          onClick={sendPasswordReset}
          disabled={sendingReset || loading}
          className="w-full text-center text-sm font-black text-blue-700 transition hover:text-blue-900 disabled:opacity-50"
        >
          {sendingReset ? "Enviando correo..." : "He olvidado mi contraseña"}
        </button>

        <p className="text-center text-xs font-semibold leading-relaxed text-gray-500">
          Las cuentas se activan únicamente mediante invitación de GastroHelp.
        </p>
      </form>

      <style jsx global>{`
        .diagonalWrap {
          inset: -40%;
          transform: rotate(-18deg);
          transform-origin: center;
        }

        .diagonalTrack {
          display: flex;
          width: max-content;
          align-items: center;
          gap: 44px;
          opacity: 0.2;
          will-change: transform;
          filter: saturate(1.05);
        }

        .diagonalA {
          position: absolute;
          top: 20%;
          left: 0;
          animation: drift 18s linear infinite;
        }

        .diagonalB {
          position: absolute;
          top: 55%;
          left: 0;
          opacity: 0.14;
          animation: drift 26s linear infinite;
        }

        @keyframes drift {
          0% {
            transform: translate3d(-20%, 0, 0);
          }
          100% {
            transform: translate3d(-70%, 0, 0);
          }
        }

        @media (max-width: 480px) {
          .diagonalTrack {
            gap: 28px;
          }
          .diagonalWrap {
            inset: -60%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .diagonalA,
          .diagonalB {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function BrandTile() {
  return (
    <div className="flex items-center gap-4 pr-6">
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10">
        <ShieldCheck className="h-6 w-6 text-blue-700" aria-hidden="true" />
      </div>
      <div className="text-sm font-extrabold tracking-[0.22em] text-black/80">
        GASTROHELP
      </div>
      <div className="h-px w-14 bg-black/15" />
    </div>
  );
}
