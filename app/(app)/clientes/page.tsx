"use client";

import { useEffect, useState } from "react";
import { Plus, Search, X, Users, Repeat2, Sparkles } from "lucide-react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import AddVisitaModal from "../components/AddVisitaModal";
import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";

type ClienteResumen = {
  id: string;
  restaurante_id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  visitas_totales: number | null;
  ultima_visita: string | null;
  canal_contacto: string | null;
  puntos_totales: number | null;
  etiquetas: string[] | null;
  total_reservas: number | null;
  total_canceladas_reales: number | null;
  total_atendidas: number | null;
  proxima_reserva: string | null;
};

function getTipo(visitas: number) {
  if (visitas >= 5) return "Frecuente";
  if (visitas >= 2) return "Habitual";
  return "Nuevo";
}

function formatFechaRelativa(fecha: string | null) {
  if (!fecha) return "-";

  const diff = Math.floor(
    (Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff <= 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return `Hace ${diff} días`;
}

function formatFechaHora(fecha: string | null) {
  if (!fecha) return "-";

  return new Date(fecha).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizarNombre(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function badgeTipoClasses(tipo: string) {
  if (tipo === "Frecuente") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (tipo === "Habitual") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
  }
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteResumen[]>([]);
  const [clientesFiltrados, setClientesFiltrados] = useState<ClienteResumen[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const [showAddVisita, setShowAddVisita] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [personas, setPersonas] = useState("");

  useEffect(() => {
    const read = () =>
      setIsDark(document.documentElement.classList.contains("dark"));

    read();

    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const cargarRestaurante = async () => {
      const id = await getRestauranteUsuario();
      if (id) setRestauranteId(id);
    };

    cargarRestaurante();
  }, []);

  const cargarClientes = async () => {
    if (!restauranteId) return;

    const { data, error } = await supabase
      .from("vw_clientes_resumen")
      .select("*")
      .eq("restaurante_id", restauranteId)
      .order("ultima_visita", { ascending: false });

    if (!error && data) {
      setClientes(data);
      setClientesFiltrados(data);
    }
  };

  useEffect(() => {
    if (!restauranteId) return;
    cargarClientes();
  }, [restauranteId]);

  useEffect(() => {
    const term = busqueda.trim().toLowerCase();

    if (!term) {
      setClientesFiltrados(clientes);
      return;
    }

    const filtrados = clientes.filter((c) => {
      const nombre = c.nombre?.toLowerCase() ?? "";
      const telefono = c.telefono?.toLowerCase() ?? "";
      const email = c.email?.toLowerCase() ?? "";

      return (
        nombre.includes(term) ||
        telefono.includes(term) ||
        email.includes(term)
      );
    });

    setClientesFiltrados(filtrados);
  }, [busqueda, clientes]);

  const añadirCliente = async () => {
    if (!nombre || !fecha) {
      alert("Nombre y fecha son obligatorios");
      return;
    }

    const nombreNormalizado = normalizarNombre(nombre);

    if (!restauranteId) return;

    const { data: existente } = await supabase
      .from("clientes")
      .select("id")
      .eq("restaurante_id", restauranteId)
      .eq("nombre_normalizado", nombreNormalizado)
      .maybeSingle();

    if (existente) {
      await supabase.from("clientes_historial").insert({
        cliente_id: existente.id,
        restaurante_id: restauranteId,
        tipo: "visita",
        created_at: fecha,
        personas: personas ? Number(personas) : null,
      });

      await supabase.rpc("increment_client_visit", {
        cliente_id_input: existente.id,
      });

      setShowModal(false);
      setNombre("");
      setFecha("");
      setPersonas("");
      cargarClientes();
      return;
    }

    const { data: cliente, error } = await supabase
      .from("clientes")
      .insert({
        restaurante_id: restauranteId,
        nombre,
        nombre_normalizado: nombreNormalizado,
        visitas_totales: 1,
        ultima_visita: fecha,
      })
      .select()
      .single();

    if (error || !cliente) {
      alert("Error al guardar el cliente");
      return;
    }

    await supabase.from("clientes_historial").insert({
      cliente_id: cliente.id,
      restaurante_id: restauranteId,
      tipo: "visita",
      created_at: fecha,
      personas: personas ? Number(personas) : null,
    });

    setNombre("");
    setFecha("");
    setPersonas("");
    setShowModal(false);
    cargarClientes();
  };

  const totalClientes = clientes.length;
  const frecuentes = clientes.filter((c) => (c.visitas_totales ?? 0) >= 5).length;
  const nuevos = clientes.filter((c) => (c.visitas_totales ?? 0) <= 1).length;

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-[0.18em] text-slate-900 dark:text-white">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Gestión de clientes presenciales y reservas
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, teléfono o email"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100 dark:border-white/10 dark:bg-[#071224] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-white/15 dark:focus:ring-white/10"
            />
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:border-white/15 dark:bg-transparent dark:hover:bg-white/5"
          >
            <Plus size={16} />
            Añadir cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-3xl border border-blue-100 bg-blue-50/80 p-5 shadow-sm dark:border-blue-500/20 dark:bg-slate-200">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-700">
              Total clientes
            </p>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm dark:bg-white/80">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-4xl font-extrabold text-slate-900">{totalClientes}</p>
        </div>

        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/80 p-5 shadow-sm dark:border-emerald-500/20 dark:bg-[#dbe8e3]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-700">
              Frecuentes
            </p>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm dark:bg-white/80">
              <Repeat2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-4xl font-extrabold text-slate-900">{frecuentes}</p>
        </div>

        <div className="rounded-3xl border border-violet-100 bg-violet-50/80 p-5 shadow-sm dark:border-violet-500/20 dark:bg-[#e9e5f2]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-700">
              Nuevos
            </p>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-sm dark:bg-white/80">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-4xl font-extrabold text-slate-900">{nuevos}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white">
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Lista de clientes</h2>
          <p className="text-sm text-slate-500">{clientesFiltrados.length} resultados</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="bg-slate-50/80">
              <tr className="border-b border-slate-200">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Visitas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Reservas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Canceladas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Atendidas
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Puntos
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Próxima reserva
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Última visita
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              {clientesFiltrados.map((c) => {
                const visitas = c.visitas_totales ?? 0;
                const tipo = getTipo(visitas);

                return (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 transition hover:bg-slate-50/80"
                  >
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-slate-900">
                          {c.nombre || "Cliente sin nombre"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {c.telefono || c.email || "Sin contacto"}
                        </span>

                        {!!c.etiquetas?.length && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {c.etiquetas.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${badgeTipoClasses(
                          tipo
                        )}`}
                      >
                        {tipo}
                      </span>
                    </td>

                    <td className="px-4 py-4 font-semibold text-slate-900">{visitas}</td>
                    <td className="px-4 py-4 text-slate-700">{c.total_reservas ?? 0}</td>
                    <td className="px-4 py-4 text-slate-700">{c.total_canceladas_reales ?? 0}</td>
                    <td className="px-4 py-4 text-slate-700">{c.total_atendidas ?? 0}</td>
                    <td className="px-4 py-4 font-medium text-slate-800">{c.puntos_totales ?? 0}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {c.proxima_reserva ? formatFechaHora(c.proxima_reserva) : "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatFechaRelativa(c.ultima_visita)}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setClienteSeleccionado(c.id);
                            setShowAddVisita(true);
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          + Visita
                        </button>

                        <Link
                          href={`/clientes/${c.id}`}
                          className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
                        >
                          Ver ficha
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {clientesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-14 text-center text-sm text-slate-500">
                    No hay clientes para mostrar
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center ${
            isDark ? "bg-black/55 backdrop-blur-sm" : "bg-slate-900/25 backdrop-blur-[2px]"
          }`}
        >
          <div
            className={`w-full max-w-md space-y-4 rounded-3xl border p-6 shadow-xl ${
              isDark
                ? "border-white/10 bg-white text-slate-900"
                : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Añadir cliente</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl p-2 opacity-70 transition hover:bg-slate-100 hover:opacity-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <input
              className="w-full rounded-2xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none"
              placeholder="Nombre del cliente"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <input
              type="date"
              className="w-full rounded-2xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />

            <input
              type="number"
              className="w-full rounded-2xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none"
              placeholder="Personas (opcional)"
              value={personas}
              onChange={(e) => setPersonas(e.target.value)}
            />

            <button
              onClick={añadirCliente}
              className="w-full rounded-2xl bg-slate-900 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Guardar cliente
            </button>
          </div>
        </div>
      )}

      {showAddVisita && clienteSeleccionado && (
        <AddVisitaModal
          clienteId={clienteSeleccionado}
          onClose={() => {
            setShowAddVisita(false);
            setClienteSeleccionado(null);
          }}
          onSaved={cargarClientes}
        />
      )}
    </div>
  );
}