"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { supabase } from "../../../(app)/lib/supabaseClient";
import { getSessionFromAuthUrl, validateNewPassword } from "../sessionFromUrl";

export default function AcceptInvitePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    let mounted = true;

    const processInvite = async () => {
      try {
        const session = await getSessionFromAuthUrl({
          expectedType: "invite",
        });

        const { data: links, error: linkError } = await supabase
          .from("usuarios_restaurantes")
          .select("restaurante_id")
          .eq("user_id", session.user.id)
          .limit(1);

        if (linkError || !links?.length) {
          throw new Error("RESTAURANT_ACCESS_MISSING");
        }

        if (!mounted) return;
        setEmail(session.user.email || "");
        setLoadingInvite(false);
      } catch (inviteError) {
        console.error("Invitación no válida", inviteError);
        if (!mounted) return;
        setError(
          "La invitación no es válida, ha caducado o no tiene un restaurante asignado.",
        );
        setLoadingInvite(false);
      }
    };

    processInvite();

    return () => {
      mounted = false;
    };
  }, []);

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const validationError = validateNewPassword(password, password2);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);

    const { error: passwordError } = await supabase.auth.updateUser({ password });

    if (passwordError) {
      setError("No se ha podido guardar la contraseña. Abre de nuevo la invitación.");
      setSaving(false);
      return;
    }

    const { error: completionError } = await supabase.rpc(
      "completar_invitacion_restaurante",
    );

    if (completionError) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: links } = user
        ? await supabase
            .from("usuarios_restaurantes")
            .select("restaurante_id")
            .eq("user_id", user.id)
            .limit(1)
        : { data: null };

      if (!links?.length) {
        setError("La cuenta se ha activado, pero no tiene restaurante asignado.");
        setSaving(false);
        return;
      }
    }

    router.replace("/dashboard");
    router.refresh();
  };

  if (loadingInvite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-blue-700" />
          <p className="mt-4 text-sm font-black text-slate-700">
            Comprobando invitación
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <form
        onSubmit={savePassword}
        className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
          <ShieldCheck className="h-8 w-8" />
        </div>

        <h1 className="mt-6 text-center text-3xl font-black text-slate-950">
          Activa tu acceso
        </h1>
        <p className="mt-2 text-center text-sm font-semibold text-slate-500">
          Crea la contraseña privada de tu restaurante.
        </p>

        {email ? (
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {email}
          </div>
        ) : null}

        {!error || email ? (
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
                Nueva contraseña
              </span>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={saving || !email}
                  className="w-full rounded-2xl border border-slate-200 py-3.5 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                  placeholder="Mínimo 10 caracteres"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">
                Repite la contraseña
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(event) => setPassword2(event.target.value)}
                disabled={saving || !email}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-bold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                placeholder="Repite la contraseña"
              />
            </label>
          </div>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-center text-sm font-bold text-red-700">
            {error}
          </p>
        ) : null}

        {email ? (
          <button
            type="submit"
            disabled={saving}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-700/20 hover:bg-blue-800 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {saving ? "Activando cuenta" : "Activar cuenta y entrar"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
