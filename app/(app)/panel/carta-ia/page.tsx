"use client";

import { useEffect, useState } from "react";
import {
  Upload,
  FileText,
  ImageIcon,
  CheckCircle,
  Loader2,
  Sparkles,
  Eye,
  Wand2,
  Star,
  Euro,
  Clock,
  Utensils,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

type ProductoPreview = {
  nombre: string;
  descripcion: string;
  precio: number;
  tipo: string;
  categoria: string;
  imagen_prompt: string;
  recomendado: boolean;
  etiqueta: string;
};

const RESTAURANTE_ID = "f13ff56d-45c1-484f-89de-b6888e3472d8";

const productosDemo: ProductoPreview[] = [
  {
    categoria: "Entrantes",
    nombre: "Patatas bravas",
    descripcion: "Patatas crujientes con salsa brava casera y alioli suave.",
    precio: 6.5,
    tipo: "tapa",
    recomendado: true,
    etiqueta: "Para compartir",
    imagen_prompt:
      "Patatas bravas españolas en plato moderno, salsa brava y alioli, fotografía gastronómica profesional, luz cálida, fondo de restaurante",
  },
  {
    categoria: "Entrantes",
    nombre: "Croquetas caseras",
    descripcion: "Croquetas cremosas con rebozado dorado y textura suave.",
    precio: 7.2,
    tipo: "tapa",
    recomendado: true,
    etiqueta: "Muy pedido",
    imagen_prompt:
      "Croquetas caseras doradas servidas en plato elegante, fotografía gastronómica profesional, luz natural, estilo restaurante",
  },
  {
    categoria: "Principales",
    nombre: "Hamburguesa Texas",
    descripcion:
      "Carne jugosa, cheddar, bacon crujiente, cebolla caramelizada y salsa especial.",
    precio: 12.9,
    tipo: "principal",
    recomendado: true,
    etiqueta: "Especial",
    imagen_prompt:
      "Hamburguesa gourmet con queso cheddar, bacon y salsa especial, fotografía gastronómica premium, fondo oscuro elegante",
  },
  {
    categoria: "Principales",
    nombre: "Costillas BBQ",
    descripcion:
      "Costillas cocinadas lentamente con salsa barbacoa y guarnición.",
    precio: 16.5,
    tipo: "principal",
    recomendado: false,
    etiqueta: "Chef",
    imagen_prompt:
      "Costillas BBQ glaseadas con salsa barbacoa, patatas de guarnición, fotografía gastronómica profesional, estilo restaurante americano",
  },
  {
    categoria: "Postres",
    nombre: "Tarta de queso",
    descripcion: "Tarta de queso cremosa con base crujiente y toque tostado.",
    precio: 5.5,
    tipo: "postre",
    recomendado: true,
    etiqueta: "Recomendado",
    imagen_prompt:
      "Tarta de queso cremosa estilo restaurante, porción servida en plato blanco, fotografía gastronómica profesional, luz cálida",
  },
  {
    categoria: "Bebidas",
    nombre: "Coca-Cola",
    descripcion: "Refresco frío servido con hielo y limón.",
    precio: 2.5,
    tipo: "bebida",
    recomendado: false,
    etiqueta: "Fría",
    imagen_prompt:
      "Vaso de Coca-Cola frío con hielo y limón, fotografía comercial de bebida, fondo de restaurante",
  },
];

const visualesPorTipo: Record<
  string,
  {
    fondo: string;
    emoji: string;
    detalle: string;
  }
> = {
  tapa: {
    fondo: "from-orange-500 via-amber-300 to-yellow-100",
    emoji: "🍟",
    detalle: "Aperitivo visual generado",
  },
  principal: {
    fondo: "from-red-700 via-orange-500 to-amber-200",
    emoji: "🍔",
    detalle: "Plato principal generado",
  },
  postre: {
    fondo: "from-pink-500 via-rose-300 to-orange-100",
    emoji: "🍰",
    detalle: "Postre generado",
  },
  bebida: {
    fondo: "from-sky-500 via-cyan-300 to-blue-100",
    emoji: "🥤",
    detalle: "Bebida generada",
  },
};

export default function CartaIAPage() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cartaId, setCartaId] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [productos, setProductos] = useState<ProductoPreview[]>([]);
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

  const pageClass = isDark
    ? "min-h-screen bg-slate-950 p-6 text-slate-100"
    : "min-h-screen bg-slate-50 p-6 text-slate-900";

  const heroClass = isDark
    ? "rounded-[2rem] border border-white/10 bg-white/5 p-7 shadow-sm"
    : "rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm";

  const panelClass = isDark
    ? "mt-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-sm"
    : "mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm";

  const iconBoxClass = isDark
    ? "relative rounded-3xl bg-white/5 p-4 text-white shadow-sm ring-1 ring-white/10"
    : "relative rounded-3xl bg-slate-900 p-4 text-white shadow-lg";

  const smallIconBoxClass = isDark
    ? "rounded-2xl bg-white/5 p-3 text-slate-200 ring-1 ring-white/10"
    : "rounded-2xl bg-slate-100 p-3 text-slate-700";

  const metricCardClass = isDark
    ? "rounded-3xl border border-white/10 bg-slate-950/70 p-4 text-center shadow-sm"
    : "rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm";

  const uploadBoxClass = isDark
    ? "group mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-white/10 bg-slate-950/70 p-10 text-center transition duration-300 hover:border-orange-500/50 hover:bg-orange-500/10"
    : "group mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center transition duration-300 hover:border-orange-300 hover:bg-orange-50";

  const uploadIconCardClass = isDark
    ? "rounded-3xl bg-white/5 p-4 shadow-sm ring-1 ring-white/10 transition duration-300 group-hover:-translate-y-1 group-hover:scale-105"
    : "rounded-3xl bg-white p-4 shadow-sm transition duration-300 group-hover:-translate-y-1 group-hover:scale-105";

  const fileCardClass = isDark
    ? "mt-5 flex items-center gap-3 rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-sm"
    : "mt-5 flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm";

  const primaryButtonClass = isDark
    ? "mt-6 flex items-center gap-2 rounded-2xl bg-white/5 px-6 py-3 font-bold text-white shadow-sm ring-1 ring-white/10 transition duration-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
    : "mt-6 flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 font-bold text-white shadow-sm transition duration-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40";

  const previewBadgeClass = isDark
    ? "mb-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/10"
    : "mb-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white";

  const statusBadgeClass = isDark
    ? "flex items-center gap-2 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-200 shadow-sm"
    : "flex items-center gap-2 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm";

  const productCardClass = isDark
    ? "group animate-[cardEntrada_0.7s_ease-out_both] overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-sm transition duration-500 hover:-translate-y-2 hover:scale-[1.015] hover:bg-white/[0.07]"
    : "group animate-[cardEntrada_0.7s_ease-out_both] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition duration-500 hover:-translate-y-2 hover:scale-[1.015] hover:shadow-xl";

  const detailsClass = isDark
    ? "mt-4 rounded-2xl bg-slate-950/70 p-3 text-xs text-slate-400 ring-1 ring-white/10"
    : "mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500";

  const editButtonClass = isDark
    ? "rounded-2xl bg-white/5 px-4 py-2 text-sm font-bold text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10"
    : "rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-200";

  const priceBadgeClass = isDark
    ? "rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950 shadow-sm"
    : "rounded-full bg-slate-900 px-4 py-2 text-sm font-black text-white shadow-sm";

  const mainTextClass = isDark ? "text-white" : "text-slate-950";
  const mutedTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const softTextClass = isDark ? "text-slate-200" : "text-slate-700";

  async function generarCarta() {
    if (!archivo) return;

    setSubiendo(true);
    setError(null);
    setArchivoUrl(null);
    setCartaId(null);
    setPublicToken(null);
    setProductos([]);

    try {
      const extension = archivo.name.split(".").pop();
      const nombreArchivo = `${crypto.randomUUID()}.${extension}`;
      const rutaArchivo = `cartas/${nombreArchivo}`;

      const { error: uploadError } = await supabase.storage
        .from("menus")
        .upload(rutaArchivo, archivo, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from("menus")
        .getPublicUrl(rutaArchivo);

      const publicUrl = publicData.publicUrl;

      const { data: cartaCreada, error: cartaError } = await supabase
        .from("cartas_digitales")
        .insert({
          restaurante_id: RESTAURANTE_ID,
          nombre: "Carta generada con IA",
          archivo_url: publicUrl,
          estado: "borrador",
        })
        .select("id, public_token")
        .single();

      if (cartaError) throw cartaError;

      const categoriasUnicas = Array.from(
        new Set(productosDemo.map((p) => p.categoria))
      );

      const categoriasParaInsertar = categoriasUnicas.map((nombre, index) => ({
        carta_id: cartaCreada.id,
        restaurante_id: RESTAURANTE_ID,
        nombre,
        orden: index + 1,
        activa: true,
      }));

      const { data: categoriasCreadas, error: categoriasError } =
        await supabase
          .from("carta_categorias")
          .insert(categoriasParaInsertar)
          .select("id, nombre");

      if (categoriasError) throw categoriasError;

      const productosParaInsertar = productosDemo.map((producto, index) => {
        const categoria = categoriasCreadas?.find(
          (cat) => cat.nombre === producto.categoria
        );

        return {
          carta_id: cartaCreada.id,
          categoria_id: categoria?.id ?? null,
          restaurante_id: RESTAURANTE_ID,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          precio: producto.precio,
          imagen_url: null,
          imagen_prompt: producto.imagen_prompt,
          tipo: producto.tipo,
          alergenos: [],
          recomendado: producto.recomendado,
          activo: true,
          orden: index + 1,
        };
      });

      const { error: productosError } = await supabase
        .from("carta_productos")
        .insert(productosParaInsertar);

      if (productosError) throw productosError;

      setArchivoUrl(publicUrl);
      setCartaId(cartaCreada.id);
      setPublicToken(cartaCreada.public_token);
      setProductos(productosDemo);

      console.log("Carta creada:", cartaCreada);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al generar la carta");
    } finally {
      setSubiendo(false);
    }
  }

  const productosPorCategoria = productos.reduce<Record<string, ProductoPreview[]>>(
    (acc, producto) => {
      if (!acc[producto.categoria]) acc[producto.categoria] = [];
      acc[producto.categoria].push(producto);
      return acc;
    },
    {}
  );

  const totalProductos = productos.length;
  const recomendados = productos.filter((p) => p.recomendado).length;
  const precioMedio =
    productos.length > 0
      ? productos.reduce((acc, p) => acc + p.precio, 0) / productos.length
      : 0;

  return (
    <main className={pageClass}>
      <div className="mx-auto max-w-7xl">
        <section className={heroClass}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className={iconBoxClass}>
                <Sparkles className="h-7 w-7" />
                <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-orange-400" />
              </div>

              <div>
                <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                  <Wand2 className="h-3.5 w-3.5" />
                  Generador de carta visual
                </p>

                <h1 className={`text-3xl font-black tracking-tight md:text-4xl ${mainTextClass}`}>
                  Carta digital con IA
                </h1>

                <p className={`mt-2 max-w-2xl ${mutedTextClass}`}>
                  Sube una foto o PDF del menú y genera una carta visual,
                  animada y lista para revisar.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className={metricCardClass}>
                <Utensils className={`mx-auto h-5 w-5 ${mutedTextClass}`} />
                <p className={`mt-2 text-2xl font-black ${mainTextClass}`}>
                  {totalProductos}
                </p>
                <p className={`text-xs ${mutedTextClass}`}>Platos</p>
              </div>

              <div className={metricCardClass}>
                <Star className={`mx-auto h-5 w-5 ${mutedTextClass}`} />
                <p className={`mt-2 text-2xl font-black ${mainTextClass}`}>
                  {recomendados}
                </p>
                <p className={`text-xs ${mutedTextClass}`}>Destacados</p>
              </div>

              <div className={metricCardClass}>
                <Euro className={`mx-auto h-5 w-5 ${mutedTextClass}`} />
                <p className={`mt-2 text-2xl font-black ${mainTextClass}`}>
                  {precioMedio.toFixed(2)}
                </p>
                <p className={`text-xs ${mutedTextClass}`}>Precio medio</p>
              </div>
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <div className="flex items-start gap-4">
            <div className={smallIconBoxClass}>
              <Upload className="h-6 w-6" />
            </div>

            <div>
              <h2 className={`text-xl font-bold ${mainTextClass}`}>
                Subir menú
              </h2>
              <p className={`mt-1 text-sm ${mutedTextClass}`}>
                Puedes subir una imagen o un PDF de la carta actual del
                restaurante.
              </p>
            </div>
          </div>

          <label className={uploadBoxClass}>
            <div className={uploadIconCardClass}>
              <Upload className="h-10 w-10 text-slate-400 group-hover:text-orange-500" />
            </div>

            <span className={`mt-4 text-base font-bold ${mainTextClass}`}>
              Haz clic para seleccionar archivo
            </span>

            <span className={`mt-1 text-sm ${mutedTextClass}`}>
              PDF, JPG, PNG o WEBP
            </span>

            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setArchivo(file);
                setArchivoUrl(null);
                setCartaId(null);
                setPublicToken(null);
                setProductos([]);
                setError(null);
              }}
            />
          </label>

          {archivo && (
            <div className={fileCardClass}>
              <div className={smallIconBoxClass}>
                {archivo.type.includes("pdf") ? (
                  <FileText className="h-6 w-6" />
                ) : (
                  <ImageIcon className="h-6 w-6" />
                )}
              </div>

              <div>
                <p className={`font-bold ${mainTextClass}`}>{archivo.name}</p>
                <p className={`text-sm ${mutedTextClass}`}>
                  {(archivo.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          )}

          {error && (
            <div
              className={
                isDark
                  ? "mt-5 rounded-3xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-medium text-red-300"
                  : "mt-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"
              }
            >
              {error}
            </div>
          )}

          {archivoUrl && (
            <div
              className={
                isDark
                  ? "mt-5 flex items-start gap-3 rounded-3xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-300"
                  : "mt-5 flex items-start gap-3 rounded-3xl border border-green-200 bg-green-50 p-4 text-sm text-green-700"
              }
            >
              <CheckCircle className="mt-0.5 h-5 w-5" />

              <div>
                <p className="font-bold">
                  Carta generada y guardada correctamente
                </p>

                <a href={archivoUrl} target="_blank" className="underline">
                  Ver archivo subido
                </a>

                {cartaId && <p className="mt-1 text-xs">ID carta: {cartaId}</p>}

                {publicToken && (
                  <p className="mt-1 text-xs">Token público: {publicToken}</p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={generarCarta}
            disabled={!archivo || subiendo}
            className={primaryButtonClass}
          >
            {subiendo ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Generando carta visual...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generar carta con IA
              </>
            )}
          </button>
        </section>

        {productos.length > 0 && (
          <section className="mt-10">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className={previewBadgeClass}>
                  <Eye className="h-3.5 w-3.5" />
                  Vista previa premium
                </p>

                <h2 className={`text-3xl font-black tracking-tight ${mainTextClass}`}>
                  Carta visual generada
                </h2>

                <p className={`mt-2 text-sm ${mutedTextClass}`}>
                  De momento son platos demo. El siguiente paso será leer el PDF
                  real y crear estos datos automáticamente.
                </p>
              </div>

              <div className={statusBadgeClass}>
                <Clock className="h-4 w-4" />
                Borrador listo para revisar
              </div>
            </div>

            <div className="space-y-10">
              {Object.entries(productosPorCategoria).map(
                ([categoria, items], categoriaIndex) => (
                  <div
                    key={categoria}
                    style={{ animationDelay: `${categoriaIndex * 140}ms` }}
                    className="animate-[sectionEntrada_0.7s_ease-out_both]"
                  >
                    <div className="mb-5 flex items-center gap-3">
                      <div
                        className={
                          isDark
                            ? "h-10 w-2 rounded-full bg-white"
                            : "h-10 w-2 rounded-full bg-slate-900"
                        }
                      />
                      <div>
                        <h3 className={`text-2xl font-black ${mainTextClass}`}>
                          {categoria}
                        </h3>
                        <p className={`text-sm ${mutedTextClass}`}>
                          {items.length} productos detectados
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {items.map((producto, index) => {
                        const visual =
                          visualesPorTipo[producto.tipo] ??
                          visualesPorTipo.principal;

                        return (
                          <article
                            key={`${producto.nombre}-${index}`}
                            style={{
                              animationDelay: `${index * 120}ms`,
                            }}
                            className={productCardClass}
                          >
                            <div
                              className={`relative h-64 overflow-hidden bg-gradient-to-br ${visual.fondo}`}
                            >
                              <div className="absolute inset-0 animate-[fondoMovimiento_5s_ease-in-out_infinite] bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.75),transparent_28%),radial-gradient(circle_at_75%_70%,rgba(15,23,42,0.22),transparent_34%)]" />

                              <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35 blur-2xl transition duration-700 group-hover:scale-125" />

                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="relative">
                                  <div className="absolute inset-0 animate-pulse rounded-full bg-white/40 blur-2xl" />
                                  <div className="relative flex h-36 w-36 animate-[platoFloat_3.5s_ease-in-out_infinite] items-center justify-center rounded-full border border-white/50 bg-white/60 text-7xl shadow-2xl backdrop-blur">
                                    {visual.emoji}
                                  </div>
                                </div>
                              </div>

                              <div className="absolute bottom-5 left-5 right-5 rounded-3xl border border-white/50 bg-white/70 p-3 shadow-lg backdrop-blur">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                                  {visual.detalle}
                                </p>
                                <p className="mt-1 line-clamp-1 text-sm font-black text-slate-950">
                                  {producto.nombre}
                                </p>
                              </div>

                              {producto.recomendado && (
                                <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white shadow-lg">
                                  <Star className="h-3.5 w-3.5 fill-white" />
                                  Recomendado
                                </span>
                              )}

                              <span className="absolute right-4 top-4 rounded-full bg-white/80 px-3 py-1 text-xs font-black text-slate-950 shadow-lg backdrop-blur">
                                {producto.etiqueta}
                              </span>
                            </div>

                            <div className="p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-orange-600">
                                    {producto.tipo}
                                  </p>

                                  <h4 className={`mt-1 text-xl font-black ${mainTextClass}`}>
                                    {producto.nombre}
                                  </h4>
                                </div>

                                <span className={priceBadgeClass}>
                                  {producto.precio.toFixed(2)} €
                                </span>
                              </div>

                              <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>
                                {producto.descripcion}
                              </p>

                              <div className="mt-5 flex items-center justify-between gap-3">
                                <button className={editButtonClass}>
                                  Editar plato
                                </button>

                                <button className="rounded-2xl bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600">
                                  Ver detalle
                                </button>
                              </div>

                              <details className={detailsClass}>
                                <summary className={`cursor-pointer font-bold ${softTextClass}`}>
                                  Prompt de imagen IA
                                </summary>
                                <p className="mt-2 leading-5">
                                  {producto.imagen_prompt}
                                </p>
                              </details>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        )}
      </div>

      <style jsx global>{`
        @keyframes cardEntrada {
          from {
            opacity: 0;
            transform: translateY(28px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes sectionEntrada {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fondoMovimiento {
          0% {
            transform: scale(1) translateX(0) translateY(0);
          }
          50% {
            transform: scale(1.16) translateX(12px) translateY(-8px);
          }
          100% {
            transform: scale(1) translateX(0) translateY(0);
          }
        }

        @keyframes platoFloat {
          0% {
            transform: translateY(0) rotate(-1deg);
          }
          50% {
            transform: translateY(-10px) rotate(2deg);
          }
          100% {
            transform: translateY(0) rotate(-1deg);
          }
        }
      `}</style>
    </main>
  );
}