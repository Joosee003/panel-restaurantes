"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  QrCode,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
  Store,
  Table2,
  Utensils,
} from "lucide-react";
import { supabase } from "../../(app)/lib/supabaseClient";

type Restaurante = {
  id: string;
  nombre: string;
  slug: string | null;
  telefono: string | null;
  direccion: string | null;
  logo_url: string | null;
  capacidad_total: number | null;
  color_primario: string | null;
};

type Modulos = {
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
};

type Carta = {
  id: string;
  restaurante_id: string;
  nombre: string;
  estado: string | null;
  public_token: string;
};

type Categoria = {
  id: string;
  carta_id: string;
  restaurante_id: string;
  nombre: string;
};

type Zona = {
  id: string;
  restaurante_id: string;
  nombre: string;
};

type Mesa = {
  id: string;
  restaurante_id: string;
  zona_id: string | null;
  nombre: string;
  capacidad: number | null;
};

type MenuDia = {
  id: string;
  restaurante_id: string;
  carta_id: string | null;
  titulo: string;
  precio: number | string | null;
  activo: boolean | null;
};

type Pedido = {
  id: string;
  restaurante_id: string;
  mesa: string | null;
  estado: string | null;
  created_at: string | null;
};

type Paso = {
  id: string;
  titulo: string;
  descripcion: string;
  listo: boolean;
  icono: ReactNode;
  accion?: ReactNode;
};

const STORAGE_KEY = "gastrohelp_restaurante_activo";

const categoriasBase = [
  {
    nombre: "Entrantes",
    orden: 1,
    traducciones: { en: "Starters", fr: "Entrées", de: "Vorspeisen", it: "Antipasti", pt: "Entradas" },
  },
  {
    nombre: "Principales",
    orden: 2,
    traducciones: { en: "Mains", fr: "Plats principaux", de: "Hauptgerichte", it: "Piatti principali", pt: "Pratos principais" },
  },
  {
    nombre: "Postres",
    orden: 3,
    traducciones: { en: "Desserts", fr: "Desserts", de: "Desserts", it: "Dolci", pt: "Sobremesas" },
  },
  {
    nombre: "Bebidas",
    orden: 4,
    traducciones: { en: "Drinks", fr: "Boissons", de: "Getränke", it: "Bevande", pt: "Bebidas" },
  },
];

const seccionesMenuBase = [
  {
    nombre: "Primeros",
    opciones: [
      { nombre: "Ensalada de la casa", descripcion: "Fresca y ligera" },
      { nombre: "Gazpacho", descripcion: "Casero y frío" },
    ],
  },
  {
    nombre: "Segundos",
    opciones: [
      { nombre: "Pollo a la brasa", descripcion: "Con patatas" },
      { nombre: "Arroz del día", descripcion: "Consultar variedad" },
    ],
  },
  {
    nombre: "Postres",
    opciones: [
      { nombre: "Tarta de queso", descripcion: "Casera" },
      { nombre: "Café", descripcion: "Incluido" },
    ],
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cardClass(listo: boolean) {
  return listo
    ? "border-emerald-200 bg-emerald-50"
    : "border-slate-200 bg-white";
}

function moduloActivo(modulos: Modulos | null, key: keyof Modulos) {
  return Boolean(modulos?.[key]);
}

function buildPublicUrl(token?: string, mesa = "1", lang = "es", origin = "") {
  if (!token) return "";
  return `${origin}/carta/${token}?mesa=${encodeURIComponent(mesa)}&lang=${lang}`;
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      {sub ? <p className="mt-1 text-sm font-semibold text-slate-500">{sub}</p> : null}
    </div>
  );
}

function PasoCard({ paso }: { paso: Paso }) {
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${cardClass(paso.listo)}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className={paso.listo ? "rounded-2xl bg-emerald-600 p-3 text-white" : "rounded-2xl bg-slate-100 p-3 text-slate-700"}>
            {paso.icono}
          </div>
          <div>
            <p className="font-black text-slate-950">{paso.titulo}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{paso.descripcion}</p>
          </div>
        </div>
        {paso.listo ? <CheckCircle2 className="shrink-0 text-emerald-600" size={22} /> : <AlertTriangle className="shrink-0 text-amber-500" size={22} />}
      </div>
      {paso.accion ? <div className="mt-4">{paso.accion}</div> : null}
    </div>
  );
}

