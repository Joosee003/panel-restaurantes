"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { useTheme } from "@/app/(app)/components/ThemeProvider";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { getRestauranteUsuario } from "@/app/(app)/lib/getRestauranteUsuario";

type Cupon = {
  id: string;
  nombre: string;
  beneficio: string;
  activo: boolean;
  creado_en: string;
};

type TipoCupon = "cumpleanos" | "horas_valle";

type PremioPuntos = {
  id: string;
  nombre: string;
  descripcion: string | null;
  puntos_requeridos: number;
  imagen_url: string | null;
  activo: boolean;
  creado_en: string;
};

type Tab = "cupones" | "premios";

function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

export default function CuponesPage() {
  const { dark } = useTheme();

  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [moduloPermitido, setModuloPermitido] = useState<boolean | null>(null);

  const [tab, setTab] = useState<Tab>("premios");

  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [loadingCupones, setLoadingCupones] = useState(true);

  const [showCuponForm, setShowCuponForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [beneficio, setBeneficio] = useState("");
  const [savingCupon, setSavingCupon] = useState(false);
  const [tipo, setTipo] = useState<TipoCupon>("cumpleanos");

  const [validezDiasCumple, setValidezDiasCumple] = useState<number>(7);
  const [diasAntesCumple, setDiasAntesCumple] = useState<number>(0);

  const [diasSemana, setDiasSemana] = useState<number[]>([1, 2, 3, 4]);
  const [horaInicio, setHoraInicio] = useState<string>("20:00");
  const [horaFin, setHoraFin] = useState<string>("21:00");
  const [cadaXVisitas, setCadaXVisitas] = useState<number>(2);

  const [premios, setPremios] = useState<PremioPuntos[]>([]);
  const [loadingPremios, setLoadingPremios] = useState(true);

  const [showPremioForm, setShowPremioForm] = useState(false);
  const [editingPremioId, setEditingPremioId] = useState<string | null>(null);

  const [premioNombre, setPremioNombre] = useState("");
  const [premioDescripcion, setPremioDescripcion] = useState("");
  const [premioPuntos, setPremioPuntos] = useState<number>(100);
  const [premioImagenUrl, setPremioImagenUrl] = useState("");
  const [premioFile, setPremioFile] = useState<File | null>(null);
  const [premioActivo, setPremioActivo] = useState(true);
  const [savingPremio, setSavingPremio] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pageWrap = useMemo(() => clsx("p-6", "mx-auto", "max-w-6xl"), []);

  const cardBase = useMemo(() => {
    return clsx(
      "rounded-2xl border shadow-sm",
      dark ? "border-gray-800 bg-gray-950" : "border-gray-200 bg-white"
    );
  }, [dark]);

  const btnPrimary = useMemo(() => {
    return clsx(
      "rounded-xl px-4 py-2 text-sm font-semibold transition",
      dark ? "bg-white text-black hover:opacity-90" : "bg-black text-white hover:opacity-90",
      "disabled:opacity-60"
    );
  }, [dark]);

  const btnGhost = useMemo(() => {
    return clsx(
      "rounded-xl border px-4 py-2 text-sm font-medium transition",
      dark
        ? "border-gray-800 bg-transparent text-gray-200 hover:bg-gray-900"
        : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
      "disabled:opacity-60"
    );
  }, [dark]);

  const btnDanger = useMemo(() => {
    return clsx(
      "rounded-xl border px-4 py-2 text-sm font-medium transition",
      dark
        ? "border-gray-800 bg-transparent text-red-300 hover:bg-gray-900"
        : "border-gray-200 bg-white text-red-600 hover:bg-red-50"
    );
  }, [dark]);

  const inputBase = useMemo(() => {
    return clsx(
      "mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none",
      dark
        ? "border-gray-800 bg-gray-950 text-gray-100 placeholder:text-gray-500 focus:border-gray-700"
        : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-gray-300"
    );
  }, [dark]);

  const pill = (active: boolean) =>
    clsx(
      "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
      active
        ? dark
          ? "bg-white/10 text-white"
          : "bg-black/10 text-black"
        : dark
        ? "bg-gray-900 text-gray-300"
        : "bg-gray-100 text-gray-600"
    );

  const toggleDiaSemana = (dia: number) => {
    setDiasSemana((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia].sort()
    );
  };

  const buildCondiciones = () => {
    if (tipo === "cumpleanos") {
      return {
        tipo: "cumpleanos",
        validez_dias: Math.max(1, Number(validezDiasCumple) || 1),
        dias_antes: Math.max(0, Number(diasAntesCumple) || 0),
      };
    }

    return {
      tipo: "horas_valle",
      dias_semana: diasSemana.length ? diasSemana : [0, 1, 2, 3, 4, 5, 6],
      hora_inicio: horaInicio || "20:00",
      hora_fin: horaFin || "21:00",
      cada_x_visitas: Math.max(1, Number(cadaXVisitas) || 1),
    };
  };

  const resetCuponForm = () => {
    setNombre("");
    setBeneficio("");
    setTipo("cumpleanos");
    setValidezDiasCumple(7);
    setDiasAntesCumple(0);
    setDiasSemana([1, 2, 3, 4]);
    setHoraInicio("20:00");
    setHoraFin("21:00");
    setCadaXVisitas(2);
  };

  const resetPremioForm = () => {
    setEditingPremioId(null);
    setPremioNombre("");
    setPremioDescripcion("");
    setPremioPuntos(100);
    setPremioImagenUrl("");
    setPremioFile(null);
    setPremioActivo(true);
  };

  const cargarCupones = async (rid: string) => {
    const { data, error } = await supabase
      .from("cupones")
      .select("id,nombre,beneficio,activo,creado_en")
      .eq("restaurante_id", rid)
      .order("creado_en", { ascending: false });

    if (error) throw error;
    setCupones((data ?? []) as Cupon[]);
  };

  const cargarPremios = async (rid: string) => {
    const { data, error } = await supabase
      .from("premios_puntos")
      .select("id,nombre,descripcion,puntos_requeridos,imagen_url,activo,creado_en")
      .eq("restaurante_id", rid)
      .order("creado_en", { ascending: false });

    if (error) throw error;
    setPremios((data ?? []) as PremioPuntos[]);
  };

  useEffect(() => {
    const run = async () => {
      setErrorMsg(null);

      const rid = await getRestauranteUsuario();

      if (!rid) {
        setErrorMsg("No se encontró restaurante_id para este usuario.");
        setModuloPermitido(false);
        setLoadingCupones(false);
        setLoadingPremios(false);
        return;
      }

      setRestauranteId(rid);

      const { data: moduloData, error: moduloError } = await supabase
        .from("restaurante_modulos")
        .select("fidelizacion")
        .eq("restaurante_id", rid)
        .maybeSingle();

      if (moduloError) {
        setErrorMsg(moduloError.message);
        setModuloPermitido(false);
        setLoadingCupones(false);
        setLoadingPremios(false);
        return;
      }

      if (!moduloData?.fidelizacion) {
        setModuloPermitido(false);
        setLoadingCupones(false);
        setLoadingPremios(false);
        return;
      }

      setModuloPermitido(true);

      try {
        setLoadingCupones(true);
        setLoadingPremios(true);
        await Promise.all([cargarCupones(rid), cargarPremios(rid)]);
      } catch (e: any) {
        setErrorMsg(e?.message ?? "Error al cargar datos");
      } finally {
        setLoadingCupones(false);
        setLoadingPremios(false);
      }
    };

    run();
  }, []);

  const avisarClientesRestaurante = async ({
    tipo,
    titulo,
    mensaje,
  }: {
    tipo: "reserva" | "cupon" | "premio" | "canje" | "puntos" | "info";
    titulo: string;
    mensaje: string;
  }) => {
    if (!restauranteId || !moduloPermitido) return;

    const { data: clientesData, error: clientesError } = await supabase
      .from("clientes")
      .select("id")
      .eq("restaurante_id", restauranteId);

    if (clientesError || !clientesData?.length) return;

    const avisos = clientesData.map((cliente) => ({
      restaurante_id: restauranteId,
      cliente_id: cliente.id,
      tipo,
      titulo,
      mensaje,
      url: null,
      leida: false,
    }));

    await supabase.from("cliente_notificaciones").insert(avisos);
  };

  const crearCupon = async () => {
    if (!restauranteId || !moduloPermitido) return;

    const n = nombre.trim();
    const b = beneficio.trim();

    if (!n || !b) {
      setErrorMsg("Rellena nombre y beneficio.");
      return;
    }

    if (tipo === "horas_valle") {
      if (!horaInicio || !horaFin) {
        setErrorMsg("Rellena hora inicio y hora fin.");
        return;
      }

      if (!diasSemana.length) {
        setErrorMsg("Selecciona al menos un día.");
        return;
      }

      const x = Math.max(1, Number(cadaXVisitas) || 1);

      if (!Number.isFinite(x) || x < 1) {
        setErrorMsg("Cada X visitas debe ser 1 o más.");
        return;
      }
    }

    setSavingCupon(true);
    setErrorMsg(null);

    const condiciones = buildCondiciones();

    const { error } = await supabase.from("cupones").insert({
      restaurante_id: restauranteId,
      nombre: n,
      beneficio: b,
      condiciones,
      activo: true,
    });

    if (error) {
      setErrorMsg(error.message);
      setSavingCupon(false);
      return;
    }

    await avisarClientesRestaurante({
      tipo: "cupon",
      titulo: "Nuevo cupón disponible",
      mensaje: `El restaurante ha creado un nuevo cupón: "${n}". ${b}`,
    });

    resetCuponForm();
    setShowCuponForm(false);

    try {
      await cargarCupones(restauranteId);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Cupón creado, pero falló la recarga.");
    } finally {
      setSavingCupon(false);
    }
  };

  async function uploadPremioImageIfNeeded(rid: string) {
    if (!premioFile) return premioImagenUrl.trim() || null;

    const ext = premioFile.name.split(".").pop() || "jpg";
    const safeName = premioNombre
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "");

    const path = `${rid}/${Date.now()}-${safeName}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("premios")
      .upload(path, premioFile, {
        upsert: false,
        contentType: premioFile.type || "image/jpeg",
      });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from("premios").getPublicUrl(path);
    return data.publicUrl || null;
  }

  const upsertPremio = async () => {
    if (!restauranteId || !moduloPermitido) return;

    const n = premioNombre.trim();
    const puntos = Math.max(1, Number(premioPuntos) || 1);
    const desc = premioDescripcion.trim() || null;

    if (!n) {
      setErrorMsg("Rellena el nombre del premio.");
      return;
    }

    setSavingPremio(true);
    setErrorMsg(null);

    try {
      const img = await uploadPremioImageIfNeeded(restauranteId);

      if (editingPremioId) {
        const { error } = await supabase
          .from("premios_puntos")
          .update({
            nombre: n,
            descripcion: desc,
            puntos_requeridos: puntos,
            imagen_url: img,
            activo: premioActivo,
          })
          .eq("id", editingPremioId)
          .eq("restaurante_id", restauranteId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("premios_puntos").insert({
          restaurante_id: restauranteId,
          nombre: n,
          descripcion: desc,
          puntos_requeridos: puntos,
          imagen_url: img,
          activo: premioActivo,
        });

        if (error) throw error;

        await avisarClientesRestaurante({
          tipo: "premio",
          titulo: "Nuevo premio disponible",
          mensaje: `El restaurante ha creado un nuevo premio: "${n}" por ${puntos} puntos.`,
        });
      }

      resetPremioForm();
      setShowPremioForm(false);
      await cargarPremios(restauranteId);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error guardando premio");
    } finally {
      setSavingPremio(false);
    }
  };

  const editarPremio = (p: PremioPuntos) => {
    setEditingPremioId(p.id);
    setPremioNombre(p.nombre);
    setPremioDescripcion(p.descripcion ?? "");
    setPremioPuntos(p.puntos_requeridos);
    setPremioImagenUrl(p.imagen_url ?? "");
    setPremioFile(null);
    setPremioActivo(p.activo);
    setShowPremioForm(true);
  };

  const togglePremioActivo = async (p: PremioPuntos) => {
    if (!restauranteId || !moduloPermitido) return;

    const { error } = await supabase
      .from("premios_puntos")
      .update({ activo: !p.activo })
      .eq("id", p.id)
      .eq("restaurante_id", restauranteId);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setPremios((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x))
    );
  };

  const borrarPremio = async (p: PremioPuntos) => {
    if (!restauranteId || !moduloPermitido) return;

    const ok = window.confirm(`Eliminar "${p.nombre}"?`);
    if (!ok) return;

    const { error } = await supabase
      .from("premios_puntos")
      .delete()
      .eq("id", p.id)
      .eq("restaurante_id", restauranteId);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setPremios((prev) => prev.filter((x) => x.id !== p.id));
  };

  const TabButton = ({
    value,
    title,
    subtitle,
    count,
  }: {
    value: Tab;
    title: string;
    subtitle: string;
    count?: number;
  }) => {
    const active = tab === value;

    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        className={clsx(
          "flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition",
          active
            ? dark
              ? "border-gray-700 bg-gray-900"
              : "border-gray-300 bg-gray-50"
            : dark
            ? "border-gray-800 bg-gray-950 hover:bg-gray-900/60"
            : "border-gray-200 bg-white hover:bg-gray-50"
        )}
      >
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
            {subtitle}
          </div>
        </div>

        {typeof count === "number" ? (
          <span className={clsx("mt-0.5", pill(true))}>{count}</span>
        ) : null}
      </button>
    );
  };

  const topAction = () => {
    if (tab === "cupones") {
      return (
        <div className="flex gap-2">
          <Link href="/dashboard/fidelizacion/canjes" className={btnGhost}>
            Ver canjes
          </Link>

          <button onClick={() => setShowCuponForm((v) => !v)} className={btnPrimary}>
            {showCuponForm ? "Cerrar" : "Nuevo cupón"}
          </button>
        </div>
      );
    }

    return (
      <div className="flex gap-2">
        <Link href="/dashboard/fidelizacion/canjes" className={btnGhost}>
          Ver canjes
        </Link>

        <button
          onClick={() => {
            resetPremioForm();
            setShowPremioForm((v) => !v);
          }}
          className={btnPrimary}
        >
          {showPremioForm ? "Cerrar" : "Nuevo premio"}
        </button>
      </div>
    );
  };

  if (moduloPermitido === null) {
    return (
      <div className={pageWrap}>
        <div className={clsx(cardBase, "p-6")}>
          <p className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
            Comprobando acceso...
          </p>
        </div>
      </div>
    );
  }

  if (moduloPermitido === false) {
    return (
      <div className={pageWrap}>
        <div className={clsx(cardBase, "p-8 text-center")}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Lock size={24} />
          </div>

          <h1 className={clsx("mt-5 text-2xl font-bold", dark ? "text-gray-100" : "text-gray-900")}>
            Módulo no contratado
          </h1>

          <p className={clsx("mx-auto mt-2 max-w-md text-sm", dark ? "text-gray-400" : "text-gray-500")}>
            Este restaurante no tiene activado el módulo de fidelización.
          </p>

          <Link href="/dashboard" className={clsx("mt-6 inline-flex", btnPrimary)}>
            Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={pageWrap}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className={clsx("text-2xl font-semibold tracking-tight", dark ? "text-gray-100" : "text-gray-900")}>
            Fidelización
          </h1>
          <div className={clsx("mt-1 text-sm", dark ? "text-gray-400" : "text-gray-500")}>
            Restaurante: {restauranteId ?? "—"}
          </div>
        </div>

        {topAction()}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <TabButton
          value="premios"
          title="Premios por puntos"
          subtitle="Recompensas canjeables por puntos"
          count={loadingPremios ? undefined : premios.length}
        />
        <TabButton
          value="cupones"
          title="Cupones automáticos"
          subtitle="Cumpleaños y horas valle"
          count={loadingCupones ? undefined : cupones.length}
        />
      </div>

      {errorMsg && (
        <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {tab === "premios" && (
        <div className="mt-6">
          {showPremioForm && (
            <div className={clsx(cardBase, "p-5")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={clsx("text-sm font-semibold", dark ? "text-gray-100" : "text-gray-900")}>
                    {editingPremioId ? "Editar premio" : "Nuevo premio"}
                  </div>
                  <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Puedes subir imagen o usar URL.
                  </div>
                </div>

                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    resetPremioForm();
                    setShowPremioForm(false);
                  }}
                >
                  Cancelar
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    Nombre
                  </label>
                  <input
                    value={premioNombre}
                    onChange={(e) => setPremioNombre(e.target.value)}
                    className={inputBase}
                  />
                </div>

                <div>
                  <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    Puntos
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={premioPuntos}
                    onChange={(e) => setPremioPuntos(Number(e.target.value))}
                    className={inputBase}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    Imagen (subir)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPremioFile(e.target.files?.[0] ?? null)}
                    className={inputBase}
                  />
                  <div className={clsx("mt-2 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Si subes archivo, se guarda en Storage y se usa esa URL.
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    Imagen (URL opcional)
                  </label>
                  <input
                    value={premioImagenUrl}
                    onChange={(e) => setPremioImagenUrl(e.target.value)}
                    className={inputBase}
                    placeholder="https://..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    Descripción (opcional)
                  </label>
                  <input
                    value={premioDescripcion}
                    onChange={(e) => setPremioDescripcion(e.target.value)}
                    className={inputBase}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="premio_activo"
                    type="checkbox"
                    checked={premioActivo}
                    onChange={(e) => setPremioActivo(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <label
                    htmlFor="premio_activo"
                    className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-700")}
                  >
                    Activo
                  </label>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={upsertPremio} disabled={savingPremio} className={btnPrimary}>
                  {savingPremio
                    ? "Guardando…"
                    : editingPremioId
                    ? "Guardar cambios"
                    : "Guardar premio"}
                </button>
              </div>
            </div>
          )}

          <div className="mt-6">
            {loadingPremios ? (
              <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                Cargando…
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    resetPremioForm();
                    setShowPremioForm(true);
                  }}
                  className={clsx(
                    "group flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed p-6 transition",
                    dark
                      ? "border-gray-700 bg-gray-950 hover:bg-gray-900"
                      : "border-gray-300 bg-white hover:bg-gray-50"
                  )}
                >
                  <div
                    className={clsx(
                      "flex h-12 w-12 items-center justify-center rounded-2xl text-2xl font-semibold",
                      dark ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"
                    )}
                  >
                    +
                  </div>
                  <div className={clsx("mt-3 text-sm font-semibold", dark ? "text-gray-100" : "text-gray-900")}>
                    Añadir premio
                  </div>
                  <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Nombre, puntos e imagen
                  </div>
                </button>

                {premios.map((p) => (
                  <div key={p.id} className={clsx(cardBase, "overflow-hidden")}>
                    <div className="relative">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} alt={p.nombre} className="h-32 w-full object-cover" />
                      ) : (
                        <div
                          className={clsx(
                            "flex h-32 w-full items-center justify-center text-xs",
                            dark ? "bg-gray-900 text-gray-400" : "bg-gray-100 text-gray-500"
                          )}
                        >
                          Sin imagen
                        </div>
                      )}

                      <div className="absolute right-3 top-3">
                        <span className={pill(p.activo)}>{p.activo ? "Activo" : "Pausado"}</span>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className={clsx("text-sm font-semibold", dark ? "text-gray-100" : "text-gray-900")}>
                            {p.nombre}
                          </div>
                          {p.descripcion ? (
                            <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                              {p.descripcion}
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={clsx(
                            "shrink-0 rounded-xl px-3 py-2 text-sm font-semibold",
                            dark ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"
                          )}
                        >
                          {p.puntos_requeridos} pts
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" className={btnGhost} onClick={() => editarPremio(p)}>
                          Editar
                        </button>
                        <button type="button" className={btnGhost} onClick={() => togglePremioActivo(p)}>
                          {p.activo ? "Pausar" : "Activar"}
                        </button>
                        <button type="button" className={btnDanger} onClick={() => borrarPremio(p)}>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingPremios && premios.length === 0 && (
              <div className={clsx("mt-4 text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                No hay premios por puntos todavía.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "cupones" && (
        <div className="mt-6">
          {showCuponForm && (
            <div className={clsx(cardBase, "p-5")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={clsx("text-sm font-semibold", dark ? "text-gray-100" : "text-gray-900")}>
                    Nuevo cupón
                  </div>
                  <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Cumpleaños o horas valle.
                  </div>
                </div>

                <button type="button" className={btnGhost} onClick={() => setShowCuponForm(false)}>
                  Cancelar
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    Nombre
                  </label>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputBase} />
                </div>

                <div>
                  <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    Beneficio
                  </label>
                  <input value={beneficio} onChange={(e) => setBeneficio(e.target.value)} className={inputBase} />
                </div>

                <div className="md:col-span-2">
                  <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    Tipo
                  </label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCupon)} className={inputBase}>
                    <option value="cumpleanos">Cumpleaños</option>
                    <option value="horas_valle">Horas valle (happy hour)</option>
                  </select>
                </div>

                {tipo === "cumpleanos" && (
                  <>
                    <div>
                      <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                        Enviar X días antes
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={diasAntesCumple}
                        onChange={(e) => setDiasAntesCumple(Number(e.target.value))}
                        className={inputBase}
                      />
                    </div>

                    <div>
                      <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                        Validez (días)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={validezDiasCumple}
                        onChange={(e) => setValidezDiasCumple(Number(e.target.value))}
                        className={inputBase}
                      />
                    </div>

                    <div className={clsx("md:col-span-2 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                      El cliente debe tener fecha de nacimiento guardada.
                    </div>
                  </>
                )}

                {tipo === "horas_valle" && (
                  <div className="md:col-span-2">
                    <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                      Días válidos
                    </label>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        { d: 1, t: "L" },
                        { d: 2, t: "M" },
                        { d: 3, t: "X" },
                        { d: 4, t: "J" },
                        { d: 5, t: "V" },
                        { d: 6, t: "S" },
                        { d: 0, t: "D" },
                      ].map((x) => (
                        <button
                          key={x.d}
                          type="button"
                          onClick={() => toggleDiaSemana(x.d)}
                          className={clsx(
                            "rounded-full border px-3 py-1 text-sm transition",
                            diasSemana.includes(x.d)
                              ? dark
                                ? "border-white bg-white text-black"
                                : "border-black bg-black text-white"
                              : dark
                              ? "border-gray-800 bg-transparent text-gray-200 hover:bg-gray-900"
                              : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                          )}
                        >
                          {x.t}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                          Hora inicio
                        </label>
                        <input
                          type="time"
                          value={horaInicio}
                          onChange={(e) => setHoraInicio(e.target.value)}
                          className={inputBase}
                        />
                      </div>

                      <div>
                        <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                          Hora fin
                        </label>
                        <input
                          type="time"
                          value={horaFin}
                          onChange={(e) => setHoraFin(e.target.value)}
                          className={inputBase}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                          Cada X visitas
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={cadaXVisitas}
                          onChange={(e) => setCadaXVisitas(Number(e.target.value))}
                          className={inputBase}
                        />
                        <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                          Ej: 2 = cupón en la visita 2, 4, 6…
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={crearCupon} disabled={savingCupon} className={btnPrimary}>
                  {savingCupon ? "Guardando…" : "Guardar cupón"}
                </button>

                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    resetCuponForm();
                    setShowCuponForm(false);
                  }}
                >
                  Salir
                </button>
              </div>
            </div>
          )}

          <div className="mt-6">
            {loadingCupones ? (
              <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                Cargando…
              </div>
            ) : cupones.length === 0 ? (
              <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                No hay cupones.
              </div>
            ) : (
              <div className={clsx(cardBase, "overflow-hidden")}>
                <div className={dark ? "bg-gray-900" : "bg-gray-100"}>
                  <div
                    className={clsx(
                      "grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide",
                      dark ? "text-gray-200" : "text-gray-800"
                    )}
                  >
                    <div className="col-span-4">Nombre</div>
                    <div className="col-span-5">Beneficio</div>
                    <div className="col-span-1 text-center">Activo</div>
                    <div className="col-span-2">Creado</div>
                  </div>
                </div>

                <div>
                  {cupones.map((c) => (
                    <div
                      key={c.id}
                      className={clsx(
                        "grid grid-cols-12 gap-2 px-4 py-3 text-sm",
                        dark
                          ? "border-t border-gray-800 hover:bg-gray-900/60 text-gray-100"
                          : "border-t border-gray-200 hover:bg-gray-50 text-gray-900"
                      )}
                    >
                      <div className="col-span-4 font-medium">{c.nombre}</div>
                      <div className={clsx("col-span-5", dark ? "text-gray-200" : "text-gray-700")}>
                        {c.beneficio}
                      </div>
                      <div className="col-span-1 text-center">
                        <span className={pill(c.activo)}>{c.activo ? "Sí" : "No"}</span>
                      </div>
                      <div className={clsx("col-span-2 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                        {new Date(c.creado_en).toLocaleString("es-ES")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}