"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Euro,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  PlusCircle,
  RefreshCw,
  Save,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useRestaurante } from "../../../hooks/useRestaurante";

type Carta = {
  id: string;
  nombre: string;
  public_token: string;
  restaurante_id: string;
};

type OpcionMenu = {
  nombre: string;
  descripcion?: string;
};

type SeccionMenu = {
  nombre: string;
  opciones: OpcionMenu[];
};

type MenuDia = {
  id: string;
  restaurante_id: string;
  carta_id: string | null;
  titulo: string;
  descripcion: string | null;
  precio: number;
  activo: boolean;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  dias_semana: number[] | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  secciones: SeccionMenu[] | null;
  traducciones?: Record<string, unknown> | null;
  orden: number;
};

type FormMenu = {
  titulo: string;
  descripcion: string;
  precio: string;
  activo: boolean;
  fecha_desde: string;
  fecha_hasta: string;
  hora_inicio: string;
  hora_fin: string;
  dias_semana: number[];
  orden: string;
  secciones: SeccionMenu[];
};

const diasSemana = [
  { id: 1, label: "L", nombre: "Lunes" },
  { id: 2, label: "M", nombre: "Martes" },
  { id: 3, label: "X", nombre: "Miércoles" },
  { id: 4, label: "J", nombre: "Jueves" },
  { id: 5, label: "V", nombre: "Viernes" },
  { id: 6, label: "S", nombre: "Sábado" },
  { id: 0, label: "D", nombre: "Domingo" },
];

const seccionesIniciales: SeccionMenu[] = [
  {
    nombre: "Primeros",
    opciones: [
      { nombre: "Ensalada mixta", descripcion: "Tomate, lechuga y atún" },
      { nombre: "Gazpacho", descripcion: "Casero y frío" },
    ],
  },
  {
    nombre: "Segundos",
    opciones: [
      { nombre: "Pollo a la brasa", descripcion: "Con patatas" },
      { nombre: "Arroz del día", descripcion: "Consultar variedad" },
    ],
  },
  {
    nombre: "Postres",
    opciones: [
      { nombre: "Tarta de queso", descripcion: "Casera" },
      { nombre: "Café", descripcion: "Incluido" },
    ],
  },
];

const formInicial: FormMenu = {
  titulo: "Menú del día",
  descripcion: "Primer plato, segundo, postre y bebida.",
  precio: "14.90",
  activo: true,
  fecha_desde: "",
  fecha_hasta: "",
  hora_inicio: "12:00",
  hora_fin: "16:00",
  dias_semana: [1, 2, 3, 4, 5],
  orden: "1",
  secciones: seccionesIniciales,
};

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clonarSecciones(secciones: SeccionMenu[]) {
  return secciones.map((seccion) => ({
    nombre: seccion.nombre,
    opciones: seccion.opciones.map((opcion) => ({ ...opcion })),
  }));
}

function normalizarSecciones(valor: unknown): SeccionMenu[] {
  if (!Array.isArray(valor)) return clonarSecciones(seccionesIniciales);

  const limpias = valor
    .map((seccion: any) => ({
      nombre: String(seccion?.nombre || "Sección").trim(),
      opciones: Array.isArray(seccion?.opciones)
        ? seccion.opciones.map((opcion: any) => ({
            nombre: String(opcion?.nombre || "").trim(),
            descripcion: String(opcion?.descripcion || "").trim(),
          }))
        : [],
    }))
    .filter((seccion: SeccionMenu) => seccion.nombre);

  return limpias.length > 0 ? limpias : clonarSecciones(seccionesIniciales);
}

function limpiarSecciones(secciones: SeccionMenu[]) {
  return secciones
    .map((seccion) => ({
      nombre: seccion.nombre.trim(),
      opciones: seccion.opciones
        .map((opcion) => ({
          nombre: opcion.nombre.trim(),
          descripcion: (opcion.descripcion || "").trim(),
        }))
        .filter((opcion) => opcion.nombre),
    }))
    .filter((seccion) => seccion.nombre && seccion.opciones.length > 0);
}

