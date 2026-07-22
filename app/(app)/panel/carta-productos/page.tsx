"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChefHat,
  Euro,
  Eye,
  EyeOff,
  Globe2,
  ImagePlus,
  Languages,
  Loader2,
  Pencil,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useRestaurante } from "../../../hooks/useRestaurante";

type LanguageCode = "en" | "fr" | "de" | "it" | "pt";

type TraduccionProducto = {
  nombre?: string;
  descripcion?: string | null;
  tipo?: string | null;
  alergenos?: string[] | null;
};

type Carta = {
  id: string;
  restaurante_id: string;
  nombre: string;
  public_token: string;
};

type Categoria = {
  id: string;
  carta_id: string;
  restaurante_id: string;
  nombre: string;
  orden: number;
  activa: boolean;
};

type Producto = {
  id: string;
  carta_id: string;
  categoria_id: string | null;
  restaurante_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number | string | null;
  imagen_url: string | null;
  imagen_prompt: string | null;
  tipo: string | null;
  alergenos: string[] | null;
  recomendado: boolean;
  activo: boolean;
  orden: number;
  traducciones?: Partial<Record<LanguageCode, TraduccionProducto>> | null;
};

const idiomasDisponibles: Array<{
  code: LanguageCode;
  label: string;
  nombre: string;
}> = [
  { code: "en", label: "EN", nombre: "English" },
  { code: "fr", label: "FR", nombre: "Français" },
  { code: "de", label: "DE", nombre: "Deutsch" },
  { code: "it", label: "IT", nombre: "Italiano" },
  { code: "pt", label: "PT", nombre: "Português" },
];

const alergenosRapidos = [
  "gluten",
  "huevo",
  "lácteos",
  "frutos secos",
  "pescado",
  "marisco",
  "soja",
  "mostaza",
  "sésamo",
  "sulfitos",
  "cacahuetes",
  "apio",
  "moluscos",
];

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizarTexto(valor: string | null | undefined) {
  return (valor ?? "").toString().trim();
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatEuro(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value));
}

function arrayATexto(valor: string[] | null | undefined) {
  return (valor || []).join(", ");
}

function textoAArray(valor: string) {
  return valor
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTraduccion(producto: Producto, idioma: LanguageCode) {
  return producto.traducciones?.[idioma] || {};
}

function tieneTraduccion(producto: Producto, idioma: LanguageCode) {
  const t = getTraduccion(producto, idioma);
  return Boolean(t.nombre || t.descripcion || t.tipo);
}

function inputClass(extra = "") {
  return clsx(
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100",
    extra
  );
}

function buttonBase(extra = "") {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
    extra
  );
}

