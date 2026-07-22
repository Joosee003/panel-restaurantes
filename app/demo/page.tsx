"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  ChefHat,
  ChevronDown,
  Gift,
  LayoutDashboard,
  LayoutGrid,
  LockKeyhole,
  Menu,
  MessageSquare,
  Moon,
  Pencil,
  Percent,
  QrCode,
  RefreshCw,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  Utensils,
  X,
  Zap,
} from "lucide-react";

type Section =
  | "dashboard"
  | "reservas"
  | "sala"
  | "clientes"
  | "resenas"
  | "rentabilidad"
  | "fidelizacion"
  | "productos"
  | "qr"
  | "cocina"
  | "estadisticas"
  | "ajustes";

type NavItem = {
  key: Section;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: number;
};

const reservations = [
  { hora: "13:30", cliente: "Marta García", personas: 4, origen: "Web", mesa: "Mesa 4", estado: "Confirmada" },
  { hora: "14:00", cliente: "Luis Romero", personas: 2, origen: "WhatsApp", mesa: "Mesa 2", estado: "Confirmada" },
  { hora: "14:30", cliente: "Elena Martín", personas: 5, origen: "Teléfono", mesa: "Mesa 8", estado: "Pendiente" },
  { hora: "20:30", cliente: "Paula Sánchez", personas: 6, origen: "Web", mesa: "Mesa 10", estado: "Confirmada" },
  { hora: "21:00", cliente: "Carlos Mora", personas: 3, origen: "Google", mesa: "Mesa 6", estado: "Confirmada" },
  { hora: "21:30", cliente: "Ana Vidal", personas: 5, origen: "Web", mesa: "Mesa 9", estado: "Pendiente" },
  { hora: "22:00", cliente: "Javier León", personas: 2, origen: "Manual", mesa: "Sin asignar", estado: "Cancelada" },
  { hora: "22:15", cliente: "Sergio Ruiz", personas: 4, origen: "WhatsApp", mesa: "Mesa 7", estado: "Confirmada" },
];

const clients = [
  { nombre: "Marta García", iniciales: "MG", visitas: 12, gasto: "684 €", puntos: 6840, ultima: "Hace 9 días", segmento: "VIP" },
  { nombre: "Luis Romero", iniciales: "LR", visitas: 7, gasto: "348 €", puntos: 3480, ultima: "Hace 21 días", segmento: "Recurrente" },
  { nombre: "Paula Sánchez", iniciales: "PS", visitas: 5, gasto: "412 €", puntos: 4120, ultima: "Hace 14 días", segmento: "Recurrente" },
  { nombre: "Carlos Mora", iniciales: "CM", visitas: 3, gasto: "189 €", puntos: 1890, ultima: "Hace 32 días", segmento: "En riesgo" },
  { nombre: "Ana Vidal", iniciales: "AV", visitas: 9, gasto: "531 €", puntos: 5310, ultima: "Hace 6 días", segmento: "VIP" },
  { nombre: "Javier León", iniciales: "JL", visitas: 2, gasto: "94 €", puntos: 940, ultima: "Hace 87 días", segmento: "Inactivo" },
];