function fechaHoyISO() {
  const ahora = new Date();
  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, "0");
  const day = String(ahora.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function horaInput(valor: string | null | undefined) {
  if (!valor) return "";
  return String(valor).slice(0, 5);
}

function precioTexto(valor: number | string | null | undefined) {
  const n = Number(valor || 0);
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diasTexto(dias: number[] | null | undefined) {
  if (!dias || dias.length === 0) return "Todos los días";
  return diasSemana
    .filter((dia) => dias.includes(dia.id))
    .map((dia) => dia.label)
    .join(" · ");
}

function menuVigenteHoy(menu: MenuDia) {
  if (!menu.activo) return false;
  const hoy = fechaHoyISO();
  const dia = new Date().getDay();
  if (menu.fecha_desde && menu.fecha_desde > hoy) return false;
  if (menu.fecha_hasta && menu.fecha_hasta < hoy) return false;
  if (menu.dias_semana?.length && !menu.dias_semana.includes(dia)) return false;
  return true;
}

export default function MenuDiaPage() {
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ? String((restauranteActual as any).id) : null;
  const restauranteNombre = (restauranteActual as any)?.nombre
    ? String((restauranteActual as any).nombre)
    : "Restaurante";

  const [cartaActiva, setCartaActiva] = useState<Carta | null>(null);
  const [menus, setMenus] = useState<MenuDia[]>([]);
  const [menuEditando, setMenuEditando] = useState<MenuDia | null>(null);
  const [form, setForm] = useState<FormMenu>({
    ...formInicial,
    secciones: clonarSecciones(formInicial.secciones),
  });
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const previewUrl = cartaActiva?.public_token
    ? `/carta/${cartaActiva.public_token}?mesa=1&lang=es&previewMenu=1`
    : "";

  const menusActivos = useMemo(() => menus.filter((menu) => menu.activo).length, [menus]);
  const menuHoy = useMemo(() => menus.find(menuVigenteHoy) || null, [menus]);

  async function cargarTodo() {
    if (loadingRestaurante) return;

    setCargando(true);
    setError(null);
    setOk(null);

    try {
      if (!restauranteId) {
        setCartaActiva(null);
        setMenus([]);
        setError("No se encontró restaurante activo. Entra desde Admin y pulsa ‘Usar en panel’ sobre el restaurante correcto.");
        return;
      }

      const { data: cartasData, error: cartasError } = await (supabase as any)
        .from("cartas_digitales")
        .select("id,nombre,public_token,restaurante_id,created_at")
        .eq("restaurante_id", restauranteId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (cartasError) throw cartasError;

      const carta = ((cartasData || []) as Carta[])[0] || null;
      setCartaActiva(carta);

      if (!carta) {
        setMenus([]);
        setError("Este restaurante todavía no tiene carta digital. Créala primero en Productos carta o desde Admin.");
        return;
      }

      const { data: menusData, error: menusError } = await (supabase as any)
        .from("menus_dia_qr")
        .select("*")
        .eq("restaurante_id", restauranteId)
        .eq("carta_id", carta.id)
        .order("orden", { ascending: true })
        .order("creado_en", { ascending: false });

      if (menusError) throw menusError;

      setMenus((menusData || []) as MenuDia[]);
    } catch (err: any) {
      console.error("Error cargando menú del día", err);
      setError(err?.message || "No se pudo cargar el menú del día.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarTodo();
  }, [restauranteId, loadingRestaurante]);

  function cambiarCampo(campo: keyof FormMenu, valor: any) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
  }

  function toggleDia(dia: number) {
    setForm((actual) => {
      const existe = actual.dias_semana.includes(dia);
      return {
        ...actual,
        dias_semana: existe
          ? actual.dias_semana.filter((item) => item !== dia)
          : [...actual.dias_semana, dia],
      };
    });
  }

  function cambiarSeccion(index: number, nombre: string) {
    setForm((actual) => ({
      ...actual,
      secciones: actual.secciones.map((seccion, i) =>
        i === index ? { ...seccion, nombre } : seccion
      ),
    }));
  }

  function añadirSeccion() {
    setForm((actual) => ({
      ...actual,
      secciones: [
        ...actual.secciones,
        { nombre: "Nueva sección", opciones: [{ nombre: "", descripcion: "" }] },
      ],
    }));
  }

  function eliminarSeccion(index: number) {
    setForm((actual) => ({
      ...actual,
      secciones: actual.secciones.filter((_, i) => i !== index),
    }));
  }

  function añadirOpcion(indexSeccion: number) {
    setForm((actual) => ({
      ...actual,
      secciones: actual.secciones.map((seccion, i) =>
        i === indexSeccion
          ? { ...seccion, opciones: [...seccion.opciones, { nombre: "", descripcion: "" }] }
          : seccion
      ),
    }));
  }

  function cambiarOpcion(
    indexSeccion: number,
    indexOpcion: number,
    campo: keyof OpcionMenu,
    valor: string
  ) {
    setForm((actual) => ({
      ...actual,
      secciones: actual.secciones.map((seccion, i) =>
        i === indexSeccion
          ? {
              ...seccion,
              opciones: seccion.opciones.map((opcion, j) =>
                j === indexOpcion ? { ...opcion, [campo]: valor } : opcion
              ),
            }
          : seccion
      ),
    }));
  }

  function eliminarOpcion(indexSeccion: number, indexOpcion: number) {
    setForm((actual) => ({
      ...actual,
      secciones: actual.secciones.map((seccion, i) =>
        i === indexSeccion
          ? { ...seccion, opciones: seccion.opciones.filter((_, j) => j !== indexOpcion) }
          : seccion
      ),
    }));
  }

  function editarMenu(menu: MenuDia) {
    setMenuEditando(menu);
    setForm({
      titulo: menu.titulo || "Menú del día",
      descripcion: menu.descripcion || "",
      precio: String(menu.precio || ""),
      activo: Boolean(menu.activo),
      fecha_desde: menu.fecha_desde || "",
      fecha_hasta: menu.fecha_hasta || "",
      hora_inicio: horaInput(menu.hora_inicio),
      hora_fin: horaInput(menu.hora_fin),
      dias_semana: menu.dias_semana || [],
      orden: String(menu.orden || 1),
      secciones: normalizarSecciones(menu.secciones),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function nuevoMenu() {
    setMenuEditando(null);
    setForm({
      ...formInicial,
      secciones: clonarSecciones(formInicial.secciones),
    });
  }

  function activarSoloHoy() {
    const hoy = fechaHoyISO();
    const dia = new Date().getDay();
    setForm((actual) => ({
      ...actual,
      activo: true,
      fecha_desde: hoy,
      fecha_hasta: hoy,
      dias_semana: [dia],
    }));
  }

  async function guardarMenu() {
    if (!restauranteId || !cartaActiva?.id) return;

    setGuardando(true);
    setError(null);
    setOk(null);

    try {
      const secciones = limpiarSecciones(form.secciones);
      if (secciones.length === 0) throw new Error("Añade al menos una sección con una opción.");

      const precio = Number(String(form.precio || "0").replace(",", "."));
      if (Number.isNaN(precio) || precio < 0) throw new Error("El precio no es válido.");

      const payload = {
        restaurante_id: restauranteId,
        carta_id: cartaActiva.id,
        titulo: form.titulo.trim() || "Menú del día",
        descripcion: form.descripcion.trim() || null,
        precio,
        activo: form.activo,
        fecha_desde: form.fecha_desde || null,
        fecha_hasta: form.fecha_hasta || null,
        hora_inicio: form.hora_inicio || null,
        hora_fin: form.hora_fin || null,
        dias_semana: form.dias_semana,
        orden: Number(form.orden || 1),
        secciones,
        actualizado_en: new Date().toISOString(),
      };

      if (menuEditando) {
        const { error: updateError } = await (supabase as any)
          .from("menus_dia_qr")
          .update(payload)
          .eq("id", menuEditando.id)
          .eq("restaurante_id", restauranteId);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await (supabase as any).from("menus_dia_qr").insert(payload);
        if (insertError) throw insertError;
      }

      setOk(menuEditando ? "Menú actualizado correctamente." : "Menú creado correctamente.");
      nuevoMenu();
      await cargarTodo();
    } catch (err: any) {
      console.error("Error guardando menú", err);
      setError(err?.message || "No se pudo guardar el menú.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarMenu(menu: MenuDia) {
    if (!restauranteId) return;
    const confirmar = window.confirm(`¿Eliminar ${menu.titulo}?`);
    if (!confirmar) return;

    const { error: deleteError } = await (supabase as any)
      .from("menus_dia_qr")
      .delete()
      .eq("id", menu.id)
      .eq("restaurante_id", restauranteId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    if (menuEditando?.id === menu.id) nuevoMenu();
    await cargarTodo();
  }

  async function ocultarMostrarMenu(menu: MenuDia, activo: boolean) {
    if (!restauranteId) return;

    const { error: updateError } = await (supabase as any)
      .from("menus_dia_qr")
      .update({ activo, actualizado_en: new Date().toISOString() })
      .eq("id", menu.id)
      .eq("restaurante_id", restauranteId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await cargarTodo();
  }

  async function duplicarMenu(menu: MenuDia) {
    if (!restauranteId || !cartaActiva?.id) return;

    const { error: insertError } = await (supabase as any).from("menus_dia_qr").insert({
      restaurante_id: restauranteId,
      carta_id: cartaActiva.id,
      titulo: `${menu.titulo} copia`,
      descripcion: menu.descripcion,
      precio: menu.precio,
      activo: false,
      fecha_desde: menu.fecha_desde,
      fecha_hasta: menu.fecha_hasta,
      hora_inicio: menu.hora_inicio,
      hora_fin: menu.hora_fin,
      dias_semana: menu.dias_semana || [],
      orden: Number(menu.orden || 1) + 1,
      secciones: normalizarSecciones(menu.secciones),
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setOk("Menú duplicado. Lo he dejado pausado para que lo revises antes de activarlo.");
    await cargarTodo();
  }

  function copiarPreview() {
    if (!previewUrl) return;
    const base = window.location.origin.includes("localhost")
      ? "https://panel.gastrohelp.es"
      : window.location.origin;
    navigator.clipboard.writeText(`${base}${previewUrl}`);
    setOk("Enlace de carta copiado.");
    setTimeout(() => setOk(null), 2200);
  }

  if (cargando || loadingRestaurante) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 p-4 text-slate-950 md:p-8">
      <div className="mx-auto max-w-[1420px] space-y-6">
        <header className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                <Utensils className="h-4 w-4" />
                Camarero digital
              </div>
              <h1 className="text-3xl font-black tracking-tight">Menú del día</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
                Configura el menú por horario. Solo usa el restaurante activo: {restauranteNombre}.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={cargarTodo}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-sm"
              >
                <RefreshCw className="h-5 w-5" />
                Actualizar
              </button>
              <button
                onClick={nuevoMenu}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm"
              >
                <PlusCircle className="h-5 w-5" />
                Nuevo menú
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {ok && (
          <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            {ok}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Carta activa</p>
            <p className="mt-2 truncate text-xl font-black">{cartaActiva?.nombre || "Sin carta"}</p>
            <p className="mt-1 text-xs font-bold text-slate-400">Sin selector de otros restaurantes</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Menús</p>
            <p className="mt-2 text-3xl font-black">{menus.length}</p>
            <p className="mt-1 text-xs font-bold text-slate-400">{menusActivos} activos</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Hoy</p>
            <p className="mt-2 truncate text-xl font-black">{menuHoy?.titulo || "Sin menú activo"}</p>
            <p className="mt-1 text-xs font-bold text-slate-400">Según fecha y día de semana</p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Vista QR</p>
            {previewUrl ? (
              <button onClick={copiarPreview} className="mt-2 text-left text-sm font-black text-blue-700">
                Copiar vista previa con menú
              </button>
            ) : (
              <p className="mt-2 text-sm font-black text-slate-400">No disponible</p>
            )}
            {previewUrl && (
              <a href={previewUrl} target="_blank" className="mt-1 block text-xs font-bold text-slate-400">
                Abrir vista con menú
              </a>
            )}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    {menuEditando ? "Editando menú" : "Nuevo menú"}
                  </p>
                  <h2 className="text-2xl font-black">Datos principales</h2>
                </div>
                <button
                  onClick={activarSoloHoy}
                  className="rounded-2xl bg-blue-50 px-4 py-3 text-xs font-black text-blue-700"
                >
                  Activar solo hoy
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-black uppercase text-slate-500">Título</label>
                  <input
                    value={form.titulo}
                    onChange={(e) => cambiarCampo("titulo", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-black uppercase text-slate-500">Descripción</label>
                  <textarea
                    value={form.descripcion}
                    onChange={(e) => cambiarCampo("descripcion", e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                    <Euro className="h-4 w-4" /> Precio
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.precio}
                    onChange={(e) => cambiarCampo("precio", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-black uppercase text-slate-500">Orden</label>
                  <input
                    type="number"
                    value={form.orden}
                    onChange={(e) => cambiarCampo("orden", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                    <Clock3 className="h-4 w-4" /> Inicio
                  </label>
                  <input
                    type="time"
                    value={form.hora_inicio}
                    onChange={(e) => cambiarCampo("hora_inicio", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-black uppercase text-slate-500">Fin</label>
                  <input
                    type="time"
                    value={form.hora_fin}
                    onChange={(e) => cambiarCampo("hora_fin", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                    <CalendarDays className="h-4 w-4" /> Desde
                  </label>
                  <input
                    type="date"
                    value={form.fecha_desde}
                    onChange={(e) => cambiarCampo("fecha_desde", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-black uppercase text-slate-500">Hasta</label>
                  <input
                    type="date"
                    value={form.fecha_hasta}
                    onChange={(e) => cambiarCampo("fecha_hasta", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <label className="mb-2 block text-xs font-black uppercase text-slate-500">Días activos</label>
                  <div className="flex flex-wrap gap-2">
                    {diasSemana.map((dia) => {
                      const activo = form.dias_semana.includes(dia.id);
                      return (
                        <button
                          type="button"
                          key={dia.id}
                          title={dia.nombre}
                          onClick={() => toggleDia(dia.id)}
                          className={clsx(
                            "h-10 w-10 rounded-xl text-sm font-black transition",
                            activo ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {dia.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex min-w-[220px] items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-black">
                  Activo en carta QR
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => cambiarCampo("activo", e.target.checked)}
                    className="h-5 w-5"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Platos</p>
                  <h2 className="text-2xl font-black">Secciones del menú</h2>
                </div>
                <button
                  onClick={añadirSeccion}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
                >
                  <Plus className="h-4 w-4" />
                  Añadir sección
                </button>
              </div>

              <div className="space-y-4">
                {form.secciones.map((seccion, indexSeccion) => (
                  <div key={indexSeccion} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center gap-3">
                      <input
                        value={seccion.nombre}
                        onChange={(e) => cambiarSeccion(indexSeccion, e.target.value)}
                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black outline-none focus:border-blue-400"
                        placeholder="Nombre de la sección"
                      />
                      <button
                        onClick={() => eliminarSeccion(indexSeccion)}
                        className="rounded-2xl bg-red-50 p-3 text-red-700"
                        title="Eliminar sección"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {seccion.opciones.map((opcion, indexOpcion) => (
                        <div key={indexOpcion} className="grid gap-3 rounded-2xl bg-white p-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_44px]">
                          <input
                            value={opcion.nombre}
                            onChange={(e) => cambiarOpcion(indexSeccion, indexOpcion, "nombre", e.target.value)}
                            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-blue-400"
                            placeholder="Nombre del plato"
                          />
                          <input
                            value={opcion.descripcion || ""}
                            onChange={(e) => cambiarOpcion(indexSeccion, indexOpcion, "descripcion", e.target.value)}
                            className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                            placeholder="Descripción corta opcional"
                          />
                          <button
                            onClick={() => eliminarOpcion(indexSeccion, indexOpcion)}
                            className="flex h-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-700"
                            title="Quitar plato"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => añadirOpcion(indexSeccion)}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      Añadir plato a {seccion.nombre || "sección"}
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={guardarMenu}
                  disabled={guardando || !cartaActiva?.id}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  {menuEditando ? "Guardar cambios" : "Guardar menú"}
                </button>
                {menuEditando && (
                  <button
                    onClick={nuevoMenu}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Vista previa</p>
              <div className="mt-4 rounded-[1.5rem] bg-slate-950 p-5 text-white shadow-sm">
                <div className="inline-flex rounded-full bg-blue-500/20 px-3 py-1 text-xs font-black text-blue-100">
                  {form.activo ? "Menú activo" : "Menú pausado"}
                </div>
                <h3 className="mt-4 text-2xl font-black">{form.titulo || "Menú del día"}</h3>
                <p className="mt-2 text-sm font-semibold text-slate-300">{form.descripcion || "Sin descripción"}</p>
                <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 p-4">
                  <span className="text-xs font-black uppercase text-slate-300">Precio</span>
                  <span className="text-2xl font-black">{precioTexto(form.precio)} €</span>
                </div>
                <div className="mt-5 space-y-3">
                  {form.secciones.slice(0, 4).map((seccion, i) => (
                    <div key={`${seccion.nombre}-${i}`} className="rounded-2xl bg-white/8 p-4">
                      <p className="text-sm font-black">{seccion.nombre || "Sección"}</p>
                      <div className="mt-2 space-y-2">
                        {seccion.opciones.slice(0, 3).map((opcion, j) => (
                          <div key={`${opcion.nombre}-${j}`} className="rounded-xl bg-black/20 p-3">
                            <p className="text-sm font-black">{opcion.nombre || "Plato"}</p>
                            {opcion.descripcion && <p className="mt-1 text-xs font-semibold text-slate-400">{opcion.descripcion}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Menús guardados</p>
                  <h2 className="mt-1 text-xl font-black">{menus.length} menús</h2>
                </div>
                <button onClick={cargarTodo} className="rounded-xl bg-slate-100 p-3 text-slate-700">
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {menus.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                    Todavía no hay menús guardados.
                  </div>
                )}

                {menus.map((menu) => (
                  <article key={menu.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-black">{menu.titulo}</h3>
                          <span className={clsx(
                            "rounded-full px-2 py-1 text-[11px] font-black",
                            menu.activo ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"
                          )}>
                            {menu.activo ? "Activo" : "Pausado"}
                          </span>
                          {menuVigenteHoy(menu) && (
                            <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-black text-blue-700">
                              Hoy
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {precioTexto(menu.precio)} € · {horaInput(menu.hora_inicio) || "--"} - {horaInput(menu.hora_fin) || "--"} · {diasTexto(menu.dias_semana)}
                        </p>
                      </div>
                      <button
                        onClick={() => ocultarMostrarMenu(menu, !menu.activo)}
                        className="rounded-xl bg-white p-2 text-slate-600 shadow-sm"
                        title={menu.activo ? "Pausar" : "Activar"}
                      >
                        {menu.activo ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => editarMenu(menu)}
                        className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => duplicarMenu(menu)}
                        className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm"
                      >
                        <Copy className="h-4 w-4" />
                        Duplicar
                      </button>
                      <button
                        onClick={() => eliminarMenu(menu)}
                        className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700"
                      >
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
