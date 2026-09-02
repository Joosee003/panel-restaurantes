"use client";

import { createContext, useContext, useEffect } from "react";

type ThemeContextType = {
  dark: boolean;
  theme: "dark" | "light";
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de ThemeProvider");
  return ctx;
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const dark = false;

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }, []);

  function toggle() {
    // Panel fijado en modo claro para evitar pantallas mezcladas: fondo claro + tarjetas oscuras.
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }

  return (
    <ThemeContext.Provider value={{ dark, theme: "light", toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
