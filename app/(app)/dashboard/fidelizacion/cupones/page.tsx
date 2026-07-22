"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { useTheme } from "@/app/(app)/components/ThemeProvider";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { getRestauranteUsuario } from "@/app/(app)/lib/getRestauranteUsuario";

type NivelCliente = "nuevo" | "frecuente" | "habitual" | "vip" | "maestro";
type TipoCupon = "cumpleanos" | "horas_valle";
type Tab = "premios" | "cupones";

type ConfigFidelizacion = {
  puntos_por_euro: number;
  nivel_frecuente_desde: number;
  nivel_habitual_desde: number;
  nivel_vip_desde: number;
  nivel_maestro_desde: number;
};

type Cupon = {
  id: string;
  nombre: string;
  beneficio: string;
  condiciones: any;
  nivel_minimo: NivelCliente;
  activo: boolean;
  creado_en: string;
};

type PremioPuntos = {
  id: string;
  nombre: string;
  descripcion: string | null;
  puntos_requeridos: number;
  imagen_url: string | null;
  nivel_minimo: NivelCliente;
  activo: boolean;
  creado_en: string;
};

const NIVELES: Array<{ value: NivelCliente; label: string; desc: string }> = [
  { value: "nuevo", label: "Nuevo", desc: "Disponible para todos" },
  { value: "frecuente", label: "Frecuente", desc: "Cliente que empieza a repetir" },
  { value: "habitual", label: "Habitual", desc: "Cliente recurrente" },
  { value: "vip", label: "VIP", desc: "Mejores clientes" },
  { value: "maestro", label: "Maestro", desc: "Máxima fidelidad" },
];

function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function nivelLabel(nivel?: string | null) {
  return NIVELES.find((n) => n.value === nivel)?.label ?? "Nuevo";
}

function nivelRank(nivel?: string | null) {
  if (nivel === "maestro") return 5;
  if (nivel === "vip") return 4;
  if (nivel === "habitual") return 3;
  if (nivel === "frecuente") return 2;
  return 1;
}

function tipoCuponLabel(condiciones: any) {
  if (condiciones?.tipo === "horas_valle") return "Horas valle";
  if (condiciones?.tipo === "cumpleanos") return "Cumpleaños";
  return "Automático";
}

