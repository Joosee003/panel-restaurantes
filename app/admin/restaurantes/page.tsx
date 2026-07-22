"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChefHat,
  Copy,
  Crown,
  Gift,
  LayoutDashboard,
  Loader2,
  QrCode,
  RefreshCw,
  Rocket,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  ToggleLeft,
  ToggleRight,
  Users,
} from "lucide-react";
import { supabase } from "../../(app)/lib/supabaseClient";

type RestauranteInfo = {
  id: string;
  nombre: string | null;
  slug?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  color_primario?: string | null;
  logo_url?: string | null;
  puntos_activo?: boolean | null;
  puntos_por_euro?: number | string | null;
};

type RestauranteModulo = {
  id?: string;
  restaurante_id: string;
  plan: string | null;
  estado: string | null;
  reservas: boolean | null;
  clientes: boolean | null;
  resenas: boolean | null;
  fidelizacion: boolean | null;
  metricas: boolean | null;
  chatbot: boolean | null;
  camarero_digital: boolean | null;
  menu_digital: boolean | null;
  automatizaciones: boolean | null;
  restaurantes: RestauranteInfo | RestauranteInfo[] | null;
};

type CartaMini = {
  id: string;
  restaurante_id: string;
  nombre: string | null;
  estado: string | null;
  public_token: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProductoMini = {
  id: string;
  restaurante_id: string;
  carta_id: string | null;
  nombre: string | null;
  activo: boolean | null;
};

type MesaMini = {
  id: string;
  restaurante_id: string;
  nombre: string | null;
  activa: boolean | null;
};

type ClienteMini = {
  id: string;
  restaurante_id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  public_token: string | null;
  puntos_totales: number | null;
  created_at: string | null;
  updated_at: string | null;
  ultima_visita?: string | null;
  visitas_totales?: number | null;
};

type ReservaMini = {
  id: string;
  restaurante_id: string;
  estado: string | null;
  fecha_hora_reserva: string | null;
  atendida: boolean | null;
  personas: number | null;
  created_at: string | null;
};

type PedidoMini = {
  id: string;
  restaurante_id: string;
  estado: string | null;
  mesa: string | null;
  total: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CierreMini = {
  id: string;
  restaurante_id: string;
  pedidos_ids: string[] | null;
  total_cobrado: number | string | null;
  creado_en: string | null;
};

type PremioMini = {
  id: string;
  restaurante_id: string;
  nombre: string | null;
  puntos_requeridos: number | null;
  activo: boolean | null;
};

type CuponMini = {
  id: string;
  restaurante_id: string;
  nombre: string | null;
  activo: boolean | null;
};

type ResenaMini = {
  id: string;
  restaurante_id: string;
  responded: boolean | null;
  rating: number | null;
  created_at: string | null;
  fecha_reseña?: string | null;
};

type VistaAdmin = "clientes" | "instalacion" | "uso" | "avisos";
type ModuloKey = (typeof modulos)[number]["key"];

type RestauranteStats = {
  carta: CartaMini | null;
  cartas: CartaMini[];
  productos: ProductoMini[];
  mesas: MesaMini[];
  clientes: ClienteMini[];
  clienteDemo: ClienteMini | null;
  reservas: ReservaMini[];
  pedidos: PedidoMini[];
  cierres: CierreMini[];
  premios: PremioMini[];
  cupones: CuponMini[];
  resenas: ResenaMini[];
  reservasHoy: number;
  reservasPendientes: number;
  pedidosHoy: number;
  mesasAbiertas: number;
  ventasHoy: number;
  ventasMes: number;
  clientesNuevosHoy: number;
  resenasPendientes: number;
  ratingMedio: string;
  ultimaActividad?: string;
  checklist: CheckItem[];
  porcentaje: number;
  problemas: string[];
};

type CheckItem = {
  id: string;
  label: string;
  description: string;
  ready: boolean;
  critical?: boolean;
};

const STORAGE_KEY = "gastrohelp_restaurante_activo";

const modulos = [
  { key: "reservas", label: "Reservas", icon: CalendarDays },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "resenas", label: "Reseñas", icon: BadgeCheck },
  { key: "fidelizacion", label: "Fidelización", icon: Gift },
  { key: "metricas", label: "Métricas", icon: BarChart3 },
  { key: "chatbot", label: "Chatbot", icon: Sparkles },
  { key: "camarero_digital", label: "Camarero", icon: ChefHat },
  { key: "menu_digital", label: "Carta QR", icon: QrCode },
  { key: "automatizaciones", label: "Automatizaciones", icon: Rocket },
] as const;

const categoriasDemo = [
  {
    nombre: "Entrantes",
    orden: 1,
    traducciones: {
      en: "Starters",
      fr: "Entrées",
      de: "Vorspeisen",
      it: "Antipasti",
      pt: "Entradas",
    },
  },
  {
    nombre: "Principales",
    orden: 2,
    traducciones: {
      en: "Mains",
      fr: "Plats principaux",
      de: "Hauptgerichte",
      it: "Piatti principali",
      pt: "Pratos principais",
    },
  },
  {
    nombre: "Postres",
    orden: 3,
    traducciones: {
      en: "Desserts",
      fr: "Desserts",
      de: "Desserts",
      it: "Dolci",
      pt: "Sobremesas",
    },
  },
  {
    nombre: "Bebidas",
    orden: 4,
    traducciones: {
      en: "Drinks",
      fr: "Boissons",
      de: "Getränke",
      it: "Bevande",
      pt: "Bebidas",
    },
  },
];

const productosDemo = [
  {
    categoria: "Entrantes",
    nombre: "Croquetas caseras",
    descripcion: "Cremosas por dentro y crujientes por fuera",
    precio: 8.5,
    recomendado: true,
  },
  {
    categoria: "Entrantes",
    nombre: "Ensaladilla especial",
    descripcion: "La tapa clásica del restaurante",
    precio: 6.9,
    recomendado: false,
  },
  {
    categoria: "Principales",
    nombre: "Hamburguesa premium",
    descripcion: "Carne, queso fundido, salsa de la casa y patatas",
    precio: 14.9,
    recomendado: true,
  },
  {
    categoria: "Principales",
    nombre: "Arroz del día",
    descripcion: "Preparado al momento según mercado",
    precio: 13.5,
    recomendado: false,
  },
  {
    categoria: "Postres",
    nombre: "Tarta de queso",
    descripcion: "Cremosa, casera y con base crujiente",
    precio: 5.9,
    recomendado: true,
  },
  {
    categoria: "Bebidas",
    nombre: "Refresco",
    descripcion: "Servido frío",
    precio: 2.4,
    recomendado: false,
  },
];

const premiosDemo = [
  {
    nombre: "Café gratis",
    descripcion: "Canjeable en tu próxima visita",
    puntos_requeridos: 60,
  },
  {
    nombre: "Postre gratis",
    descripcion: "Premio para clientes que repiten",
    puntos_requeridos: 180,
  },
  {
    nombre: "Entrante para compartir",
    descripcion: "Ventaja especial del club privado",
    puntos_requeridos: 320,
  },
];

const cuponesDemo = [
  {
    nombre: "Refresco gratis",
    beneficio: "Actívalo y enséñalo al personal en tu próxima visita.",
    condiciones: {
      tipo: "horas_valle",
      hora_inicio: "00:00",
      hora_fin: "23:59",
      dias_semana: [0, 1, 2, 3, 4, 5, 6],
      cada_x_visitas: 1,
    },
  },
  {
    nombre: "10% en tu próxima comida",
    beneficio: "Descuento exclusivo para clientes que vuelven.",
    condiciones: {
      tipo: "horas_valle",
      hora_inicio: "00:00",
      hora_fin: "23:59",
      dias_semana: [0, 1, 2, 3, 4, 5, 6],
      cada_x_visitas: 2,
    },
  },
  {
    nombre: "Happy Hour privada",
    beneficio: "1 caña gratis de 20:00 a 21:00.",
    condiciones: {
      tipo: "horas_valle",
      hora_inicio: "20:00",
      hora_fin: "21:00",
      dias_semana: [1, 2, 3, 4, 5],
      cada_x_visitas: 2,
    },
  },
];

function getOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function todayKey(dateLike?: string | null) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKey(dateLike?: string | null) {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function money(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function fechaCorta(value?: string | null) {
  if (!value) return "Sin actividad";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Sin actividad";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizarEstado(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .trim();
}

function isClosedOrder(estado?: string | null) {
  return ["cancelado", "cancelada", "cobrado", "cerrado"].includes(
    normalizarEstado(estado),
  );
}

function randomToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID().replace(/-/g, "");
  return `${Date.now()}${Math.random().toString(16).slice(2)}`.replace(
    /\./g,
    "",
  );
}

function randomUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getRestauranteInfo(
  restaurante: RestauranteModulo,
): RestauranteInfo | null {
  const value = restaurante.restaurantes;
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getRestauranteNombre(restaurante: RestauranteModulo) {
  return getRestauranteInfo(restaurante)?.nombre || restaurante.restaurante_id;
}

function planColor(plan?: string | null) {
  const p = normalizarEstado(plan);
  if (p === "premium") return "bg-violet-50 text-violet-700 border-violet-200";
  if (p === "pro") return "bg-blue-50 text-blue-700 border-blue-200";
  if (p === "demo") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function estadoColor(estado?: string | null) {
  const e = normalizarEstado(estado);
  if (e === "activo")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (e === "demo") return "bg-blue-50 text-blue-700 border-blue-200";
  if (e === "pausado") return "bg-amber-50 text-amber-700 border-amber-200";
  if (e === "baja") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function readinessLabel(value: number, avisos: number) {
  if (value >= 95 && avisos === 0) return "Listo para cliente real";
  if (value >= 80) return "Listo para demo";
  if (value >= 50) return "Preparación media";
  return "Falta instalación";
}

function readinessClass(value: number, avisos: number) {
  if (value >= 95 && avisos === 0)
    return "border-emerald-300/40 bg-emerald-400/10 text-emerald-100";
  if (value >= 80) return "border-blue-300/40 bg-blue-400/10 text-blue-100";
  if (value >= 50) return "border-amber-300/40 bg-amber-400/10 text-amber-100";
  return "border-rose-300/40 bg-rose-400/10 text-rose-100";
}

function nextAction(stats: RestauranteStats | null) {
  if (!stats) return "Selecciona un restaurante";
  if (!stats.carta?.public_token) return "Crear carta QR pública";
  if (stats.productos.length === 0) return "Cargar productos de la carta";
  if (stats.mesas.length === 0) return "Crear mesas QR";
  if (!stats.clienteDemo?.public_token) return "Crear app cliente demo";
  if (
    !stats.premios.some((p) => p.activo !== false) ||
    !stats.cupones.some((c) => c.activo !== false)
  )
    return "Crear premios y cupones";
  if (stats.mesasAbiertas > 0) return "Cerrar mesas abiertas";
  if (stats.reservasPendientes > 0) return "Revisar reservas pendientes";
  if (stats.resenasPendientes > 0) return "Responder reseñas pendientes";
  return "Listo para enseñar y vender";
}

function SmallDarkMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black tracking-tight text-white">
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-xs font-bold text-slate-400">{sub}</p>
      ) : null}
    </div>
  );
}

function moduloCount(restaurante: RestauranteModulo) {
  return modulos.filter((m) => Boolean(restaurante[m.key])).length;
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  tone?: "blue" | "emerald" | "amber" | "rose" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {value}
          </p>
          {sub ? (
            <p className="mt-1 text-xs font-bold text-slate-500">{sub}</p>
          ) : null}
        </div>
        <div className={`rounded-2xl p-3 ${toneClass}`}>{icon}</div>
      </div>
    </div>
  );
}

