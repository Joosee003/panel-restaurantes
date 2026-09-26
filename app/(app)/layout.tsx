"use client";

import "../globals.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import Sidebar from "./components/Sidebar";
import ThemeProvider from "./components/ThemeProvider";
import RequireLandscape from "./components/RequireLandscape";
import AuthGuard from "./components/AuthGuard";
import DemoModeGuard from "./components/DemoModeGuard";
import ModuleRouteGuard from "./components/ModuleRouteGuard";
import RestaurantScope from "./components/RestaurantScope";
import "./components/turno-vivo/turno-vivo.css";
import "./components/product/product.css";

const pageNames: Record<string, string> = {
  "/dashboard": "Hoy",
  "/reservas": "Reservas",
  "/sala": "Sala",
  "/clientes": "Clientes",
  "/resenas": "Reseñas",
  "/estadisticas": "Métricas",
  "/dashboard/rentabilidad": "Rentabilidad",
  "/dashboard/fidelizacion": "Fidelización",
  "/panel/carta-productos": "Productos carta",
  "/panel/qr-mesas": "QR mesas",
  "/panel/menu-dia": "Menú del día",
  "/panel/pedidos-qr": "Cocina / pedidos",
  "/ajustes": "Ajustes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  const isLogin = pathname === "/login";
  const isTurnoSurface =
    pathname === "/dashboard" ||
    pathname === "/reservas" ||
    pathname === "/clientes" ||
    pathname.startsWith("/clientes/");
  const isProductSurface = isTurnoSurface || [
    "/sala", "/resenas", "/estadisticas", "/dashboard/rentabilidad",
    "/dashboard/fidelizacion", "/panel", "/ajustes",
  ].some((path) => pathname === path || pathname.startsWith(path + "/"));
  const title = useMemo(() => {
    const exact = pageNames[pathname];
    if (exact) return exact;
    const found = Object.entries(pageNames).sort(([a], [b]) => b.length - a.length).find(([path]) => pathname.startsWith(`${path}/`));
    return found?.[1] || "Panel";
  }, [pathname]);

  useEffect(() => {
    const dialog = mobileDialog.current;
    if (mobileOpen && dialog && !dialog.open) dialog.showModal();
    if (!mobileOpen && dialog?.open) dialog.close();
  }, [mobileOpen]);

  return (
    <RestaurantScope><AuthGuard>
      <ThemeProvider>
        {isLogin ? children : (
          <RequireLandscape>
            <div className="gh-panel-shell gh-product-shell min-h-screen">
              <a href="#gh-workspace" className="gh-skip-link">Saltar al contenido</a>
              <div className="gh-desktop-navigation"><Sidebar /></div>
              <div className="gh-mobile-top">
                <Link href="/dashboard" aria-label="GastroHelp, Hoy">GastroHelp</Link>
                <span>{title}</span>
                <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir navegación" aria-haspopup="dialog"><Menu size={21} /></button>
              </div>
              <dialog ref={mobileDialog} className="gh-mobile-navigation" aria-label="Navegación principal"
                onCancel={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)}
                onClick={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
                <button type="button" onClick={() => setMobileOpen(false)} className="gh-mobile-close" aria-label="Cerrar navegación"><X size={22} /></button>
                {mobileOpen ? <Sidebar mobile onNavigate={() => setMobileOpen(false)} /> : null}
              </dialog>
              <main id="gh-workspace" tabIndex={-1} className={`gh-panel-main min-w-0 ${isProductSurface ? "gh-turno-scope gh-product-scope" : ""}`}>
                <div className="gh-product-content">
                  <DemoModeGuard />
                  <ModuleRouteGuard>{children}</ModuleRouteGuard>
                  <footer className="gh-product-footer"><span>GastroHelp</span><span>Tu restaurante, en orden.</span></footer>
                </div>
              </main>
            </div>
          </RequireLandscape>
        )}
      </ThemeProvider>
    </AuthGuard></RestaurantScope>
  );
}
