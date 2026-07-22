"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "../../../(app)/lib/supabaseClient";
import { getSessionFromAuthUrl, validateNewPassword } from "../sessionFromUrl";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getSessionFromAuthUrl({ expectedType: "recovery" })
      .then(() => setReady(true))
      .catch(() => {
        setError("El enlace no es válido o ha caducado.");
        setReady(true);
      });
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
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("No se ha podido cambiar la contraseña.");
      setSaving(false);
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login?password=updated");
    router.refresh();
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <form
        onSubmit={savePassword}
        className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-700 text-white">
          <KeyRound className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-center text-3xl font-black text-slate-950">
          Nueva contraseña
        </h1>
        <p className="mt-2 text-center text-sm font-semibold text-slate-500">
          La contraseña debe tener al menos 10 caracteres.
        </p>

        {!error || password || password2 ? (
          <div className="mt-6 space-y-3">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Nueva contraseña"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-bold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
            <input
              type="password"
              autoComplete="new-password"
              value={password2}
              onChange={(event) => setPassword2(event.target.value)}
              placeholder="Repite la contraseña"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-bold outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-center text-sm font-bold text-red-700">
            {error}
          </p>
        ) : null}

        {ready && (!error || password || password2) ? (
          <button
            type="submit"
            disabled={saving}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Guardar contraseña
          </button>
        ) : null}
      </form>
    </div>
  );
}
