"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
  Settings2,
  Table2,
} from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "../../lib/supabaseClient";
import { useRestaurante } from "../../../hooks/useRestaurante";

type CartaDigital = {
  id: string;
  nombre: string;
  public_token: string;
  restaurante_id: string;
};

type Zona = {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
};

type Mesa = {
  id: string;
  restaurante_id: string;
  zona_id: string | null;
  nombre: string;
  capacidad: number;
  orden: number;
  activa: boolean;
  bloqueada: boolean;
  qr_access_token: string;
  qr_expires_at: string;
};

type MesaConUrl = Mesa & {
  url: string;
  zonaNombre: string;
  accesoVigente: boolean;
};

const idiomasQR = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
];

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizarDominio(valor: string) {
  return (valor || "https://panel.gastrohelp.es").trim().replace(/\/$/, "");
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function QRMesasPage() {
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id
    ? String((restauranteActual as any).id)
    : null;
  const restauranteNombre = (restauranteActual as any)?.nombre
    ? String((restauranteActual as any).nombre)
    : "Restaurante";

  const [cartaActiva, setCartaActiva] = useState<CartaDigital | null>(null);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [descargandoTodos, setDescargandoTodos] = useState(false);
  const [renovandoMesaId, setRenovandoMesaId] = useState<string | null>(null);
  const [mostrarAjustes, setMostrarAjustes] = useState(false);
  const [qrPreviewByMesa, setQrPreviewByMesa] = useState<Record<string, string>>({});
  const [ahora, setAhora] = useState(0);

  const [dominio, setDominio] = useState("https://panel.gastrohelp.es");
  const [idiomaDefault, setIdiomaDefault] = useState("es");
  const [tituloQR, setTituloQR] = useState("Carta digital");
  const [subtituloQR, setSubtituloQR] = useState("Escanea para ver la carta y pedir desde tu mesa");
  const [pieQR, setPieQR] = useState("Haz tu pedido desde el móvil");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      const origin = window.location.origin.includes("localhost")
        ? "https://panel.gastrohelp.es"
        : window.location.origin;
      setDominio(origin);
    }
  }, []);

  useEffect(() => {
    const actualizarReloj = () => setAhora(Date.now());
    const inicio = window.setTimeout(actualizarReloj, 0);
    const intervalo = window.setInterval(actualizarReloj, 30000);
    return () => {
      window.clearTimeout(inicio);
      window.clearInterval(intervalo);
    };
  }, []);

  async function cargarDatos() {
    setLoading(true);
    setErrorMsg(null);
    setOkMsg(null);

    if (loadingRestaurante) return;

    if (!restauranteId) {
      setCartaActiva(null);
      setZonas([]);
      setMesas([]);
      setErrorMsg(
        "No se encontró restaurante activo. Entra desde Admin y pulsa ‘Usar en panel’ sobre el restaurante correcto."
      );
      setLoading(false);
      return;
    }

    const [cartasRes, zonasRes, mesasRes] = await Promise.all([
      (supabase as any)
        .from("cartas_digitales")
        .select("id,nombre,public_token,restaurante_id,created_at")
        .eq("restaurante_id", restauranteId)
        .order("created_at", { ascending: false })
        .limit(1),
      (supabase as any)
        .from("sala_zonas")
        .select("id,nombre,orden,activa")
        .eq("restaurante_id", restauranteId)
        .eq("activa", true)
        .order("orden", { ascending: true }),
      (supabase as any)
        .from("sala_mesas")
        .select("id,restaurante_id,zona_id,nombre,capacidad,orden,activa,bloqueada,qr_access_token,qr_expires_at")
        .eq("restaurante_id", restauranteId)
        .eq("activa", true)
        .order("orden", { ascending: true }),
    ]);

    if (cartasRes.error) setErrorMsg(cartasRes.error.message);
    if (zonasRes.error) setErrorMsg(zonasRes.error.message);
    if (mesasRes.error) setErrorMsg(mesasRes.error.message);

    const carta = ((cartasRes.data || []) as CartaDigital[])[0] || null;
    setCartaActiva(carta);
    setZonas((zonasRes.data || []) as Zona[]);
    setMesas((mesasRes.data || []) as Mesa[]);
    setLoading(false);
  }

  useEffect(() => {
    cargarDatos();
  }, [restauranteId, loadingRestaurante]);

  const zonasById = useMemo(() => {
    const map = new Map<string, Zona>();
    zonas.forEach((zona) => map.set(zona.id, zona));
    return map;
  }, [zonas]);

  const mesasConUrl = useMemo<MesaConUrl[]>(() => {
    if (!cartaActiva?.public_token) return [];

    const base = normalizarDominio(dominio);
    return mesas
      .slice()
      .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0))
      .map((mesa) => {
        const zona = mesa.zona_id ? zonasById.get(mesa.zona_id) : null;
        const lang = idiomaDefault ? `&lang=${encodeURIComponent(idiomaDefault)}` : "";
        const url = `${base}/carta/${cartaActiva.public_token}?mesa=${encodeURIComponent(
          mesa.nombre
        )}&mesaId=${encodeURIComponent(mesa.id)}&access=${encodeURIComponent(
          mesa.qr_access_token
        )}${lang}`;

        return {
          ...mesa,
          url,
          zonaNombre: zona?.nombre || "Sin zona",
          accesoVigente:
            Boolean(mesa.qr_access_token) &&
            ahora > 0 &&
            Number.isFinite(new Date(mesa.qr_expires_at).getTime()) &&
            new Date(mesa.qr_expires_at).getTime() > ahora,
        };
      });
  }, [cartaActiva, mesas, zonasById, dominio, idiomaDefault, ahora]);

  const grupos = useMemo(() => {
    const map = new Map<string, MesaConUrl[]>();
    mesasConUrl.forEach((mesa) => {
      if (!map.has(mesa.zonaNombre)) map.set(mesa.zonaNombre, []);
      map.get(mesa.zonaNombre)?.push(mesa);
    });
    return Array.from(map.entries());
  }, [mesasConUrl]);

  useEffect(() => {
    let cancelado = false;

    async function generarPreviews() {
      if (!mesasConUrl.length) {
        setQrPreviewByMesa({});
        return;
      }

      const entradas = await Promise.all(
        mesasConUrl.map(async (mesa) => {
          const qr = await QRCode.toDataURL(mesa.url, {
            width: 220,
            margin: 2,
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          });
          return [mesa.id, qr] as const;
        })
      );

      if (!cancelado) setQrPreviewByMesa(Object.fromEntries(entradas));
    }

    generarPreviews();
    return () => {
      cancelado = true;
    };
  }, [mesasConUrl]);

  async function copiar(texto: string, mensaje = "Copiado") {
    try {
      await navigator.clipboard.writeText(texto);
      setOkMsg(mensaje);
      setTimeout(() => setOkMsg(null), 2200);
    } catch {
      window.prompt("Copia este enlace:", texto);
    }
  }

  async function renovarAcceso(mesaId: string) {
    setRenovandoMesaId(mesaId);
    setErrorMsg(null);
    setOkMsg(null);

    try {
      const { data, error } = await (supabase as any).rpc("renovar_acceso_mesa_qr", {
        p_mesa_id: mesaId,
        p_duracion_horas: 12,
      });

      if (error) throw error;

      const resultado = Array.isArray(data) ? data[0] : data;
      if (!resultado?.ok || !resultado?.access_token || !resultado?.expires_at) {
        throw new Error("No se pudo generar el nuevo acceso.");
      }

      setMesas((actuales) =>
        actuales.map((mesa) =>
          mesa.id === mesaId
            ? {
                ...mesa,
                qr_access_token: String(resultado.access_token),
                qr_expires_at: String(resultado.expires_at),
              }
            : mesa
        )
      );
      setOkMsg("URL renovada. La anterior ya no permite enviar pedidos.");
      setTimeout(() => setOkMsg(null), 3500);
    } catch (err: any) {
      const message = String(err?.message || "");
      setErrorMsg(
        /MESA_CON_PEDIDOS_ABIERTOS/i.test(message)
          ? "No puedes renovar esta URL mientras la mesa tenga pedidos abiertos. Cierra y cobra la mesa primero."
          : "No se pudo renovar el acceso de la mesa. Inténtalo de nuevo."
      );
    } finally {
      setRenovandoMesaId(null);
    }
  }

  async function generarPosterQR(mesa: MesaConUrl) {
    const canvasQR = document.createElement("canvas");

    await QRCode.toCanvas(canvasQR, mesa.url, {
      width: 900,
      margin: 3,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });

    const qrDataUrl = canvasQR.toDataURL("image/png");
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = 1240;
    finalCanvas.height = 1754;

    const ctx = finalCanvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 70, 70, 1100, 1614, 48);
    ctx.fill();

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 4;
    roundRect(ctx, 70, 70, 1100, 1614, 48);
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 70px Arial";
    ctx.textAlign = "center";
    ctx.fillText(tituloQR || "Carta digital", finalCanvas.width / 2, 185);

    ctx.fillStyle = "#334155";
    ctx.font = "bold 44px Arial";
    ctx.fillText(restauranteNombre || "Restaurante", finalCanvas.width / 2, 260);

    ctx.fillStyle = "#0f172a";
    roundRect(ctx, 420, 305, 400, 86, 44);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px Arial";
    ctx.fillText(`MESA ${mesa.nombre}`, finalCanvas.width / 2, 363);

    ctx.fillStyle = "#475569";
    ctx.font = "32px Arial";
    wrapTextCenter(ctx, subtituloQR || "Escanea para ver la carta y pedir desde tu mesa", finalCanvas.width / 2, 455, 900, 42);

    const qrImage = new Image();

    return await new Promise<string | null>((resolve) => {
      qrImage.onload = () => {
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, 220, 535, 800, 800, 36);
        ctx.fill();

        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 3;
        roundRect(ctx, 220, 535, 800, 800, 36);
        ctx.stroke();

        ctx.drawImage(qrImage, 260, 575, 720, 720);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 39px Arial";
        ctx.fillText("1. Escanea el código", finalCanvas.width / 2, 1410);
        ctx.fillText("2. Elige tus platos", finalCanvas.width / 2, 1475);
        ctx.fillText("3. Envía el pedido", finalCanvas.width / 2, 1540);

        ctx.fillStyle = "#64748b";
        ctx.font = "30px Arial";
        ctx.fillText(pieQR || "Haz tu pedido desde el móvil", finalCanvas.width / 2, 1618);

        resolve(finalCanvas.toDataURL("image/png"));
      };

      qrImage.onerror = () => resolve(null);
      qrImage.src = qrDataUrl;
    });
  }

  async function descargarQR(mesa: MesaConUrl) {
    const poster = await generarPosterQR(mesa);
    if (!poster) return;

    const link = document.createElement("a");
    link.download = `qr-${restauranteNombre}-${mesa.nombre}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-") + ".png";
    link.href = poster;
    link.click();
  }

  async function descargarTodos() {
    if (!mesasConUrl.length) return;
    setDescargandoTodos(true);

    try {
      for (const mesa of mesasConUrl) {
        const poster = await generarPosterQR(mesa);
        if (!poster) continue;

        const link = document.createElement("a");
        link.download = `qr-${mesa.nombre}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-") + ".png";
        link.href = poster;
        link.click();
        await esperar(300);
      }
    } finally {
      setDescargandoTodos(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-slate-950 p-3 text-white shadow-sm">
              <QrCode className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">QR mesas</h1>
              <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
                Cada mesa tiene una URL temporal. Al cobrar, la anterior deja de aceptar pedidos automáticamente.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => setMostrarAjustes((v) => !v)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              <Settings2 className="h-4 w-4" />
              Personalizar
            </button>
            <button
              onClick={cargarDatos}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-100"
            >
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </button>
            <button
              onClick={descargarTodos}
              disabled={descargandoTodos || !mesasConUrl.length}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {descargandoTodos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {descargandoTodos ? "Descargando..." : "Descargar todos"}
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
          <div className="grid gap-4 md:grid-cols-4">
            <InfoCard label="Restaurante" value={restauranteNombre} />
            <InfoCard label="Carta activa" value={cartaActiva?.nombre || "Sin carta"} />
            <InfoCard label="Mesas activas" value={String(mesas.length)} />
            <InfoCard label="Protección" value="URL rotatoria · 12 h" />
          </div>

          {!loading && !cartaActiva && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              Este restaurante todavía no tiene carta digital. Crea la carta desde Productos carta antes de imprimir QR.
            </div>
          )}

          {!loading && cartaActiva && mesas.length === 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              No hay mesas activas para este restaurante. Crea las mesas desde Ajustes → Sala.
            </div>
          )}

          {mostrarAjustes && (
            <div className="mt-5 grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-3">
              <Field label="Dominio final">
                <input
                  value={dominio}
                  onChange={(e) => setDominio(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </Field>
              <Field label="Idioma inicial">
                <select
                  value={idiomaDefault}
                  onChange={(e) => setIdiomaDefault(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                >
                  {idiomasQR.map((idioma) => (
                    <option key={idioma.code} value={idioma.code}>
                      {idioma.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Título del cartel">
                <input
                  value={tituloQR}
                  onChange={(e) => setTituloQR(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </Field>
              <Field label="Subtítulo">
                <input
                  value={subtituloQR}
                  onChange={(e) => setSubtituloQR(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </Field>
              <Field label="Texto inferior">
                <input
                  value={pieQR}
                  onChange={(e) => setPieQR(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </Field>
            </div>
          )}
        </section>

        {loading || loadingRestaurante ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-sm font-black text-slate-500 shadow-sm">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando QR...
          </div>
        ) : grupos.length > 0 ? (
          <div className="space-y-6">
            {grupos.map(([zonaNombre, mesasZona]) => (
              <section key={zonaNombre} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                  <div>
                    <h2 className="text-xl font-black text-slate-950">{zonaNombre}</h2>
                    <p className="text-sm font-semibold text-slate-500">{mesasZona.length} mesas listas para imprimir.</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {mesasZona.map((mesa) => (
                    <MesaQRCard
                      key={mesa.id}
                      mesa={mesa}
                      qrPreview={qrPreviewByMesa[mesa.id]}
                      onCopy={() => copiar(mesa.url, `Enlace de ${mesa.nombre} copiado`)}
                      onDownload={() => descargarQR(mesa)}
                      onRenew={() => renovarAcceso(mesa.id)}
                      renewing={renovandoMesaId === mesa.id}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
            <h2 className="text-xl font-black text-slate-950">No hay QR para generar todavía</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
              Necesitas una carta activa y mesas creadas en Ajustes. Cuando existan, aquí aparecerán automáticamente.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 truncate text-lg font-black text-slate-950">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MesaQRCard({
  mesa,
  qrPreview,
  onCopy,
  onDownload,
  onRenew,
  renewing,
}: {
  mesa: MesaConUrl;
  qrPreview?: string;
  onCopy: () => void;
  onDownload: () => void;
  onRenew: () => void;
  renewing: boolean;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex gap-4">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-2">
          {qrPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrPreview} alt={`QR ${mesa.nombre}`} className="h-full w-full object-contain" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Mesa</div>
              <h3 className="text-2xl font-black text-slate-950">{mesa.nombre}</h3>
            </div>
            {mesa.bloqueada ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">Bloqueada</span>
            ) : !mesa.accesoVigente ? (
              <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-black text-rose-700">Caducada</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Protegida
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs font-black text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-1">{mesa.zonaNombre}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">{mesa.capacidad}p</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-3">
        <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-slate-400">Enlace</div>
        <p className="line-clamp-2 break-all text-xs font-bold text-slate-600">{mesa.url}</p>
        <p className="mt-2 text-xs font-black text-slate-400">
          {mesa.accesoVigente
            ? `Caduca ${new Date(mesa.qr_expires_at).toLocaleString("es-ES", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Renueva el acceso antes de entregar este QR"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onCopy}
          disabled={!mesa.accesoVigente}
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Copy className="h-3.5 w-3.5" /> Copiar
        </button>
        <a
          href={mesa.accesoVigente ? mesa.url : undefined}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
          aria-disabled={!mesa.accesoVigente}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir
        </a>
        <button
          onClick={onDownload}
          disabled={!mesa.accesoVigente}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" /> QR
        </button>
        <button
          onClick={onRenew}
          disabled={renewing || mesa.bloqueada}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {renewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Renovar URL
        </button>
      </div>
    </article>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapTextCenter(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (let n = 0; n < words.length; n++) {
    const testLine = `${line}${words[n]} `;
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      lines.push(line.trim());
      line = `${words[n]} `;
    } else {
      line = testLine;
    }
  }

  lines.push(line.trim());

  lines.forEach((currentLine, index) => {
    ctx.fillText(currentLine, centerX, startY + index * lineHeight);
  });
}
