"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  MessageSquare,
  Settings,
  Gift,
  LayoutGrid,
  BarChart3,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [reservasPendientes, setReservasPendientes] = useState(0);
  const [clientesNuevos, setClientesNuevos] = useState(0);
  const [resenasPendientes, setResenasPendientes] = useState(0);

  useEffect(() => {
    const cargarRestaurante = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("usuarios_restaurantes")
        .select("restaurante_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.restaurante_id) {
        setRestauranteId(data.restaurante_id);
      }
    };

    cargarRestaurante();
  }, []);

  useEffect(() => {
    if (!restauranteId) return;

    const cargarContadores = async () => {
      const { count: cReservas } = await supabase
        .from("reservas")
        .select("*", { count: "exact", head: true })
        .eq("restaurante_id", restauranteId)
        .eq("estado", "pendiente");

      const hoy = new Date();
      const inicioHoy = `${hoy.getFullYear()}-${String(
        hoy.getMonth() + 1
      ).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")} 00:00:00`;
      const finHoy = `${hoy.getFullYear()}-${String(
        hoy.getMonth() + 1
      ).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")} 23:59:59`;

      const { count: cClientes } = await supabase
        .from("clientes")
        .select("*", { count: "exact", head: true })
        .eq("restaurante_id", restauranteId)
        .gte("created_at", inicioHoy)
        .lte("created_at", finHoy);

      const { count: cResenas } = await supabase
        .from("resenas")
        .select("*", { count: "exact", head: true })
        .eq("restaurante_id", restauranteId)
        .eq("responded", false);

      setReservasPendientes(cReservas ?? 0);
      setClientesNuevos(cClientes ?? 0);
      setResenasPendientes(cResenas ?? 0);
    };

    cargarContadores();
  }, [restauranteId]);

  useEffect(() => {
    if (!restauranteId) return;

    const canal = supabase
      .channel("sidebar-reservas")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservas",
          filter: `restaurante_id=eq.${restauranteId}`,
        },
        async () => {
          const { count } = await supabase
            .from("reservas")
            .select("*", { count: "exact", head: true })
            .eq("restaurante_id", restauranteId)
            .eq("estado", "pendiente");

          setReservasPendientes(count ?? 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [restauranteId]);

  const items = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    {
      href: "/reservas",
      label: "Reservas",
      icon: CalendarDays,
      badge: reservasPendientes,
    },
    {
      href: "/sala",
      label: "Sala",
      icon: LayoutGrid,
    },
    {
      href: "/clientes",
      label: "Clientes",
      icon: Users,
      badge: clientesNuevos,
    },
    {
      href: "/resenas",
      label: "Reseñas",
      icon: MessageSquare,
      badge: resenasPendientes,
    },
    {
      href: "/dashboard/rentabilidad",
      label: "Rentabilidad",
      icon: BarChart3,
    },
    {
      href: "/dashboard/fidelizacion/cupones",
      label: "Fidelización",
      icon: Gift,
    },
    { href: "/ajustes", label: "Ajustes", icon: Settings },
  ];

  const isItemActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside
      className={[
        "flex h-full w-64 flex-col gap-6 p-6 transition-colors duration-300",
        mobile ? "" : "fixed left-0 top-0 h-screen",
      ].join(" ")}
    >
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Panel Restaurante
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Vista general
        </p>
      </div>

      <nav className="flex flex-col gap-1 text-sm">
        {items.map((item) => {
          const isActive = isItemActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={[
                "flex items-center justify-between rounded-xl px-3 py-3 transition",
                isActive
                  ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <Icon size={18} />
                <span className={isActive ? "font-semibold" : ""}>
                  {item.label}
                </span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}