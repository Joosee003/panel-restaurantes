"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../(app)/lib/supabaseClient";

type RestauranteModulo = {
  restaurante_id: string;
  plan: string;
  estado: string;
  reservas: boolean;
  clientes: boolean;
  resenas: boolean;
  fidelizacion: boolean;
  metricas: boolean;
  chatbot: boolean;
  camarero_digital: boolean;
  menu_digital: boolean;
  automatizaciones: boolean;
  restaurantes: {
    id: string;
    nombre: string;
  } | null;
};

const modulos = [
  { key: "reservas", label: "Reservas" },
  { key: "clientes", label: "Clientes" },
  { key: "resenas", label: "Reseñas" },
  { key: "fidelizacion", label: "Fidelización" },
  { key: "metricas", label: "Métricas" },
  { key: "chatbot", label: "Chatbot" },
  { key: "camarero_digital", label: "Camarero digital" },
  { key: "menu_digital", label: "Menú digital" },
  { key: "automatizaciones", label: "Automatizaciones" },
] as const;

export default function AdminRestaurantesPage() {
  const [restaurantes, setRestaurantes] = useState<RestauranteModulo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarRestaurantes();
  }, []);

  async function cargarRestaurantes() {
    setLoading(true);

    const { data, error } = await supabase
      .from("restaurante_modulos")
      .select(`
        restaurante_id,
        plan,
        estado,
        reservas,
        clientes,
        resenas,
        fidelizacion,
        metricas,
        chatbot,
        camarero_digital,
        menu_digital,
        automatizaciones,
        restaurantes (
          id,
          nombre
        )
      `)
      .order("restaurante_id", { ascending: true });

    if (error) {
      console.error("Error cargando restaurantes:", error);
      setLoading(false);
      return;
    }

    setRestaurantes((data || []) as unknown as RestauranteModulo[]);
    setLoading(false);
  }

  async function cambiarModulo(
    restauranteId: string,
    modulo: keyof RestauranteModulo,
    valorActual: boolean
  ) {
    const { error } = await supabase
      .from("restaurante_modulos")
      .update({
        [modulo]: !valorActual,
        updated_at: new Date().toISOString(),
      })
      .eq("restaurante_id", restauranteId);

    if (error) {
      console.error("Error actualizando módulo:", error);
      return;
    }

    setRestaurantes((prev) =>
      prev.map((restaurante) =>
        restaurante.restaurante_id === restauranteId
          ? {
              ...restaurante,
              [modulo]: !valorActual,
            }
          : restaurante
      )
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-8 text-slate-950">
        <p>Cargando restaurantes...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8 text-slate-950">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-600">
            Panel interno
          </p>

          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">
            Admin GastroHelp
          </h1>

          <p className="mt-3 text-base text-slate-500">
            Controla qué servicios tiene activo cada restaurante desde una sola
            pantalla.
          </p>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-950 p-6 shadow-sm">
            <p className="text-sm text-slate-400">Restaurantes</p>
            <p className="mt-2 text-4xl font-black text-white">
              {restaurantes.length}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-950 p-6 shadow-sm">
            <p className="text-sm text-slate-400">Activos</p>
            <p className="mt-2 text-4xl font-black text-white">
              {restaurantes.filter((r) => r.estado === "activo").length}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-950 p-6 shadow-sm">
            <p className="text-sm text-slate-400">Con chatbot</p>
            <p className="mt-2 text-4xl font-black text-white">
              {restaurantes.filter((r) => r.chatbot).length}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-950 p-6 shadow-sm">
            <p className="text-sm text-slate-400">Con fidelización</p>
            <p className="mt-2 text-4xl font-black text-white">
              {restaurantes.filter((r) => r.fidelizacion).length}
            </p>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl bg-slate-950 shadow-sm">
          <div className="border-b border-slate-800 p-6">
            <h2 className="text-xl font-bold text-white">
              Restaurantes y módulos
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Activa o desactiva servicios con los interruptores.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-slate-800 text-xs uppercase text-slate-300">
                <tr>
                  <th className="px-5 py-4">Restaurante</th>
                  <th className="px-5 py-4">Plan</th>
                  <th className="px-5 py-4">Estado</th>

                  {modulos.map((modulo) => (
                    <th key={modulo.key} className="px-5 py-4 text-center">
                      {modulo.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {restaurantes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      No hay restaurantes cargados todavía.
                    </td>
                  </tr>
                ) : (
                  restaurantes.map((restaurante, index) => (
                    <tr
                      key={restaurante.restaurante_id}
                      className="border-t border-slate-800 hover:bg-slate-900"
                    >
                      <td className="px-5 py-5">
                        <p className="font-bold text-white">
                          {restaurante.restaurantes?.nombre ||
                            `Restaurante ${index + 1}`}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {restaurante.restaurante_id}
                        </p>
                      </td>

                      <td className="px-5 py-5">
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold capitalize text-slate-200">
                          {restaurante.plan}
                        </span>
                      </td>

                      <td className="px-5 py-5">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${
                            restaurante.estado === "activo"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-red-500/15 text-red-300"
                          }`}
                        >
                          {restaurante.estado}
                        </span>
                      </td>

                      {modulos.map((modulo) => {
                        const activo = Boolean(restaurante[modulo.key]);

                        return (
                          <td key={modulo.key} className="px-5 py-5 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                cambiarModulo(
                                  restaurante.restaurante_id,
                                  modulo.key,
                                  activo
                                )
                              }
                              className={`mx-auto flex h-7 w-12 items-center rounded-full p-1 transition ${
                                activo ? "bg-emerald-500" : "bg-slate-700"
                              }`}
                            >
                              <span
                                className={`h-5 w-5 rounded-full bg-white shadow transition ${
                                  activo ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </button>

                            <p
                              className={`mt-2 text-[11px] font-black ${
                                activo ? "text-emerald-400" : "text-slate-500"
                              }`}
                            >
                              {activo ? "ON" : "OFF"}
                            </p>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}