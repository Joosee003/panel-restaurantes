"use client";

import "../globals.css";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./components/Sidebar";
import ThemeProvider from "./components/ThemeProvider";
import RequireLandscape from "./components/RequireLandscape";
import AuthGuard from "./components/AuthGuard";
import DemoModeGuard from "./components/DemoModeGuard";

const pageNames: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/reservas": "Reservas",
  "/sala": "Sala",
  "/clientes": "Clientes",
  "/resenas": "Reseñas",
  "/panel/carta-productos": "Productos carta",
  "/panel/qr-mesas": "QR mesas",
  "/panel/menu-dia": "Menú del día",
  "/panel/pedidos-qr": "Cocina / pedidos",
  "/ajustes": "Ajustes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isLogin = pathname === "/login";
  const title = useMemo(() => {
    const exact = pageNames[pathname];
    if (exact) return exact;
    const found = Object.entries(pageNames).find(([path]) => pathname.startsWith(`${path}/`));
    return found?.[1] || "Panel";
  }, [pathname]);

  return (
    <AuthGuard>
      <ThemeProvider>
        {isLogin ? (
          <>{children}</>
        ) : (
        <RequireLandscape>
          <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
            <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 p-4 backdrop-blur lg:hidden">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:bg-slate-50"
              >
                ☰
              </button>
              <span className="text-sm font-black uppercase tracking-widest text-slate-700">{title}</span>
              <span className="h-9 w-9" />
            </div>

            {mobileOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <div className="absolute inset-0 bg-slate-950/40" onClick={() => setMobileOpen(false)} />
                <div className="absolute left-0 top-0 h-full w-64 shadow-2xl">
                  <Sidebar mobile onNavigate={() => setMobileOpen(false)} />
                </div>
              </div>
            )}

            <div className="flex min-h-screen">
              <div className="hidden lg:block">
                <Sidebar />
              </div>

              <main className="flex min-h-screen min-w-0 flex-1 flex-col p-4 sm:p-6 lg:ml-64">
                <DemoModeGuard />
                <div className="w-full min-w-0 flex-1">{children}</div>

                <div className="mt-10 flex justify-center py-6">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    GastroHelp · Panel restaurante
                  </span>
                </div>
              </main>
            </div>
          </div>
        </RequireLandscape>
        )}
      </ThemeProvider>
    </AuthGuard>
  );
}
