"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { supabase } from "../../(app)/lib/supabaseClient";

type CartaDigital = {
  id: string;
  restaurante_id: string;
  nombre: string;
  archivo_url: string | null;
  estado: string;
  public_token: string;
  created_at: string;
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
  precio: number | null;
  imagen_url: string | null;
  imagen_prompt: string | null;
  tipo: string | null;
  alergenos: string[] | null;
  recomendado: boolean;
  activo: boolean;
  orden: number;
};

type CarritoItem = {
  producto: Producto;
  cantidad: number;
};

type Recomendacion = {
  producto: Producto;
  motivo: string;
};

const imagenesFallback = [
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1565958011703-44f9829ba187?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?q=80&w=1200&auto=format&fit=crop",
];

export default function CartaPublicaPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const token = String(params?.token || "");
  const mesa = searchParams.get("mesa");

  const [carta, setCarta] = useState<CartaDigital | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
  const [modalRecomendacion, setModalRecomendacion] = useState(false);
  const [mostrarCarritoMovil, setMostrarCarritoMovil] = useState(false);

  useEffect(() => {
    cargarCarta();
  }, [token]);

  async function cargarCarta() {
    setCargando(true);
    setError(null);

    try {
      const { data: cartaData, error: cartaError } = await supabase
        .from("cartas_digitales")
        .select("*")
        .eq("public_token", token)
        .single();

      if (cartaError) throw cartaError;
      if (!cartaData) throw new Error("No se ha encontrado la carta.");

      setCarta(cartaData);

      const { data: categoriasData, error: categoriasError } = await supabase
        .from("carta_categorias")
        .select("*")
        .eq("carta_id", cartaData.id)
        .eq("activa", true)
        .order("orden", { ascending: true });

      if (categoriasError) throw categoriasError;

      const { data: productosData, error: productosError } = await supabase
        .from("carta_productos")
        .select("*")
        .eq("carta_id", cartaData.id)
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (productosError) throw productosError;

      setCategorias(categoriasData || []);
      setProductos(productosData || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo cargar la carta.");
    } finally {
      setCargando(false);
    }
  }

  const productosFiltrados = useMemo(() => {
    return productos.filter((producto) => {
      const coincideCategoria =
        categoriaActiva === "todas" || producto.categoria_id === categoriaActiva;

      const texto = `${producto.nombre} ${producto.descripcion || ""} ${
        producto.tipo || ""
      }`.toLowerCase();

      const coincideBusqueda = texto.includes(busqueda.toLowerCase().trim());

      return coincideCategoria && coincideBusqueda;
    });
  }, [productos, categoriaActiva, busqueda]);

  const productosPorCategoria = useMemo(() => {
    return categorias
      .map((categoria) => ({
        categoria,
        productos: productosFiltrados.filter(
          (producto) => producto.categoria_id === categoria.id
        ),
      }))
      .filter((grupo) => grupo.productos.length > 0);
  }, [categorias, productosFiltrados]);

  const destacados = productos
    .filter((producto) => producto.recomendado)
    .slice(0, 5);

  const totalCarrito = carrito.reduce((total, item) => {
    return total + Number(item.producto.precio || 0) * item.cantidad;
  }, 0);

  const unidadesCarrito = carrito.reduce(
    (total, item) => total + item.cantidad,
    0
  );

  const recomendaciones = useMemo(() => {
    return obtenerRecomendaciones(productos, carrito);
  }, [productos, carrito]);

  function obtenerImagen(producto: Producto, index = 0) {
    if (producto.imagen_url) return producto.imagen_url;

    const nombre = producto.nombre.toLowerCase();

    if (nombre.includes("hamburguesa") || nombre.includes("burger")) {
      return "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=1200&auto=format&fit=crop";
    }

    if (nombre.includes("pizza")) {
      return "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=1200&auto=format&fit=crop";
    }

    if (nombre.includes("costilla") || nombre.includes("bbq")) {
      return "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1200&auto=format&fit=crop";
    }

    if (nombre.includes("tarta") || nombre.includes("postre")) {
      return "https://images.unsplash.com/photo-1565958011703-44f9829ba187?q=80&w=1200&auto=format&fit=crop";
    }

    if (
      nombre.includes("coca") ||
      nombre.includes("cola") ||
      nombre.includes("bebida") ||
      nombre.includes("agua")
    ) {
      return "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?q=80&w=1200&auto=format&fit=crop";
    }

    return imagenesFallback[index % imagenesFallback.length];
  }

  function cantidadProducto(productoId: string) {
    return carrito.find((item) => item.producto.id === productoId)?.cantidad || 0;
  }

  function añadirProducto(producto: Producto) {
    setCarrito((actual) => {
      const existe = actual.find((item) => item.producto.id === producto.id);

      if (existe) {
        return actual.map((item) =>
          item.producto.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }

      return [...actual, { producto, cantidad: 1 }];
    });
  }

  function restarProducto(productoId: string) {
    setCarrito((actual) =>
      actual
        .map((item) =>
          item.producto.id === productoId
            ? { ...item, cantidad: item.cantidad - 1 }
            : item
        )
        .filter((item) => item.cantidad > 0)
    );
  }

  function eliminarProducto(productoId: string) {
    setCarrito((actual) =>
      actual.filter((item) => item.producto.id !== productoId)
    );
  }

  function prepararEnvioPedido() {
    if (carrito.length === 0) return;

    if (recomendaciones.length > 0) {
      setModalRecomendacion(true);
      return;
    }

    enviarPedido();
  }

  async function enviarPedido() {
    if (!carta || carrito.length === 0) return;

    setEnviando(true);
    setError(null);

    try {
      const { data: pedidoData, error: pedidoError } = await supabase
        .from("pedidos_qr")
        .insert({
          restaurante_id: carta.restaurante_id,
          carta_id: carta.id,
          mesa: mesa || null,
          estado: "nuevo",
          total: totalCarrito,
          notas: null,
        })
        .select()
        .single();

      if (pedidoError) throw pedidoError;

      const itemsPedido = carrito.map((item) => ({
        pedido_id: pedidoData.id,
        producto_id: item.producto.id,
        nombre_producto: item.producto.nombre,
        precio_unitario: Number(item.producto.precio || 0),
        cantidad: item.cantidad,
        notas: null,
      }));

      const { error: itemsError } = await supabase
        .from("pedido_qr_items")
        .insert(itemsPedido);

      if (itemsError) throw itemsError;

      setCarrito([]);
      setModalRecomendacion(false);
      setMostrarCarritoMovil(false);
      setPedidoEnviado(true);

      setTimeout(() => {
        setPedidoEnviado(false);
      }, 7000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo enviar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f172a] text-white">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 backdrop-blur">
            <Loader2 className="h-9 w-9 animate-spin" />
          </div>
          <p className="text-xl font-black">Cargando carta...</p>
          <p className="mt-2 text-sm text-white/60">
            Preparando la carta del restaurante
          </p>
        </div>
      </main>
    );
  }

  if (error && !carta) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
        <div className="max-w-md rounded-3xl border border-red-200 bg-white p-7 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <X className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black">Carta no disponible</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-900">
      <section className="relative overflow-hidden bg-slate-950 px-5 pb-8 pt-6 text-white">
        <div className="absolute -left-20 top-10 h-52 w-52 animate-pulse rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute -right-24 top-20 h-64 w-64 animate-pulse rounded-full bg-amber-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-44 w-96 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

        <div className="relative mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-black backdrop-blur">
                <Utensils className="h-4 w-4 text-orange-300" />
                {mesa ? `Mesa ${mesa}` : "Carta digital"}
              </div>

              <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-6xl">
                {carta?.nombre || "Carta digital"}
              </h1>

              <p className="mt-4 max-w-2xl text-base font-semibold text-white/70">
                Elige tus platos favoritos y envía el pedido directamente a cocina.
              </p>
            </div>

            <button
              onClick={() => setMostrarCarritoMovil(true)}
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg md:hidden"
            >
              <ShoppingBag className="h-6 w-6" />
              {unidadesCarrito > 0 && (
                <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-orange-500 px-2 text-xs font-black text-white">
                  {unidadesCarrito}
                </span>
              )}
            </button>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-3 md:max-w-xl">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-2xl font-black">{productos.length}</p>
              <p className="text-xs font-bold text-white/60">Productos</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-2xl font-black">{categorias.length}</p>
              <p className="text-xs font-bold text-white/60">Categorías</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-2xl font-black">{destacados.length}</p>
              <p className="text-xs font-bold text-white/60">Destacados</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-t-[2.5rem] bg-slate-50 px-5 pb-40 pt-6 md:pb-12">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            {pedidoEnviado && (
              <div className="mb-6 flex items-center gap-4 rounded-3xl border border-green-200 bg-green-50 p-5 text-green-800 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600 text-white">
                  <Check className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-black">Pedido enviado correctamente</p>
                  <p className="text-sm font-semibold">
                    Cocina ya ha recibido tu pedido.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm">
                <p className="font-black">Error</p>
                <p className="mt-1 text-sm font-semibold">{error}</p>
              </div>
            )}

            <div className="sticky top-0 z-20 -mx-5 bg-slate-50/95 px-5 pb-4 pt-2 backdrop-blur">
              <div className="flex gap-3 overflow-x-auto pb-2">
                <button
                  onClick={() => setCategoriaActiva("todas")}
                  className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-black transition ${
                    categoriaActiva === "todas"
                      ? "bg-slate-950 text-white shadow-sm"
                      : "bg-white text-slate-700 shadow-sm"
                  }`}
                >
                  Todas
                </button>

                {categorias.map((categoria) => (
                  <button
                    key={categoria.id}
                    onClick={() => setCategoriaActiva(categoria.id)}
                    className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-black transition ${
                      categoriaActiva === categoria.id
                        ? "bg-slate-950 text-white shadow-sm"
                        : "bg-white text-slate-700 shadow-sm"
                    }`}
                  >
                    {categoria.nombre}
                  </button>
                ))}
              </div>

              <div className="relative mt-3">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato, bebida o postre..."
                  className="w-full rounded-3xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-sm font-bold outline-none shadow-sm transition focus:border-slate-400"
                />
              </div>
            </div>

            {destacados.length > 0 && categoriaActiva === "todas" && !busqueda && (
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black uppercase text-orange-600">
                      Recomendados
                    </p>
                    <h2 className="text-2xl font-black text-slate-950">
                      Lo más destacado
                    </h2>
                  </div>
                  <Sparkles className="h-6 w-6 text-orange-500" />
                </div>

                <div className="flex gap-4 overflow-x-auto pb-3">
                  {destacados.map((producto, index) => (
                    <button
                      key={producto.id}
                      onClick={() => añadirProducto(producto)}
                      className="group relative h-64 w-56 shrink-0 overflow-hidden rounded-[2rem] bg-slate-900 text-left shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                    >
                      <img
                        src={obtenerImagen(producto, index)}
                        alt={producto.nombre}
                        className="food-photo-motion h-full w-full object-cover transition duration-700 group-hover:scale-125"
                      />

                      <div className="food-shine" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                      <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
                        <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-black text-white">
                          Top
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-950">
                          <Plus className="h-5 w-5" />
                        </span>
                      </div>

                      <div className="absolute bottom-4 left-4 right-4">
                        <h3 className="line-clamp-2 text-lg font-black text-white">
                          {producto.nombre}
                        </h3>
                        <p className="mt-2 text-xl font-black text-orange-300">
                          {Number(producto.precio || 0).toFixed(2)} €
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {categoriaActiva === "todas" && !busqueda ? (
              <div className="space-y-9">
                {productosPorCategoria.map((grupo) => (
                  <section key={grupo.categoria.id}>
                    <div className="mb-4">
                      <p className="text-sm font-black uppercase text-slate-400">
                        Categoría
                      </p>
                      <h2 className="text-2xl font-black text-slate-950">
                        {grupo.categoria.nombre}
                      </h2>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {grupo.productos.map((producto, index) => (
                        <ProductoCard
                          key={producto.id}
                          producto={producto}
                          imagen={obtenerImagen(producto, index)}
                          cantidad={cantidadProducto(producto.id)}
                          onAñadir={() => añadirProducto(producto)}
                          onRestar={() => restarProducto(producto.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {productosFiltrados.map((producto, index) => (
                  <ProductoCard
                    key={producto.id}
                    producto={producto}
                    imagen={obtenerImagen(producto, index)}
                    cantidad={cantidadProducto(producto.id)}
                    onAñadir={() => añadirProducto(producto)}
                    onRestar={() => restarProducto(producto.id)}
                  />
                ))}
              </div>
            )}

            {productosFiltrados.length === 0 && (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <p className="text-xl font-black">No hay productos</p>
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Prueba con otra categoría o búsqueda.
                </p>
              </div>
            )}
          </div>

          <aside className="hidden lg:block">
            <CarritoPanel
              mesa={mesa}
              carrito={carrito}
              total={totalCarrito}
              unidades={unidadesCarrito}
              enviando={enviando}
              onAñadir={añadirProducto}
              onRestar={restarProducto}
              onEliminar={eliminarProducto}
              onEnviar={prepararEnvioPedido}
            />
          </aside>
        </div>
      </section>

      {unidadesCarrito > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden">
          <button
            onClick={() => setMostrarCarritoMovil(true)}
            className="flex w-full items-center justify-between rounded-3xl bg-slate-950 px-5 py-4 text-white shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="font-black">{unidadesCarrito} producto(s)</p>
                <p className="text-xs font-semibold text-white/60">
                  {mesa ? `Mesa ${mesa}` : "Sin mesa"}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xl font-black">{totalCarrito.toFixed(2)} €</p>
              <p className="text-xs font-semibold text-orange-300">Ver pedido</p>
            </div>
          </button>
        </div>
      )}

      {mostrarCarritoMovil && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 backdrop-blur-sm lg:hidden">
          <div className="flex h-full flex-col rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-xl font-black">Tu pedido</p>
                <p className="text-sm font-bold text-slate-500">
                  {mesa ? `Mesa ${mesa}` : "Sin mesa"}
                </p>
              </div>

              <button
                onClick={() => setMostrarCarritoMovil(false)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <CarritoContenido
                carrito={carrito}
                onAñadir={añadirProducto}
                onRestar={restarProducto}
                onEliminar={eliminarProducto}
              />
            </div>

            <div className="border-t border-slate-100 p-5">
              <button
                onClick={prepararEnvioPedido}
                disabled={enviando || carrito.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShoppingBag className="h-5 w-5" />
                )}
                Enviar pedido · {totalCarrito.toFixed(2)} €
              </button>
            </div>
          </div>
        </div>
      )}

      {modalRecomendacion && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/60 p-4 backdrop-blur-sm md:items-center md:justify-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl md:max-w-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-orange-700">
                  <Sparkles className="h-4 w-4" />
                  Recomendación para completar tu pedido
                </div>

                <h2 className="text-2xl font-black text-slate-950">
                  Antes de enviar, te puede interesar
                </h2>

                <p className="mt-2 text-sm font-semibold text-slate-500">
                  Según lo que has elegido, estos productos encajan bien con tu pedido.
                </p>
              </div>

              <button
                onClick={() => setModalRecomendacion(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {recomendaciones.map((recomendacion, index) => {
                const producto = recomendacion.producto;
                const cantidad = cantidadProducto(producto.id);

                return (
                  <article
                    key={producto.id}
                    className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50"
                  >
                    <div className="relative h-40 overflow-hidden">
                      <img
                        src={obtenerImagen(producto, index)}
                        alt={producto.nombre}
                        className="food-photo-motion h-full w-full object-cover"
                      />

                      <div className="food-shine" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

                      <div className="absolute bottom-3 left-3 right-3">
                        <p className="text-lg font-black text-white">
                          {producto.nombre}
                        </p>
                        <p className="text-xl font-black text-orange-300">
                          {Number(producto.precio || 0).toFixed(2)} €
                        </p>
                      </div>
                    </div>

                    <div className="p-4">
                      <p className="text-sm font-semibold text-slate-600">
                        {recomendacion.motivo}
                      </p>

                      {cantidad > 0 ? (
                        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-2">
                          <button
                            onClick={() => restarProducto(producto.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100"
                          >
                            <Minus className="h-4 w-4" />
                          </button>

                          <span className="font-black">{cantidad}</span>

                          <button
                            onClick={() => añadirProducto(producto)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => añadirProducto(producto)}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
                        >
                          <Plus className="h-4 w-4" />
                          Añadir al pedido
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <button
                onClick={enviarPedido}
                disabled={enviando}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {enviando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowLeft className="h-5 w-5" />
                )}
                Enviar sin añadir nada
              </button>

              <button
                onClick={enviarPedido}
                disabled={enviando}
                className="flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {enviando ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ShoppingBag className="h-5 w-5" />
                )}
                Enviar pedido · {totalCarrito.toFixed(2)} €
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes foodKenBurns {
          0% {
            transform: scale(1.04) translate3d(0, 0, 0);
          }
          50% {
            transform: scale(1.14) translate3d(-8px, -6px, 0);
          }
          100% {
            transform: scale(1.04) translate3d(0, 0, 0);
          }
        }

        @keyframes shineMove {
          0% {
            transform: translateX(-140%) rotate(18deg);
            opacity: 0;
          }
          35% {
            opacity: 0.35;
          }
          70% {
            opacity: 0;
          }
          100% {
            transform: translateX(180%) rotate(18deg);
            opacity: 0;
          }
        }

        @keyframes softPulseBorder {
          0% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.35);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(249, 115, 22, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
          }
        }

        @keyframes cardEnter {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .food-card-enter {
          animation: cardEnter 0.55s ease both;
        }

        .food-photo-motion {
          animation: foodKenBurns 9s ease-in-out infinite;
          will-change: transform;
        }

        .food-shine {
          position: absolute;
          top: -40%;
          left: -40%;
          width: 45%;
          height: 180%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.45),
            transparent
          );
          animation: shineMove 4.8s ease-in-out infinite;
          pointer-events: none;
        }

        .recommended-glow {
          animation: softPulseBorder 2.6s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}

function ProductoCard({
  producto,
  imagen,
  cantidad,
  onAñadir,
  onRestar,
}: {
  producto: Producto;
  imagen: string;
  cantidad: number;
  onAñadir: () => void;
  onRestar: () => void;
}) {
  return (
    <article
      className={`food-card-enter group overflow-hidden rounded-[2rem] border bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${
        producto.recomendado
          ? "recommended-glow border-orange-200"
          : "border-slate-200"
      }`}
    >
      <div className="relative h-56 overflow-hidden bg-slate-900">
        <img
          src={imagen}
          alt={producto.nombre}
          className="food-photo-motion h-full w-full object-cover transition duration-700 group-hover:scale-125"
        />

        <div className="food-shine" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          {producto.recomendado && (
            <span className="flex items-center gap-1 rounded-full bg-orange-500 px-3 py-1 text-xs font-black text-white shadow-sm">
              <Star className="h-3 w-3 fill-white" />
              Recomendado
            </span>
          )}

          {producto.tipo && (
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-800 shadow-sm backdrop-blur">
              {producto.tipo}
            </span>
          )}
        </div>

        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-3xl font-black text-white drop-shadow">
            {Number(producto.precio || 0).toFixed(2)} €
          </p>
        </div>
      </div>

      <div className="p-5">
        <h3 className="text-xl font-black text-slate-950">{producto.nombre}</h3>

        {producto.descripcion && (
          <p className="mt-2 line-clamp-2 min-h-10 text-sm font-semibold leading-relaxed text-slate-500">
            {producto.descripcion}
          </p>
        )}

        {producto.alergenos && producto.alergenos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {producto.alergenos.slice(0, 3).map((alergeno) => (
              <span
                key={alergeno}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500"
              >
                {alergeno}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5">
          {cantidad > 0 ? (
            <div className="flex items-center justify-between rounded-2xl bg-slate-950 p-2 text-white">
              <button
                onClick={onRestar}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20"
              >
                <Minus className="h-5 w-5" />
              </button>

              <div className="text-center">
                <p className="text-xs font-bold text-white/60">Cantidad</p>
                <p className="text-lg font-black">{cantidad}</p>
              </div>

              <button
                onClick={onAñadir}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 transition hover:bg-orange-600"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onAñadir}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-orange-500"
            >
              <Plus className="h-5 w-5" />
              Añadir
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function CarritoPanel({
  mesa,
  carrito,
  total,
  unidades,
  enviando,
  onAñadir,
  onRestar,
  onEliminar,
  onEnviar,
}: {
  mesa: string | null;
  carrito: CarritoItem[];
  total: number;
  unidades: number;
  enviando: boolean;
  onAñadir: (producto: Producto) => void;
  onRestar: (productoId: string) => void;
  onEliminar: (productoId: string) => void;
  onEnviar: () => void;
}) {
  return (
    <div className="sticky top-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-black uppercase text-slate-400">
            Tu pedido
          </p>
          <h2 className="text-2xl font-black text-slate-950">
            {mesa ? `Mesa ${mesa}` : "Sin mesa"}
          </h2>
        </div>

        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <ShoppingBag className="h-6 w-6" />
          {unidades > 0 && (
            <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-orange-500 px-2 text-xs font-black text-white">
              {unidades}
            </span>
          )}
        </div>
      </div>

      <CarritoContenido
        carrito={carrito}
        onAñadir={onAñadir}
        onRestar={onRestar}
        onEliminar={onEliminar}
      />

      <div className="mt-5 border-t border-slate-100 pt-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-black text-slate-500">Total</span>
          <span className="text-3xl font-black text-slate-950">
            {total.toFixed(2)} €
          </span>
        </div>

        <button
          onClick={onEnviar}
          disabled={enviando || carrito.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ShoppingBag className="h-5 w-5" />
          )}
          Enviar pedido
        </button>

        <p className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-slate-400">
          <Clock className="h-4 w-4" />
          El pedido llegará directamente a cocina
        </p>
      </div>
    </div>
  );
}

function CarritoContenido({
  carrito,
  onAñadir,
  onRestar,
  onEliminar,
}: {
  carrito: CarritoItem[];
  onAñadir: (producto: Producto) => void;
  onRestar: (productoId: string) => void;
  onEliminar: (productoId: string) => void;
}) {
  if (carrito.length === 0) {
    return (
      <div className="rounded-3xl bg-slate-50 p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
          <ShoppingBag className="h-7 w-7" />
        </div>
        <p className="font-black text-slate-950">Tu pedido está vacío</p>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Añade algún producto de la carta.
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
      {carrito.map((item) => (
        <div
          key={item.producto.id}
          className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-black text-slate-950">{item.producto.nombre}</p>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {Number(item.producto.precio || 0).toFixed(2)} € / ud.
              </p>
            </div>

            <button
              onClick={() => onEliminar(item.producto.id)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-red-500 shadow-sm"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm">
              <button
                onClick={() => onRestar(item.producto.id)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100"
              >
                <Minus className="h-4 w-4" />
              </button>

              <span className="w-8 text-center font-black">{item.cantidad}</span>

              <button
                onClick={() => onAñadir(item.producto)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <p className="text-lg font-black text-slate-950">
              {(Number(item.producto.precio || 0) * item.cantidad).toFixed(2)} €
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function obtenerRecomendaciones(
  productos: Producto[],
  carrito: CarritoItem[]
): Recomendacion[] {
  if (carrito.length === 0) return [];

  const idsEnCarrito = new Set(carrito.map((item) => item.producto.id));
  const nombresCarrito = carrito
    .map((item) => `${item.producto.nombre} ${item.producto.tipo || ""}`)
    .join(" ")
    .toLowerCase();

  const tieneBebida = carrito.some((item) => esBebida(item.producto));
  const tienePostre = carrito.some((item) => esPostre(item.producto));
  const tienePrincipal = carrito.some((item) => esPrincipal(item.producto));
  const tieneEntrante = carrito.some((item) => esEntrante(item.producto));

  const recomendaciones: Recomendacion[] = [];

  function buscarProducto(
    filtro: (producto: Producto) => boolean,
    motivo: string
  ) {
    const producto = productos.find(
      (p) => !idsEnCarrito.has(p.id) && p.activo && filtro(p)
    );

    if (producto && !recomendaciones.some((r) => r.producto.id === producto.id)) {
      recomendaciones.push({ producto, motivo });
    }
  }

  if (!tieneBebida) {
    buscarProducto(esBebida, "Una bebida encaja bien para completar el pedido.");
  }

  if (!tienePostre && (tienePrincipal || nombresCarrito.includes("costilla"))) {
    buscarProducto(
      esPostre,
      "Un postre puede ser una buena forma de terminar el pedido."
    );
  }

  if (tieneEntrante && !tienePrincipal) {
    buscarProducto(
      esPrincipal,
      "Has elegido un entrante. Puedes añadir un plato principal para completar."
    );
  }

  if (
    nombresCarrito.includes("hamburguesa") ||
    nombresCarrito.includes("burger")
  ) {
    buscarProducto(
      (producto) =>
        normalizar(producto).includes("patata") ||
        normalizar(producto).includes("brava") ||
        esBebida(producto),
      "Combina muy bien con una hamburguesa."
    );
  }

  if (nombresCarrito.includes("costilla") || nombresCarrito.includes("bbq")) {
    buscarProducto(
      (producto) =>
        normalizar(producto).includes("patata") ||
        normalizar(producto).includes("ensalada") ||
        esBebida(producto),
      "Combina muy bien con platos BBQ."
    );
  }

  buscarProducto(
    (producto) => producto.recomendado,
    "Es uno de los productos destacados de la carta."
  );

  return recomendaciones.slice(0, 2);
}

function normalizar(producto: Producto) {
  return `${producto.nombre} ${producto.descripcion || ""} ${
    producto.tipo || ""
  }`.toLowerCase();
}

function esBebida(producto: Producto) {
  const texto = normalizar(producto);

  return (
    texto.includes("bebida") ||
    texto.includes("refresco") ||
    texto.includes("agua") ||
    texto.includes("coca") ||
    texto.includes("cola") ||
    texto.includes("cerveza") ||
    texto.includes("vino") ||
    texto.includes("fanta") ||
    texto.includes("sprite") ||
    texto.includes("zumo")
  );
}

function esPostre(producto: Producto) {
  const texto = normalizar(producto);

  return (
    texto.includes("postre") ||
    texto.includes("tarta") ||
    texto.includes("helado") ||
    texto.includes("brownie") ||
    texto.includes("flan") ||
    texto.includes("tiramis")
  );
}

function esEntrante(producto: Producto) {
  const texto = normalizar(producto);

  return (
    texto.includes("entrante") ||
    texto.includes("bravas") ||
    texto.includes("croqueta") ||
    texto.includes("nachos") ||
    texto.includes("ensalada") ||
    texto.includes("tapa")
  );
}

function esPrincipal(producto: Producto) {
  const texto = normalizar(producto);

  return (
    texto.includes("principal") ||
    texto.includes("hamburguesa") ||
    texto.includes("burger") ||
    texto.includes("costilla") ||
    texto.includes("carne") ||
    texto.includes("pollo") ||
    texto.includes("pasta") ||
    texto.includes("pizza") ||
    texto.includes("arroz")
  );
}