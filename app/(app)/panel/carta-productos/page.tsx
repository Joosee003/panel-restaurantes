"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ImagePlus,
  Loader2,
  Save,
  Star,
  Search,
  Eye,
  EyeOff,
  RefreshCw,
  Euro,
  Pencil,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type Carta = {
  id: string;
  restaurante_id: string;
  nombre: string;
  public_token: string;
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

export default function CartaProductosPage() {
  const [cartas, setCartas] = useState<Carta[]>([]);
  const [cartaActivaId, setCartaActivaId] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains("dark"));

    read();

    const obs = new MutationObserver(read);
    obs.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    cargarCartas();
  }, []);

  useEffect(() => {
    if (cartaActivaId) {
      cargarProductos(cartaActivaId);
    }
  }, [cartaActivaId]);

  const cartaActiva = cartas.find((carta) => carta.id === cartaActivaId);

  const productosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    return productos.filter((producto) => {
      const texto = `${producto.nombre} ${producto.descripcion || ""} ${
        producto.tipo || ""
      }`.toLowerCase();

      return texto.includes(q);
    });
  }, [productos, busqueda]);

  const pageClass = isDark
    ? "min-h-screen bg-slate-950 p-6 text-slate-100"
    : "min-h-screen bg-slate-50 p-6 text-slate-900";

  const loadingPageClass = isDark
    ? "flex min-h-screen items-center justify-center bg-slate-950 text-slate-100"
    : "flex min-h-screen items-center justify-center bg-slate-50 text-slate-900";

  const iconBoxClass = isDark
    ? "rounded-2xl bg-white/5 p-3 text-white shadow-sm ring-1 ring-white/10"
    : "rounded-2xl bg-slate-900 p-3 text-white shadow-sm";

  const titleClass = isDark
    ? "text-3xl font-black text-white"
    : "text-3xl font-black text-slate-900";

  const subtitleClass = isDark
    ? "mt-1 text-slate-400"
    : "mt-1 text-slate-500";

  const primaryButtonClass = isDark
    ? "flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-5 py-3 text-sm font-black text-white shadow-sm ring-1 ring-white/10 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
    : "flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

  const panelClass = isDark
    ? "mb-8 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm"
    : "mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";

  const productCardClass = isDark
    ? "overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-sm"
    : "overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm";

  const imageBoxClass = isDark
    ? "relative min-h-[260px] bg-slate-900/80"
    : "relative min-h-[260px] bg-slate-100";

  const uploadButtonClass = isDark
    ? "absolute bottom-4 left-4 right-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg ring-1 ring-white/10 transition hover:bg-white/10"
    : "absolute bottom-4 left-4 right-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:bg-slate-800";

  const inputClass = isDark
    ? "w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-4 focus:ring-white/10"
    : "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100";

  const inputWithIconClass = isDark
    ? "w-full rounded-2xl border border-white/10 bg-slate-950 py-3 pl-10 pr-4 font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-4 focus:ring-white/10"
    : "w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100";

  const searchInputClass = isDark
    ? "w-full rounded-2xl border border-white/10 bg-slate-950 py-3 pl-12 pr-4 font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-4 focus:ring-white/10"
    : "w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100";

  const labelClass = isDark
    ? "mb-2 block text-sm font-black text-slate-200"
    : "mb-2 block text-sm font-black text-slate-700";

  const mutedTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const mainTextClass = isDark ? "text-white" : "text-slate-900";

  async function cargarCartas() {
    setCargando(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("cartas_digitales")
        .select("id, restaurante_id, nombre, public_token")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const cartasData = data || [];
      setCartas(cartasData);

      if (cartasData.length > 0) {
        setCartaActivaId(cartasData[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudieron cargar las cartas.");
    } finally {
      setCargando(false);
    }
  }

  async function cargarProductos(cartaId: string) {
    setCargando(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("carta_productos")
        .select("*")
        .eq("carta_id", cartaId)
        .order("orden", { ascending: true });

      if (error) throw error;

      setProductos(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudieron cargar los productos.");
    } finally {
      setCargando(false);
    }
  }

  function actualizarProductoLocal(
    productoId: string,
    cambios: Partial<Producto>
  ) {
    setProductos((actual) =>
      actual.map((producto) =>
        producto.id === productoId ? { ...producto, ...cambios } : producto
      )
    );
  }

  async function guardarProducto(producto: Producto) {
    setGuardandoId(producto.id);
    setError(null);
    setMensaje(null);

    try {
      const { error } = await supabase
        .from("carta_productos")
        .update({
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          precio: producto.precio,
          imagen_url: producto.imagen_url,
          tipo: producto.tipo,
          recomendado: producto.recomendado,
          activo: producto.activo,
          orden: producto.orden,
        })
        .eq("id", producto.id);

      if (error) throw error;

      setMensaje("Producto guardado correctamente.");

      setTimeout(() => {
        setMensaje(null);
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo guardar el producto.");
    } finally {
      setGuardandoId(null);
    }
  }

  async function subirImagen(producto: Producto, file: File) {
    if (!file) return;

    setSubiendoId(producto.id);
    setError(null);
    setMensaje(null);

    try {
      const extension = file.name.split(".").pop() || "jpg";
      const nombreArchivo = `productos/${producto.restaurante_id}/${producto.id}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("menus")
        .upload(nombreArchivo, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("menus")
        .getPublicUrl(nombreArchivo);

      const imagenUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from("carta_productos")
        .update({
          imagen_url: imagenUrl,
        })
        .eq("id", producto.id);

      if (updateError) throw updateError;

      actualizarProductoLocal(producto.id, {
        imagen_url: imagenUrl,
      });

      setMensaje("Imagen subida correctamente.");

      setTimeout(() => {
        setMensaje(null);
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo subir la imagen.");
    } finally {
      setSubiendoId(null);
    }
  }

  function recomendadoButtonClass(recomendado: boolean) {
    if (recomendado) {
      return "bg-orange-500 text-white hover:bg-orange-600";
    }

    return isDark
      ? "bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
      : "bg-slate-100 text-slate-500 hover:bg-slate-200";
  }

  function activoButtonClass(activo: boolean) {
    if (activo) {
      return isDark
        ? "bg-green-500/10 text-green-300 ring-1 ring-green-500/20 hover:bg-green-500/15"
        : "bg-green-100 text-green-700 hover:bg-green-200";
    }

    return isDark
      ? "bg-red-500/10 text-red-300 ring-1 ring-red-500/20 hover:bg-red-500/15"
      : "bg-red-100 text-red-700 hover:bg-red-200";
  }

  if (cargando && productos.length === 0) {
    return (
      <main className={loadingPageClass}>
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          <p className="mt-4 font-black">Cargando productos...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={pageClass}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className={iconBoxClass}>
              <Pencil className="h-6 w-6" />
            </div>

            <div>
              <h1 className={titleClass}>Productos de la carta</h1>
              <p className={subtitleClass}>
                Edita nombres, precios, descripciones, imágenes y destacados.
              </p>
            </div>
          </div>

          <button
            onClick={() => cartaActivaId && cargarProductos(cartaActivaId)}
            className={primaryButtonClass}
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>

        {error && (
          <div
            className={
              isDark
                ? "mb-6 rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-red-300 shadow-sm"
                : "mb-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm"
            }
          >
            <p className="font-black">Error</p>
            <p className="mt-1 text-sm font-semibold">{error}</p>
          </div>
        )}

        {mensaje && (
          <div
            className={
              isDark
                ? "mb-6 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-300 shadow-sm"
                : "mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700 shadow-sm"
            }
          >
            <p className="font-black">{mensaje}</p>
          </div>
        )}

        <section className={panelClass}>
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div>
              <label className={labelClass}>Carta</label>

              <select
                value={cartaActivaId}
                onChange={(e) => setCartaActivaId(e.target.value)}
                className={inputClass}
              >
                {cartas.map((carta) => (
                  <option key={carta.id} value={carta.id}>
                    {carta.nombre}
                  </option>
                ))}
              </select>

              {cartaActiva && (
                <p className={`mt-2 break-all text-xs font-bold ${mutedTextClass}`}>
                  Token: {cartaActiva.public_token}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Buscar producto</label>

              <div className="relative">
                <Search className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${mutedTextClass}`} />

                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, descripción o tipo..."
                  className={searchInputClass}
                />
              </div>
            </div>
          </div>
        </section>

        {productosFiltrados.length === 0 && (
          <div
            className={
              isDark
                ? "rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-sm"
                : "rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"
            }
          >
            <p className={`text-xl font-black ${mainTextClass}`}>
              No hay productos
            </p>
            <p className={`mt-2 text-sm font-semibold ${mutedTextClass}`}>
              No se han encontrado productos en esta carta.
            </p>
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-2">
          {productosFiltrados.map((producto) => (
            <article key={producto.id} className={productCardClass}>
              <div className="grid md:grid-cols-[260px_1fr]">
                <div className={imageBoxClass}>
                  {producto.imagen_url ? (
                    <img
                      src={producto.imagen_url}
                      alt={producto.nombre}
                      className="h-full min-h-[260px] w-full object-cover"
                    />
                  ) : (
                    <div className={`flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center ${mutedTextClass}`}>
                      <ImagePlus className="mb-3 h-10 w-10" />
                      <p className={`font-black ${mutedTextClass}`}>
                        Sin imagen
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        Sube una imagen para que salga en la carta.
                      </p>
                    </div>
                  )}

                  <label className={uploadButtonClass}>
                    {subiendoId === producto.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    {subiendoId === producto.id ? "Subiendo..." : "Subir imagen"}

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={subiendoId === producto.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) subirImagen(producto, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>

                <div className="p-5">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className={`text-xs font-black uppercase tracking-[0.12em] ${mutedTextClass}`}>
                        Producto
                      </p>
                      <h2 className={`mt-1 text-2xl font-black ${mainTextClass}`}>
                        {producto.nombre || "Sin nombre"}
                      </h2>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          actualizarProductoLocal(producto.id, {
                            recomendado: !producto.recomendado,
                          })
                        }
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl transition ${recomendadoButtonClass(
                          producto.recomendado
                        )}`}
                        title="Marcar como recomendado"
                      >
                        <Star
                          className={`h-5 w-5 ${
                            producto.recomendado ? "fill-white" : ""
                          }`}
                        />
                      </button>

                      <button
                        onClick={() =>
                          actualizarProductoLocal(producto.id, {
                            activo: !producto.activo,
                          })
                        }
                        className={`flex h-11 w-11 items-center justify-center rounded-2xl transition ${activoButtonClass(
                          producto.activo
                        )}`}
                        title="Activar o desactivar producto"
                      >
                        {producto.activo ? (
                          <Eye className="h-5 w-5" />
                        ) : (
                          <EyeOff className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label className={labelClass}>Nombre</label>
                      <input
                        value={producto.nombre}
                        onChange={(e) =>
                          actualizarProductoLocal(producto.id, {
                            nombre: e.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Descripción</label>
                      <textarea
                        value={producto.descripcion || ""}
                        onChange={(e) =>
                          actualizarProductoLocal(producto.id, {
                            descripcion: e.target.value,
                          })
                        }
                        rows={3}
                        className={`${inputClass} resize-none`}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className={labelClass}>Precio</label>
                        <div className="relative">
                          <Euro className={`absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 ${mutedTextClass}`} />
                          <input
                            type="number"
                            step="0.01"
                            value={producto.precio ?? ""}
                            onChange={(e) =>
                              actualizarProductoLocal(producto.id, {
                                precio:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            className={inputWithIconClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Tipo</label>
                        <input
                          value={producto.tipo || ""}
                          onChange={(e) =>
                            actualizarProductoLocal(producto.id, {
                              tipo: e.target.value,
                            })
                          }
                          placeholder="entrante, principal..."
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Orden</label>
                        <input
                          type="number"
                          value={producto.orden ?? 0}
                          onChange={(e) =>
                            actualizarProductoLocal(producto.id, {
                              orden: Number(e.target.value),
                            })
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>URL de imagen</label>
                      <input
                        value={producto.imagen_url || ""}
                        onChange={(e) =>
                          actualizarProductoLocal(producto.id, {
                            imagen_url: e.target.value,
                          })
                        }
                        placeholder="https://..."
                        className={`${inputClass} text-sm`}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => guardarProducto(producto)}
                    disabled={guardandoId === producto.id}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-4 text-sm font-black text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {guardandoId === producto.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                    {guardandoId === producto.id
                      ? "Guardando..."
                      : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}