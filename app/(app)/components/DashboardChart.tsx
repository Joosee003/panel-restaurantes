"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../lib/supabaseClient";

type ChartPoint = {
  day: string;
  reservas: number;
};

type Props = {
  restauranteId: string;
};

export default function DashboardChart({ restauranteId }: Props) {

  const [data, setData] = useState<ChartPoint[]>([]);

  useEffect(() => {
    const cargarGrafico = async () => {
      // Últimos 7 días
      const hoy = new Date();
      const dias: ChartPoint[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(hoy.getDate() - i);

        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");

        const inicio = `${yyyy}-${mm}-${dd} 00:00:00`;
        const fin = `${yyyy}-${mm}-${dd} 23:59:59`;

        const { count } = await supabase
          .from("reservas")
          .select("*", { count: "exact", head: true })
          .eq("restaurante_id", restauranteId)
          .gte("fecha_hora_reserva", inicio)
          .lte("fecha_hora_reserva", fin);
      

        const nombreDia = d.toLocaleDateString("es-ES", {
          weekday: "short",
        });

        dias.push({
          day: nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1, 3),
          reservas: count || 0,
        });
      }

      setData(dias);
    };

    cargarGrafico();
  }, [restauranteId]);


  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border h-[260px]">
      <h2 className="text-sm font-medium text-gray-600 mb-4">
        Reservas de la semana
      </h2>

      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="reservas"
            stroke="#2563eb"
            strokeWidth={3}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
