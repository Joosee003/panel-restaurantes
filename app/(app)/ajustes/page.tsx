"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Clock,
  Gift,
  LayoutGrid,
  Loader2,
  MapPinned,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Store,
  Table2,
  Trash2,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useRestaurante } from "../../hooks/useRestaurante";
import WebReservasSettings from "./WebReservasSettings";

type Zona = {
  id: string;
  restaurante_id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  created_at?: string;
  updated_at?: string;
};

type Mesa = {
  id: string;
  restaurante_id: string;
  zona_id: string | null;
  nombre: string;
  capacidad: number;
  orden: number;
  activa: boolean;
  bloqueada: boolean;
  created_at?: string;
  updated_at?: string;
};

type RestauranteConfig = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  capacidad_total: number | null;
  capacidad_comida: number | null;
  capacidad_cena: number | null;
  horario_comida: string | null;
  horario_cena: string | null;
  puntos_activo: boolean | null;
  puntos_por_euro: number | null;
};

type TabKey = "general" | "web" | "fidelizacion" | "reservas" | "sala";

const inputClass =
  "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400";

const smallInputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400";

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePuntos(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatPuntos(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function zonaNombre(zonas: Zona[], zonaId: string | null) {
  if (!zonaId) return "Sin zona";
  return zonas.find((z) => z.id === zonaId)?.nombre || "Sin zona";
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            {value}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">{sub}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  eyebrow,
  children,
  icon,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        {icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            {icon}
          </div>
        ) : null}
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-xl font-black tracking-tight text-slate-950">
            {title}
          </h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function AjustesPage() {
  const { data: restauranteActivo, isLoading } = useRestaurante();

  const [tab, setTab] = useState<TabKey>("general");
  const [restaurante, setRestaurante] = useState<RestauranteConfig | null>(null);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [capacidadTotal, setCapacidadTotal] = useState<number>(0);
  const [horarioComida, setHorarioComida] = useState("");
  const [horarioCena, setHorarioCena] = useState("");
  const [capacidadComida, setCapacidadComida] = useState<number>(0);
  const [capacidadCena, setCapacidadCena] = useState<number>(0);

  const [puntosActivo, setPuntosActivo] = useState<boolean>(false);
  const [puntosPorEuroInput, setPuntosPorEuroInput] = useState<string>("1");

  const [zonas, setZonas] = useState<Zona[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);

  const [nuevaZonaNombre, setNuevaZonaNombre] = useState("");
  const [nuevaZonaOrden, setNuevaZonaOrden] = useState<number>(0);

  const [nuevaMesaNombre, setNuevaMesaNombre] = useState("");
  const [nuevaMesaCapacidad, setNuevaMesaCapacidad] = useState<number>(2);
  const [nuevaMesaOrden, setNuevaMesaOrden] = useState<number>(0);
  const [nuevaMesaZonaId, setNuevaMesaZonaId] = useState<string>("");

  const [guardandoRestaurante, setGuardandoRestaurante] = useState(false);
  const [guardandoZona, setGuardandoZona] = useState(false);
  const [guardandoMesa, setGuardandoMesa] = useState(false);
  const [cargandoSala, setCargandoSala] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const restauranteId = restauranteActivo?.id ?? null;

  const zonasOrdenadas = useMemo(() => {
    return [...zonas].sort((a, b) => {
      if (a.orden !== b.orden) return a.orden - b.orden;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [zonas]);

  const mesasOrdenadas = useMemo(() => {
    return [...mesas].sort((a, b) => {
      const zonaA = zonas.find((z) => z.id === a.zona_id)?.orden ?? 999999;
      const zonaB = zonas.find((z) => z.id === b.zona_id)?.orden ?? 999999;

      if (zonaA !== zonaB) return zonaA - zonaB;
      if (a.orden !== b.orden) return a.orden - b.orden;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [mesas, zonas]);

  const mesasActivas = useMemo(
    () => mesas.filter((mesa) => mesa.activa),
    [mesas]
  );

  const mesasBloqueadas = useMemo(
    () => mesas.filter((mesa) => mesa.bloqueada),
    [mesas]
  );

  const capacidadMesasActivas = useMemo(
    () => mesasActivas.reduce((total, mesa) => total + toNumber(mesa.capacidad), 0),
    [mesasActivas]
  );

  const setupWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!nombre.trim()) warnings.push("Falta el nombre del restaurante");
    if (!telefono.trim()) warnings.push("Falta el teléfono del restaurante");
    if (!horarioComida.trim() && !horarioCena.trim()) warnings.push("Faltan horarios de comida/cena");
    if (zonasOrdenadas.length === 0) warnings.push("No hay zonas creadas");
    if (mesasActivas.length === 0) warnings.push("No hay mesas activas");
    if (!puntosActivo) warnings.push("Puntos de fidelización desactivados");
    return warnings;
  }, [nombre, telefono, horarioComida, horarioCena, zonasOrdenadas.length, mesasActivas.length, puntosActivo]);

  useEffect(() => {
    if (!restauranteActivo?.id) return;

    const data = restauranteActivo as RestauranteConfig;
    setRestaurante(data);
    setNombre(data.nombre || "");
    setTelefono(data.telefono || "");
    setCapacidadTotal(toNumber(data.capacidad_total));
    setHorarioComida(data.horario_comida || "");
    setHorarioCena(data.horario_cena || "");
    setCapacidadComida(toNumber(data.capacidad_comida));
    setCapacidadCena(toNumber(data.capacidad_cena));
    setPuntosActivo(Boolean(data.puntos_activo));
    setPuntosPorEuroInput(formatPuntos(toNumber(data.puntos_por_euro, 1)));
    void cargarSalaData(data.id);
  }, [restauranteActivo?.id]);

  async function cargarSalaData(idParam?: string) {
    const id = idParam || restauranteId;
    if (!id) return;

    setCargandoSala(true);
    setErrorMsg(null);

    const [{ data: zonasData, error: zonasError }, { data: mesasData, error: mesasError }] =
      await Promise.all([
        supabase
          .from("sala_zonas")
          .select("*")
          .eq("restaurante_id", id)
          .order("orden", { ascending: true })
          .order("nombre", { ascending: true }),
        supabase
          .from("sala_mesas")
          .select("*")
          .eq("restaurante_id", id)
          .order("orden", { ascending: true })
          .order("nombre", { ascending: true }),
      ]);

    if (zonasError || mesasError) {
      console.log("Error cargando sala:", zonasError || mesasError);
      setErrorMsg("No se pudieron cargar zonas y mesas.");
    }

    if (!zonasError && zonasData) {
      setZonas(zonasData as Zona[]);
      if (!nuevaMesaZonaId && zonasData.length > 0) {
        setNuevaMesaZonaId(zonasData[0].id);
      }
    }

    if (!mesasError && mesasData) {
      setMesas(mesasData as Mesa[]);
    }

    setCargandoSala(false);
  }

  const guardarCambios = async () => {
    if (!restauranteId) return;

    setGuardandoRestaurante(true);
    setMensaje(null);
    setErrorMsg(null);

    const puntos_por_euro = parsePuntos(puntosPorEuroInput);

    const { data, error } = await supabase
      .from("restaurantes")
      .update({
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        capacidad_total: toNumber(capacidadTotal),
        horario_comida: horarioComida.trim(),
        horario_cena: horarioCena.trim(),
        capacidad_comida: toNumber(capacidadComida),
        capacidad_cena: toNumber(capacidadCena),
        puntos_activo: puntosActivo,
        puntos_por_euro,
      })
      .eq("id", restauranteId)
      .select("id,nombre,telefono,capacidad_total,horario_comida,horario_cena,capacidad_comida,capacidad_cena,puntos_activo,puntos_por_euro")
      .maybeSingle();

    if (error) {
      console.log("Error guardando restaurantes:", error);
      setErrorMsg("Error al guardar la configuración general.");
      setGuardandoRestaurante(false);
      return;
    }

    const { error: configError } = await supabase.from("fidelizacion_config").upsert(
      {
        restaurante_id: restauranteId,
        puntos_por_euro,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "restaurante_id" }
    );

    setGuardandoRestaurante(false);

    if (configError) {
      console.log("Error guardando fidelizacion_config:", configError);
      setErrorMsg("Se guardó el restaurante, pero falló la configuración de puntos.");
      return;
    }

    if (data) {
      const row = data as RestauranteConfig;
      setRestaurante(row);
      setPuntosActivo(Boolean(row.puntos_activo));
      setPuntosPorEuroInput(formatPuntos(toNumber(row.puntos_por_euro, puntos_por_euro)));
    }

    setMensaje("Configuración guardada correctamente.");
  };

  const crearZona = async () => {
    if (!restauranteId) return;

    const nombreLimpio = nuevaZonaNombre.trim();
    if (!nombreLimpio) {
      setErrorMsg("Escribe un nombre para la zona.");
      return;
    }

    setGuardandoZona(true);
    setMensaje(null);
    setErrorMsg(null);

    const { error } = await supabase.from("sala_zonas").insert({
      restaurante_id: restauranteId,
      nombre: nombreLimpio,
      orden: toNumber(nuevaZonaOrden),
      activa: true,
    });

    setGuardandoZona(false);

    if (error) {
      console.log("Error creando zona:", error);
      setErrorMsg("Error al crear la zona.");
      return;
    }

    setNuevaZonaNombre("");
    setNuevaZonaOrden(0);
    setMensaje("Zona creada.");
    await cargarSalaData(restauranteId);
  };

  const actualizarZona = async (zonaId: string, cambios: Partial<Zona>) => {
    if (typeof cambios.nombre === "string" && !cambios.nombre.trim()) {
      setErrorMsg("El nombre de la zona no puede estar vacío.");
      await cargarSalaData();
      return;
    }

    const payload: Partial<Zona> = {
      ...cambios,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("sala_zonas").update(payload).eq("id", zonaId);

    if (error) {
      console.log("Error actualizando zona:", error);
      setErrorMsg("Error al guardar la zona.");
      return;
    }

    setMensaje("Zona actualizada.");
    await cargarSalaData();
  };

  const borrarZona = async (zonaId: string) => {
    const mesasEnZona = mesas.filter((m) => m.zona_id === zonaId).length;

    if (mesasEnZona > 0) {
      setErrorMsg("No puedes borrar una zona que todavía tiene mesas. Mueve o borra las mesas antes.");
      return;
    }

    const ok = window.confirm("¿Seguro que quieres borrar esta zona?");
    if (!ok) return;

    const { error } = await supabase.from("sala_zonas").delete().eq("id", zonaId);

    if (error) {
      console.log("Error borrando zona:", error);
      setErrorMsg("Error al borrar la zona.");
      return;
    }

    if (nuevaMesaZonaId === zonaId) {
      setNuevaMesaZonaId("");
    }

    setMensaje("Zona borrada.");
    await cargarSalaData();
  };

  const crearMesa = async () => {
    if (!restauranteId) return;

    const nombreLimpio = nuevaMesaNombre.trim();
    if (!nombreLimpio) {
      setErrorMsg("Escribe un nombre para la mesa.");
      return;
    }

    if (!nuevaMesaZonaId) {
      setErrorMsg("Selecciona una zona para la mesa.");
      return;
    }

    if (!nuevaMesaCapacidad || nuevaMesaCapacidad < 1) {
      setErrorMsg("La capacidad debe ser mayor que 0.");
      return;
    }

    setGuardandoMesa(true);
    setMensaje(null);
    setErrorMsg(null);

    const { error } = await supabase.from("sala_mesas").insert({
      restaurante_id: restauranteId,
      zona_id: nuevaMesaZonaId,
      nombre: nombreLimpio,
      capacidad: toNumber(nuevaMesaCapacidad, 2),
      orden: toNumber(nuevaMesaOrden),
      activa: true,
      bloqueada: false,
    });

    setGuardandoMesa(false);

    if (error) {
      console.log("Error creando mesa:", error);
      setErrorMsg("Error al crear la mesa.");
      return;
    }

    setNuevaMesaNombre("");
    setNuevaMesaCapacidad(2);
    setNuevaMesaOrden(0);
    setMensaje("Mesa creada.");
    await cargarSalaData(restauranteId);
  };

  const actualizarMesa = async (mesaId: string, cambios: Partial<Mesa>) => {
    if (typeof cambios.nombre === "string" && !cambios.nombre.trim()) {
      setErrorMsg("El nombre de la mesa no puede estar vacío.");
      await cargarSalaData();
      return;
    }

    const payload: Partial<Mesa> = {
      ...cambios,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("sala_mesas").update(payload).eq("id", mesaId);

    if (error) {
      console.log("Error actualizando mesa:", error);
      setErrorMsg("Error al guardar la mesa.");
      return;
    }

    setMensaje("Mesa actualizada.");
    await cargarSalaData();
  };

  const borrarMesa = async (mesaId: string) => {
    const ok = window.confirm("¿Seguro que quieres borrar esta mesa? Si tiene reservas antiguas, mejor desactívala.");
    if (!ok) return;

    const { error } = await supabase.from("sala_mesas").delete().eq("id", mesaId);

    if (error) {
      console.log("Error borrando mesa:", error);
      setErrorMsg("Error al borrar la mesa. Si tiene reservas asociadas, desactívala en vez de borrarla.");
      return;
    }

    setMensaje("Mesa borrada.");
    await cargarSalaData();
  };

  const tabs: { key: TabKey; label: string; description: string }[] = [
    { key: "general", label: "General", description: "Datos básicos" },
    { key: "web", label: "Web + reservas", description: "Página pública" },
    { key: "fidelizacion", label: "Puntos", description: "Fidelización" },
    { key: "reservas", label: "Reservas", description: "Horarios y capacidad" },
    { key: "sala", label: "Sala", description: "Zonas y mesas" },
  ];

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-600 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          Cargando ajustes...
        </div>
      </div>
    );
  }

  if (!restauranteId) {
    return (
      <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <div className="flex items-center gap-3 font-black">
          <AlertTriangle className="h-5 w-5" />
          No se encontró restaurante activo.
        </div>
        <p className="mt-2 text-sm font-semibold">
          Entra en el admin y pulsa “Usar en panel” sobre el restaurante que quieras configurar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 text-slate-950">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
              <Settings2 className="h-3.5 w-3.5" />
              Configuración del restaurante
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Ajustes
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
              Configura datos, puntos, horarios y sala sin tocar Supabase manualmente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void cargarSalaData(restauranteId)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar sala
            </button>
            <button
              onClick={guardarCambios}
              disabled={guardandoRestaurante}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {guardandoRestaurante ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {guardandoRestaurante ? "Guardando..." : "Guardar ajustes"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Restaurante"
            value={nombre || restaurante?.nombre || "Sin nombre"}
            sub="Datos visibles en panel"
            icon={<Store className="h-5 w-5" />}
          />
          <StatCard
            label="Mesas activas"
            value={mesasActivas.length}
            sub={`${capacidadMesasActivas} plazas configuradas`}
            icon={<LayoutGrid className="h-5 w-5" />}
          />
          <StatCard
            label="Puntos"
            value={puntosActivo ? `${puntosPorEuroInput}/€` : "OFF"}
            sub={puntosActivo ? "Fidelización activa" : "No suma puntos"}
            icon={<Gift className="h-5 w-5" />}
          />
          <StatCard
            label="Revisar"
            value={setupWarnings.length}
            sub="Avisos de configuración"
            icon={<AlertTriangle className="h-5 w-5" />}
          />
        </div>

        {(mensaje || errorMsg || setupWarnings.length > 0) && (
          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {mensaje ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
                {mensaje}
              </div>
            ) : null}
            {errorMsg ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {errorMsg}
              </div>
            ) : null}
            {setupWarnings.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 lg:col-span-2">
                <span className="font-black">Avisos:</span> {setupWarnings.join(" · ")}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`rounded-2xl px-4 py-3 text-left transition ${
                  active
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="text-sm font-black">{item.label}</div>
                <div className={`text-xs font-bold ${active ? "text-blue-100" : "text-slate-400"}`}>
                  {item.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "general" && (
        <SectionCard title="Datos del restaurante" eyebrow="General" icon={<Store className="h-5 w-5" />}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className={inputClass}
                placeholder="Ej: Restaurante La Plaza"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Teléfono</label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className={inputClass}
                placeholder="Ej: 964 000 000"
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Capacidad total</label>
              <input
                type="number"
                min={0}
                value={capacidadTotal}
                onChange={(e) => setCapacidadTotal(toNumber(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            Esta información se usa como base para reservas, sala, dashboard y configuración comercial del restaurante.
          </div>
        </SectionCard>
      )}

      {tab === "web" && (
        <WebReservasSettings
          restauranteId={restauranteId}
          restaurantName={nombre || restaurante?.nombre || "Restaurante"}
        />
      )}

      {tab === "fidelizacion" && (
        <SectionCard title="Puntos de fidelización" eyebrow="Clientes" icon={<Gift className="h-5 w-5" />}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-black text-slate-950">Estado del sistema</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Controla si los consumos de reservas generan puntos en la app cliente.
              </p>

              <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <p className="text-sm font-black text-slate-950">Activar puntos</p>
                  <p className="text-xs font-semibold text-slate-500">
                    Si está apagado, los consumos no suman puntos.
                  </p>
                </div>
                <input
                  id="puntos_activo"
                  type="checkbox"
                  checked={puntosActivo}
                  onChange={(e) => setPuntosActivo(e.target.checked)}
                  className="h-5 w-5 accent-blue-600"
                />
              </label>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Puntos por euro gastado</label>
              <input
                type="text"
                inputMode="decimal"
                value={puntosPorEuroInput}
                onChange={(e) => setPuntosPorEuroInput(e.target.value)}
                className={inputClass}
                placeholder="Ej: 1, 2 o 0.5"
              />
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[20, 40, 75].map((importe) => {
                  const puntos = Math.floor(importe * parsePuntos(puntosPorEuroInput));
                  return (
                    <div key={importe} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Ticket {importe}€</p>
                      <p className="mt-2 text-2xl font-black text-slate-950">{puntos} pts</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs font-semibold text-slate-500">
                Se guarda también en la configuración de fidelización para que reservas, clientes y app cliente usen el mismo cálculo.
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {tab === "reservas" && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SectionCard title="Horarios de servicio" eyebrow="Reservas" icon={<Clock className="h-5 w-5" />}>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Comida</label>
                <input
                  type="text"
                  value={horarioComida}
                  onChange={(e) => setHorarioComida(e.target.value)}
                  className={inputClass}
                  placeholder="Ej: 13:30-15:30"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Cena</label>
                <input
                  type="text"
                  value={horarioCena}
                  onChange={(e) => setHorarioCena(e.target.value)}
                  className={inputClass}
                  placeholder="Ej: 20:00-23:30"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Ocupación por turno" eyebrow="Capacidad" icon={<Users className="h-5 w-5" />}>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Capacidad comida</label>
                <input
                  type="number"
                  min={0}
                  value={capacidadComida}
                  onChange={(e) => setCapacidadComida(toNumber(e.target.value))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Capacidad cena</label>
                <input
                  type="number"
                  min={0}
                  value={capacidadCena}
                  onChange={(e) => setCapacidadCena(toNumber(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </SectionCard>
        </div>
      )}

      {tab === "sala" && (
        <SectionCard title="Zonas y mesas" eyebrow="Sala" icon={<MapPinned className="h-5 w-5" />}>
          <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Zonas</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{zonasOrdenadas.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Mesas</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{mesas.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Activas</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{mesasActivas.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Bloqueadas</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{mesasBloqueadas.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-black text-slate-950">Crear zona</p>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Agrupa las mesas por espacios, por ejemplo Sala, Terraza o Interior.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Nombre de la zona
                    </span>
                    <input
                      type="text"
                      value={nuevaZonaNombre}
                      onChange={(e) => setNuevaZonaNombre(e.target.value)}
                      className={smallInputClass}
                      placeholder="Ej: Sala, Terraza..."
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Orden visual
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={nuevaZonaOrden}
                      onChange={(e) => setNuevaZonaOrden(toNumber(e.target.value))}
                      className={smallInputClass}
                      placeholder="Ej: 1"
                    />
                    <span className="mt-1 block text-[10px] font-semibold text-slate-400">Posición en la lista</span>
                  </label>
                </div>
                <button
                  onClick={crearZona}
                  disabled={guardandoZona}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {guardandoZona ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {guardandoZona ? "Creando..." : "Crear zona"}
                </button>
              </div>

              <div className="space-y-3">
                {zonasOrdenadas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">
                    Todavía no hay zonas creadas.
                  </div>
                ) : null}

                {zonasOrdenadas.map((zona) => {
                  const mesasZona = mesas.filter((mesa) => mesa.zona_id === zona.id).length;
                  return (
                    <div key={zona.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Zona</label>
                          <input
                            type="text"
                            value={zona.nombre}
                            onChange={(e) => {
                              const value = e.target.value;
                              setZonas((prev) => prev.map((z) => (z.id === zona.id ? { ...z, nombre: value } : z)));
                            }}
                            onBlur={() => actualizarZona(zona.id, { nombre: zona.nombre.trim() })}
                            className={smallInputClass}
                          />
                        </div>
                        <div className="w-full sm:w-28">
                          <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Orden</label>
                          <input
                            type="number"
                            value={zona.orden}
                            onChange={(e) => {
                              const value = toNumber(e.target.value);
                              setZonas((prev) => prev.map((z) => (z.id === zona.id ? { ...z, orden: value } : z)));
                            }}
                            onBlur={() => actualizarZona(zona.id, { orden: toNumber(zona.orden) })}
                            className={smallInputClass}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{mesasZona} mesas</span>
                          <label className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                            <input
                              type="checkbox"
                              checked={zona.activa}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setZonas((prev) => prev.map((z) => (z.id === zona.id ? { ...z, activa: checked } : z)));
                                void actualizarZona(zona.id, { activa: checked });
                              }}
                              className="accent-blue-600"
                            />
                            Activa
                          </label>
                        </div>
                        <button
                          onClick={() => borrarZona(zona.id)}
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Borrar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-black text-slate-950">Crear mesa</p>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Indica dónde está, cuántas personas admite y en qué posición aparece.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Nombre de la mesa
                    </span>
                    <input
                      type="text"
                      value={nuevaMesaNombre}
                      onChange={(e) => setNuevaMesaNombre(e.target.value)}
                      className={smallInputClass}
                      placeholder="Ej: M1, T2, Barra 1..."
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Zona donde está
                    </span>
                    <select
                      value={nuevaMesaZonaId}
                      onChange={(e) => setNuevaMesaZonaId(e.target.value)}
                      className={smallInputClass}
                    >
                      <option value="">Selecciona zona</option>
                      {zonasOrdenadas.map((zona) => (
                        <option key={zona.id} value={zona.id}>
                          {zona.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Capacidad
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={nuevaMesaCapacidad}
                      onChange={(e) => setNuevaMesaCapacidad(toNumber(e.target.value, 2))}
                      className={smallInputClass}
                      placeholder="Ej: 4"
                    />
                    <span className="mt-1 block text-[10px] font-semibold text-slate-400">Número de personas</span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Orden visual
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={nuevaMesaOrden}
                      onChange={(e) => setNuevaMesaOrden(toNumber(e.target.value))}
                      className={smallInputClass}
                      placeholder="Ej: 1"
                    />
                    <span className="mt-1 block text-[10px] font-semibold text-slate-400">Posición dentro de la zona</span>
                  </label>
                </div>

                <button
                  onClick={crearMesa}
                  disabled={guardandoMesa || zonasOrdenadas.length === 0}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {guardandoMesa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {guardandoMesa ? "Creando..." : "Crear mesa"}
                </button>
              </div>

              <div className="space-y-3">
                {cargandoSala ? (
                  <div className="rounded-2xl border border-slate-200 p-5 text-sm font-bold text-slate-500">
                    Cargando mesas...
                  </div>
                ) : null}

                {!cargandoSala && mesasOrdenadas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">
                    Todavía no hay mesas creadas.
                  </div>
                ) : null}

                {mesasOrdenadas.map((mesa) => (
                  <div key={mesa.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_110px_110px]">
                      <div>
                        <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Mesa</label>
                        <input
                          type="text"
                          value={mesa.nombre}
                          onChange={(e) => {
                            const value = e.target.value;
                            setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, nombre: value } : m)));
                          }}
                          onBlur={() => actualizarMesa(mesa.id, { nombre: mesa.nombre.trim() })}
                          className={smallInputClass}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Zona</label>
                        <select
                          value={mesa.zona_id ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, zona_id: value } : m)));
                            void actualizarMesa(mesa.id, { zona_id: value });
                          }}
                          className={smallInputClass}
                        >
                          <option value="">Sin zona</option>
                          {zonasOrdenadas.map((zona) => (
                            <option key={zona.id} value={zona.id}>
                              {zona.nombre}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Personas</label>
                        <input
                          type="number"
                          min={1}
                          value={mesa.capacidad}
                          onChange={(e) => {
                            const value = toNumber(e.target.value, 1);
                            setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, capacidad: value } : m)));
                          }}
                          onBlur={() => actualizarMesa(mesa.id, { capacidad: mesa.capacidad < 1 ? 1 : mesa.capacidad })}
                          className={smallInputClass}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-black uppercase tracking-wide text-slate-400">Orden</label>
                        <input
                          type="number"
                          value={mesa.orden}
                          onChange={(e) => {
                            const value = toNumber(e.target.value);
                            setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, orden: value } : m)));
                          }}
                          onBlur={() => actualizarMesa(mesa.id, { orden: toNumber(mesa.orden) })}
                          className={smallInputClass}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                          {zonaNombre(zonas, mesa.zona_id)}
                        </span>
                        <label className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                          <input
                            type="checkbox"
                            checked={mesa.activa}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, activa: checked } : m)));
                              void actualizarMesa(mesa.id, { activa: checked });
                            }}
                            className="accent-emerald-600"
                          />
                          Activa
                        </label>
                        <label className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                          <input
                            type="checkbox"
                            checked={mesa.bloqueada}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, bloqueada: checked } : m)));
                              void actualizarMesa(mesa.id, { bloqueada: checked });
                            }}
                            className="accent-amber-600"
                          />
                          Bloqueada
                        </label>
                      </div>

                      <button
                        onClick={() => borrarMesa(mesa.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Borrar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-600">
            <BadgeCheck className="h-5 w-5 text-blue-600" />
            Los cambios generales se guardan con el botón “Guardar ajustes”. Zonas y mesas se guardan al editar o crear.
          </div>
          <button
            onClick={guardarCambios}
            disabled={guardandoRestaurante}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {guardandoRestaurante ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar ajustes
          </button>
        </div>
      </div>
    </div>
  );
}
