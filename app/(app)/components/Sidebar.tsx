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
  Utensils,
  Sparkles,
  Pencil,
  QrCode,
  ChefHat,
  ChevronDown,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type ModulosRestaurante = {
  reservas: boolean;
  clientes: boolean;
  resenas: boolean;
  fidelizacion: boolean;
  metricas: boolean;
  chatbot: boolean;
  camarero_digital: boolean;
  menu_digital: boolean;
  automatizaciones: boolean;
};

const modulosDefault: ModulosRestaurante = {
  reservas: true,
  clientes: true,
  resenas: false,
  fidelizacion: false,
  metricas: false,
  chatbot: false,
  camarero_digital: false,
  menu_digital: false,
  automatizaciones: false,
};

export default function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [modulos, setModulos] = useState<ModulosRestaurante>(modulosDefault);

  const [reservasPendientes, setReservasPendientes] = useState(0);
  const [clientesNuevos, setClientesNuevos] = useState(0);
  const [resenasPendientes, setResenasPendientes] = useState(0);

  const camareroDigitalActivo =
    pathname.startsWith("/panel/carta-ia") ||
    pathname.startsWith("/panel/carta-productos") ||
    pathname.startsWith("/panel/qr-mesas") ||
    pathname.startsWith("/panel/pedidos-qr");

  const [camareroAbierto, setCamareroAbierto] = useState(false);

  useEffect(() => {
    if (camareroDigitalActivo) {
      setCamareroAbierto(true);
    }
  }, [camareroDigitalActivo]);

  useEffect(() => {
    const cargarRestaurante = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("usuarios_restaurantes")
        .select("restaurante_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error cargando restaurante del usuario:", error);
        return;
      }

      if (data?.restaurante_id) {
        setRestauranteId(data.restaurante_id);
      }
    };

    cargarRestaurante();
  }, []);

  useEffect(() => {
    if (!restauranteId) return;

    const cargarModulos = async () => {
      const { data, error } = await supabase
        .from("restaurante_modulos")
        .select(
          "reservas, clientes, resenas, fidelizacion, metricas, chatbot, camarero_digital, menu_digital, automatizaciones"
        )
        .eq("restaurante_id", restauranteId)
        .maybeSingle();

      if (error) {
        console.error("Error cargando módulos:", error);
        return;
      }

      if (data) {
        setModulos({
          reservas: Boolean(data.reservas),
          clientes: Boolean(data.clientes),
          resenas: Boolean(data.resenas),
          fidelizacion: Boolean(data.fidelizacion),
          metricas: Boolean(data.metricas),
          chatbot: Boolean(data.chatbot),
          camarero_digital: Boolean(data.camarero_digital),
          menu_digital: Boolean(data.menu_digital),
          automatizaciones: Boolean(data.automatizaciones),
        });
      }
    };

    cargarModulos();
  }, [restauranteId]);

  useEffect(() => {
    if (!restauranteId) return;

    const cargarContadores = async () => {
      if (modulos.reservas) {
        const { count: cReservas } = await supabase
          .from("reservas")
          .select("*", { count: "exact", head: true })
          .eq("restaurante_id", restauranteId)
          .eq("estado", "pendiente");

        setReservasPendientes(cReservas ?? 0);
      }

      if (modulos.clientes) {
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

        setClientesNuevos(cClientes ?? 0);
      }

      if (modulos.resenas) {
        const { count: cResenas } = await supabase
          .from("resenas")
          .select("*", { count: "exact", head: true })
          .eq("restaurante_id", restauranteId)
          .eq("responded", false);

        setResenasPendientes(cResenas ?? 0);
      }
    };

    cargarContadores();
  }, [restauranteId, modulos]);

  useEffect(() => {
    if (!restauranteId || !modulos.reservas) return;

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
  }, [restauranteId, modulos.reservas]);

  const itemsPrincipales = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, visible: true },
    {
      href: "/reservas",
      label: "Reservas",
      icon: CalendarDays,
      badge: reservasPendientes,
      visible: modulos.reservas,
    },
    {
      href: "/sala",
      label: "Sala",
      icon: LayoutGrid,
      visible: modulos.reservas,
    },
    {
      href: "/clientes",
      label: "Clientes",
      icon: Users,
      badge: clientesNuevos,
      visible: modulos.clientes,
    },
    {
      href: "/resenas",
      label: "Reseñas",
      icon: MessageSquare,
      badge: resenasPendientes,
      visible: modulos.resenas,
    },
    {
      href: "/dashboard/rentabilidad",
      label: "Rentabilidad",
      icon: BarChart3,
      visible: modulos.metricas,
    },
    {
      href: "/dashboard/fidelizacion/cupones",
      label: "Fidelización",
      icon: Gift,
      visible: modulos.fidelizacion,
    },
  ];

  const camareroItems = [
    {
      href: "/panel/carta-ia",
      label: "Generar carta",
      icon: Sparkles,
    },
    {
      href: "/panel/carta-productos",
      label: "Productos carta",
      icon: Pencil,
    },
    {
      href: "/panel/qr-mesas",
      label: "QR mesas",
      icon: QrCode,
    },
    {
      href: "/panel/pedidos-qr",
      label: "Cocina / pedidos",
      icon: ChefHat,
    },
  ];

  const itemsFinales = [{ href: "/ajustes", label: "Ajustes", icon: Settings }];

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
        {itemsPrincipales
          .filter((item) => item.visible)
          .map((item) => {
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

        {modulos.camarero_digital && (
          <>
            <div className="my-2 h-px bg-slate-200 dark:bg-slate-800" />

            <button
              type="button"
              onClick={() => setCamareroAbierto((actual) => !actual)}
              className={[
                "flex items-center justify-between rounded-xl px-3 py-3 text-left transition",
                camareroDigitalActivo
                  ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <Utensils size={18} />
                <span className={camareroDigitalActivo ? "font-semibold" : ""}>
                  Camarero digital
                </span>
              </div>

              <ChevronDown
                size={16}
                className={[
                  "transition-transform",
                  camareroAbierto ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {camareroAbierto && (
              <div className="ml-4 mt-1 flex flex-col gap-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                {camareroItems.map((item) => {
                  const isActive = isItemActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={[
                        "flex items-center justify-between rounded-xl px-3 py-2.5 transition",
                        isActive
                          ? "bg-orange-500 text-white"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={16} />
                        <span className={isActive ? "font-semibold" : ""}>
                          {item.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="my-2 h-px bg-slate-200 dark:bg-slate-800" />

        {itemsFinales.map((item) => {
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
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}