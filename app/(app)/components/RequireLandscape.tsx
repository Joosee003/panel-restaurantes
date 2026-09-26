"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function RequireLandscape({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const allowsPortrait =
    pathname === "/dashboard" ||
    pathname === "/reservas" ||
    pathname === "/clientes" ||
    pathname.startsWith("/clientes/") ||
    ["/sala", "/resenas", "/estadisticas", "/dashboard/rentabilidad", "/dashboard/fidelizacion", "/panel", "/ajustes"]
      .some((path) => pathname === path || pathname.startsWith(path + "/"));

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth <= 768;
      const portrait = window.innerHeight > window.innerWidth;

      setIsMobile(mobile);
      setIsPortrait(portrait);
    };

    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);

    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (!allowsPortrait && isMobile && isPortrait) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white text-center px-6">
        <div className="text-2xl font-semibold mb-4">
          Gira el móvil
        </div>
        <p className="text-sm opacity-80">
          Este panel está pensado para verse en horizontal
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