export default function CuponesPage() {
  const { dark } = useTheme();

  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [moduloPermitido, setModuloPermitido] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("premios");

  const [config, setConfig] = useState<ConfigFidelizacion>({
    puntos_por_euro: 1,
    nivel_frecuente_desde: 2,
    nivel_habitual_desde: 5,
    nivel_vip_desde: 10,
    nivel_maestro_desde: 20,
  });

  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [premios, setPremios] = useState<PremioPuntos[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showCuponForm, setShowCuponForm] = useState(false);
  const [editingCuponId, setEditingCuponId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [beneficio, setBeneficio] = useState("");
  const [tipo, setTipo] = useState<TipoCupon>("cumpleanos");
  const [cuponNivel, setCuponNivel] = useState<NivelCliente>("nuevo");
  const [validezDiasCumple, setValidezDiasCumple] = useState<number>(7);
  const [diasAntesCumple, setDiasAntesCumple] = useState<number>(0);
  const [diasSemana, setDiasSemana] = useState<number[]>([1, 2, 3, 4]);
  const [horaInicio, setHoraInicio] = useState<string>("20:00");
  const [horaFin, setHoraFin] = useState<string>("21:00");
  const [cadaXVisitas, setCadaXVisitas] = useState<number>(2);
  const [savingCupon, setSavingCupon] = useState(false);

  const [showPremioForm, setShowPremioForm] = useState(false);
  const [editingPremioId, setEditingPremioId] = useState<string | null>(null);
  const [premioNombre, setPremioNombre] = useState("");
  const [premioDescripcion, setPremioDescripcion] = useState("");
  const [premioPuntos, setPremioPuntos] = useState<number>(100);
  const [premioImagenUrl, setPremioImagenUrl] = useState("");
  const [premioFile, setPremioFile] = useState<File | null>(null);
  const [premioNivel, setPremioNivel] = useState<NivelCliente>("nuevo");
  const [premioActivo, setPremioActivo] = useState(true);
  const [savingPremio, setSavingPremio] = useState(false);

  const pageWrap = "mx-auto max-w-7xl p-6";

  const cardBase = useMemo(
    () =>
      clsx(
        "rounded-3xl border shadow-sm",
        dark ? "border-gray-800 bg-gray-950 text-gray-100" : "border-gray-200 bg-white text-gray-950"
      ),
    [dark]
  );

  const btnPrimary = useMemo(
    () =>
      clsx(
        "rounded-xl px-4 py-2 text-sm font-black transition disabled:opacity-60",
        dark ? "bg-white text-black hover:opacity-90" : "bg-black text-white hover:opacity-90"
      ),
    [dark]
  );

  const btnGhost = useMemo(
    () =>
      clsx(
        "rounded-xl border px-4 py-2 text-sm font-bold transition disabled:opacity-60",
        dark
          ? "border-gray-800 bg-transparent text-gray-100 hover:bg-gray-900"
          : "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
      ),
    [dark]
  );

  const btnDanger = useMemo(
    () =>
      clsx(
        "rounded-xl border px-4 py-2 text-sm font-bold transition",
        dark
          ? "border-gray-800 bg-transparent text-red-300 hover:bg-gray-900"
          : "border-gray-200 bg-white text-red-600 hover:bg-red-50"
      ),
    [dark]
  );

  const inputBase = useMemo(
    () =>
      clsx(
        "mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none",
        dark
          ? "border-gray-800 bg-gray-950 text-gray-100 placeholder:text-gray-500 focus:border-gray-700"
          : "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-400"
      ),
    [dark]
  );

  const smallText = dark ? "text-gray-400" : "text-slate-500";

  const nivelBadge = (nivel: NivelCliente) => {
    const base = "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black";
    if (nivel === "vip") return clsx(base, "bg-purple-100 text-purple-700");
    if (nivel === "habitual") return clsx(base, "bg-amber-100 text-amber-700");
    if (nivel === "frecuente") return clsx(base, "bg-blue-100 text-blue-700");
    return clsx(base, "bg-slate-100 text-slate-700");
  };

  const activeBadge = (active: boolean) =>
    clsx(
      "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black",
      active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
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
    setEditingCuponId(null);
    setNombre("");
    setBeneficio("");
    setTipo("cumpleanos");
    setCuponNivel("nuevo");
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
    setPremioNivel("nuevo");
    setPremioActivo(true);
  };

  const cargarTodo = async (rid: string) => {
    const [cuponesRes, premiosRes, configRes] = await Promise.all([
      supabase
        .from("cupones")
        .select("id,nombre,beneficio,condiciones,nivel_minimo,activo,creado_en")
        .eq("restaurante_id", rid)
        .order("creado_en", { ascending: false }),
      supabase
        .from("premios_puntos")
        .select("id,nombre,descripcion,puntos_requeridos,imagen_url,nivel_minimo,activo,creado_en")
        .eq("restaurante_id", rid)
        .order("creado_en", { ascending: false }),
      supabase
        .from("fidelizacion_config")
        .select("puntos_por_euro,nivel_frecuente_desde,nivel_habitual_desde,nivel_vip_desde,nivel_maestro_desde")
        .eq("restaurante_id", rid)
        .maybeSingle(),
    ]);

    if (cuponesRes.error) throw cuponesRes.error;
    if (premiosRes.error) throw premiosRes.error;
    if (configRes.error) throw configRes.error;

    setCupones((cuponesRes.data ?? []) as Cupon[]);
    setPremios((premiosRes.data ?? []) as PremioPuntos[]);
    if (configRes.data) setConfig(configRes.data as ConfigFidelizacion);
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErrorMsg(null);

      const rid = await getRestauranteUsuario();
      if (!rid) {
        setModuloPermitido(false);
        setErrorMsg("No se encontró restaurante asociado.");
        setLoading(false);
        return;
      }

      setRestauranteId(rid);

      const { data: moduloData, error: moduloError } = await supabase
        .from("restaurante_modulos")
        .select("fidelizacion")
        .eq("restaurante_id", rid)
        .maybeSingle();

      if (moduloError) {
        setModuloPermitido(false);
        setErrorMsg(moduloError.message);
        setLoading(false);
        return;
      }

      if (!moduloData?.fidelizacion) {
        setModuloPermitido(false);
        setLoading(false);
        return;
      }

      setModuloPermitido(true);

      try {
        await cargarTodo(rid);
      } catch (e: any) {
        setErrorMsg(e?.message ?? "Error cargando fidelización.");
      } finally {
        setLoading(false);
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

  const guardarCupon = async () => {
    if (!restauranteId || !moduloPermitido) return;

    const n = nombre.trim();
    const b = beneficio.trim();

    if (!n || !b) {
      setErrorMsg("Rellena nombre y beneficio.");
      return;
    }

    if (tipo === "horas_valle" && (!horaInicio || !horaFin || !diasSemana.length)) {
      setErrorMsg("Configura días y horas para el cupón de horas valle.");
      return;
    }

    setSavingCupon(true);
    setErrorMsg(null);

    try {
      const payload = {
        nombre: n,
        beneficio: b,
        condiciones: buildCondiciones(),
        nivel_minimo: cuponNivel,
        activo: true,
      };

      if (editingCuponId) {
        const { error } = await supabase
          .from("cupones")
          .update(payload)
          .eq("id", editingCuponId)
          .eq("restaurante_id", restauranteId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cupones").insert({
          restaurante_id: restauranteId,
          ...payload,
        });
        if (error) throw error;

        await avisarClientesRestaurante({
          tipo: "cupon",
          titulo: "Nueva ventaja disponible",
          mensaje: `Hay una nueva ventaja para clientes ${nivelLabel(cuponNivel)}: ${n}. ${b}`,
        });
      }

      resetCuponForm();
      setShowCuponForm(false);
      await cargarTodo(restauranteId);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error guardando cupón.");
    } finally {
      setSavingCupon(false);
    }
  };

  const editarCupon = (c: Cupon) => {
    const cond = c.condiciones ?? {};
    setEditingCuponId(c.id);
    setNombre(c.nombre);
    setBeneficio(c.beneficio);
    setTipo(cond.tipo === "horas_valle" ? "horas_valle" : "cumpleanos");
    setCuponNivel(c.nivel_minimo ?? "nuevo");
    setValidezDiasCumple(Number(cond.validez_dias ?? 7));
    setDiasAntesCumple(Number(cond.dias_antes ?? 0));
    setDiasSemana(Array.isArray(cond.dias_semana) ? cond.dias_semana : [1, 2, 3, 4]);
    setHoraInicio(String(cond.hora_inicio ?? "20:00"));
    setHoraFin(String(cond.hora_fin ?? "21:00"));
    setCadaXVisitas(Number(cond.cada_x_visitas ?? 2));
    setShowCuponForm(true);
    setTab("cupones");
  };

  const toggleCuponActivo = async (c: Cupon) => {
    if (!restauranteId || !moduloPermitido) return;

    const { error } = await supabase
      .from("cupones")
      .update({ activo: !c.activo })
      .eq("id", c.id)
      .eq("restaurante_id", restauranteId);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setCupones((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo: !x.activo } : x)));
  };

  const borrarCupon = async (c: Cupon) => {
    if (!restauranteId || !moduloPermitido) return;
    const ok = window.confirm(`Eliminar "${c.nombre}"?`);
    if (!ok) return;

    const { error } = await supabase
      .from("cupones")
      .delete()
      .eq("id", c.id)
      .eq("restaurante_id", restauranteId);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setCupones((prev) => prev.filter((x) => x.id !== c.id));
  };

  async function uploadPremioImageIfNeeded(rid: string) {
    if (!premioFile) return premioImagenUrl.trim() || null;

    const tiposPermitidos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!tiposPermitidos.includes(premioFile.type)) {
      throw new Error("La imagen debe ser JPG, PNG, WEBP o GIF.");
    }
    if (premioFile.size > 5 * 1024 * 1024) {
      throw new Error("La imagen no puede superar los 5 MB.");
    }

    const ext = premioFile.name.split(".").pop() || "jpg";
    const safeName = premioNombre
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "");

    const path = `${rid}/${Date.now()}-${safeName || "premio"}.${ext}`;

    const { error: upErr } = await supabase.storage.from("premios").upload(path, premioFile, {
      upsert: false,
      contentType: premioFile.type || "image/jpeg",
    });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from("premios").getPublicUrl(path);
    return data.publicUrl || null;
  }

  const guardarPremio = async () => {
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
      const payload = {
        nombre: n,
        descripcion: desc,
        puntos_requeridos: puntos,
        imagen_url: img,
        nivel_minimo: premioNivel,
        activo: premioActivo,
      };

      if (editingPremioId) {
        const { error } = await supabase
          .from("premios_puntos")
          .update(payload)
          .eq("id", editingPremioId)
          .eq("restaurante_id", restauranteId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("premios_puntos").insert({
          restaurante_id: restauranteId,
          ...payload,
        });
        if (error) throw error;

        await avisarClientesRestaurante({
          tipo: "premio",
          titulo: "Nuevo premio disponible",
          mensaje: `Nuevo premio para clientes ${nivelLabel(premioNivel)}: ${n} por ${puntos} puntos.`,
        });
      }

      resetPremioForm();
      setShowPremioForm(false);
      await cargarTodo(restauranteId);
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error guardando premio.");
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
    setPremioNivel(p.nivel_minimo ?? "nuevo");
    setPremioActivo(p.activo);
    setShowPremioForm(true);
    setTab("premios");
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

    setPremios((prev) => prev.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x)));
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

  const estadisticas = useMemo(() => {
    const premiosActivos = premios.filter((p) => p.activo).length;
    const cuponesActivos = cupones.filter((c) => c.activo).length;
    const ventajasVip = [...premios, ...cupones].filter((x: any) => x.nivel_minimo === "vip").length;
    const maxNivel = [...premios, ...cupones]
      .map((x: any) => x.nivel_minimo as NivelCliente)
      .sort((a, b) => nivelRank(b) - nivelRank(a))[0];

    return { premiosActivos, cuponesActivos, ventajasVip, maxNivel: maxNivel ?? "nuevo" };
  }, [premios, cupones]);

  const abrirNuevoPremio = () => {
    resetPremioForm();
    setShowPremioForm(true);
    setShowCuponForm(false);
    setTab("premios");
  };

  const abrirNuevoCupon = () => {
    resetCuponForm();
    setShowCuponForm(true);
    setShowPremioForm(false);
    setTab("cupones");
  };

  if (moduloPermitido === null) {
    return (
      <div className={pageWrap}>
        <div className={clsx(cardBase, "p-6 text-sm font-bold", smallText)}>Cargando fidelización…</div>
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
          <h1 className="mt-5 text-2xl font-black">Módulo no contratado</h1>
          <p className={clsx("mx-auto mt-2 max-w-md text-sm", smallText)}>
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
      <div
        className={clsx(
          "rounded-[2rem] border p-6 shadow-sm",
          dark
            ? "border-gray-800 bg-gradient-to-br from-gray-950 to-gray-900"
            : "border-slate-200 bg-gradient-to-br from-white to-slate-50"
        )}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              Fidelización y ventajas
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">Programa de fidelización</h1>
            <p className={clsx("mt-2 max-w-2xl text-sm font-semibold", smallText)}>
              Crea premios por puntos y ventajas por nivel para que el cliente vuelva más veces.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/fidelizacion/canjes" className={btnGhost}>
              Ver canjes
            </Link>
            <Link href="/clientes" className={btnGhost}>
              Configurar niveles
            </Link>
            <button type="button" onClick={tab === "premios" ? abrirNuevoPremio : abrirNuevoCupon} className={btnPrimary}>
              {tab === "premios" ? "Nuevo premio" : "Nuevo cupón"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <StatCard title="Premios activos" value={estadisticas.premiosActivos} subtitle="Canjeables por puntos" />
          <StatCard title="Cupones activos" value={estadisticas.cuponesActivos} subtitle="Ventajas automáticas" />
          <StatCard title="Ventajas VIP" value={estadisticas.ventajasVip} subtitle="Solo mejores clientes" />
          <StatCard title="Puntos por euro" value={config.puntos_por_euro || 1} subtitle="Base del restaurante" />
        </div>

        <div className="mt-5 grid gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-900 md:grid-cols-5">
          <div>Nuevo: 0-{Math.max(0, config.nivel_frecuente_desde - 1)} visitas</div>
          <div>Frecuente: desde {config.nivel_frecuente_desde}</div>
          <div>Habitual: desde {config.nivel_habitual_desde}</div>
          <div>VIP: desde {config.nivel_vip_desde}</div>
          <div>Maestro: desde {config.nivel_maestro_desde}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("premios")}
          className={clsx(
            "rounded-2xl px-5 py-3 text-sm font-black transition",
            tab === "premios" ? "bg-blue-600 text-white" : dark ? "bg-gray-900 text-gray-200" : "bg-white text-slate-800"
          )}
        >
          Premios por puntos · {premios.length}
        </button>
        <button
          type="button"
          onClick={() => setTab("cupones")}
          className={clsx(
            "rounded-2xl px-5 py-3 text-sm font-black transition",
            tab === "cupones" ? "bg-blue-600 text-white" : dark ? "bg-gray-900 text-gray-200" : "bg-white text-slate-800"
          )}
        >
          Cupones y ventajas · {cupones.length}
        </button>
      </div>

      {errorMsg && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{errorMsg}</div>}

      {loading ? (
        <div className={clsx(cardBase, "mt-6 p-6 text-sm font-bold", smallText)}>Cargando…</div>
      ) : null}

      {tab === "premios" && !loading ? (
        <div className="mt-6">
          {showPremioForm ? (
            <EditorPremio
              cardBase={cardBase}
              btnGhost={btnGhost}
              btnPrimary={btnPrimary}
              inputBase={inputBase}
              smallText={smallText}
              editing={Boolean(editingPremioId)}
              nombre={premioNombre}
              setNombre={setPremioNombre}
              descripcion={premioDescripcion}
              setDescripcion={setPremioDescripcion}
              puntos={premioPuntos}
              setPuntos={setPremioPuntos}
              imagenUrl={premioImagenUrl}
              setImagenUrl={setPremioImagenUrl}
              setFile={setPremioFile}
              nivel={premioNivel}
              setNivel={setPremioNivel}
              activo={premioActivo}
              setActivo={setPremioActivo}
              saving={savingPremio}
              onSave={guardarPremio}
              onCancel={() => {
                resetPremioForm();
                setShowPremioForm(false);
              }}
            />
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <CreateCard title="Añadir premio" subtitle="Premio por puntos y nivel" onClick={abrirNuevoPremio} dark={dark} />
            {premios.map((p) => (
              <div key={p.id} className={clsx(cardBase, "overflow-hidden")}>
                <div className="relative">
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt={p.nombre} className="h-36 w-full object-cover" />
                  ) : (
                    <div className={clsx("flex h-36 w-full items-center justify-center text-xs font-bold", dark ? "bg-gray-900 text-gray-400" : "bg-slate-100 text-slate-500")}>
                      Sin imagen
                    </div>
                  )}
                  <div className="absolute left-3 top-3 flex gap-2">
                    <span className={activeBadge(p.activo)}>{p.activo ? "Activo" : "Pausado"}</span>
                    <span className={nivelBadge(p.nivel_minimo)}>{nivelLabel(p.nivel_minimo)}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-black">{p.nombre}</div>
                      <div className={clsx("mt-1 text-sm font-semibold", smallText)}>{p.descripcion || "Sin descripción"}</div>
                    </div>
                    <div className={clsx("shrink-0 rounded-2xl px-3 py-2 text-sm font-black", dark ? "bg-gray-900" : "bg-slate-100")}>
                      {p.puntos_requeridos} pts
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className={btnGhost} onClick={() => editarPremio(p)}>Editar</button>
                    <button type="button" className={btnGhost} onClick={() => togglePremioActivo(p)}>{p.activo ? "Pausar" : "Activar"}</button>
                    <button type="button" className={btnDanger} onClick={() => borrarPremio(p)}>Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "cupones" && !loading ? (
        <div className="mt-6">
          {showCuponForm ? (
            <EditorCupon
              cardBase={cardBase}
              btnGhost={btnGhost}
              btnPrimary={btnPrimary}
              inputBase={inputBase}
              smallText={smallText}
              editing={Boolean(editingCuponId)}
              nombre={nombre}
              setNombre={setNombre}
              beneficio={beneficio}
              setBeneficio={setBeneficio}
              tipo={tipo}
              setTipo={setTipo}
              nivel={cuponNivel}
              setNivel={setCuponNivel}
              validezDiasCumple={validezDiasCumple}
              setValidezDiasCumple={setValidezDiasCumple}
              diasAntesCumple={diasAntesCumple}
              setDiasAntesCumple={setDiasAntesCumple}
              diasSemana={diasSemana}
              toggleDiaSemana={toggleDiaSemana}
              horaInicio={horaInicio}
              setHoraInicio={setHoraInicio}
              horaFin={horaFin}
              setHoraFin={setHoraFin}
              cadaXVisitas={cadaXVisitas}
              setCadaXVisitas={setCadaXVisitas}
              saving={savingCupon}
              onSave={guardarCupon}
              onCancel={() => {
                resetCuponForm();
                setShowCuponForm(false);
              }}
            />
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <CreateCard title="Añadir cupón" subtitle="Ventaja por nivel o condición" onClick={abrirNuevoCupon} dark={dark} />
            {cupones.map((c) => (
              <div key={c.id} className={clsx(cardBase, "p-5")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={activeBadge(c.activo)}>{c.activo ? "Activo" : "Pausado"}</span>
                      <span className={nivelBadge(c.nivel_minimo)}>{nivelLabel(c.nivel_minimo)}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-black">{c.nombre}</h3>
                    <p className={clsx("mt-1 text-sm font-semibold", smallText)}>{c.beneficio}</p>
                  </div>
                  <div className={clsx("rounded-2xl px-3 py-2 text-xs font-black", dark ? "bg-gray-900" : "bg-slate-100")}>
                    {tipoCuponLabel(c.condiciones)}
                  </div>
                </div>

                <div className={clsx("mt-5 rounded-2xl p-4 text-xs font-bold", dark ? "bg-gray-900 text-gray-300" : "bg-slate-50 text-slate-600")}>
                  {c.condiciones?.tipo === "horas_valle" ? (
                    <span>
                      Válido de {c.condiciones?.hora_inicio ?? "—"} a {c.condiciones?.hora_fin ?? "—"}. Cada {c.condiciones?.cada_x_visitas ?? 1} visitas.
                    </span>
                  ) : (
                    <span>
                      Cumpleaños · {c.condiciones?.dias_antes ?? 0} días antes · {c.condiciones?.validez_dias ?? 7} días de validez.
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={btnGhost} onClick={() => editarCupon(c)}>Editar</button>
                  <button type="button" className={btnGhost} onClick={() => toggleCuponActivo(c)}>{c.activo ? "Pausar" : "Activar"}</button>
                  <button type="button" className={btnDanger} onClick={() => borrarCupon(c)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  function StatCard({ title, value, subtitle }: { title: string; value: number | string; subtitle: string }) {
    return (
      <div className={clsx("rounded-2xl border p-4", dark ? "border-gray-800 bg-gray-950/60" : "border-slate-200 bg-white")}>
        <div className={clsx("text-xs font-black uppercase tracking-[0.14em]", smallText)}>{title}</div>
        <div className="mt-2 text-2xl font-black">{value}</div>
        <div className={clsx("mt-1 text-xs font-bold", smallText)}>{subtitle}</div>
      </div>
    );
  }
}

function CreateCard({ title, subtitle, onClick, dark }: { title: string; subtitle: string; onClick: () => void; dark: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group flex min-h-[210px] flex-col items-center justify-center rounded-3xl border border-dashed p-6 text-center transition",
        dark ? "border-gray-700 bg-gray-950 hover:bg-gray-900" : "border-slate-300 bg-white hover:bg-slate-50"
      )}
    >
      <div className={clsx("flex h-14 w-14 items-center justify-center rounded-2xl text-3xl font-black", dark ? "bg-gray-900" : "bg-slate-100")}>
        +
      </div>
      <div className="mt-4 text-base font-black">{title}</div>
      <div className={clsx("mt-1 text-xs font-bold", dark ? "text-gray-400" : "text-slate-500")}>{subtitle}</div>
    </button>
  );
}

function NivelSelect({
  value,
  onChange,
  inputBase,
}: {
  value: NivelCliente;
  onChange: (v: NivelCliente) => void;
  inputBase: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as NivelCliente)} className={inputBase}>
      {NIVELES.map((n) => (
        <option key={n.value} value={n.value}>
          {n.label} · {n.desc}
        </option>
      ))}
    </select>
  );
}

function EditorPremio(props: {
  cardBase: string;
  btnGhost: string;
  btnPrimary: string;
  inputBase: string;
  smallText: string;
  editing: boolean;
  nombre: string;
  setNombre: (v: string) => void;
  descripcion: string;
  setDescripcion: (v: string) => void;
  puntos: number;
  setPuntos: (v: number) => void;
  imagenUrl: string;
  setImagenUrl: (v: string) => void;
  setFile: (v: File | null) => void;
  nivel: NivelCliente;
  setNivel: (v: NivelCliente) => void;
  activo: boolean;
  setActivo: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={clsx(props.cardBase, "p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black">{props.editing ? "Editar premio" : "Nuevo premio"}</div>
          <div className={clsx("mt-1 text-sm font-semibold", props.smallText)}>
            Elige puntos, imagen y nivel mínimo para desbloquearlo.
          </div>
        </div>
        <button type="button" className={props.btnGhost} onClick={props.onCancel}>Cancelar</button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Nombre" inputBase={props.inputBase} value={props.nombre} onChange={props.setNombre} />
        <div>
          <Label>Puntos necesarios</Label>
          <input type="number" min={1} value={props.puntos} onChange={(e) => props.setPuntos(Number(e.target.value))} className={props.inputBase} />
        </div>
        <div>
          <Label>Nivel mínimo</Label>
          <NivelSelect value={props.nivel} onChange={props.setNivel} inputBase={props.inputBase} />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <input id="premio_activo" type="checkbox" checked={props.activo} onChange={(e) => props.setActivo(e.target.checked)} className="h-4 w-4" />
          <label htmlFor="premio_activo" className="text-sm font-bold">Activo en app cliente</label>
        </div>
        <div className="md:col-span-2">
          <Label>Descripción</Label>
          <input value={props.descripcion} onChange={(e) => props.setDescripcion(e.target.value)} className={props.inputBase} placeholder="Ej: Postre gratis para clientes habituales" />
        </div>
        <div>
          <Label>Imagen subida</Label>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => props.setFile(e.target.files?.[0] ?? null)} className={props.inputBase} />
        </div>
        <div>
          <Label>Imagen por URL</Label>
          <input value={props.imagenUrl} onChange={(e) => props.setImagenUrl(e.target.value)} className={props.inputBase} placeholder="https://..." />
        </div>
      </div>

      <div className="mt-5">
        <button type="button" className={props.btnPrimary} onClick={props.onSave} disabled={props.saving}>
          {props.saving ? "Guardando…" : props.editing ? "Guardar cambios" : "Crear premio"}
        </button>
      </div>
    </div>
  );
}

function EditorCupon(props: {
  cardBase: string;
  btnGhost: string;
  btnPrimary: string;
  inputBase: string;
  smallText: string;
  editing: boolean;
  nombre: string;
  setNombre: (v: string) => void;
  beneficio: string;
  setBeneficio: (v: string) => void;
  tipo: TipoCupon;
  setTipo: (v: TipoCupon) => void;
  nivel: NivelCliente;
  setNivel: (v: NivelCliente) => void;
  validezDiasCumple: number;
  setValidezDiasCumple: (v: number) => void;
  diasAntesCumple: number;
  setDiasAntesCumple: (v: number) => void;
  diasSemana: number[];
  toggleDiaSemana: (d: number) => void;
  horaInicio: string;
  setHoraInicio: (v: string) => void;
  horaFin: string;
  setHoraFin: (v: string) => void;
  cadaXVisitas: number;
  setCadaXVisitas: (v: number) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={clsx(props.cardBase, "p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black">{props.editing ? "Editar cupón" : "Nuevo cupón"}</div>
          <div className={clsx("mt-1 text-sm font-semibold", props.smallText)}>
            Crea ventajas por cumpleaños, horas valle o nivel de cliente.
          </div>
        </div>
        <button type="button" className={props.btnGhost} onClick={props.onCancel}>Cancelar</button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Nombre" inputBase={props.inputBase} value={props.nombre} onChange={props.setNombre} />
        <Field label="Beneficio" inputBase={props.inputBase} value={props.beneficio} onChange={props.setBeneficio} />
        <div>
          <Label>Tipo</Label>
          <select value={props.tipo} onChange={(e) => props.setTipo(e.target.value as TipoCupon)} className={props.inputBase}>
            <option value="cumpleanos">Cumpleaños</option>
            <option value="horas_valle">Horas valle</option>
          </select>
        </div>
        <div>
          <Label>Nivel mínimo</Label>
          <NivelSelect value={props.nivel} onChange={props.setNivel} inputBase={props.inputBase} />
        </div>

        {props.tipo === "cumpleanos" ? (
          <>
            <div>
              <Label>Enviar X días antes</Label>
              <input type="number" min={0} value={props.diasAntesCumple} onChange={(e) => props.setDiasAntesCumple(Number(e.target.value))} className={props.inputBase} />
            </div>
            <div>
              <Label>Validez en días</Label>
              <input type="number" min={1} value={props.validezDiasCumple} onChange={(e) => props.setValidezDiasCumple(Number(e.target.value))} className={props.inputBase} />
            </div>
          </>
        ) : (
          <div className="md:col-span-2">
            <Label>Días válidos</Label>
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
                  onClick={() => props.toggleDiaSemana(x.d)}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-sm font-black transition",
                    props.diasSemana.includes(x.d) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"
                  )}
                >
                  {x.t}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <Label>Hora inicio</Label>
                <input type="time" value={props.horaInicio} onChange={(e) => props.setHoraInicio(e.target.value)} className={props.inputBase} />
              </div>
              <div>
                <Label>Hora fin</Label>
                <input type="time" value={props.horaFin} onChange={(e) => props.setHoraFin(e.target.value)} className={props.inputBase} />
              </div>
              <div>
                <Label>Cada X visitas</Label>
                <input type="number" min={1} value={props.cadaXVisitas} onChange={(e) => props.setCadaXVisitas(Number(e.target.value))} className={props.inputBase} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5">
        <button type="button" className={props.btnPrimary} onClick={props.onSave} disabled={props.saving}>
          {props.saving ? "Guardando…" : props.editing ? "Guardar cambios" : "Crear cupón"}
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-black text-slate-700">{children}</label>;
}

function Field({ label, inputBase, value, onChange }: { label: string; inputBase: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputBase} />
    </div>
  );
}
