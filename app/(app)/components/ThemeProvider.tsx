"use client";

import { createContext, useContext, useEffect, useState } from "react";

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
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
    setDark(false);
  }, []);

  function toggle() {
    // Panel fijado en modo claro para evitar pantallas mezcladas: fondo claro + tarjetas oscuras.
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
    setDark(false);
  }

  return (
    <ThemeContext.Provider value={{ dark, theme: "light", toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