const products = [
  { nombre: "Tataki de atún", categoria: "Entrantes", precio: "18,90 €", coste: "6,20 €", margen: "67%", foto: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80" },
  { nombre: "Pasta trufada", categoria: "Principales", precio: "17,50 €", coste: "4,80 €", margen: "73%", foto: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=80" },
  { nombre: "Pizza burrata", categoria: "Principales", precio: "16,90 €", coste: "5,10 €", margen: "70%", foto: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80" },
  { nombre: "Burger La Reserva", categoria: "Principales", precio: "15,90 €", coste: "5,40 €", margen: "66%", foto: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80" },
  { nombre: "Entrecot madurado", categoria: "Carnes", precio: "27,00 €", coste: "11,20 €", margen: "59%", foto: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80" },
  { nombre: "Tarta de queso", categoria: "Postres", precio: "7,50 €", coste: "1,85 €", margen: "75%", foto: "https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80" },
];

const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "reservas", label: "Reservas", icon: CalendarDays, badge: 3 },
  { key: "sala", label: "Sala", icon: LayoutGrid },
  { key: "clientes", label: "Clientes", icon: Users, badge: 8 },
  { key: "resenas", label: "Reseñas", icon: MessageSquare, badge: 6 },
  { key: "rentabilidad", label: "Rentabilidad", icon: BarChart3 },
  { key: "fidelizacion", label: "Fidelización", icon: Gift },
];

const digitalItems: NavItem[] = [
  { key: "productos", label: "Productos carta", icon: Pencil },
  { key: "qr", label: "QR mesas", icon: QrCode },
  { key: "cocina", label: "Cocina / pedidos", icon: ChefHat },
];

const sectionTitles: Record<Section, string> = {
  dashboard: "Dashboard",
  reservas: "Reservas",
  sala: "Sala",
  clientes: "Clientes",
  resenas: "Reseñas",
  rentabilidad: "Rentabilidad",
  fidelizacion: "Fidelización",
  productos: "Productos carta",
  qr: "QR mesas",
  cocina: "Cocina / pedidos",
  estadisticas: "Estadísticas",
  ajustes: "Ajustes",
};

function DemoButton({ children, onClick, primary = false }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        primary
          ? "border-slate-800 bg-slate-800 text-white dark:border-white dark:bg-white dark:text-slate-900"
          : "border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function StatCard({ title, value, context, icon: Icon, color }: { title: string; value: string; context: string; icon: React.ComponentType<{ size?: number }>; color: "blue" | "green" | "red" | "purple" }) {
  const map = {
    blue: { line: "from-blue-500 to-cyan-400", box: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
    green: { line: "from-emerald-500 to-teal-400", box: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
    red: { line: "from-rose-500 to-pink-400", box: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
    purple: { line: "from-violet-500 to-fuchsia-400", box: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  }[color];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950">
      <div className={`mb-3 h-1 w-full rounded-full bg-gradient-to-r ${map.line}`} />
      <div className="flex items-start gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-slate-200 dark:ring-white/10 ${map.box}`}>
          <Icon size={22} />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1 text-3xl font-extrabold leading-none text-slate-900 dark:text-white">{value}</p>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{context}</p>
        </div>
      </div>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const styles = value === "Confirmada" || value === "Activo" || value === "Listo"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value === "Pendiente" || value === "Nuevo"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>{value}</span>;
}

export default function DemoPage() {
  const [entered, setEntered] = useState(false);
  const [section, setSection] = useState<Section>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [digitalOpen, setDigitalOpen] = useState(true);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<(typeof reservations)[number] | null>(null);
  const [selectedClient, setSelectedClient] = useState<(typeof clients)[number] | null>(null);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buenos días";
    if (hour < 20) return "Buenas tardes";
    return "Buenas noches";
  }, []);

  const blocked = () => {
    setToast(true);
    window.setTimeout(() => setToast(false), 2200);
  };

  const goTo = (next: Section) => {
    setSection(next);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!entered) {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="grid min-h-screen lg:grid-cols-[1.12fr_.88fr]">
          <section
            className="relative hidden overflow-hidden lg:block"
            style={{ backgroundImage: "linear-gradient(90deg,rgba(2,6,23,.08),rgba(2,6,23,.78)),url(https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=88)", backgroundSize: "cover", backgroundPosition: "center" }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
            <div className="absolute bottom-16 left-16 right-16 z-10 max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/45 px-4 py-2 text-xs font-extrabold uppercase tracking-[.18em] backdrop-blur-xl">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_#34d399]" />
                Restaurante de demostración
              </span>
              <h1 className="mt-6 text-6xl font-black leading-[.94] tracking-[-.065em] xl:text-7xl">Entra como si fueras el dueño de un restaurante real.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">Recorre el mismo entorno visual del panel GastroHelp con información inventada y sin tocar ningún restaurante real.</p>
            </div>
          </section>

          <section className="grid place-items-center bg-[radial-gradient(circle_at_100%_0,rgba(109,74,255,.22),transparent_28%)] p-5 sm:p-10">
            <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[.055] p-7 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-9">
              <div className="text-2xl font-black tracking-[-.04em]">Gastro<span className="text-violet-400">Help</span></div>
              <span className="mt-7 inline-flex rounded-xl bg-violet-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-[.16em] text-violet-300">Acceso público de demostración</span>
              <h2 className="mt-5 text-4xl font-black tracking-[-.05em]">La Reserva</h2>
              <p className="mt-2 text-sm leading-6 text-white/55">La cuenta ya está preparada. Solo tienes que entrar para recorrer el panel.</p>

              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                <img className="h-16 w-16 rounded-2xl object-cover" src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=300&q=80" alt="Interior del restaurante demo" />
                <div>
                  <b className="block">La Reserva</b>
                  <span className="mt-1 block text-xs text-white/45">Restaurante mediterráneo · Castellón</span>
                </div>
              </div>

              <label className="mt-5 block text-xs font-bold text-white/60">Correo del restaurante</label>
              <input readOnly value="demo@lareserva.es" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white outline-none" />
              <label className="mt-4 block text-xs font-bold text-white/60">Contraseña</label>
              <input readOnly type="password" value="gastrohelp-demo" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white outline-none" />

              <button onClick={() => setEntered(true)} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-700 to-violet-500 font-black shadow-xl shadow-violet-900/30 transition hover:-translate-y-0.5 hover:shadow-2xl">
                Entrar como restaurante demo <ArrowRight size={18} />
              </button>

              <div className="mt-5 flex gap-3 text-xs leading-5 text-white/40">
                <LockKeyhole size={17} className="mt-0.5 shrink-0" />
                <p>Los datos son ficticios. Las acciones de edición, borrado y envío están bloqueadas.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-900 dark:text-slate-100">
        {mobileOpen && <button aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/45 lg:hidden" />}

        <aside className={[
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col gap-6 border-r border-slate-200 bg-white p-6 transition-transform dark:border-slate-800 dark:bg-slate-950",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Panel Restaurante</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Vista general</p>
            </div>
            <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1 text-slate-500 lg:hidden"><X size={20} /></button>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
            <img src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=180&q=75" alt="La Reserva" className="h-11 w-11 rounded-xl object-cover" />
            <div className="min-w-0">
              <b className="block truncate text-sm">La Reserva</b>
              <span className="block text-xs text-slate-500">Restaurante demo</span>
            </div>
          </div>

          <div className="-mt-3 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Entorno demo
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto text-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <button key={item.key} onClick={() => goTo(item.key)} className={[
                  "flex items-center justify-between rounded-xl px-3 py-3 text-left transition",
                  active ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70",
                ].join(" ")}>
                  <span className="flex items-center gap-3"><Icon size={18} /><span className={active ? "font-semibold" : ""}>{item.label}</span></span>
                  {item.badge ? <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">{item.badge}</span> : null}
                </button>
              );
            })}

            <div className="my-2 h-px bg-slate-200 dark:bg-slate-800" />
            <button onClick={() => setDigitalOpen((value) => !value)} className="flex items-center justify-between rounded-xl px-3 py-3 text-left text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70">
              <span className="flex items-center gap-3"><Utensils size={18} /><span>Camarero digital</span></span>
              <ChevronDown size={16} className={digitalOpen ? "rotate-180 transition" : "transition"} />
            </button>
            {digitalOpen && (
              <div className="ml-4 flex flex-col gap-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                {digitalItems.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.key;
                  return (
                    <button key={item.key} onClick={() => goTo(item.key)} className={[
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                      active ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70",
                    ].join(" ")}><Icon size={16} />{item.label}</button>
                  );
                })}
              </div>
            )}

            <div className="my-2 h-px bg-slate-200 dark:bg-slate-800" />
            <button onClick={() => goTo("estadisticas")} className={section === "estadisticas" ? "flex items-center gap-3 rounded-xl bg-slate-800 px-3 py-3 text-white dark:bg-white dark:text-slate-900" : "flex items-center gap-3 rounded-xl px-3 py-3 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70"}><BarChart3 size={18} />Estadísticas</button>
            <button onClick={() => goTo("ajustes")} className={section === "ajustes" ? "flex items-center gap-3 rounded-xl bg-slate-800 px-3 py-3 text-white dark:bg-white dark:text-slate-900" : "flex items-center gap-3 rounded-xl px-3 py-3 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70"}><Settings size={18} />Ajustes</button>
          </nav>

          <button onClick={() => setEntered(false)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">Salir de la demo</button>
        </aside>

        <main className="min-h-screen lg:ml-64">
          <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90 sm:px-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="rounded-xl border border-slate-300 bg-white p-2.5 lg:hidden dark:border-slate-700 dark:bg-slate-900"><Menu size={18} /></button>
              <div>
                <span className="block text-[10px] font-extrabold uppercase tracking-[.12em] text-violet-600 dark:text-violet-400">Datos ficticios · Demo GastroHelp</span>
                <h2 className="mt-1 text-lg font-bold">{sectionTitles[section]}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:inline-flex">● Demo activa</span>
              <button onClick={() => setDark((value) => !value)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"><Moon size={16} /></button>
              <a href="https://wa.me/34635846049?text=Hola%2C%20he%20probado%20el%20panel%20demo%20de%20GastroHelp" target="_blank" rel="noopener noreferrer" className="hidden rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white sm:inline-flex dark:bg-white dark:text-slate-900">Quiero esto en mi restaurante</a>
            </div>
          </header>

          <div className="p-4 sm:p-6">
            {section === "dashboard" && (
              <div className="space-y-6">
                <section className="relative min-h-[235px] overflow-hidden rounded-3xl shadow-xl shadow-slate-300/20 dark:shadow-black/20" style={{ backgroundImage: "linear-gradient(90deg,rgba(2,6,23,.92),rgba(2,6,23,.18)),url(https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=85)", backgroundSize: "cover", backgroundPosition: "center" }}>
                  <div className="absolute inset-0 flex items-end p-6 sm:p-8">
                    <div>
                      <span className="text-xs font-black uppercase tracking-[.14em] text-violet-300">Resumen del restaurante</span>
                      <h1 className="mt-3 text-4xl font-black tracking-[-.05em] text-white sm:text-5xl">{greeting}, La Reserva</h1>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">Esto es lo más importante del restaurante ahora mismo. Todo lo que ves pertenece únicamente al entorno de demostración.</p>
                    </div>
                  </div>
                  <div className="absolute right-5 top-5 flex flex-wrap gap-2"><span className="rounded-full border border-white/15 bg-slate-950/45 px-3 py-2 text-xs font-bold text-white backdrop-blur-xl">Abierto ahora</span><span className="rounded-full border border-white/15 bg-slate-950/45 px-3 py-2 text-xs font-bold text-white backdrop-blur-xl">Turno de cena</span></div>
                </section>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard title="Reservas hoy" value="24" context="12% más que el martes pasado" icon={CalendarDays} color="blue" />
                  <StatCard title="Clientes nuevos" value="8" context="4 proceden de la web" icon={Users} color="green" />
                  <StatCard title="Reseñas pendientes" value="6" context="Impactan en Google" icon={MessageSquare} color="red" />
                  <StatCard title="Ocupación" value="82%" context="Ocupación total del día" icon={Percent} color="purple" />
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-6">
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 xl:col-span-4">
                    <div className="mb-5 flex items-center justify-between"><div><h3 className="font-bold uppercase">Reservas de los últimos 7 días</h3><p className="mt-1 text-xs text-slate-500">Actividad del restaurante</p></div><button onClick={blocked} className="rounded-xl border border-slate-300 p-2.5 dark:border-slate-700"><RefreshCw size={16} /></button></div>
                    <div className="flex h-64 items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                      {[42, 58, 49, 72, 66, 96, 84].map((height, index) => <div key={height} className="relative flex-1 rounded-t-xl bg-gradient-to-t from-blue-700 to-cyan-400" style={{ height: `${height}%` }}><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate-500">{["L", "M", "X", "J", "V", "S", "D"][index]}</span></div>)}
                    </div>
                  </section>

                  <div className="grid gap-5 xl:col-span-2">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"><Sparkles size={18} /></span><h3 className="font-bold uppercase">Acciones</h3></div><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">4</span></div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">{[["Confirmar 3 reservas", "Antes de las 18:00"], ["Responder 2 reseñas", "Impactan en Google"], ["Reactivar 14 clientes", "Sin visita en 90 días"], ["Revisar martes", "Ocupación prevista: 46%"]].map(([title, sub]) => <button key={title} onClick={blocked} className="flex w-full items-center justify-between gap-4 py-3 text-left"><span><b className="block text-sm">{title}</b><small className="text-slate-500">{sub}</small></span><ArrowRight size={15} className="text-slate-400" /></button>)}</div>
                    </section>
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <div className="mb-3 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"><Bell size={18} /></span><h3 className="font-bold uppercase">Alertas</h3></div>
                      <div className="space-y-2"><div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">2 reservas pendientes de confirmar</div><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">Martes con ocupación inferior al objetivo</div></div>
                    </section>
                  </div>
                </div>
              </div>
            )}

            {section === "reservas" && (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Reservas</h1><p className="mt-1 text-sm text-slate-500">Calendario, turnos, estados y asistencia.</p></div><div className="flex gap-2"><DemoButton onClick={blocked}>Calendario</DemoButton><DemoButton onClick={blocked} primary>Nueva reserva</DemoButton></div></div>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse"><thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-widest text-slate-500 dark:border-slate-800 dark:bg-slate-900">{["Hora", "Cliente", "Personas", "Origen", "Mesa", "Estado"].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr></thead><tbody>{reservations.map((item) => <tr key={`${item.hora}-${item.cliente}`} onClick={() => setSelectedReservation(item)} className="cursor-pointer border-b border-slate-100 text-sm transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"><td className="px-4 py-4 font-bold">{item.hora}</td><td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-xs font-black text-violet-700">{item.cliente.split(" ").map((value) => value[0]).join("").slice(0, 2)}</span><b>{item.cliente}</b></div></td><td className="px-4 py-4">{item.personas}</td><td className="px-4 py-4">{item.origen}</td><td className="px-4 py-4">{item.mesa}</td><td className="px-4 py-4"><Status value={item.estado} /></td></tr>)}</tbody></table></div></section>
              </div>
            )}

            {section === "sala" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Sala y ocupación</h1><p className="mt-1 text-sm text-slate-500">Estado de las mesas para el turno de cena.</p></div><DemoButton onClick={blocked}>Configurar sala</DemoButton></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"><StatCard title="Mesas totales" value="18" context="72 plazas" icon={LayoutGrid} color="blue" /><StatCard title="Ocupadas" value="7" context="Servicio actual" icon={Users} color="green" /><StatCard title="Reservadas" value="6" context="Próximas 2 horas" icon={CalendarDays} color="purple" /><StatCard title="Disponibles" value="5" context="28 plazas libres" icon={TrendingUp} color="blue" /></div><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 15 }, (_, index) => { const state = index % 5 === 0 ? "Reservada" : index % 3 === 0 ? "Ocupada" : "Disponible"; return <button onClick={blocked} key={index} className={[
                "relative min-h-32 rounded-2xl border-2 p-4 text-left transition hover:-translate-y-0.5",
                state === "Ocupada" ? "border-emerald-400 bg-emerald-50" : state === "Reservada" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
              ].join(" ")}><b className="block">Mesa {index + 1}</b><span className="mt-1 block text-xs text-slate-500">{state}</span><span className="absolute bottom-3 right-3 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{[2, 4, 4, 6][index % 4]} plazas</span></button>; })}</div></section></div>
            )}

            {section === "clientes" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Clientes</h1><p className="mt-1 text-sm text-slate-500">Historial, recurrencia, gasto y puntos.</p></div><DemoButton onClick={blocked} primary>Añadir cliente</DemoButton></div><div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{clients.map((client) => <button key={client.nombre} onClick={() => setSelectedClient(client)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950"><div className="h-20 bg-gradient-to-br from-indigo-950 to-violet-500" /><div className="p-5 pt-0"><span className="-mt-8 grid h-16 w-16 place-items-center rounded-2xl border-4 border-white bg-violet-100 font-black text-violet-700 dark:border-slate-950">{client.iniciales}</span><h3 className="mt-3 text-lg font-bold">{client.nombre}</h3><p className="mt-1 text-xs text-slate-500">{client.segmento} · {client.ultima}</p><div className="mt-4 grid grid-cols-3 gap-2">{[["Visitas", client.visitas], ["Gasto", client.gasto], ["Puntos", client.puntos]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><small className="block text-[9px] uppercase text-slate-500">{label}</small><b className="mt-1 block text-sm">{value}</b></div>)}</div></div></button>)}</div></div>
            )}

            {section === "resenas" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Reseñas y reputación</h1><p className="mt-1 text-sm text-slate-500">Solicitudes, publicaciones y respuestas pendientes.</p></div><DemoButton onClick={blocked} primary>Solicitar reseñas</DemoButton></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"><StatCard title="Valoración media" value="4,7" context="Últimos 90 días" icon={MessageSquare} color="purple" /><StatCard title="Publicadas" value="128" context="19 este mes" icon={Zap} color="green" /><StatCard title="Pendientes" value="6" context="Requieren seguimiento" icon={Bell} color="red" /><StatCard title="Tasa respuesta" value="94%" context="Objetivo: 100%" icon={TrendingUp} color="blue" /></div><div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">{[["Marta García", "★★★★★", "La comida estuvo increíble y el trato fue muy atento. Volveremos seguro."], ["Luis Romero", "★★★★☆", "Muy buena cena. La pasta trufada merece especialmente la pena."], ["Paula Sánchez", "★★★★★", "Reservamos por WhatsApp y todo fue rápido y sencillo."], ["Carlos Mora", "★★★☆☆", "La comida bien, aunque esperamos algo más de lo previsto."]].map(([name, stars, text]) => <article key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="tracking-widest text-amber-500">{stars}</div><p className="mt-4 min-h-24 text-sm leading-6 text-slate-600 dark:text-slate-300">“{text}”</p><div className="mt-4 flex items-center justify-between gap-3"><b className="text-sm">{name}</b><button onClick={blocked} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">Responder</button></div></article>)}</div></div>
            )}

            {section === "rentabilidad" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Rentabilidad de la carta</h1><p className="mt-1 text-sm text-slate-500">Precio, coste estimado, margen y rendimiento.</p></div><DemoButton onClick={blocked} primary>Actualizar costes</DemoButton></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"><StatCard title="Margen medio" value="68%" context="Carta completa" icon={Percent} color="green" /><StatCard title="Ventas del mes" value="746" context="Productos servidos" icon={TrendingUp} color="blue" /><StatCard title="Más rentable" value="Tarta" context="75% de margen" icon={Sparkles} color="purple" /><StatCard title="Beneficio estimado" value="8.420 €" context="Datos demo" icon={BarChart3} color="green" /></div><ProductGrid blocked={blocked} showCost /></div>
            )}

            {section === "fidelizacion" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Fidelización</h1><p className="mt-1 text-sm text-slate-500">Puntos, recompensas, cupones y campañas de retorno.</p></div><DemoButton onClick={blocked} primary>Crear recompensa</DemoButton></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"><StatCard title="Miembros activos" value="438" context="24 este mes" icon={Users} color="purple" /><StatCard title="Puntos emitidos" value="18.420" context="3.260 canjeados" icon={Gift} color="blue" /><StatCard title="Cupones activos" value="27" context="13 canjeados" icon={Percent} color="green" /><StatCard title="Recuperados" value="18" context="Últimos 30 días" icon={RefreshCw} color="red" /></div><div className="grid grid-cols-1 gap-5 md:grid-cols-3">{[["RECOMPENSA VIP", "Postre gratis", "Disponible al alcanzar 2.500 puntos.", "72%"], ["VOLVER10", "10% próxima visita", "Para clientes sin visita en 60 días.", "54%"], ["CUMPLEAÑOS", "Copa de bienvenida", "Se activa durante la semana del cumpleaños.", "86%"]].map(([code, title, text, progress], index) => <article key={code} className={index === 0 ? "rounded-2xl bg-gradient-to-br from-indigo-950 to-violet-700 p-5 text-white shadow-lg" : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"}><span className="inline-flex rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-black text-white">{code}</span><h3 className="mt-4 text-xl font-bold">{title}</h3><p className={index === 0 ? "mt-2 text-sm text-white/60" : "mt-2 text-sm text-slate-500"}>{text}</p><div className={index === 0 ? "mt-5 h-2 overflow-hidden rounded-full bg-white/15" : "mt-5 h-2 overflow-hidden rounded-full bg-slate-200"}><span className="block h-full rounded-full bg-violet-400" style={{ width: progress }} /></div></article>)}</div></div>
            )}

            {section === "productos" && <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Productos carta</h1><p className="mt-1 text-sm text-slate-500">Productos visibles en el camarero digital.</p></div><DemoButton onClick={blocked} primary>Añadir producto</DemoButton></div><ProductGrid blocked={blocked} /></div>}

            {section === "qr" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">QR mesas</h1><p className="mt-1 text-sm text-slate-500">Cada código abre la carta y asocia el pedido a su mesa.</p></div><DemoButton onClick={blocked} primary>Descargar todos</DemoButton></div><div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 12 }, (_, index) => <article key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="grid h-20 w-20 place-items-center border-[9px] border-double border-slate-900 text-xs font-black dark:border-white">QR</div><h3 className="mt-4 font-bold">Mesa {index + 1}</h3><p className="mt-1 text-xs text-slate-500">Activo · {7 + index} escaneos</p><button onClick={blocked} className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">Ver código</button></article>)}</div></div>
            )}

            {section === "cocina" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Cocina y pedidos</h1><p className="mt-1 text-sm text-slate-500">Comandas recibidas desde los QR de mesa.</p></div><DemoButton onClick={blocked} primary>Nuevo pedido</DemoButton></div><div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">{[["#1042", "Mesa 8", ["2 × Tataki de atún", "1 × Pasta trufada", "2 × Agua"], "En preparación"], ["#1041", "Mesa 3", ["1 × Pizza burrata", "1 × Burger La Reserva"], "Nuevo"], ["#1040", "Mesa 11", ["2 × Entrecot madurado", "1 × Ensalada"], "Listo"], ["#1039", "Mesa 4", ["2 × Tarta de queso", "2 × Café"], "Listo"]].map(([id, table, order, status]) => <article key={String(id)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><small className="text-slate-500">{id}</small><h3 className="mt-1 text-lg font-bold">{table}</h3></div><Status value={String(status)} /></div><div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">{(order as string[]).map((line) => <div key={line} className="py-2.5 text-sm text-slate-600 dark:text-slate-300">{line}</div>)}</div><button onClick={blocked} className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">Cambiar estado</button></article>)}</div></div>
            )}

            {section === "estadisticas" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Estadísticas</h1><p className="mt-1 text-sm text-slate-500">Evolución mensual y canales de captación.</p></div><DemoButton onClick={blocked} primary>Exportar informe</DemoButton></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"><StatCard title="Reservas del mes" value="612" context="14% más" icon={CalendarDays} color="blue" /><StatCard title="Recurrentes" value="38%" context="6 puntos más" icon={Users} color="green" /><StatCard title="Ticket medio" value="31,40 €" context="2,10 € más" icon={TrendingUp} color="purple" /><StatCard title="No-show" value="2,8%" context="1,2 puntos menos" icon={Bell} color="red" /></div><div className="grid grid-cols-1 gap-5 xl:grid-cols-3"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 xl:col-span-2"><h3 className="font-bold uppercase">Reservas por semana</h3><div className="mt-5 flex h-64 items-end gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">{[48, 62, 77, 91].map((height, index) => <div key={height} className="relative flex-1 rounded-t-2xl bg-gradient-to-t from-violet-800 to-fuchsia-400" style={{ height: `${height}%` }}><span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate-500">S{index + 1}</span></div>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><h3 className="font-bold uppercase">Origen de reservas</h3><div className="mt-5 space-y-4">{[["Web propia", "42%", "bg-blue-500"], ["WhatsApp", "31%", "bg-emerald-500"], ["Teléfono", "17%", "bg-amber-500"], ["Manual", "10%", "bg-rose-500"]].map(([label, value, color]) => <div key={label}><div className="flex justify-between text-sm"><b>{label}</b><span>{value}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full ${color}`} style={{ width: value }} /></div></div>)}</div></section></div></div>
            )}

            {section === "ajustes" && (
              <div className="space-y-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-black tracking-tight">Ajustes</h1><p className="mt-1 text-sm text-slate-500">Servicios, horarios y notificaciones.</p></div><DemoButton onClick={blocked} primary>Guardar cambios</DemoButton></div><div className="grid grid-cols-1 gap-5 xl:grid-cols-2">{[["Servicios activos", [["Reservas", "Web, WhatsApp y manual"], ["Clientes", "Historial y recurrencia"], ["Fidelización", "Puntos y cupones"], ["Camarero digital", "Carta, QR y cocina"]]], ["Notificaciones", [["Nueva reserva", "Aviso inmediato"], ["Reserva pendiente", "Recordatorio al equipo"], ["Nueva reseña", "Alerta de reputación"], ["Pedido de cocina", "Sonido y aviso visual"]]]].map(([title, rows]) => <section key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><h3 className="font-bold uppercase">{String(title)}</h3><div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">{(rows as string[][]).map(([label, sub]) => <div key={label} className="flex items-center justify-between gap-4 py-4"><div><b className="block text-sm">{label}</b><small className="mt-1 block text-slate-500">{sub}</small></div><button onClick={blocked} className="relative h-6 w-11 rounded-full bg-violet-600"><span className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white" /></button></div>)}</div></section>)}</div></div>
            )}
          </div>
        </main>

        {(selectedReservation || selectedClient) && (
          <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4" onClick={() => { setSelectedReservation(null); setSelectedClient(null); }}>
            <div onClick={(event) => event.stopPropagation()} className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950">
              <div className="flex items-start justify-between gap-4"><div><span className="text-xs font-black uppercase tracking-widest text-violet-600">{selectedReservation ? "Detalle de reserva" : "Ficha de cliente"}</span><h3 className="mt-2 text-2xl font-black">{selectedReservation?.cliente ?? selectedClient?.nombre}</h3></div><button onClick={() => { setSelectedReservation(null); setSelectedClient(null); }} className="rounded-xl bg-slate-100 p-2 dark:bg-slate-800"><X size={18} /></button></div>
              {selectedReservation ? <div className="mt-5 grid grid-cols-2 gap-3">{[["Hora", selectedReservation.hora], ["Personas", selectedReservation.personas], ["Mesa", selectedReservation.mesa], ["Origen", selectedReservation.origen], ["Estado", selectedReservation.estado], ["Cliente", "Historial disponible"]].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900"><small className="block text-[10px] uppercase tracking-widest text-slate-500">{label}</small><b className="mt-1 block">{value}</b></div>)}</div> : null}
              {selectedClient ? <div className="mt-5 grid grid-cols-2 gap-3">{[["Segmento", selectedClient.segmento], ["Visitas", selectedClient.visitas], ["Gasto", selectedClient.gasto], ["Puntos", selectedClient.puntos], ["Última visita", selectedClient.ultima], ["Recompensa", selectedClient.puntos > 5000 ? "Postre gratis" : "10% próxima visita"]].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900"><small className="block text-[10px] uppercase tracking-widest text-slate-500">{label}</small><b className="mt-1 block">{value}</b></div>)}</div> : null}
              <button onClick={blocked} className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white dark:bg-white dark:text-slate-900">Editar información</button>
            </div>
          </div>
        )}

        <div className={[
          "fixed bottom-5 right-5 z-[100] rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl transition-all",
          toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-20 opacity-0",
        ].join(" ")}>Esta acción está desactivada en el entorno demo.</div>
      </div>
    </div>
  );
}

function ProductGrid({ blocked, showCost = false }: { blocked: () => void; showCost?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <article key={product.nombre} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <img src={product.foto} alt={product.nombre} className="h-48 w-full object-cover" />
          <div className="p-5">
            <h3 className="text-lg font-bold">{product.nombre}</h3>
            <p className="mt-1 text-xs text-slate-500">{product.categoria}{showCost ? ` · Coste ${product.coste}` : " · Disponible"}</p>
            <div className="mt-4 flex items-end justify-between gap-4"><b className="text-2xl">{product.precio}</b>{showCost ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{product.margen} margen</span> : <button onClick={blocked} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">Editar</button>}</div>
          </div>
        </article>
      ))}
    </div>
  );
}
