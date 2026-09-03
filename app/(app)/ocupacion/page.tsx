"use client";

import { useEffect, useState } from "react";
import { calcularOcupacion, type TramoOcupacion } from "../lib/ocupacion";
import { supabase } from "../lib/supabaseClient";

export default function OcupacionPage() {
  const [restauranteId, setRestauranteId] = useState<string | null>(null);

  // valores calculados
  const [totalDia, setTotalDia] = useState(0);
  const [ocupacionComida, setOcupacionComida] = useState(0);
  const [ocupacionCena, setOcupacionCena] = useState(0);

  // detalle por tramos
  const [tramosComida, setTramosComida] = useState<TramoOcupacion[]>([]);
  const [tramosCena, setTramosCena] = useState<TramoOcupacion[]>([]);

  /* ===== OBTENER RESTAURANTE ===== */
  useEffect(() => {
    const cargarRestaurante = async () => {
      const { data, error } = await supabase
        .from("restaurantes")
        .select("id")
        .limit(1)
        .single();

      if (error || !data) return;
      setRestauranteId(data.id);
    };

    cargarRestaurante();
  }, []);

  /* ===== OCUPACIÓN (UNA SOLA FUENTE DE VERDAD) ===== */
  useEffect(() => {
    if (!restauranteId) return;

    const cargarOcupacion = async () => {
      const res = await calcularOcupacion(restauranteId);
      if (!res) return;

      // media real del día (comida + cena ponderado por horas)
      setTotalDia(res.totalDiaPct);

      // medias por servicio
      setOcupacionComida(res.ocupacionComidaPct);
      setOcupacionCena(res.ocupacionCenaPct);

      // detalle por horas
      setTramosComida(res.tramosComida || []);
      setTramosCena(res.tramosCena || []);
    };

    cargarOcupacion();
  }, [restauranteId]);

  const turnos = [
    {
      id: "comida",
      nombre: "Comida",
      porcentaje: ocupacionComida,
      tramos: tramosComida,
    },
    {
      id: "cena",
      nombre: "Cena",
      porcentaje: ocupacionCena,
      tramos: tramosCena,
    },
  ];

  const formatHora = (min: number) =>
    String(Math.floor(min / 60)).padStart(2, "0") + ":00";

  const ahora = new Date();
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes();

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-wider">
          Ocupación
        </h1>
        <p className="text-sm opacity-70">
          Ocupación total del día: {totalDia}%
        </p>
      </div>

      {/* TURNOS */}
      <div className="card rounded-2xl p-5">
        <p className="text-sm font-bold uppercase mb-4">
          Ocupación por turnos
        </p>

        <div className="space-y-4">
          {turnos.map((turno) => {
            const maxHoy = Math.max(
              ...turno.tramos.map((t) => t.pct),
              0
            );

            return (
              <div
                key={turno.id}
                className="rounded-xl border p-4 dark:border-gray-700"
              >
                {/* CABECERA */}
                <div className="flex justify-between mb-1">
                  <p className="font-bold">{turno.nombre}</p>
                  <p className="text-sm opacity-70">
                    {turno.porcentaje}%
                  </p>
                </div>

                <p className="text-xs opacity-60 mb-3">
                  Máx hoy: {maxHoy}%
                </p>

                {/* BARRA GRANDE DEL SERVICIO */}
                <div className="w-full h-3 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full ${
                      turno.porcentaje > 75
                        ? "bg-red-500"
                        : turno.porcentaje > 50
                        ? "bg-yellow-400"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${turno.porcentaje}%` }}
                  />
                </div>

                {/* TRAMOS */}
                <div className="space-y-2">
                  {turno.tramos.map((t, i) => {
                    const esActual =
                      minAhora >= t.start && minAhora < t.end;

                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 text-sm ${
                          esActual
                            ? "bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2"
                            : ""
                        }`}
                      >
                        <span
                          className={`w-24 ${
                            esActual
                              ? "font-bold text-blue-600"
                              : "opacity-70"
                          }`}
                        >
                          {formatHora(t.start)} - {formatHora(t.end)}
                        </span>

                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={
                              t.pct < 30
                                ? "h-full bg-red-500"
                                : t.pct < 60
                                ? "h-full bg-yellow-400"
                                : "h-full bg-green-500"
                            }
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>

                        <span
                          className={`w-10 text-right ${
                            esActual ? "font-bold" : "opacity-70"
                          }`}
                        >
                          {t.pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
