"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Save,
  Clock,
  Users,
  Plus,
  Trash2,
  MapPinned,
  Table2,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";

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

export default function AjustesPage() {
  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [restaurante, setRestaurante] = useState<any>(null);

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

  useEffect(() => {
    const cargarTodo = async () => {
      const id = await getRestauranteUsuario();
      if (!id) return;

      setRestauranteId(id);

      const { data, error } = await supabase
        .from("restaurantes")
        .select("*")
        .eq("id", id)
        .single();

      if (!error && data) {
        setRestaurante(data);
        setNombre(data.nombre || "");
        setTelefono(data.telefono || "");
        setCapacidadTotal(data.capacidad_total || 0);
        setHorarioComida(data.horario_comida || "");
        setHorarioCena(data.horario_cena || "");
        setCapacidadComida(data.capacidad_comida || 0);
        setCapacidadCena(data.capacidad_cena || 0);
        setPuntosActivo(Boolean(data.puntos_activo));

        const ppe = data.puntos_por_euro ?? 1;
        setPuntosPorEuroInput(String(ppe));
      }

      await cargarSalaData(id);
    };

    cargarTodo();
  }, []);

  const cargarSalaData = async (idParam?: string) => {
    const id = idParam || restauranteId;
    if (!id) return;

    setCargandoSala(true);

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

    if (!zonasError && zonasData) {
      setZonas(zonasData);
      if (!nuevaMesaZonaId && zonasData.length > 0) {
        setNuevaMesaZonaId(zonasData[0].id);
      }
    }

    if (!mesasError && mesasData) {
      setMesas(mesasData);
    }

    setCargandoSala(false);
  };

  const guardarCambios = async () => {
    if (!restauranteId) return;

    setGuardandoRestaurante(true);

    const normalizado = (puntosPorEuroInput || "").trim().replace(",", ".");
    const ppe = Number(normalizado);
    const puntos_por_euro = Number.isFinite(ppe) && ppe > 0 ? ppe : 1;

    const { data, error } = await supabase
      .from("restaurantes")
      .update({
        nombre,
        telefono,
        capacidad_total: capacidadTotal,
        horario_comida: horarioComida,
        horario_cena: horarioCena,
        capacidad_comida: capacidadComida,
        capacidad_cena: capacidadCena,
        puntos_activo: puntosActivo,
        puntos_por_euro,
      })
      .eq("id", restauranteId)
      .select("id,puntos_activo,puntos_por_euro");

    setGuardandoRestaurante(false);

    if (error) {
      console.log("Error guardando restaurantes:", error);
      alert("Error al guardar cambios");
      return;
    }

    if (!data || data.length === 0) {
      alert("Guardado, pero no se pudo confirmar la lectura.");
      return;
    }

    const row: any = data[0];
    setPuntosActivo(Boolean(row.puntos_activo));
    setPuntosPorEuroInput(String(row.puntos_por_euro ?? puntos_por_euro));

    alert("Cambios guardados correctamente");
  };

  const crearZona = async () => {
    if (!restauranteId) return;

    const nombreLimpio = nuevaZonaNombre.trim();
    if (!nombreLimpio) {
      alert("Escribe un nombre para la zona");
      return;
    }

    setGuardandoZona(true);

    const { error } = await supabase.from("sala_zonas").insert({
      restaurante_id: restauranteId,
      nombre: nombreLimpio,
      orden: Number.isFinite(nuevaZonaOrden) ? nuevaZonaOrden : 0,
      activa: true,
    });

    setGuardandoZona(false);

    if (error) {
      console.log("Error creando zona:", error);
      alert("Error al crear la zona");
      return;
    }

    setNuevaZonaNombre("");
    setNuevaZonaOrden(0);
    await cargarSalaData(restauranteId);
  };

  const actualizarZona = async (zonaId: string, cambios: Partial<Zona>) => {
    const payload: Partial<Zona> = {
      ...cambios,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("sala_zonas")
      .update(payload)
      .eq("id", zonaId);

    if (error) {
      console.log("Error actualizando zona:", error);
      alert("Error al guardar la zona");
      return;
    }

    await cargarSalaData();
  };

  const borrarZona = async (zonaId: string) => {
    const mesasEnZona = mesas.filter((m) => m.zona_id === zonaId).length;

    if (mesasEnZona > 0) {
      alert("No puedes borrar una zona que todavía tiene mesas");
      return;
    }

    const ok = window.confirm("¿Seguro que quieres borrar esta zona?");
    if (!ok) return;

    const { error } = await supabase.from("sala_zonas").delete().eq("id", zonaId);

    if (error) {
      console.log("Error borrando zona:", error);
      alert("Error al borrar la zona");
      return;
    }

    if (nuevaMesaZonaId === zonaId) {
      setNuevaMesaZonaId("");
    }

    await cargarSalaData();
  };

  const crearMesa = async () => {
    if (!restauranteId) return;

    const nombreLimpio = nuevaMesaNombre.trim();
    if (!nombreLimpio) {
      alert("Escribe un nombre para la mesa");
      return;
    }

    if (!nuevaMesaZonaId) {
      alert("Selecciona una zona");
      return;
    }

    if (!nuevaMesaCapacidad || nuevaMesaCapacidad < 1) {
      alert("La capacidad debe ser mayor que 0");
      return;
    }

    setGuardandoMesa(true);

    const { error } = await supabase.from("sala_mesas").insert({
      restaurante_id: restauranteId,
      zona_id: nuevaMesaZonaId,
      nombre: nombreLimpio,
      capacidad: nuevaMesaCapacidad,
      orden: Number.isFinite(nuevaMesaOrden) ? nuevaMesaOrden : 0,
      activa: true,
      bloqueada: false,
    });

    setGuardandoMesa(false);

    if (error) {
      console.log("Error creando mesa:", error);
      alert("Error al crear la mesa");
      return;
    }

    setNuevaMesaNombre("");
    setNuevaMesaCapacidad(2);
    setNuevaMesaOrden(0);
    await cargarSalaData(restauranteId);
  };

  const actualizarMesa = async (mesaId: string, cambios: Partial<Mesa>) => {
    const payload: Partial<Mesa> = {
      ...cambios,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("sala_mesas")
      .update(payload)
      .eq("id", mesaId);

    if (error) {
      console.log("Error actualizando mesa:", error);
      alert("Error al guardar la mesa");
      return;
    }

    await cargarSalaData();
  };

  const borrarMesa = async (mesaId: string) => {
    const ok = window.confirm("¿Seguro que quieres borrar esta mesa?");
    if (!ok) return;

    const { error } = await supabase.from("sala_mesas").delete().eq("id", mesaId);

    if (error) {
      console.log("Error borrando mesa:", error);
      alert("Error al borrar la mesa");
      return;
    }

    await cargarSalaData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-wider">
          Ajustes
        </h1>
        <p className="text-sm opacity-70">Configuración del restaurante</p>
      </div>

      <div className="card rounded-2xl p-5">
        <p className="text-sm font-bold uppercase mb-4">
          Datos del restaurante
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold opacity-70">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
            />
          </div>

          <div>
            <label className="text-xs font-semibold opacity-70">Teléfono</label>
            <input
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
            />
          </div>

          <div>
            <label className="text-xs font-semibold opacity-70">
              Capacidad total
            </label>
            <input
              type="number"
              value={capacidadTotal}
              onChange={(e) => setCapacidadTotal(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
            />
          </div>
        </div>
      </div>

      <div className="card rounded-2xl p-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-bold uppercase">Puntos</p>
            <p className="text-xs opacity-70 mt-1">
              puntos = suelo(gasto € × puntos/€). Si no se introduce gasto, no suma
              puntos.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div>
            <label className="text-xs font-semibold opacity-70">
              Activar puntos
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="puntos_activo"
                type="checkbox"
                checked={puntosActivo}
                onChange={(e) => setPuntosActivo(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="puntos_activo" className="text-sm">
                {puntosActivo ? "Activado" : "Desactivado"}
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold opacity-70">
              Puntos por €
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={puntosPorEuroInput}
              onChange={(e) => setPuntosPorEuroInput(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
              placeholder="Ej: 1 o 0.5"
            />
            <p className="text-xs opacity-60 mt-2">
              Usa punto decimal (0.5). Si escribes coma, se convierte al guardar.
            </p>
          </div>
        </div>
      </div>

      <div className="card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} />
          <p className="text-sm font-bold uppercase">Horarios</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold opacity-70">Comida</label>
            <input
              type="text"
              value={horarioComida}
              onChange={(e) => setHorarioComida(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
            />
          </div>

          <div>
            <label className="text-xs font-semibold opacity-70">Cena</label>
            <input
              type="text"
              value={horarioCena}
              onChange={(e) => setHorarioCena(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
            />
          </div>
        </div>
      </div>

      <div className="card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} />
          <p className="text-sm font-bold uppercase">Ocupación por turnos</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold opacity-70">
              Capacidad comida
            </label>
            <input
              type="number"
              value={capacidadComida}
              onChange={(e) => setCapacidadComida(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
            />
          </div>

          <div>
            <label className="text-xs font-semibold opacity-70">
              Capacidad cena
            </label>
            <input
              type="number"
              value={capacidadCena}
              onChange={(e) => setCapacidadCena(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
            />
          </div>
        </div>
      </div>

      <div className="card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPinned size={16} />
          <p className="text-sm font-bold uppercase">Zonas y mesas</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border p-4">
            <p className="text-sm font-bold uppercase mb-4">Crear zona</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold opacity-70">Nombre</label>
                <input
                  type="text"
                  value={nuevaZonaNombre}
                  onChange={(e) => setNuevaZonaNombre(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                  placeholder="Ej: Sala, Terraza, Interior..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold opacity-70">Orden</label>
                <input
                  type="number"
                  value={nuevaZonaOrden}
                  onChange={(e) => setNuevaZonaOrden(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={crearZona}
                disabled={guardandoZona}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90 dark:bg-white dark:text-black disabled:opacity-50"
              >
                <Plus size={14} />
                {guardandoZona ? "Guardando..." : "Crear zona"}
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {zonasOrdenadas.length === 0 && (
                <p className="text-sm opacity-60">Todavía no hay zonas creadas.</p>
              )}

              {zonasOrdenadas.map((zona) => (
                <div key={zona.id} className="rounded-xl border p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold opacity-70">
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={zona.nombre}
                        onChange={(e) => {
                          const value = e.target.value;
                          setZonas((prev) =>
                            prev.map((z) =>
                              z.id === zona.id ? { ...z, nombre: value } : z
                            )
                          );
                        }}
                        onBlur={() =>
                          actualizarZona(zona.id, { nombre: zona.nombre.trim() })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold opacity-70">
                        Orden
                      </label>
                      <input
                        type="number"
                        value={zona.orden}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setZonas((prev) =>
                            prev.map((z) =>
                              z.id === zona.id ? { ...z, orden: value } : z
                            )
                          );
                        }}
                        onBlur={() =>
                          actualizarZona(zona.id, { orden: zona.orden || 0 })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                      />
                    </div>

                    <div className="flex items-end gap-3">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={zona.activa}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setZonas((prev) =>
                              prev.map((z) =>
                                z.id === zona.id ? { ...z, activa: checked } : z
                              )
                            );
                            actualizarZona(zona.id, { activa: checked });
                          }}
                        />
                        Activa
                      </label>

                      <button
                        onClick={() => borrarZona(zona.id)}
                        className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 size={14} />
                        Borrar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="flex items-center gap-2 mb-4">
              <Table2 size={16} />
              <p className="text-sm font-bold uppercase">Crear mesa</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold opacity-70">Nombre</label>
                <input
                  type="text"
                  value={nuevaMesaNombre}
                  onChange={(e) => setNuevaMesaNombre(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                  placeholder="Ej: M1, Terraza 2..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold opacity-70">Zona</label>
                <select
                  value={nuevaMesaZonaId}
                  onChange={(e) => setNuevaMesaZonaId(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                >
                  <option value="">Selecciona una zona</option>
                  {zonasOrdenadas.map((zona) => (
                    <option key={zona.id} value={zona.id}>
                      {zona.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold opacity-70">
                  Capacidad
                </label>
                <input
                  type="number"
                  min={1}
                  value={nuevaMesaCapacidad}
                  onChange={(e) => setNuevaMesaCapacidad(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                />
              </div>

              <div>
                <label className="text-xs font-semibold opacity-70">Orden</label>
                <input
                  type="number"
                  value={nuevaMesaOrden}
                  onChange={(e) => setNuevaMesaOrden(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={crearMesa}
                disabled={guardandoMesa || zonasOrdenadas.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90 dark:bg-white dark:text-black disabled:opacity-50"
              >
                <Plus size={14} />
                {guardandoMesa ? "Guardando..." : "Crear mesa"}
              </button>
            </div>

            {zonasOrdenadas.length === 0 && (
              <p className="text-sm opacity-60 mt-4">
                Primero crea al menos una zona para poder crear mesas.
              </p>
            )}

            <div className="mt-6 space-y-3">
              {cargandoSala && (
                <p className="text-sm opacity-60">Cargando zonas y mesas...</p>
              )}

              {!cargandoSala && mesasOrdenadas.length === 0 && (
                <p className="text-sm opacity-60">Todavía no hay mesas creadas.</p>
              )}

              {mesasOrdenadas.map((mesa) => (
                <div key={mesa.id} className="rounded-xl border p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                    <div>
                      <label className="text-xs font-semibold opacity-70">
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={mesa.nombre}
                        onChange={(e) => {
                          const value = e.target.value;
                          setMesas((prev) =>
                            prev.map((m) =>
                              m.id === mesa.id ? { ...m, nombre: value } : m
                            )
                          );
                        }}
                        onBlur={() =>
                          actualizarMesa(mesa.id, { nombre: mesa.nombre.trim() })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold opacity-70">
                        Zona
                      </label>
                      <select
                        value={mesa.zona_id ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setMesas((prev) =>
                            prev.map((m) =>
                              m.id === mesa.id ? { ...m, zona_id: value } : m
                            )
                          );
                          actualizarMesa(mesa.id, { zona_id: value });
                        }}
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
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
                      <label className="text-xs font-semibold opacity-70">
                        Capacidad
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={mesa.capacidad}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setMesas((prev) =>
                            prev.map((m) =>
                              m.id === mesa.id ? { ...m, capacidad: value } : m
                            )
                          );
                        }}
                        onBlur={() =>
                          actualizarMesa(mesa.id, {
                            capacidad: mesa.capacidad < 1 ? 1 : mesa.capacidad,
                          })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold opacity-70">
                        Orden
                      </label>
                      <input
                        type="number"
                        value={mesa.orden}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setMesas((prev) =>
                            prev.map((m) =>
                              m.id === mesa.id ? { ...m, orden: value } : m
                            )
                          );
                        }}
                        onBlur={() =>
                          actualizarMesa(mesa.id, { orden: mesa.orden || 0 })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:bg-transparent dark:border-gray-700"
                      />
                    </div>

                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={mesa.activa}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setMesas((prev) =>
                              prev.map((m) =>
                                m.id === mesa.id ? { ...m, activa: checked } : m
                              )
                            );
                            actualizarMesa(mesa.id, { activa: checked });
                          }}
                        />
                        Activa
                      </label>
                    </div>

                    <div className="flex items-end gap-3">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={mesa.bloqueada}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setMesas((prev) =>
                              prev.map((m) =>
                                m.id === mesa.id
                                  ? { ...m, bloqueada: checked }
                                  : m
                              )
                            );
                            actualizarMesa(mesa.id, { bloqueada: checked });
                          }}
                        />
                        Bloqueada
                      </label>

                      <button
                        onClick={() => borrarMesa(mesa.id)}
                        className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 size={14} />
                        Borrar
                      </button>
                    </div>
                  </div>

                  <p className="text-xs opacity-60">
                    Zona actual:{" "}
                    {zonas.find((z) => z.id === mesa.zona_id)?.nombre || "Sin zona"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={guardarCambios}
          disabled={guardandoRestaurante}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90 dark:bg-white dark:text-black disabled:opacity-50"
        >
          <Save size={14} />
          {guardandoRestaurante ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}