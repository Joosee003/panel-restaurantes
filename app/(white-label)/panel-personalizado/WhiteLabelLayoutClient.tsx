"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, LayoutGrid, LogOut, NotebookTabs, Settings2, Tags, Users } from "lucide-react";
import AuthGuard from "../../(app)/components/AuthGuard";
import RestaurantScope from "../../(app)/components/RestaurantScope";
import AgencyRestaurantContext from "../../(app)/components/AgencyRestaurantContext";
import DemoModeGuard from "../../(app)/components/DemoModeGuard";
import ModuleRouteGuard from "../../(app)/components/ModuleRouteGuard";
import ThemeProvider from "../../(app)/components/ThemeProvider";
import { getRestauranteUsuario } from "../../(app)/lib/getRestauranteUsuario";
import { getWhiteLabelBrand, type WhiteLabelBrand } from "../../white-label/brands";
import "../../(app)/components/turno-vivo/turno-vivo.css";
import "../../(app)/components/product/product.css";
import "./white-label.css";

const links = [
  { href: "/panel-personalizado", label: "Inicio", Icon: House },
  { href: "/panel-personalizado/reservas", label: "Reservas", Icon: CalendarDays },
  { href: "/panel-personalizado/sala", label: "Mesas", Icon: LayoutGrid },
  { href: "/panel-personalizado/clientes", label: "Clientes", Icon: Users },
  { href: "/panel-personalizado/carta", label: "Carta", Icon: NotebookTabs },
  { href: "/panel-personalizado/promociones", label: "Promociones", Icon: Tags },
];

function BrandedPanel({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [brand, setBrand] = useState<WhiteLabelBrand | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getRestauranteUsuario().then(id => {
      if (active) setBrand(getWhiteLabelBrand(id));
    }).catch(() => {
      if (active) setBrand(null);
    });
    return () => { active = false; };
  }, [pathname]);

  if (brand === undefined) return <div className="wl-state" role="status">Preparando el panel…</div>;
  if (!brand) return <div className="wl-state" role="alert">
    <h1>Panel personalizado no configurado</h1>
    <p>Este restaurante todavía no tiene una identidad White Label asignada.</p>
    <Link href="/dashboard">Volver a GastroHelp</Link>
  </div>;

  const style = {
    "--wl-ink": brand.ink,
    "--wl-accent": brand.accent,
    "--wl-paper": brand.paper,
  } as CSSProperties;

  return <div className="wl-shell" style={style}>
    <a className="wl-skip" href="#wl-content">Saltar al contenido</a>
    <aside className="wl-sidebar" aria-label="Panel de restaurante">
      <Link className="wl-brand" href="/panel-personalizado" aria-label={`${brand.name}, inicio`}>
        <span className="wl-mark">{brand.mark}<b>.</b></span>
        <span><strong>{brand.name}</strong><small>PANEL PRIVADO</small></span>
      </Link>
      <p className="wl-side-caption">TU RESTAURANTE</p>
      <nav aria-label="Navegación del panel">
        {links.map(({ href, label, Icon }) => <Link key={href} href={href}
          aria-current={pathname === href || (href !== "/panel-personalizado" && pathname.startsWith(`${href}/`)) ? "page" : undefined}>
          <Icon size={19} aria-hidden="true" /><span>{label}</span>
        </Link>)}
      </nav>
      <div className="wl-sidebar-foot">Una vista de GastroHelp para {brand.name}.</div>
    </aside>
    <div className="wl-body">
      <header className="wl-topbar"><span className="wl-mobile-name">{brand.name}</span><span className="wl-topbar-label">Gestión del restaurante</span><div className="wl-topbar-actions"><Link href="/panel-personalizado/ajustes"><Settings2 size={16} aria-hidden="true" />Ajustes</Link><Link href="/logout"><LogOut size={16} aria-hidden="true" />Salir</Link></div></header>
      <main id="wl-main" className="wl-main gh-turno-scope gh-product-scope" tabIndex={-1}>
        <div id="wl-content">{children}</div>
      </main>
    </div>
  </div>;
}

export default function WhiteLabelLayout({ children }: { children: ReactNode }) {
  return <RestaurantScope><AuthGuard><ThemeProvider><AgencyRestaurantContext>
    <DemoModeGuard />
    <ModuleRouteGuard><BrandedPanel>{children}</BrandedPanel></ModuleRouteGuard>
  </AgencyRestaurantContext></ThemeProvider></AuthGuard></RestaurantScope>;
}