export default function OnboardingRestaurantePage() {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([]);
  const [restauranteId, setRestauranteId] = useState<string>("");
  const [restaurante, setRestaurante] = useState<Restaurante | null>(null);
  const [modulos, setModulos] = useState<Modulos | null>(null);
  const [cartas, setCartas] = useState<Carta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [menus, setMenus] = useState<MenuDia[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [publicOrigin, setPublicOrigin] = useState("");

  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    direccion: "",
    email: "",
    capacidad: "40",
    mesas: "8",
    plan: "premium",
    cartaNombre: "Carta principal",
    activarReservas: true,
    activarClientes: true,
    activarResenas: true,
    activarFidelizacion: true,
    activarMetricas: true,
    activarCamarero: true,
    activarMenuDigital: true,
    activarChatbot: false,
    activarAutomatizaciones: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPublicOrigin(window.location.origin);
    }, 0);
    void cargarInicial();

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (restauranteId) {
      cargarRestaurante(restauranteId);
    }
  }, [restauranteId]);

  async function cargarInicial() {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("No hay sesión activa. Entra con tu usuario del panel.");
      setLoading(false);
      return;
    }

    const { data: adminAccess, error: adminError } = await supabase
      .from("app_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError || !adminAccess?.user_id) {
      setError("Tu usuario no tiene acceso de administración.");
      setLoading(false);
      return;
    }

    const { data, error: restaurantsError } = await supabase
      .from("restaurantes")
      .select("id, nombre, slug, telefono, direccion, logo_url, capacidad_total, color_primario")
      .order("created_at", { ascending: true });

    if (restaurantsError) {
      setError("No he podido cargar los restaurantes.");
      console.error(restaurantsError);
      setLoading(false);
      return;
    }

    const lista = (data || []) as Restaurante[];

    setRestaurantes(lista);

    const guardado = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const inicial = lista.find((r) => r.id === guardado)?.id || lista[0]?.id || "";
    setRestauranteId(inicial);

    if (!inicial) {
      setLoading(false);
    }
  }

  async function cargarRestaurante(id: string) {
    setLoading(true);
    setError(null);

    const [restauranteRes, modulosRes, cartasRes, categoriasRes, zonasRes, mesasRes, menusRes, pedidosRes] = await Promise.all([
      supabase.from("restaurantes").select("id, nombre, slug, telefono, direccion, logo_url, capacidad_total, color_primario").eq("id", id).maybeSingle(),
      supabase.from("restaurante_modulos").select("*").eq("restaurante_id", id).maybeSingle(),
      supabase.from("cartas_digitales").select("id, restaurante_id, nombre, estado, public_token").eq("restaurante_id", id).order("created_at", { ascending: true }),
      supabase.from("carta_categorias").select("id, carta_id, restaurante_id, nombre").eq("restaurante_id", id).order("orden", { ascending: true }),
      supabase.from("sala_zonas").select("id, restaurante_id, nombre").eq("restaurante_id", id).order("orden", { ascending: true }),
      supabase.from("sala_mesas").select("id, restaurante_id, zona_id, nombre, capacidad").eq("restaurante_id", id).order("orden", { ascending: true }),
      supabase.from("menus_dia_qr").select("id, restaurante_id, carta_id, titulo, precio, activo").eq("restaurante_id", id).order("orden", { ascending: true }),
      supabase.from("pedidos_qr").select("id, restaurante_id, mesa, estado, created_at").eq("restaurante_id", id).order("created_at", { ascending: false }).limit(20),
    ]);

    if (restauranteRes.error) {
      setError("No he podido cargar el restaurante seleccionado.");
      console.error(restauranteRes.error);
    }

    setRestaurante((restauranteRes.data as Restaurante | null) || null);
    setModulos((modulosRes.data as Modulos | null) || null);
    setCartas((cartasRes.data || []) as Carta[]);
    setCategorias((categoriasRes.data || []) as Categoria[]);
    setZonas((zonasRes.data || []) as Zona[]);
    setMesas((mesasRes.data || []) as Mesa[]);
    setMenus((menusRes.data || []) as MenuDia[]);
    setPedidos((pedidosRes.data || []) as Pedido[]);
    setLoading(false);
  }

  function seleccionarRestaurante(id: string) {
    setRestauranteId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
      window.dispatchEvent(new Event("storage"));
    }
  }

  function usarRestauranteEnPanel(id?: string) {
    const idFinal = id || restauranteId;
    if (!idFinal) {
      setError("Selecciona un restaurante antes de abrir el panel.");
      return;
    }

    seleccionarRestaurante(idFinal);

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        window.location.assign("/dashboard");
      }, 80);
    }
  }

  async function crearRestauranteCompleto() {
    if (!form.nombre.trim()) {
      setError("Pon el nombre del restaurante antes de crear la instalación.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Escribe el email que usará el restaurante para entrar.");
      return;
    }

    setSaving("crear");
    setError(null);
    setOk(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setError("La sesión ha caducado. Vuelve a entrar.");
      setSaving(null);
      return;
    }

    const response = await fetch("/api/admin/restaurantes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        direccion: form.direccion.trim(),
        email: form.email.trim().toLowerCase(),
        capacidad: form.capacidad,
        mesas: form.mesas,
        plan: form.plan,
        cartaNombre: form.cartaNombre,
        activarReservas: form.activarReservas,
        activarClientes: form.activarClientes,
        activarResenas: form.activarResenas,
        activarFidelizacion: form.activarFidelizacion,
        activarMetricas: form.activarMetricas,
        activarChatbot: form.activarChatbot,
        activarCamarero: form.activarCamarero,
        activarMenuDigital: form.activarMenuDigital,
        activarAutomatizaciones: form.activarAutomatizaciones,
      }),
    });

    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      restaurante_id?: string;
      invited_email?: string;
    } | null;

    if (!response.ok || !result?.ok || !result.restaurante_id) {
      const messages: Record<string, string> = {
        EMAIL_ALREADY_REGISTERED:
          "Ese email ya tiene una cuenta. Usa otro email o revisa el restaurante existente.",
        INVITE_SEND_FAILED:
          "No se ha podido enviar la invitación. No se ha guardado una instalación incompleta.",
        ADMIN_REQUIRED: "Tu usuario ya no tiene acceso de administración.",
        INVALID_SESSION: "La sesión ha caducado. Vuelve a entrar.",
      };
      setError(
        messages[result?.error || ""] ||
          "No se ha podido crear la instalación y enviar la invitación.",
      );
      setSaving(null);
      return;
    }

    seleccionarRestaurante(result.restaurante_id);
    setOk(
      `Instalación creada. Invitación enviada a ${result.invited_email || form.email.trim()}.`,
    );
    setForm((actual) => ({ ...actual, nombre: "", telefono: "", direccion: "", email: "" }));
    await cargarInicial();
    await cargarRestaurante(result.restaurante_id);
    setSaving(null);
  }

  async function activarPackCompleto() {
    if (!restauranteId) return;
    setSaving("modulos");
    setError(null);

    const payload = {
      restaurante_id: restauranteId,
      plan: "premium",
      estado: "activo",
      reservas: true,
      clientes: true,
      resenas: true,
      fidelizacion: true,
      metricas: true,
      chatbot: true,
      camarero_digital: true,
      menu_digital: true,
      automatizaciones: true,
    };

    const { error: updateError } = modulos
      ? await supabase.from("restaurante_modulos").update(payload).eq("restaurante_id", restauranteId)
      : await supabase.from("restaurante_modulos").insert(payload);

    if (updateError) {
      setError("No he podido activar los módulos.");
      console.error(updateError);
    } else {
      setOk("Módulos activados.");
      await cargarRestaurante(restauranteId);
    }

    setSaving(null);
  }

  async function crearCartaBase() {
    if (!restauranteId) return;
    setSaving("carta");
    setError(null);

    const { data: carta, error: cartaError } = await supabase
      .from("cartas_digitales")
      .insert({ restaurante_id: restauranteId, nombre: "Carta principal", estado: "activa" })
      .select("id")
      .single();

    if (cartaError || !carta?.id) {
      setError("No he podido crear la carta.");
      console.error(cartaError);
      setSaving(null);
      return;
    }

    await supabase.from("carta_categorias").insert(
      categoriasBase.map((categoria) => ({
        carta_id: carta.id,
        restaurante_id: restauranteId,
        nombre: categoria.nombre,
        orden: categoria.orden,
        activa: true,
        traducciones: categoria.traducciones,
      }))
    );

    setOk("Carta principal creada con categorías base.");
    await cargarRestaurante(restauranteId);
    setSaving(null);
  }

  async function crearCategoriasBase() {
    const carta = cartas[0];
    if (!restauranteId || !carta) return;
    setSaving("categorias");
    setError(null);

    const existentes = new Set(categorias.map((c) => c.nombre.toLowerCase()));
    const nuevas = categoriasBase.filter((c) => !existentes.has(c.nombre.toLowerCase()));

    if (nuevas.length > 0) {
      await supabase.from("carta_categorias").insert(
        nuevas.map((categoria) => ({
          carta_id: carta.id,
          restaurante_id: restauranteId,
          nombre: categoria.nombre,
          orden: categoria.orden,
          activa: true,
          traducciones: categoria.traducciones,
        }))
      );
    }

    setOk("Categorías revisadas.");
    await cargarRestaurante(restauranteId);
    setSaving(null);
  }

  async function crearMesasRapidas() {
    if (!restauranteId) return;
    setSaving("mesas");
    setError(null);

    let zonaId = zonas[0]?.id;

    if (!zonaId) {
      const { data: zona } = await supabase
        .from("sala_zonas")
        .insert({ restaurante_id: restauranteId, nombre: "Sala principal", orden: 1, activa: true })
        .select("id")
        .single();
      zonaId = zona?.id;
    }

    if (zonaId) {
      const inicio = mesas.length;
      const total = Math.max(1, Math.min(80, Number(form.mesas || 8)));
      await supabase.from("sala_mesas").insert(
        Array.from({ length: total }).map((_, index) => ({
          restaurante_id: restauranteId,
          zona_id: zonaId,
          nombre: `Mesa ${inicio + index + 1}`,
          capacidad: 4,
          orden: inicio + index + 1,
          activa: true,
          bloqueada: false,
        }))
      );
    }

    setOk("Mesas creadas.");
    await cargarRestaurante(restauranteId);
    setSaving(null);
  }

  async function crearMenuDemo() {
    const carta = cartas[0];
    if (!restauranteId || !carta) return;
    setSaving("menu");
    setError(null);

    await supabase.from("menus_dia_qr").insert({
      restaurante_id: restauranteId,
      carta_id: carta.id,
      titulo: "Menú del día",
      descripcion: "Primer plato, segundo, postre y bebida.",
      precio: 14.9,
      activo: true,
      dias_semana: [1, 2, 3, 4, 5],
      hora_inicio: "12:00",
      hora_fin: "16:00",
      fecha_desde: todayIso(),
      secciones: seccionesMenuBase,
      orden: 1,
    });

    setOk("Menú del día creado.");
    await cargarRestaurante(restauranteId);
    setSaving(null);
  }

  async function copiar(texto: string) {
    if (!texto) return;
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1400);
  }

  const cartaPrincipal = cartas[0];
  const mesaPrincipal = mesas[0]?.nombre || "1";
  const qrDemo = buildPublicUrl(cartaPrincipal?.public_token, mesaPrincipal, "es", publicOrigin);

  const progreso = useMemo(() => {
    const checks = [
      Boolean(restaurante),
      Boolean(modulos),
      Boolean(cartaPrincipal),
      categorias.length >= 4,
      mesas.length > 0,
      Boolean(cartaPrincipal && mesas.length > 0),
      menus.some((m) => m.activo),
      pedidos.length > 0,
    ];
    const completados = checks.filter(Boolean).length;
    return Math.round((completados / checks.length) * 100);
  }, [restaurante, modulos, cartaPrincipal, categorias.length, mesas.length, menus, pedidos.length]);

  const pasos: Paso[] = [
    {
      id: "datos",
      titulo: "Datos del restaurante",
      descripcion: restaurante ? restaurante.nombre : "Crea o elige un restaurante.",
      listo: Boolean(restaurante),
      icono: <Store size={20} />,
    },
    {
      id: "modulos",
      titulo: "Módulos activados",
      descripcion: modulos ? `${Object.entries(modulos).filter(([, value]) => value === true).length} activos` : "Activa el pack contratado.",
      listo: Boolean(modulos && moduloActivo(modulos, "reservas") && moduloActivo(modulos, "clientes")),
      icono: <Settings2 size={20} />,
      accion: !modulos || !moduloActivo(modulos, "camarero_digital") ? (
        <button onClick={activarPackCompleto} className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800">
          Activar pack completo
        </button>
      ) : null,
    },
    {
      id: "carta",
      titulo: "Carta QR",
      descripcion: cartaPrincipal ? cartaPrincipal.nombre : "Crea una carta principal.",
      listo: Boolean(cartaPrincipal),
      icono: <FileText size={20} />,
      accion: !cartaPrincipal ? (
        <button onClick={crearCartaBase} className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800">
          Crear carta base
        </button>
      ) : null,
    },
    {
      id: "categorias",
      titulo: "Categorías base",
      descripcion: `${categorias.length} categorías creadas`,
      listo: categorias.length >= 4,
      icono: <Utensils size={20} />,
      accion: cartaPrincipal && categorias.length < 4 ? (
        <button onClick={crearCategoriasBase} className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800">
          Completar categorías
        </button>
      ) : null,
    },
    {
      id: "mesas",
      titulo: "Mesas y sala",
      descripcion: `${mesas.length} mesas creadas`,
      listo: mesas.length > 0,
      icono: <Table2 size={20} />,
      accion: mesas.length === 0 ? (
        <button onClick={crearMesasRapidas} className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800">
          Crear mesas
        </button>
      ) : null,
    },
    {
      id: "qr",
      titulo: "QR listo",
      descripcion: cartaPrincipal && mesas.length ? "Enlace de prueba preparado." : "Necesita carta y mesas.",
      listo: Boolean(cartaPrincipal && mesas.length > 0),
      icono: <QrCode size={20} />,
      accion: qrDemo ? (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => copiar(qrDemo)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-800 hover:bg-slate-50">
            Copiar QR demo
          </button>
          <Link href="/panel/qr-mesas" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">
            Ver QR mesas
          </Link>
        </div>
      ) : null,
    },
    {
      id: "menu",
      titulo: "Menú del día",
      descripcion: menus.some((m) => m.activo) ? "Menú activo en carta QR." : "Crea un menú inicial.",
      listo: menus.some((m) => m.activo),
      icono: <CalendarClock size={20} />,
      accion: cartaPrincipal && !menus.some((m) => m.activo) ? (
        <button onClick={crearMenuDemo} className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800">
          Crear menú inicial
        </button>
      ) : null,
    },
    {
      id: "prueba",
      titulo: "Pedido de prueba",
      descripcion: pedidos.length ? `${pedidos.length} pedidos detectados` : "Haz un pedido desde el QR antes de entregar.",
      listo: pedidos.length > 0,
      icono: <ChefHat size={20} />,
      accion: qrDemo ? (
        <Link href={qrDemo} target="_blank" className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800">
          Probar pedido <ExternalLink size={15} />
        </Link>
      ) : null,
    },
  ];

  const textoEntrega = useMemo(() => {
    return [
      `Instalación ${restaurante?.nombre || "restaurante"}`,
      `Panel: ${publicOrigin || ""}/dashboard`,
      cartaPrincipal ? `Carta QR: ${buildPublicUrl(cartaPrincipal.public_token, "1", "es", publicOrigin)}` : "Carta QR: pendiente",
      `Mesas creadas: ${mesas.length}`,
      `Menú del día: ${menus.some((m) => m.activo) ? "activo" : "pendiente"}`,
      `Prueba de pedido: ${pedidos.length ? "hecha" : "pendiente"}`,
    ].join("\n");
  }, [restaurante?.nombre, cartaPrincipal, mesas.length, menus, pedidos.length, publicOrigin]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-wide text-blue-700">
                <Rocket size={16} /> Pack 8 · Instalación de restaurante
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 lg:text-5xl">
                Onboarding rápido para nuevos clientes
              </h1>
              <p className="mt-3 max-w-3xl text-base font-semibold text-slate-500">
                Crea el restaurante, activa módulos, monta carta, mesas, QR y prueba final desde una sola pantalla.
              </p>
            </div>

            <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-blue-200">Progreso</p>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-5xl font-black">{progreso}%</span>
                <span className="pb-2 text-sm font-bold text-slate-300">listo</span>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${progreso}%` }} />
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : null}
        {ok ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            {ok}
          </div>
        ) : null}
        {copiado ? (
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-700">
            Copiado.
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-950">Restaurante activo</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">El panel trabajará con este restaurante.</p>
                </div>
                <button onClick={cargarInicial} className="rounded-2xl border border-slate-200 p-3 text-slate-700 hover:bg-slate-50">
                  <RefreshCw size={18} />
                </button>
              </div>

              <select
                value={restauranteId}
                onChange={(e) => seleccionarRestaurante(e.target.value)}
                className="mt-5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 outline-none focus:border-blue-500"
              >
                <option value="">Seleccionar restaurante</option>
                {restaurantes.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>

              {restaurante ? (
                <div className="mt-5 rounded-3xl bg-slate-50 p-4">
                  <p className="font-black text-slate-950">{restaurante.nombre}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{restaurante.direccion || "Sin dirección"}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{restaurante.telefono || "Sin teléfono"}</p>
                  <button
                    onClick={() => usarRestauranteEnPanel(restaurante.id)}
                    className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800"
                  >
                    Usar en el panel <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                  Todavía no hay restaurante seleccionado.
                </div>
              )}
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">Crear instalación nueva</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Rellena lo básico y crea todo de golpe.</p>

              <div className="mt-5 space-y-3">
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre restaurante" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
                <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Teléfono" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email de acceso del restaurante" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
                <div className="grid grid-cols-2 gap-3">
                  <input value={form.capacidad} onChange={(e) => setForm({ ...form, capacidad: e.target.value })} placeholder="Capacidad" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
                  <input value={form.mesas} onChange={(e) => setForm({ ...form, mesas: e.target.value })} placeholder="Mesas" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
                </div>
                <input value={form.cartaNombre} onChange={(e) => setForm({ ...form, cartaNombre: e.target.value })} placeholder="Nombre carta" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />

                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Módulos iniciales</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold text-slate-700">
                    {(
                      [
                        ["activarReservas", "Reservas"],
                        ["activarClientes", "Clientes"],
                        ["activarResenas", "Reseñas"],
                        ["activarFidelizacion", "Fidelización"],
                        ["activarMetricas", "Métricas"],
                        ["activarCamarero", "Camarero"],
                        ["activarMenuDigital", "Carta QR"],
                        ["activarChatbot", "Chatbot"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(form[key])}
                          onChange={(e) => setForm((actual) => ({ ...actual, [key]: e.target.checked }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={crearRestauranteCompleto}
                disabled={saving === "crear"}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {saving === "crear" ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Crear instalación y enviar invitación
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi label="Cartas" value={cartas.length} sub={cartaPrincipal?.nombre || "pendiente"} />
              <Kpi label="Mesas" value={mesas.length} sub={zonas.length ? `${zonas.length} zonas` : "sin zonas"} />
              <Kpi label="Menús" value={menus.length} sub={menus.some((m) => m.activo) ? "activo" : "pendiente"} />
              <Kpi label="Pedidos prueba" value={pedidos.length} sub="últimos 20" />
            </div>

            {loading ? (
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center font-bold text-slate-500 shadow-sm">
                Cargando instalación...
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {pasos.map((paso) => <PasoCard key={paso.id} paso={paso} />)}
              </div>
            )}

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><QrCode size={22} /></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-950">Enlaces QR por mesa</h2>
                    <p className="text-sm font-semibold text-slate-500">Primeras mesas listas para imprimir.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  {cartaPrincipal && mesas.length ? mesas.slice(0, 8).map((mesa) => {
                    const url = buildPublicUrl(cartaPrincipal.public_token, mesa.nombre.replace(/mesa\s*/i, "") || mesa.nombre, "es", publicOrigin);
                    return (
                      <div key={mesa.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
                        <div className="min-w-0">
                          <p className="font-black text-slate-950">{mesa.nombre}</p>
                          <p className="truncate text-xs font-semibold text-slate-500">{url}</p>
                        </div>
                        <button onClick={() => copiar(url)} className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50">
                          <Copy size={16} />
                        </button>
                      </div>
                    );
                  }) : (
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Crea carta y mesas para ver enlaces.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><ClipboardCheck size={22} /></div>
                  <div>
                    <h2 className="text-xl font-black text-slate-950">Entrega al cliente</h2>
                    <p className="text-sm font-semibold text-slate-500">Texto rápido para tener control de la instalación.</p>
                  </div>
                </div>

                <pre className="mt-5 whitespace-pre-wrap rounded-3xl bg-slate-950 p-5 text-sm font-semibold leading-6 text-slate-100">
                  {textoEntrega}
                </pre>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button onClick={() => copiar(textoEntrega)} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white hover:bg-blue-800">
                    <Copy size={16} /> Copiar entrega
                  </button>
                  <Link href="/admin/restaurantes" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50">
                    <Building2 size={16} /> Admin
                  </Link>
                  <button onClick={() => usarRestauranteEnPanel()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50">
                    <Eye size={16} /> Ver panel
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><BadgeCheck size={22} /></div>
                <div>
                  <h2 className="text-xl font-black text-slate-950">Checklist final antes de venderlo</h2>
                  <p className="text-sm font-semibold text-slate-500">Cuando esto esté todo en verde, el cliente puede usarlo.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  "El restaurante aparece en Admin GastroHelp",
                  "Los módulos contratados están activos",
                  "La carta QR abre en móvil sin juego lateral",
                  "Los idiomas se ven en la carta",
                  "Las mesas tienen QR correcto",
                  "Cocina recibe pedidos",
                  "Mesa abierta permite cerrar y cobrar",
                  "Menú del día aparece en horario correcto",
                  "Dashboard muestra actividad",
                  "Reservas y clientes cargan sin errores",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
                    <CheckCircle2 className="shrink-0 text-emerald-600" size={18} /> {item}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