export default function CartaProductosPage() {
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id
    ? String((restauranteActual as any).id)
    : null;

  const [cartaActiva, setCartaActiva] = useState<Carta | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [idiomaActivo, setIdiomaActivo] = useState<LanguageCode>("en");
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const categoriaById = useMemo(() => {
    const map = new Map<string, Categoria>();
    categorias.forEach((cat) => map.set(cat.id, cat));
    return map;
  }, [categorias]);

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((producto) => {
      if (!q) return true;
      const traduccion = getTraduccion(producto, idiomaActivo);
      const categoria = producto.categoria_id
        ? categoriaById.get(producto.categoria_id)?.nombre
        : "";

      const texto = `
        ${producto.nombre}
        ${producto.descripcion || ""}
        ${producto.tipo || ""}
        ${categoria || ""}
        ${(producto.alergenos || []).join(" ")}
        ${traduccion.nombre || ""}
        ${traduccion.descripcion || ""}
        ${traduccion.tipo || ""}
      `.toLowerCase();

      return texto.includes(q);
    });
  }, [productos, busqueda, idiomaActivo, categoriaById]);

  const stats = useMemo(() => {
    const activos = productos.filter((p) => p.activo).length;
    const recomendados = productos.filter((p) => p.recomendado).length;
    const conAlergenos = productos.filter((p) => (p.alergenos || []).length > 0).length;
    const traducidos = productos.filter((p) => tieneTraduccion(p, idiomaActivo)).length;

    return { activos, recomendados, conAlergenos, traducidos };
  }, [productos, idiomaActivo]);

  async function cargarDatos() {
    setLoading(true);
    setErrorMsg(null);

    if (loadingRestaurante) return;

    if (!restauranteId) {
      setCartaActiva(null);
      setProductos([]);
      setCategorias([]);
      setErrorMsg(
        "No se encontró restaurante activo. Entra desde Admin y pulsa ‘Usar en panel’ sobre el restaurante correcto."
      );
      setLoading(false);
      return;
    }

    const cartasRes = await (supabase as any)
      .from("cartas_digitales")
      .select("id, restaurante_id, nombre, public_token, created_at")
      .eq("restaurante_id", restauranteId)
      .order("created_at", { ascending: false });

    if (cartasRes.error) {
      setErrorMsg(cartasRes.error.message);
      setLoading(false);
      return;
    }

    const carta = ((cartasRes.data || []) as Carta[])[0] || null;
    setCartaActiva(carta);

    if (!carta) {
      setProductos([]);
      setCategorias([]);
      setLoading(false);
      return;
    }

    const [categoriasRes, productosRes] = await Promise.all([
      (supabase as any)
        .from("carta_categorias")
        .select("*")
        .eq("restaurante_id", restauranteId)
        .eq("carta_id", carta.id)
        .order("orden", { ascending: true }),
      (supabase as any)
        .from("carta_productos")
        .select("*")
        .eq("restaurante_id", restauranteId)
        .eq("carta_id", carta.id)
        .order("orden", { ascending: true }),
    ]);

    if (categoriasRes.error) setErrorMsg(categoriasRes.error.message);
    if (productosRes.error) setErrorMsg(productosRes.error.message);

    setCategorias((categoriasRes.data || []) as Categoria[]);
    setProductos((productosRes.data || []) as Producto[]);
    setLoading(false);
  }

  useEffect(() => {
    cargarDatos();
  }, [restauranteId, loadingRestaurante]);

  function actualizarProductoLocal(productoActualizado: Producto) {
    setProductos((actual) =>
      actual.map((producto) =>
        producto.id === productoActualizado.id ? productoActualizado : producto
      )
    );
    setProductoEditando((actual) =>
      actual?.id === productoActualizado.id ? productoActualizado : actual
    );
  }

  async function guardarProducto(producto: Producto, silent = false) {
    if (!restauranteId) return;

    setGuardandoId(producto.id);
    setErrorMsg(null);
    if (!silent) setOkMsg(null);

    const { error } = await (supabase as any)
      .from("carta_productos")
      .update({
        nombre: producto.nombre,
        descripcion: producto.descripcion || "",
        precio: toNumber(producto.precio),
        categoria_id: producto.categoria_id || null,
        imagen_url: producto.imagen_url || null,
        tipo: producto.tipo || "",
        alergenos: producto.alergenos || [],
        recomendado: Boolean(producto.recomendado),
        activo: Boolean(producto.activo),
        orden: Number(producto.orden || 0),
        traducciones: producto.traducciones || {},
      })
      .eq("id", producto.id)
      .eq("restaurante_id", restauranteId);

    if (error) {
      setErrorMsg(error.message || "No se pudo guardar el producto.");
      setGuardandoId(null);
      return;
    }

    actualizarProductoLocal(producto);
    if (!silent) {
      setOkMsg("Producto guardado correctamente.");
      setTimeout(() => setOkMsg(null), 2500);
    }
    setGuardandoId(null);
  }

  async function crearProductoManual() {
    if (!restauranteId || !cartaActiva) {
      setErrorMsg("Este restaurante todavía no tiene carta digital creada.");
      return;
    }

    setGuardandoId("nuevo");
    setErrorMsg(null);
    setOkMsg(null);

    const maxOrden = productos.reduce(
      (max, producto) => Math.max(max, Number(producto.orden || 0)),
      0
    );

    const { data, error } = await (supabase as any)
      .from("carta_productos")
      .insert({
        carta_id: cartaActiva.id,
        restaurante_id: restauranteId,
        categoria_id: categorias[0]?.id || null,
        nombre: "Nuevo producto",
        descripcion: "",
        precio: 0,
        imagen_url: null,
        imagen_prompt: null,
        tipo: "",
        alergenos: [],
        recomendado: false,
        activo: true,
        orden: maxOrden + 1,
        traducciones: {},
      })
      .select("*")
      .single();

    if (error) {
      setErrorMsg(error.message || "No se pudo crear el producto.");
      setGuardandoId(null);
      return;
    }

    const producto = data as Producto;
    setProductos((actual) => [...actual, producto]);
    setProductoEditando(producto);
    setGuardandoId(null);
  }

  async function subirImagen(producto: Producto, file: File) {
    if (!file || !restauranteId) return;

    setSubiendoId(producto.id);
    setErrorMsg(null);

    const extension = file.name.split(".").pop() || "jpg";
    const nombreArchivo = `productos/${restauranteId}/${producto.id}-${Date.now()}.${extension}`;

    const uploadRes = await (supabase as any).storage.from("menus").upload(nombreArchivo, file, {
      cacheControl: "3600",
      upsert: true,
    });

    if (uploadRes.error) {
      setErrorMsg(uploadRes.error.message || "No se pudo subir la imagen.");
      setSubiendoId(null);
      return;
    }

    const { data } = (supabase as any).storage.from("menus").getPublicUrl(nombreArchivo);
    const imagenUrl = data.publicUrl as string;
    const actualizado = { ...producto, imagen_url: imagenUrl };

    await guardarProducto(actualizado, true);
    setProductoEditando(actualizado);
    setOkMsg("Imagen subida correctamente.");
    setTimeout(() => setOkMsg(null), 2500);
    setSubiendoId(null);
  }

  function actualizarEditando(cambios: Partial<Producto>) {
    setProductoEditando((actual) => (actual ? { ...actual, ...cambios } : actual));
  }

  function actualizarTraduccion(idioma: LanguageCode, cambios: TraduccionProducto) {
    setProductoEditando((actual) => {
      if (!actual) return actual;
      const traducciones = actual.traducciones || {};
      const existente = traducciones[idioma] || {};
      return {
        ...actual,
        traducciones: {
          ...traducciones,
          [idioma]: { ...existente, ...cambios },
        },
      };
    });
  }

  function toggleAlergenoProducto(alergeno: string) {
    if (!productoEditando) return;
    const actuales = productoEditando.alergenos || [];
    const existe = actuales.includes(alergeno);
    actualizarEditando({
      alergenos: existe
        ? actuales.filter((item) => item !== alergeno)
        : [...actuales, alergeno],
    });
  }

  function toggleAlergenoTraducido(alergeno: string) {
    if (!productoEditando) return;
    const traduccion = getTraduccion(productoEditando, idiomaActivo);
    const actuales = traduccion.alergenos || [];
    const existe = actuales.includes(alergeno);
    actualizarTraduccion(idiomaActivo, {
      alergenos: existe
        ? actuales.filter((item) => item !== alergeno)
        : [...actuales, alergeno],
    });
  }

  async function toggleRapido(producto: Producto, campo: "activo" | "recomendado") {
    const actualizado = { ...producto, [campo]: !producto[campo] };
    actualizarProductoLocal(actualizado);
    await guardarProducto(actualizado, true);
  }

  const traduccionEditando = productoEditando
    ? getTraduccion(productoEditando, idiomaActivo)
    : {};

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-slate-950 p-3 text-white shadow-sm">
              <ChefHat className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Productos carta</h1>
              <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
                Gestiona solo la carta del restaurante activo. Sin elegir cartas de otros restaurantes.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={crearProductoManual}
              disabled={!cartaActiva || guardandoId === "nuevo"}
              className={buttonBase("bg-slate-950 text-white hover:bg-slate-800")}
            >
              {guardandoId === "nuevo" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlusCircle className="h-4 w-4" />
              )}
              Nuevo producto
            </button>
            <button
              onClick={cargarDatos}
              className={buttonBase("border border-slate-200 bg-white text-slate-700 hover:bg-slate-100")}
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </button>
          </div>
        </header>

        {errorMsg && (
          <div className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {errorMsg}
          </div>
        )}

        {okMsg && (
          <div className="mb-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            {okMsg}
          </div>
        )}

        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Carta del restaurante activo
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {loading || loadingRestaurante ? (
                  <div className="flex items-center gap-2 text-sm font-black text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando carta...
                  </div>
                ) : cartaActiva ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xl font-black text-slate-950">{cartaActiva.nombre}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        Token QR: {cartaActiva.public_token}
                      </p>
                    </div>
                    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 className="h-4 w-4" /> Carta activa
                    </span>
                  </div>
                ) : (
                  <div>
                    <p className="font-black text-slate-950">Sin carta creada</p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Prepara la demo desde Admin o crea la carta del restaurante antes de añadir productos.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Buscar rápido
              </div>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato, categoría, alérgeno..."
                  className={inputClass("py-4 pl-12")}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MiniStat label="Productos" value={productos.length} />
            <MiniStat label="Activos" value={stats.activos} />
            <MiniStat label="Recomendados" value={stats.recomendados} />
            <MiniStat label="Con alérgenos" value={stats.conAlergenos} />
            <MiniStat label={`Trad. ${idiomaActivo.toUpperCase()}`} value={stats.traducidos} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Traducciones
            </span>
            {idiomasDisponibles.map((idioma) => (
              <button
                key={idioma.code}
                onClick={() => setIdiomaActivo(idioma.code)}
                className={clsx(
                  "rounded-2xl px-4 py-2 text-sm font-black transition",
                  idiomaActivo === idioma.code
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                )}
              >
                {idioma.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Productos</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Vista compacta para editar sin que la pantalla se haga enorme.
              </p>
            </div>
            <p className="text-sm font-black text-slate-400">
              {productosFiltrados.length} resultados
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 p-10 text-sm font-black text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando productos...
            </div>
          ) : productosFiltrados.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-lg font-black">No hay productos</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Crea el primer producto o cambia la búsqueda.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {productosFiltrados.map((producto) => {
                const categoria = producto.categoria_id
                  ? categoriaById.get(producto.categoria_id)?.nombre
                  : null;
                const traducido = tieneTraduccion(producto, idiomaActivo);
                const alergCount = (producto.alergenos || []).length;

                return (
                  <div
                    key={producto.id}
                    className="grid gap-4 p-4 transition hover:bg-slate-50 lg:grid-cols-[80px_1fr_auto] lg:items-center"
                  >
                    <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-100">
                      {producto.imagen_url ? (
                        <img
                          src={producto.imagen_url}
                          alt={producto.nombre}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ImagePlus className="h-6 w-6" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-black text-slate-950">
                          {producto.nombre || "Producto sin nombre"}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                          {formatEuro(producto.precio)}
                        </span>
                        {categoria && (
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-100">
                            {categoria}
                          </span>
                        )}
                      </div>

                      <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-500">
                        {normalizarTexto(producto.descripcion) || "Sin descripción"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge ok={producto.activo} label={producto.activo ? "Activo" : "Oculto"} />
                        {producto.recomendado && <Badge ok label="Recomendado" />}
                        <Badge ok={alergCount > 0} label={`${alergCount} alérgenos`} />
                        <Badge ok={traducido} label={traducido ? `${idiomaActivo.toUpperCase()} listo` : `${idiomaActivo.toUpperCase()} pendiente`} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        onClick={() => toggleRapido(producto, "recomendado")}
                        disabled={guardandoId === producto.id}
                        className={buttonBase(
                          producto.recomendado
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                        )}
                        title="Recomendado"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => toggleRapido(producto, "activo")}
                        disabled={guardandoId === producto.id}
                        className={buttonBase(
                          producto.activo
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                            : "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
                        )}
                        title="Visible en carta"
                      >
                        {producto.activo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setProductoEditando({ ...producto })}
                        className={buttonBase("bg-slate-950 text-white hover:bg-slate-800")}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {productoEditando && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 p-0 backdrop-blur-sm sm:p-4">
          <div className="h-full w-full overflow-y-auto bg-white shadow-2xl sm:max-w-2xl sm:rounded-[2rem]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  Editar producto
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">
                  {productoEditando.nombre || "Producto"}
                </h3>
              </div>
              <button
                onClick={() => setProductoEditando(null)}
                className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 p-5">
              <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-slate-400" />
                  <p className="font-black">Datos principales</p>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">Nombre</label>
                    <input
                      value={productoEditando.nombre}
                      onChange={(e) => actualizarEditando({ nombre: e.target.value })}
                      className={inputClass()}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">Descripción</label>
                    <textarea
                      value={productoEditando.descripcion || ""}
                      onChange={(e) => actualizarEditando({ descripcion: e.target.value })}
                      rows={3}
                      className={inputClass("resize-none")}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-black text-slate-700">Precio</label>
                      <div className="relative">
                        <Euro className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="number"
                          step="0.01"
                          value={productoEditando.precio ?? ""}
                          onChange={(e) =>
                            actualizarEditando({
                              precio: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className={inputClass("pl-10")}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-black text-slate-700">Categoría</label>
                      <select
                        value={productoEditando.categoria_id || ""}
                        onChange={(e) => actualizarEditando({ categoria_id: e.target.value || null })}
                        className={inputClass()}
                      >
                        <option value="">Sin categoría</option>
                        {categorias.map((categoria) => (
                          <option key={categoria.id} value={categoria.id}>
                            {categoria.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-black text-slate-700">Tipo</label>
                      <input
                        value={productoEditando.tipo || ""}
                        onChange={(e) => actualizarEditando({ tipo: e.target.value })}
                        placeholder="entrante, principal, postre..."
                        className={inputClass()}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-black text-slate-700">Orden</label>
                      <input
                        type="number"
                        value={productoEditando.orden ?? 0}
                        onChange={(e) => actualizarEditando({ orden: Number(e.target.value) })}
                        className={inputClass()}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
                    <div className="h-28 w-28 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200">
                      {productoEditando.imagen_url ? (
                        <img
                          src={productoEditando.imagen_url}
                          alt={productoEditando.nombre}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <ImagePlus className="h-7 w-7" />
                        </div>
                      )}
                    </div>
                    <div className="grid gap-3">
                      <label className={buttonBase("cursor-pointer border border-slate-200 bg-white text-slate-700 hover:bg-slate-100")}> 
                        {subiendoId === productoEditando.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ImagePlus className="h-4 w-4" />
                        )}
                        Subir imagen
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) subirImagen(productoEditando, file);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <input
                        value={productoEditando.imagen_url || ""}
                        onChange={(e) => actualizarEditando({ imagen_url: e.target.value })}
                        placeholder="URL de imagen"
                        className={inputClass()}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => actualizarEditando({ activo: !productoEditando.activo })}
                      className={buttonBase(
                        productoEditando.activo
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                      )}
                    >
                      {productoEditando.activo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      {productoEditando.activo ? "Visible" : "Oculto"}
                    </button>
                    <button
                      onClick={() => actualizarEditando({ recomendado: !productoEditando.recomendado })}
                      className={buttonBase(
                        productoEditando.recomendado
                          ? "bg-blue-600 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      )}
                    >
                      <Star className="h-4 w-4" />
                      Recomendado
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-slate-400" />
                  <p className="font-black">Alérgenos</p>
                </div>
                <input
                  value={arrayATexto(productoEditando.alergenos)}
                  onChange={(e) => actualizarEditando({ alergenos: textoAArray(e.target.value) })}
                  placeholder="gluten, huevo, lácteos..."
                  className={inputClass()}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {alergenosRapidos.map((alergeno) => {
                    const activo = (productoEditando.alergenos || []).includes(alergeno);
                    return (
                      <button
                        key={alergeno}
                        onClick={() => toggleAlergenoProducto(alergeno)}
                        className={clsx(
                          "rounded-full px-3 py-2 text-xs font-black transition",
                          activo
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        {alergeno}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Languages className="h-5 w-5 text-slate-400" />
                    <p className="font-black">Traducción {idiomaActivo.toUpperCase()}</p>
                  </div>
                  <Globe2 className="h-5 w-5 text-slate-300" />
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {idiomasDisponibles.map((idioma) => (
                    <button
                      key={idioma.code}
                      onClick={() => setIdiomaActivo(idioma.code)}
                      className={clsx(
                        "rounded-2xl px-3 py-2 text-xs font-black transition",
                        idiomaActivo === idioma.code
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {idioma.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">Nombre traducido</label>
                    <input
                      value={traduccionEditando.nombre || ""}
                      onChange={(e) => actualizarTraduccion(idiomaActivo, { nombre: e.target.value })}
                      className={inputClass()}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">Descripción traducida</label>
                    <textarea
                      value={traduccionEditando.descripcion || ""}
                      onChange={(e) => actualizarTraduccion(idiomaActivo, { descripcion: e.target.value })}
                      rows={3}
                      className={inputClass("resize-none")}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">Tipo traducido</label>
                    <input
                      value={traduccionEditando.tipo || ""}
                      onChange={(e) => actualizarTraduccion(idiomaActivo, { tipo: e.target.value })}
                      className={inputClass()}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-black text-slate-700">Alérgenos traducidos</label>
                    <input
                      value={arrayATexto(traduccionEditando.alergenos)}
                      onChange={(e) =>
                        actualizarTraduccion(idiomaActivo, { alergenos: textoAArray(e.target.value) })
                      }
                      className={inputClass()}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {alergenosRapidos.map((alergeno) => {
                        const activo = (traduccionEditando.alergenos || []).includes(alergeno);
                        return (
                          <button
                            key={alergeno}
                            onClick={() => toggleAlergenoTraducido(alergeno)}
                            className={clsx(
                              "rounded-full px-3 py-2 text-xs font-black transition",
                              activo
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            )}
                          >
                            {alergeno}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 border-t border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => guardarProducto(productoEditando)}
                  disabled={guardandoId === productoEditando.id}
                  className={buttonBase("flex-1 bg-slate-950 text-white hover:bg-slate-800")}
                >
                  {guardandoId === productoEditando.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Guardar cambios
                </button>
                <button
                  onClick={() => setProductoEditando(null)}
                  className={buttonBase("border border-slate-200 bg-white text-slate-700 hover:bg-slate-100")}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-black ring-1",
        ok
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-slate-100 text-slate-500 ring-slate-200"
      )}
    >
      {label}
    </span>
  );
}
