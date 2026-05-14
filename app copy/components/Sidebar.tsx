"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  LayoutGrid,
  Users,
  MessageSquare,
  Settings,
} from "lucide-react";

const reseñasPendientes = 2;

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reservas", label: "Reservas", icon: CalendarDays },
  { href: "/sala", label: "Sala", icon: LayoutGrid },
  { href: "/clientes", label: "Clientes", icon: Users },
  {
    href: "/resenas",
    label: "Reseñas",
    icon: MessageSquare,
    badge: reseñasPendientes,
  },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="
      w-64 fixed left-0 top-0 h-screen p-6 flex flex-col gap-6
      bg-white text-gray-900 border-r border-gray-200
      dark:bg-[#0b1220] dark:text-white dark:border-gray-800
      transition-colors duration-300
    "
    >
      <div>
        <h1 className="text-xl font-bold">Panel Restaurante</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Vista general
        </p>
      </div>

      <nav className="flex flex-col gap-1 text-sm">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center justify-between px-3 py-2 rounded-md transition",
                isActive
                  ? "bg-gray-100 dark:bg-gray-800 font-semibold"
                  : "hover:bg-gray-50 dark:hover:bg-gray-900",
              ].join(" ")}
            >
              <div className="flex items-center gap-3">
                <Icon size={18} />
                {item.label}
              </div>

              {item.badge && item.badge > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}