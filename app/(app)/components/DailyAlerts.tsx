"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Alert = {
  id: string;
  text: string;
  type: "warning" | "danger";
};

const colors: Record<Alert["type"], string> = {
  warning: "bg-yellow-50 text-yellow-700 border-yellow-200",
  danger: "bg-red-50 text-red-700 border-red-200",
};

export default function DailyAlerts({ restauranteId }: { restauranteId: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const cargarAlertas = useCallback(async () => {
    const nuevasAlertas: Alert[] = [];

    // 🔔 Reseñas pendientes
    const { count: pendientes } = await supabase
      .from("resenas")
      .select("*", { count: "exact", head: true })
      .eq("restaurante_id", restauranteId)
      .eq("responded", false);

    if (pendientes && pendientes > 0) {
      nuevasAlertas.push({
        id: "resenas-pendientes",
        text: `${pendientes} reseña${pendientes > 1 ? "s" : ""} pendiente${pendientes > 1 ? "s" : ""} de responder`,
        type: "warning",
      });
    }

    // 🚨 Reseñas negativas sin responder
    const { count: negativas } = await supabase
      .from("resenas")
      .select("*", { count: "exact", head: true })
      .eq("restaurante_id", restauranteId)
      .eq("responded", false)
      .lte("rating", 2);

    if (negativas && negativas > 0) {
      nuevasAlertas.push({
        id: "resenas-negativas",
        text: `${negativas} reseña${negativas > 1 ? "s" : ""} negativa${negativas > 1 ? "s" : ""} sin responder`,
        type: "danger",
      });
    }

    setAlerts(nuevasAlertas);
  }, [restauranteId]);

  useEffect(() => {
    if (restauranteId) cargarAlertas();
  }, [cargarAlertas, restauranteId]);

  if (alerts.length === 0) return null;

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border">
      <h2 className="text-sm font-medium text-gray-600 mb-4">Alertas</h2>

      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`border px-4 py-3 rounded-md text-sm ${colors[alert.type]}`}
          >
            {alert.text}
          </div>
        ))}
      </div>
    </div>
  );
}