function Pill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${className}`}
    >
      {children}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-slate-950 transition-all"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

function MiniMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
      {sub ? (
        <p className="mt-1 text-[11px] font-bold text-slate-500">{sub}</p>
      ) : null}
    </div>
  );
}

function CheckRow({ item }: { item: CheckItem }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3">
      <div
        className={`mt-0.5 rounded-full p-1 ${item.ready ? "bg-emerald-50 text-emerald-700" : item.critical ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
      >
        {item.ready ? <Check size={14} /> : <AlertTriangle size={14} />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-950">{item.label}</p>
        <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-500">
          {item.description}
        </p>
      </div>
    </div>
  );
}

export default function AdminRestaurantesPage() {
  const [restaurantes, setRestaurantes] = useState<RestauranteModulo[]>([]);
  const [cartas, setCartas] = useState<CartaMini[]>([]);
  const [productos, setProductos] = useState<ProductoMini[]>([]);
  const [mesas, setMesas] = useState<MesaMini[]>([]);
  const [clientes, setClientes] = useState<ClienteMini[]>([]);
  const [reservas, setReservas] = useState<ReservaMini[]>([]);
  const [pedidos, setPedidos] = useState<PedidoMini[]>([]);
  const [cierres, setCierres] = useState<CierreMini[]>([]);
  const [premios, setPremios] = useState<PremioMini[]>([]);
  const [cupones, setCupones] = useState<CuponMini[]>([]);
  const [resenas, setResenas] = useState<ResenaMini[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preparando, setPreparando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<VistaAdmin>("clientes");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  useEffect(() => {
    cargarAdmin();
  }, []);

  async function cargarAdmin() {
    setLoading(true);
    setError(null);

    const results = await Promise.allSettled([
      supabase
        .from("restaurante_modulos")
        .select(
          `
          id,
          restaurante_id,
          plan,
          estado,
          reservas,
          clientes,
          resenas,
          fidelizacion,
          metricas,
          chatbot,
          camarero_digital,
          menu_digital,
          automatizaciones,
          restaurantes ( id, nombre, slug, telefono, direccion, color_primario, logo_url, puntos_activo, puntos_por_euro )
        `,
        )
        .order("updated_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("cartas_digitales")
        .select(
          "id, restaurante_id, nombre, estado, public_token, created_at, updated_at",
        ),
      supabase
        .from("carta_productos")
        .select("id, restaurante_id, carta_id, nombre, activo"),
      supabase.from("sala_mesas").select("id, restaurante_id, nombre, activa"),
      supabase
        .from("clientes")
        .select(
          "id, restaurante_id, nombre, email, telefono, public_token, puntos_totales, created_at, updated_at, ultima_visita, visitas_totales",
        ),
      supabase
        .from("reservas")
        .select(
          "id, restaurante_id, estado, fecha_hora_reserva, atendida, personas, created_at",
        ),
      supabase
        .from("pedidos_qr")
        .select(
          "id, restaurante_id, estado, mesa, total, created_at, updated_at",
        ),
      supabase
        .from("cierres_mesa_qr")
        .select("id, restaurante_id, pedidos_ids, total_cobrado, creado_en"),
      supabase
        .from("premios_puntos")
        .select("id, restaurante_id, nombre, puntos_requeridos, activo"),
      supabase.from("cupones").select("id, restaurante_id, nombre, activo"),
      supabase
        .from("resenas")
        .select(
          "id, restaurante_id, responded, rating, created_at, fecha_reseña",
        ),
    ]);

    const getData = <T,>(index: number, fallback: T[]): T[] => {
      const result = results[index];
      if (result.status !== "fulfilled") return fallback;
      const response = result.value as {
        data?: unknown;
        error?: { message?: string } | null;
      };
      if (response.error) {
        console.warn("Admin query warning", response.error.message);
        return fallback;
      }
      return (response.data || fallback) as T[];
    };

    const modulosData = getData<RestauranteModulo>(0, []);
    if (
      results[0].status === "fulfilled" &&
      (results[0].value as { error?: { message?: string } | null }).error
    ) {
      setError(
        "No he podido cargar todos los restaurantes. Revisa que tu usuario tenga acceso admin o vínculo en usuarios_restaurantes.",
      );
    }

    setRestaurantes(modulosData);
    setCartas(getData<CartaMini>(1, []));
    setProductos(getData<ProductoMini>(2, []));
    setMesas(getData<MesaMini>(3, []));
    setClientes(getData<ClienteMini>(4, []));
    setReservas(getData<ReservaMini>(5, []));
    setPedidos(getData<PedidoMini>(6, []));
    setCierres(getData<CierreMini>(7, []));
    setPremios(getData<PremioMini>(8, []));
    setCupones(getData<CuponMini>(9, []));
    setResenas(getData<ResenaMini>(10, []));
    setLoading(false);
  }

  const hoy = todayKey(new Date().toISOString());
  const mesActual = monthKey(new Date().toISOString());
  const pedidosCerrados = useMemo(
    () => new Set(cierres.flatMap((c) => c.pedidos_ids || [])),
    [cierres],
  );
  const origin = getOrigin();

  function statsRestaurante(restauranteId: string): RestauranteStats {
    const cartasR = cartas.filter(
      (c) =>
        c.restaurante_id === restauranteId &&
        normalizarEstado(c.estado) !== "eliminada",
    );
    const carta = cartasR[0] || null;
    const productosR = productos.filter(
      (p) => p.restaurante_id === restauranteId,
    );
    const mesasR = mesas.filter((m) => m.restaurante_id === restauranteId);
    const clientesR = clientes.filter(
      (c) => c.restaurante_id === restauranteId,
    );
    const reservasR = reservas.filter(
      (r) => r.restaurante_id === restauranteId,
    );
    const pedidosR = pedidos.filter((p) => p.restaurante_id === restauranteId);
    const cierresR = cierres.filter((c) => c.restaurante_id === restauranteId);
    const premiosR = premios.filter((p) => p.restaurante_id === restauranteId);
    const cuponesR = cupones.filter((c) => c.restaurante_id === restauranteId);
    const resenasR = resenas.filter((r) => r.restaurante_id === restauranteId);
    const clienteDemo = clientesR.find((c) => c.public_token) || null;

    const pedidosAbiertos = pedidosR.filter(
      (p) => !pedidosCerrados.has(p.id) && !isClosedOrder(p.estado),
    );
    const ventasHoy = cierresR
      .filter((c) => todayKey(c.creado_en) === hoy)
      .reduce((acc, c) => acc + Number(c.total_cobrado || 0), 0);
    const ventasMes = cierresR
      .filter((c) => monthKey(c.creado_en) === mesActual)
      .reduce((acc, c) => acc + Number(c.total_cobrado || 0), 0);

    const moduloRestaurante =
      restaurantes.find((r) => r.restaurante_id === restauranteId) || null;

    const lastActivity = [
      ...reservasR.map((r) => r.fecha_hora_reserva || r.created_at),
      ...pedidosR.map((p) => p.updated_at || p.created_at),
      ...cierresR.map((c) => c.creado_en),
      ...clientesR.map((c) => c.updated_at || c.created_at),
      ...resenasR.map((r) => r.fecha_reseña || r.created_at),
    ]
      .filter(Boolean)
      .sort(
        (a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime(),
      )[0] as string | undefined;

    const checklist: CheckItem[] = [
      {
        id: "modulos",
        label: "Módulos activos",
        description:
          "El restaurante tiene servicios activados para aparecer en el panel.",
        ready:
          moduloCount(
            restaurantes.find(
              (r) => r.restaurante_id === restauranteId,
            ) as RestauranteModulo,
          ) > 0,
        critical: true,
      },
      {
        id: "carta",
        label: "Carta QR creada",
        description: carta?.public_token
          ? "Tiene enlace público para enseñar o imprimir en QR."
          : "Falta crear carta digital pública.",
        ready: Boolean(carta?.public_token),
        critical: true,
      },
      {
        id: "productos",
        label: "Productos cargados",
        description: productosR.length
          ? `${productosR.length} productos en carta.`
          : "Añade productos para que la carta no salga vacía.",
        ready: productosR.length > 0,
        critical: true,
      },
      {
        id: "mesas",
        label: "Mesas / sala",
        description: mesasR.length
          ? `${mesasR.length} mesas disponibles.`
          : "Faltan mesas para hacer demo de QR por mesa.",
        ready: mesasR.length > 0,
      },
      {
        id: "cliente",
        label: "App cliente demo",
        description: clienteDemo?.public_token
          ? "Tiene un cliente con enlace público para enseñar fidelización."
          : "Falta cliente demo con public_token.",
        ready: Boolean(clienteDemo?.public_token),
      },
      {
        id: "fidelizacion",
        label: "Premios y cupones",
        description: `${premiosR.filter((p) => p.activo !== false).length} premios · ${cuponesR.filter((c) => c.activo !== false).length} cupones activos.`,
        ready:
          premiosR.some((p) => p.activo !== false) &&
          cuponesR.some((c) => c.activo !== false),
      },
    ];

    const readyCount = checklist.filter((c) => c.ready).length;
    const porcentaje = Math.round((readyCount / checklist.length) * 100);

    const problemas: string[] = [];
    if (!carta?.public_token) problemas.push("Sin carta QR pública");
    if (productosR.length === 0) problemas.push("Sin productos en carta");
    if (mesasR.length === 0) problemas.push("Sin mesas para QR");
    if (!clienteDemo?.public_token) problemas.push("Sin app cliente demo");
    if (
      reservasR.filter((r) => normalizarEstado(r.estado) === "pendiente")
        .length > 0
    )
      problemas.push("Reservas pendientes");
    if (resenasR.filter((r) => r.responded === false).length > 0)
      problemas.push("Reseñas sin responder");
    if (pedidosAbiertos.length > 0) problemas.push("Mesas abiertas sin cerrar");
    if (lastActivity) {
      const dias = Math.floor(
        (Date.now() - new Date(lastActivity).getTime()) / 86400000,
      );
      if (dias >= 10) problemas.push(`Sin uso reciente: ${dias} días`);
    }

    return {
      carta,
      cartas: cartasR,
      productos: productosR,
      mesas: mesasR,
      clientes: clientesR,
      clienteDemo,
      reservas: reservasR,
      pedidos: pedidosR,
      cierres: cierresR,
      premios: premiosR,
      cupones: cuponesR,
      resenas: resenasR,
      reservasHoy: reservasR.filter(
        (r) => todayKey(r.fecha_hora_reserva) === hoy,
      ).length,
      reservasPendientes: reservasR.filter(
        (r) => normalizarEstado(r.estado) === "pendiente",
      ).length,
      pedidosHoy: pedidosR.filter((p) => todayKey(p.created_at) === hoy).length,
      mesasAbiertas: new Set(pedidosAbiertos.map((p) => p.mesa || "Sin mesa"))
        .size,
      ventasHoy,
      ventasMes,
      clientesNuevosHoy: clientesR.filter((c) => todayKey(c.created_at) === hoy)
        .length,
      resenasPendientes: resenasR.filter((r) => r.responded === false).length,
      ratingMedio: resenasR.length
        ? (
            resenasR.reduce((acc, r) => acc + Number(r.rating || 0), 0) /
            resenasR.length
          ).toFixed(1)
        : "-",
      ultimaActividad: lastActivity,
      checklist,
      porcentaje,
      problemas,
    };
  }

  const restaurantesFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return restaurantes.filter((r) => {
      const nombre = getRestauranteNombre(r);
      return `${nombre} ${r.plan || ""} ${r.estado || ""} ${r.restaurante_id}`
        .toLowerCase()
        .includes(q);
    });
  }, [restaurantes, busqueda]);

  const restauranteActivo = useMemo(() => {
    const id =
      seleccionado ||
      restaurantesFiltrados[0]?.restaurante_id ||
      restaurantes[0]?.restaurante_id ||
      null;
    return (
      restaurantes.find((r) => r.restaurante_id === id) ||
      restaurantesFiltrados[0] ||
      restaurantes[0] ||
      null
    );
  }, [seleccionado, restaurantes, restaurantesFiltrados]);

  const statsActivo = restauranteActivo
    ? statsRestaurante(restauranteActivo.restaurante_id)
    : null;

  const resumenGlobal = useMemo(() => {
    const restauranteIds = new Set(restaurantes.map((r) => r.restaurante_id));
    const ventasHoy = cierres
      .filter((c) => todayKey(c.creado_en) === hoy)
      .reduce((acc, c) => acc + Number(c.total_cobrado || 0), 0);
    const ventasMes = cierres
      .filter((c) => monthKey(c.creado_en) === mesActual)
      .reduce((acc, c) => acc + Number(c.total_cobrado || 0), 0);
    const listos = restaurantes.filter(
      (r) => statsRestaurante(r.restaurante_id).porcentaje >= 80,
    ).length;

    return {
      restaurantes: restauranteIds.size,
      activos: restaurantes.filter((r) =>
        ["activo", "demo"].includes(normalizarEstado(r.estado)),
      ).length,
      listos,
      reservasHoy: reservas.filter(
        (r) => todayKey(r.fecha_hora_reserva) === hoy,
      ).length,
      pedidosHoy: pedidos.filter((p) => todayKey(p.created_at) === hoy).length,
      ventasHoy,
      ventasMes,
      avisos: restaurantes.reduce(
        (acc, r) => acc + statsRestaurante(r.restaurante_id).problemas.length,
        0,
      ),
    };
  }, [restaurantes, reservas, pedidos, cierres, hoy, mesActual]);

  async function cambiarModulo(restaurante: RestauranteModulo, key: ModuloKey) {
    const current = Boolean(restaurante[key]);
    setSaving(`${restaurante.restaurante_id}-${key}`);
    setError(null);

    const { error } = await supabase
      .from("restaurante_modulos")
      .update({ [key]: !current, updated_at: new Date().toISOString() })
      .eq("restaurante_id", restaurante.restaurante_id);

    if (!error) {
      setRestaurantes((prev) =>
        prev.map((r) =>
          r.restaurante_id === restaurante.restaurante_id
            ? { ...r, [key]: !current }
            : r,
        ),
      );
    } else {
      console.error(error);
      setError(
        "No se ha podido cambiar el módulo. Revisa permisos de Supabase.",
      );
    }
    setSaving(null);
  }

  async function cambiarCampo(
    restauranteId: string,
    campo: "plan" | "estado",
    valor: string,
  ) {
    setSaving(`${restauranteId}-${campo}`);
    setError(null);

    const { error } = await supabase
      .from("restaurante_modulos")
      .update({ [campo]: valor, updated_at: new Date().toISOString() })
      .eq("restaurante_id", restauranteId);

    if (!error) {
      setRestaurantes((prev) =>
        prev.map((r) =>
          r.restaurante_id === restauranteId ? { ...r, [campo]: valor } : r,
        ),
      );
    } else {
      console.error(error);
      setError("No se ha podido guardar el cambio.");
    }
    setSaving(null);
  }

  async function copiarTexto(texto: string, label = "Copiado") {
    if (!texto) return;
    await navigator.clipboard.writeText(texto);
    setCopiado(label);
    setTimeout(() => setCopiado(null), 1500);
  }

  function usarEnPanel(restauranteId: string) {
    localStorage.setItem(STORAGE_KEY, restauranteId);
    setCopiado("Restaurante activo seleccionado");
    setTimeout(() => setCopiado(null), 1600);
  }

  async function prepararDemo(restaurante: RestauranteModulo) {
    const restauranteId = restaurante.restaurante_id;
    const stats = statsRestaurante(restauranteId);
    const nombreRestaurante = getRestauranteNombre(restaurante);
    setPreparando(restauranteId);
    setError(null);

    try {
      let carta = stats.carta;
      const now = new Date().toISOString();

      if (!carta) {
        const { data, error } = await supabase
          .from("cartas_digitales")
          .insert({
            restaurante_id: restauranteId,
            nombre: `Carta ${nombreRestaurante}`,
            estado: "activa",
            public_token: randomToken(),
            created_at: now,
            updated_at: now,
          })
          .select(
            "id, restaurante_id, nombre, estado, public_token, created_at, updated_at",
          )
          .single();
        if (error) throw error;
        carta = data as CartaMini;
      }

      if (stats.productos.length === 0 && carta?.id) {
        const { data: categoriasCreadas, error: categoriasError } =
          await supabase
            .from("carta_categorias")
            .insert(
              categoriasDemo.map((categoria) => ({
                carta_id: carta?.id,
                restaurante_id: restauranteId,
                nombre: categoria.nombre,
                orden: categoria.orden,
                activa: true,
                traducciones: categoria.traducciones,
                created_at: now,
              })),
            )
            .select("id, nombre");
        if (categoriasError) throw categoriasError;

        const categoriaId = (nombre: string) =>
          (categoriasCreadas || []).find(
            (c: { id: string; nombre: string }) => c.nombre === nombre,
          )?.id || null;

        const { error: productosError } = await supabase
          .from("carta_productos")
          .insert(
            productosDemo.map((producto, index) => ({
              carta_id: carta?.id,
              restaurante_id: restauranteId,
              categoria_id: categoriaId(producto.categoria),
              nombre: producto.nombre,
              descripcion: producto.descripcion,
              precio: producto.precio,
              tipo: "producto",
              recomendado: producto.recomendado,
              activo: true,
              orden: index + 1,
              alergenos: [],
              traducciones: {},
              created_at: now,
            })),
          );
        if (productosError) throw productosError;
      }

      if (stats.mesas.length === 0) {
        const { data: zona, error: zonaError } = await supabase
          .from("sala_zonas")
          .insert({
            restaurante_id: restauranteId,
            nombre: "Sala principal",
            orden: 1,
            activa: true,
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .single();
        if (zonaError) throw zonaError;

        const { error: mesasError } = await supabase.from("sala_mesas").insert(
          Array.from({ length: 8 }).map((_, index) => ({
            restaurante_id: restauranteId,
            zona_id: (zona as { id: string }).id,
            nombre: `Mesa ${index + 1}`,
            capacidad: index < 4 ? 2 : 4,
            orden: index + 1,
            activa: true,
            bloqueada: false,
            created_at: now,
            updated_at: now,
          })),
        );
        if (mesasError) throw mesasError;
      }

      if (!stats.clienteDemo) {
        const { error: clienteError } = await supabase.from("clientes").insert({
          restaurante_id: restauranteId,
          nombre: "Cliente demo",
          telefono: "600000000",
          email: "cliente.demo@gastrohelp.es",
          public_token: randomUuid(),
          puntos_totales: 220,
          visitas_totales: 3,
          origen_principal: "demo",
          canal_contacto: "app_cliente",
          permite_whatsapp: true,
          permite_email: true,
          etiquetas: ["demo", "app-cliente"],
          created_at: now,
          updated_at: now,
        });
        if (clienteError) throw clienteError;
      }

      if (stats.premios.length === 0) {
        const { error: premiosError } = await supabase
          .from("premios_puntos")
          .insert(
            premiosDemo.map((premio) => ({
              restaurante_id: restauranteId,
              nombre: premio.nombre,
              descripcion: premio.descripcion,
              puntos_requeridos: premio.puntos_requeridos,
              activo: true,
              creado_en: now,
            })),
          );
        if (premiosError) throw premiosError;
      }

      if (stats.cupones.length === 0) {
        const { error: cuponesError } = await supabase.from("cupones").insert(
          cuponesDemo.map((cupon) => ({
            restaurante_id: restauranteId,
            nombre: cupon.nombre,
            beneficio: cupon.beneficio,
            condiciones: cupon.condiciones,
            activo: true,
            creado_en: now,
          })),
        );
        if (cuponesError) throw cuponesError;
      }

      await cargarAdmin();
      setCopiado("Demo preparada");
      setTimeout(() => setCopiado(null), 1600);
    } catch (err) {
      console.error("Preparar demo", err);
      const message = err instanceof Error ? err.message : "Error desconocido";
      setError(`No he podido preparar la demo: ${message}`);
    } finally {
      setPreparando(null);
    }
  }

  function cartaUrl(stats: RestauranteStats | null) {
    if (!origin || !stats?.carta?.public_token) return "";
    return `${origin}/carta/${stats.carta.public_token}?mesa=1&lang=es`;
  }

  function clienteUrl(stats: RestauranteStats | null) {
    if (!origin || !stats?.clienteDemo?.public_token) return "";
    return `${origin}/c/${stats.clienteDemo.public_token}`;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
            <Loader2 className="mx-auto animate-spin text-blue-300" size={34} />
            <p className="mt-4 text-sm font-black uppercase tracking-[0.25em] text-blue-100">
              Cargando Admin GastroHelp
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      {copiado ? (
        <div className="fixed right-5 top-5 z-50 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-lg">
          {copiado}
        </div>
      ) : null}
      {saving ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-lg">
          Guardando...
        </div>
      ) : null}

      <section className="relative overflow-hidden bg-slate-950 px-4 py-4 !text-white sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-[1800px]">
          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-blue-100">
                    <ShieldCheck size={14} /> Panel interno GastroHelp
                  </div>
                  <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-tight !text-white drop-shadow-sm sm:text-4xl">
                    Admin Pro para vender y controlar restaurantes
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed !text-slate-100">
                    Crea demos, revisa qué falta, copia enlaces y entra al panel de cada cliente sin tocar Supabase.
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    href="/admin/onboarding-restaurante"
                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-50"
                  >
                    <Store size={16} /> Instalar restaurante
                  </Link>
                  <button
                    onClick={cargarAdmin}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
                  >
                    <RefreshCw size={16} /> Actualizar
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SmallDarkMetric
                  label="Restaurantes"
                  value={resumenGlobal.restaurantes}
                  sub={`${resumenGlobal.activos} activos/demo`}
                />
                <SmallDarkMetric
                  label="Listos"
                  value={resumenGlobal.listos}
                  sub="para enseñar"
                />
                <SmallDarkMetric
                  label="Ventas mes QR"
                  value={money(resumenGlobal.ventasMes)}
                  sub="cobros registrados"
                />
                <SmallDarkMetric
                  label="Avisos"
                  value={resumenGlobal.avisos}
                  sub="cosas a revisar"
                />
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.22em] !text-slate-300">
                    Restaurante seleccionado
                  </p>
                  <h2 className="mt-2 truncate text-2xl font-black tracking-tight !text-white">
                    {restauranteActivo
                      ? getRestauranteNombre(restauranteActivo)
                      : "Sin restaurante"}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {statsActivo ? (
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${readinessClass(statsActivo.porcentaje, statsActivo.problemas.length)}`}
                      >
                        <CheckCircle2 size={14} />{" "}
                        {readinessLabel(
                          statsActivo.porcentaje,
                          statsActivo.problemas.length,
                        )}
                      </span>
                    ) : null}
                    {restauranteActivo ? (
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-slate-300">
                        {restauranteActivo.plan || "base"}
                      </span>
                    ) : null}
                  </div>
                </div>
                {statsActivo ? (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/10 bg-white/10 text-2xl font-black text-white shadow-inner">
                    {statsActivo.porcentaje}%
                  </div>
                ) : null}
              </div>

              {statsActivo ? (
                <div className="mt-5 space-y-4">
                  <ProgressBar value={statsActivo.porcentaje} />

                  <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                      Siguiente acción recomendada
                    </p>
                    <p className="mt-1 text-lg font-black !text-white">
                      {nextAction(statsActivo)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(statsActivo.problemas.length
                        ? statsActivo.problemas.slice(0, 3)
                        : ["Sin avisos críticos"]
                      ).map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black text-slate-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={() =>
                        restauranteActivo &&
                        usarEnPanel(restauranteActivo.restaurante_id)
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-blue-400"
                    >
                      <LayoutDashboard size={16} /> Usar en panel
                    </button>
                    <button
                      disabled={
                        !restauranteActivo ||
                        preparando === restauranteActivo.restaurante_id
                      }
                      onClick={() =>
                        restauranteActivo && prepararDemo(restauranteActivo)
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100 disabled:opacity-60"
                    >
                      {preparando === restauranteActivo?.restaurante_id ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Rocket size={16} />
                      )}
                      Preparar demo
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      disabled={!cartaUrl(statsActivo)}
                      onClick={() =>
                        copiarTexto(cartaUrl(statsActivo), "Link carta copiado")
                      }
                      className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-xs font-black text-white transition hover:bg-white/15 disabled:opacity-40"
                    >
                      Copiar carta QR
                    </button>
                    <button
                      disabled={!clienteUrl(statsActivo)}
                      onClick={() =>
                        copiarTexto(
                          clienteUrl(statsActivo),
                          "Link app cliente copiado",
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-xs font-black text-white transition hover:bg-white/15 disabled:opacity-40"
                    >
                      Copiar app cliente
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1800px] space-y-6 p-4 sm:p-6 lg:p-8">
        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            label="Restaurantes"
            value={resumenGlobal.restaurantes}
            sub={`${resumenGlobal.activos} activos/demo`}
            icon={<Store size={20} />}
          />
          <StatCard
            label="Listos"
            value={resumenGlobal.listos}
            sub="demo/venta"
            icon={<CheckCircle2 size={20} />}
            tone="emerald"
          />
          <StatCard
            label="Reservas hoy"
            value={resumenGlobal.reservasHoy}
            sub="todos los clientes"
            icon={<CalendarDays size={20} />}
          />
          <StatCard
            label="Pedidos QR"
            value={resumenGlobal.pedidosHoy}
            sub="entrados hoy"
            icon={<ChefHat size={20} />}
          />
          <StatCard
            label="Ventas hoy"
            value={money(resumenGlobal.ventasHoy)}
            sub="QR cobrado"
            icon={<BarChart3 size={20} />}
            tone="emerald"
          />
          <StatCard
            label="Avisos"
            value={resumenGlobal.avisos}
            sub="a revisar"
            icon={<AlertTriangle size={20} />}
            tone={resumenGlobal.avisos ? "amber" : "emerald"}
          />
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["clientes", "Clientes"],
                  ["instalacion", "Instalación"],
                  ["uso", "Uso real"],
                  ["avisos", "Avisos"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setVista(id)}
                  className={`rounded-2xl px-4 py-2 text-sm font-black transition ${vista === id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar restaurante, plan, estado o ID..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100 xl:w-[420px]"
              />
            </div>
          </div>
        </section>

        {vista === "clientes" ? (
          <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {restaurantesFiltrados.map((restaurante) => {
              const stats = statsRestaurante(restaurante.restaurante_id);
              const nombre = getRestauranteNombre(restaurante);
              const selected =
                restauranteActivo?.restaurante_id ===
                restaurante.restaurante_id;
              return (
                <article
                  key={restaurante.restaurante_id}
                  className={`rounded-[2rem] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? "border-blue-600 ring-4 ring-blue-100" : "border-slate-200"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <button
                      onClick={() =>
                        setSeleccionado(restaurante.restaurante_id)
                      }
                      className="min-w-0 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill className={planColor(restaurante.plan)}>
                          <Crown size={12} /> {restaurante.plan || "base"}
                        </Pill>
                        <Pill className={estadoColor(restaurante.estado)}>
                          {restaurante.estado || "sin estado"}
                        </Pill>
                        {stats.porcentaje >= 80 ? (
                          <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            <CheckCircle2 size={12} /> Listo
                          </Pill>
                        ) : null}
                      </div>
                      <h2 className="mt-3 truncate text-2xl font-black text-slate-950">
                        {nombre}
                      </h2>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        ID {restaurante.restaurante_id.slice(0, 8)} · Última
                        actividad {fechaCorta(stats.ultimaActividad)}
                      </p>
                    </button>
                    <button
                      onClick={() =>
                        copiarTexto(restaurante.restaurante_id, "ID copiado")
                      }
                      className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 hover:bg-slate-50"
                    >
                      <Copy size={16} />
                    </button>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-slate-500">
                      <span>Preparación</span>
                      <span>{stats.porcentaje}%</span>
                    </div>
                    <div className="mt-2">
                      <ProgressBar value={stats.porcentaje} />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <MiniMetric
                      label="Carta"
                      value={stats.carta ? "OK" : "No"}
                      sub={`${stats.productos.length} productos`}
                    />
                    <MiniMetric
                      label="App"
                      value={stats.clienteDemo ? "OK" : "No"}
                      sub={`${stats.clientes.length} clientes`}
                    />
                    <MiniMetric
                      label="QR hoy"
                      value={stats.pedidosHoy}
                      sub={money(stats.ventasHoy)}
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      onClick={() => usarEnPanel(restaurante.restaurante_id)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
                    >
                      <LayoutDashboard size={14} /> Usar en panel
                    </button>
                    <button
                      onClick={() => prepararDemo(restaurante)}
                      disabled={preparando === restaurante.restaurante_id}
                      className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                    >
                      {preparando === restaurante.restaurante_id ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Rocket size={14} />
                      )}{" "}
                      Preparar demo
                    </button>
                    {cartaUrl(stats) ? (
                      <button
                        onClick={() =>
                          copiarTexto(cartaUrl(stats), "Carta QR copiada")
                        }
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
                      >
                        <QrCode size={14} /> Carta
                      </button>
                    ) : null}
                    {clienteUrl(stats) ? (
                      <button
                        onClick={() =>
                          copiarTexto(clienteUrl(stats), "App cliente copiada")
                        }
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
                      >
                        <Smartphone size={14} /> App
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        {vista === "instalacion" ? (
          <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">
                Restaurantes
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Selecciona uno para revisar si está listo para vender.
              </p>
              <div className="mt-4 space-y-2">
                {restaurantesFiltrados.map((r) => {
                  const stats = statsRestaurante(r.restaurante_id);
                  const selected =
                    restauranteActivo?.restaurante_id === r.restaurante_id;
                  return (
                    <button
                      key={r.restaurante_id}
                      onClick={() => setSeleccionado(r.restaurante_id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">
                            {getRestauranteNombre(r)}
                          </p>
                          <p
                            className={`mt-0.5 text-xs font-bold ${selected ? "text-slate-300" : "text-slate-500"}`}
                          >
                            {stats.porcentaje}% preparado
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-black ${stats.porcentaje >= 80 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                        >
                          {stats.porcentaje}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {restauranteActivo && statsActivo ? (
              <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Checklist de instalación
                    </p>
                    <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
                      {getRestauranteNombre(restauranteActivo)}
                    </h2>
                    <p className="mt-2 text-sm font-semibold text-slate-500">
                      Deja todo preparado antes de enseñar el sistema al
                      restaurante.
                    </p>
                  </div>
                  <div className="rounded-3xl bg-slate-950 px-6 py-4 text-center text-white">
                    <p className="text-4xl font-black">
                      {statsActivo.porcentaje}%
                    </p>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      preparado
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <ProgressBar value={statsActivo.porcentaje} />
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {statsActivo.checklist.map((item) => (
                    <CheckRow key={item.id} item={item} />
                  ))}
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Link
                    href="/admin/onboarding-restaurante"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                  >
                    <Settings2 size={16} /> Abrir onboarding
                  </Link>
                  <button
                    onClick={() => prepararDemo(restauranteActivo)}
                    disabled={preparando === restauranteActivo.restaurante_id}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {preparando === restauranteActivo.restaurante_id ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Rocket size={16} />
                    )}{" "}
                    Preparar demo
                  </button>
                  <button
                    onClick={() =>
                      copiarTexto(cartaUrl(statsActivo), "Link carta copiado")
                    }
                    disabled={!cartaUrl(statsActivo)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    <QrCode size={16} /> Copiar QR
                  </button>
                  <button
                    onClick={() =>
                      copiarTexto(clienteUrl(statsActivo), "Link app copiado")
                    }
                    disabled={!clienteUrl(statsActivo)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                  >
                    <Smartphone size={16} /> Copiar app
                  </button>
                </div>

                <div className="mt-6 rounded-3xl bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-950">
                    Links rápidos
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center justify-between rounded-2xl bg-white p-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      Panel restaurante <ArrowRight size={16} />
                    </Link>
                    <Link
                      href="/panel/pedidos-qr"
                      className="inline-flex items-center justify-between rounded-2xl bg-white p-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      Cocina / pedidos <ArrowRight size={16} />
                    </Link>
                    <Link
                      href="/panel/qr-mesas"
                      className="inline-flex items-center justify-between rounded-2xl bg-white p-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      QR mesas <ArrowRight size={16} />
                    </Link>
                    <Link
                      href="/estadisticas"
                      className="inline-flex items-center justify-between rounded-2xl bg-white p-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      Métricas <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              </article>
            ) : null}
          </section>
        ) : null}

        {vista === "uso" ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {restaurantesFiltrados.map((r) => {
              const stats = statsRestaurante(r.restaurante_id);
              return (
                <article
                  key={r.restaurante_id}
                  className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black text-slate-950">
                        {getRestauranteNombre(r)}
                      </h2>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Última actividad: {fechaCorta(stats.ultimaActividad)}
                      </p>
                    </div>
                    <Pill className={estadoColor(r.estado)}>
                      {r.estado || "sin estado"}
                    </Pill>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <MiniMetric
                      label="Reservas hoy"
                      value={stats.reservasHoy}
                    />
                    <MiniMetric label="Pedidos QR" value={stats.pedidosHoy} />
                    <MiniMetric
                      label="Ventas QR hoy"
                      value={money(stats.ventasHoy)}
                    />
                    <MiniMetric
                      label="Ventas QR mes"
                      value={money(stats.ventasMes)}
                    />
                    <MiniMetric
                      label="Clientes"
                      value={stats.clientes.length}
                    />
                    <MiniMetric label="Rating" value={stats.ratingMedio} />
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        {vista === "avisos" ? (
          <section className="space-y-4">
            {restaurantesFiltrados.map((r) => {
              const stats = statsRestaurante(r.restaurante_id);
              return (
                <article
                  key={r.restaurante_id}
                  className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-xl font-black text-slate-950">
                        {getRestauranteNombre(r)}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {stats.problemas.length
                          ? "Cosas que conviene revisar"
                          : "Todo correcto ahora mismo"}
                      </p>
                    </div>
                    {stats.problemas.length ? (
                      <Pill className="border-amber-200 bg-amber-50 text-amber-700">
                        <AlertTriangle size={13} /> {stats.problemas.length}{" "}
                        aviso{stats.problemas.length === 1 ? "" : "s"}
                      </Pill>
                    ) : (
                      <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        <CheckCircle2 size={13} /> OK
                      </Pill>
                    )}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stats.problemas.length ? (
                      stats.problemas.map((p) => (
                        <div
                          key={p}
                          className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-black text-amber-800"
                        >
                          {p}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-black text-emerald-700">
                        Sin problemas importantes
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                Contratación y acceso
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Control de módulos
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Activa solo lo que el restaurante tiene contratado. Esto
                controla qué aparece en el panel cliente.
              </p>
            </div>
            {restauranteActivo ? (
              <div className="flex flex-wrap gap-2">
                <select
                  value={restauranteActivo.plan || "base"}
                  onChange={(e) =>
                    cambiarCampo(
                      restauranteActivo.restaurante_id,
                      "plan",
                      e.target.value,
                    )
                  }
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="base">Base</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                  <option value="demo">Demo</option>
                </select>
                <select
                  value={restauranteActivo.estado || "activo"}
                  onChange={(e) =>
                    cambiarCampo(
                      restauranteActivo.restaurante_id,
                      "estado",
                      e.target.value,
                    )
                  }
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="activo">Activo</option>
                  <option value="demo">Demo</option>
                  <option value="pausado">Pausado</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            ) : null}
          </div>

          {restauranteActivo ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {modulos.map((m) => {
                const active = Boolean(restauranteActivo[m.key]);
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    onClick={() => cambiarModulo(restauranteActivo, m.key)}
                    className={`group rounded-3xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${active ? "border-blue-200 bg-gradient-to-br from-blue-50 to-white" : "border-slate-200 bg-slate-50 hover:bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`rounded-2xl p-3 shadow-sm ${active ? "bg-blue-600 text-white" : "bg-white text-slate-500"}`}
                      >
                        <Icon size={18} />
                      </div>
                      <div
                        className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${active ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}
                      >
                        {active ? "ON" : "OFF"}
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-black text-slate-950">
                      {m.label}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {active
                        ? "Visible y activo para este restaurante"
                        : "Oculto en el panel cliente"}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs font-black text-slate-400">
                      <span>{active ? "Incluido" : "No contratado"}</span>
                      {active ? (
                        <ToggleRight className="text-blue-700" size={24} />
                      ) : (
                        <ToggleLeft className="text-slate-400" size={24} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
