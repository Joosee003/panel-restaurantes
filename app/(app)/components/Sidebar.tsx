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
import { setActiveRestaurant } from "../lib/activeRestaurant";
import ServiceClock from "./product/ServiceClock";
import {
  defaultRestaurantModules,
  parseRestaurantModules,
  restaurantModuleColumns,
  type RestaurantModules,
} from "../lib/restaurantModules";

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
  const [modulos, setModulos] = useState<RestaurantModules>(defaultRestaurantModules);

  const [reservasPendientes, setReservasPendientes] = useState(0);
  const [clientesNuevos, setClientesNuevos] = useState(0);
  const [resenasPendientes, setResenasPendientes] = useState(0);

  const menuDigitalActivo =
    pathname.startsWith("/panel/carta-productos") ||
    pathname.startsWith("/panel/menu-dia");
  const camareroDigitalActivo =
    pathname.startsWith("/panel/qr-mesas") ||
    pathname.startsWith("/panel/pedidos-qr");

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [camareroAbierto, setCamareroAbierto] = useState(false);
  const mostrarMenu = menuAbierto || menuDigitalActivo;
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
          .select(restaurantModuleColumns)
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
        setModulos(parseRestaurantModules(modulosRes.data));
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
    { href: "/dashboard", label: "Hoy", icon: LayoutDashboard, visible: true },
    { href: "/reservas", label: "Reservas", icon: CalendarDays, badge: reservasPendientes, visible: modulos.reservas },
    { href: "/sala", label: "Sala", icon: LayoutGrid, visible: modulos.reservas },
    { href: "/clientes", label: "Clientes", icon: Users, badge: clientesNuevos, visible: modulos.clientes },
    { href: "/resenas", label: "Reseñas", icon: MessageSquare, badge: resenasPendientes, visible: modulos.resenas },
    { href: "/estadisticas", label: "Métricas", icon: BarChart3, visible: modulos.metricas },
    { href: "/dashboard/rentabilidad", label: "Rentabilidad", icon: BarChart3, visible: modulos.rentabilidad },
    { href: "/dashboard/fidelizacion/cupones", label: "Fidelización", icon: Gift, visible: modulos.fidelizacion },
  ];

  const menuDigitalItems = [
    { href: "/panel/carta-productos", label: "Productos carta", icon: Pencil },
    { href: "/panel/menu-dia", label: "Menú del día", icon: CalendarClock },
  ];

  const camareroItems = [
    { href: "/panel/qr-mesas", label: "QR mesas", icon: QrCode },
    { href: "/panel/pedidos-qr", label: "Cocina / pedidos", icon: ChefHat },
  ];

  const isItemActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const badge = (value?: number) =>
    value ? (
      <span className="gh-nav-count">
        {value}
      </span>
    ) : null;

  const cerrarSesion = async () => {
    setActiveRestaurant(null);
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  };

  const navigate = (event: React.MouseEvent<HTMLElement>) => {
    if (!mobile) event.currentTarget.closest("details")?.removeAttribute("open");
    onNavigate?.();
  };

  const renderItem = (item: typeof itemsPrincipales[number]) => {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} onClick={navigate}
        className="gh-nav-link" aria-current={isItemActive(item.href) ? "page" : undefined}>
        <span>{mobile ? <Icon size={16} aria-hidden="true" /> : null}{item.label}</span>
        {badge(item.badge)}
      </Link>
    );
  };

  return (
    <aside className="gh-service-nav" aria-label="Navegación del restaurante"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !mobile) {
          const details = event.currentTarget.querySelector("details[open]");
          details?.removeAttribute("open");
          (details?.querySelector("summary") as HTMLElement | null)?.focus();
        }
      }}>
      <Link href="/dashboard" className="gh-nav-brand" onClick={navigate}>
        <strong>GastroHelp</strong><span>{restauranteNombre}</span>
      </Link>
      <nav className="gh-nav-primary" aria-label="Principal">
        {itemsPrincipales.slice(0, 4).filter((item) => item.visible).map(renderItem)}
        <details className="gh-nav-more" open={mobile || undefined}>
          <summary className="gh-nav-link">Más <ChevronDown size={14} aria-hidden="true" /></summary>
          <div className="gh-nav-menu">
            {itemsPrincipales.some((item, i) => [4, 7].includes(i) && item.visible) ? (
              <section className="gh-nav-group">
                <h2>Relación con el cliente</h2>
                {itemsPrincipales.filter((item, i) => [4, 7].includes(i) && item.visible).map(renderItem)}
              </section>
            ) : null}
            {itemsPrincipales.some((item, i) => [5, 6].includes(i) && item.visible) ? (
              <section className="gh-nav-group">
                <h2>Negocio</h2>
                {itemsPrincipales.filter((item, i) => [5, 6].includes(i) && item.visible).map(renderItem)}
              </section>
            ) : null}
            {modulos.menu_digital ? (
              <section className="gh-nav-group">
                <button type="button" className="gh-nav-link" onClick={() => setMenuAbierto((actual) => !actual)} aria-expanded={mostrarMenu} aria-controls={`gh-menu-digital-${mobile ? "mobile" : "desktop"}`}>
                  <span><Utensils size={16} aria-hidden="true" /> Carta QR</span><ChevronDown size={14} />
                </button>
                {mostrarMenu ? <div id={`gh-menu-digital-${mobile ? "mobile" : "desktop"}`}>{menuDigitalItems.map((item) => renderItem({ ...item, visible: true }))}</div> : null}
              </section>
            ) : null}
            {modulos.camarero_digital ? (
              <section className="gh-nav-group">
                <button type="button" className="gh-nav-link" onClick={() => setCamareroAbierto((actual) => !actual)} aria-expanded={mostrarCamarero} aria-controls={`gh-camarero-digital-${mobile ? "mobile" : "desktop"}`}>
                  <span><ChefHat size={16} aria-hidden="true" /> Camarero digital</span><ChevronDown size={14} />
                </button>
                {mostrarCamarero ? <div id={`gh-camarero-digital-${mobile ? "mobile" : "desktop"}`}>{camareroItems.map((item) => renderItem({ ...item, visible: true }))}</div> : null}
              </section>
            ) : null}
            <div className="gh-nav-account">
              <Link href="/ajustes" onClick={navigate} aria-current={isItemActive("/ajustes") ? "page" : undefined}><Settings size={16} /> Ajustes</Link>
              <button type="button" onClick={cerrarSesion}><LogOut size={15} /> Cerrar sesión</button>
            </div>
          </div>
        </details>
      </nav>
      {!mobile ? <ServiceClock /> : null}
    </aside>
  );
}
