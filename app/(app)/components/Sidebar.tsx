"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  ChefHat,
  ChevronDown,
  Gift,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  LogOut,
  Pencil,
  QrCode,
  Settings,
  Utensils,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";

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
  const router = useRouter();

  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [restauranteNombre, setRestauranteNombre] = useState("Restaurante");
  const [modulos, setModulos] = useState<ModulosRestaurante>(modulosDefault);

  const [reservasPendientes, setReservasPendientes] = useState(0);
  const [clientesNuevos, setClientesNuevos] = useState(0);
  const [resenasPendientes, setResenasPendientes] = useState(0);

  const camareroDigitalActivo =
    pathname.startsWith("/panel/carta-productos") ||
    pathname.startsWith("/panel/qr-mesas") ||
    pathname.startsWith("/panel/menu-dia") ||
    pathname.startsWith("/panel/pedidos-qr");

  const [camareroAbierto, setCamareroAbierto] = useState(false);
  const mostrarCamarero = camareroAbierto || camareroDigitalActivo;

  useEffect(() => {
    const cargarRestaurante = async () => {
      const id = await getRestauranteUsuario();
      if (id) {
        setRestauranteId(id);
      }
    };

    cargarRestaurante();
  }, []);

  useEffect(() => {
    if (!restauranteId) return;

    const cargarDatosRestaurante = async () => {
      const [restauranteRes, modulosRes] = await Promise.all([
        supabase.from("restaurantes").select("nombre").eq("id", restauranteId).maybeSingle(),
        supabase
          .from("restaurante_modulos")
          .select(
            "reservas, clientes, resenas, fidelizacion, metricas, chatbot, camarero_digital, menu_digital, automatizaciones"
          )
          .eq("restaurante_id", restauranteId)
          .maybeSingle(),
      ]);

      if (restauranteRes.data?.nombre) {
        setRestauranteNombre(String(restauranteRes.data.nombre));
      }

      if (modulosRes.error) {
        console.error("Error cargando módulos:", modulosRes.error);
      }

      if (modulosRes.data) {
        setModulos({
          reservas: Boolean(modulosRes.data.reservas),
          clientes: Boolean(modulosRes.data.clientes),
          resenas: Boolean(modulosRes.data.resenas),
          fidelizacion: Boolean(modulosRes.data.fidelizacion),
          metricas: Boolean(modulosRes.data.metricas),
          chatbot: Boolean(modulosRes.data.chatbot),
          camarero_digital: Boolean(modulosRes.data.camarero_digital),
          menu_digital: Boolean(modulosRes.data.menu_digital),
          automatizaciones: Boolean(modulosRes.data.automatizaciones),
        });
      }
    };

    cargarDatosRestaurante();
  }, [restauranteId]);

  useEffect(() => {
    if (!restauranteId) return;

    const cargarContadores = async () => {
      if (modulos.reservas) {
        const { count } = await supabase
          .from("reservas")
          .select("*", { count: "exact", head: true })
          .eq("restaurante_id", restauranteId)
          .eq("estado", "pendiente");
        setReservasPendientes(count ?? 0);
      }

      if (modulos.clientes) {
        const hoy = new Date();
        const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

        const { count } = await supabase
          .from("clientes")
          .select("*", { count: "exact", head: true })
          .eq("restaurante_id", restauranteId)
          .gte("created_at", `${dia} 00:00:00`)
          .lte("created_at", `${dia} 23:59:59`);
        setClientesNuevos(count ?? 0);
      }

      if (modulos.resenas) {
        const { count } = await supabase
          .from("resenas")
          .select("*", { count: "exact", head: true })
          .eq("restaurante_id", restauranteId)
          .eq("responded", false);
        setResenasPendientes(count ?? 0);
      }
    };

    cargarContadores();
  }, [restauranteId, modulos]);

  useEffect(() => {
    if (!restauranteId || !modulos.reservas) return;

    const canal = supabase
      .channel(`sidebar-reservas-${restauranteId}`)
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
    { href: "/reservas", label: "Reservas", icon: CalendarDays, badge: reservasPendientes, visible: modulos.reservas },
    { href: "/sala", label: "Sala", icon: LayoutGrid, visible: modulos.reservas },
    { href: "/clientes", label: "Clientes", icon: Users, badge: clientesNuevos, visible: modulos.clientes },
    { href: "/resenas", label: "Reseñas", icon: MessageSquare, badge: resenasPendientes, visible: modulos.resenas },
    { href: "/dashboard/rentabilidad", label: "Rentabilidad", icon: BarChart3, visible: modulos.metricas },
    { href: "/dashboard/fidelizacion/cupones", label: "Fidelización", icon: Gift, visible: modulos.fidelizacion },
  ];

  const camareroItems = [
    { href: "/panel/carta-productos", label: "Productos carta", icon: Pencil },
    { href: "/panel/qr-mesas", label: "QR mesas", icon: QrCode },
    { href: "/panel/menu-dia", label: "Menú del día", icon: CalendarClock },
    { href: "/panel/pedidos-qr", label: "Cocina / pedidos", icon: ChefHat },
  ];

  const isItemActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const badge = (value?: number) =>
    value ? (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">
        {value}
      </span>
    ) : null;

  const cerrarSesion = async () => {
    window.localStorage.removeItem("gastrohelp_restaurante_activo");
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside
      className={[
        "flex h-full w-64 flex-col border-r border-slate-200 bg-white p-5 text-slate-900 shadow-sm",
        mobile ? "" : "fixed left-0 top-0 h-screen",
      ].join(" ")}
    >
      <div className="rounded-3xl bg-slate-50 p-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Panel Restaurante</p>
        <h1 className="mt-1 truncate text-lg font-black text-slate-950">{restauranteNombre}</h1>
        <p className="mt-1 text-xs font-semibold text-slate-500">Vista general</p>
      </div>

      <nav className="mt-5 flex flex-1 flex-col gap-1 overflow-y-auto pr-1 text-sm">
        {itemsPrincipales.filter((item) => item.visible).map((item) => {
          const isActive = isItemActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={[
                "flex items-center justify-between rounded-2xl px-3 py-3 font-bold transition",
                isActive
                  ? "bg-blue-700 text-white shadow-sm"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
              ].join(" ")}
            >
              <span className="flex items-center gap-3">
                <Icon size={18} />
                {item.label}
              </span>
              {badge(item.badge)}
            </Link>
          );
        })}

        {modulos.camarero_digital && (
          <div className="my-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setCamareroAbierto((actual) => !actual)}
              className={[
                "flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left font-black transition",
                camareroDigitalActivo
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-800 hover:bg-slate-100",
              ].join(" ")}
            >
              <span className="flex items-center gap-3">
                <Utensils size={18} />
                Camarero digital
              </span>
              <ChevronDown size={16} className={mostrarCamarero ? "rotate-180 transition" : "transition"} />
            </button>

            {mostrarCamarero && (
              <div className="mt-2 flex flex-col gap-1 border-l border-slate-200 pl-3">
                {camareroItems.map((item) => {
                  const isActive = isItemActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={[
                        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition",
                        isActive
                          ? "bg-blue-700 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                      ].join(" ")}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-auto border-t border-slate-200 pt-3">
          <Link
            href="/ajustes"
            onClick={onNavigate}
            className={[
              "flex items-center gap-3 rounded-2xl px-3 py-3 font-bold transition",
              isItemActive("/ajustes")
                ? "bg-blue-700 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
            ].join(" ")}
          >
            <Settings size={18} />
            Ajustes
          </Link>
          <button
            type="button"
            onClick={cerrarSesion}
            className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-bold text-red-600 transition hover:bg-red-50 hover:text-red-700"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </nav>
    </aside>
  );
}
