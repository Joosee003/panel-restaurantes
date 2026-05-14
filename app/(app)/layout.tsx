"use client";

import "../globals.css";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./components/Sidebar";
import ThemeProvider from "./components/ThemeProvider";
import RequireLandscape from "./components/RequireLandscape";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isLogin = pathname === "/login";

  return (
    <ThemeProvider>
      {isLogin ? (
        <>{children}</>
      ) : (
        <RequireLandscape>
          <div className="min-h-screen transition-colors duration-300">
            {/* TOP BAR MÓVIL */}
            <div className="flex items-center justify-between border-b border-gray-200 p-4 lg:hidden dark:border-gray-800">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                ☰
              </button>

              <span className="text-sm font-bold uppercase">Panel</span>
            </div>

            {/* SIDEBAR MÓVIL */}
            {mobileOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setMobileOpen(false)}
                />

                <div className="absolute left-0 top-0 h-full w-64 shadow-xl">
                  <Sidebar mobile onNavigate={() => setMobileOpen(false)} />
                </div>
              </div>
            )}

            <div className="flex min-h-screen">
              {/* SIDEBAR DESKTOP */}
              <div className="hidden lg:block">
                <Sidebar />
              </div>

              {/* CONTENIDO */}
              <main className="flex min-h-screen flex-1 flex-col p-4 sm:p-6 lg:ml-64">
                <div className="flex-1">{children}</div>

                <div className="mt-10 flex justify-center py-6">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    © {new Date().getFullYear()} GastroHelp®
                  </span>
                </div>
              </main>
            </div>
          </div>
        </RequireLandscape>
      )}
    </ThemeProvider>
  );
}