"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  ChefHat,
  CheckCircle,
  Clock3,
  CreditCard,
  History,
  Loader2,
  Printer,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Table2,
  Utensils,
  Volume2,
  VolumeX,
  XCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useRestaurante } from "../../../hooks/useRestaurante";
import { FINAL_QR_STATES, qrBillKey, qrQuoteSignature, qrTotal, readAllActiveQrOrders } from "../../lib/qr-billing";

type PedidoItem = {
  id: string;
  pedido_id: string;
  producto_id: string | null;
  nombre_producto: string;
  precio_unitario: number;
  cantidad: number;
  notas: string | null;
  created_at?: string;
};

type PedidoQR = {
  id: string;
  restaurante_id: string;
  carta_id: string | null;
  mesa: string | null;
  mesa_id: string | null;
  mesa_session_id: string | null;
  estado: string;
  total: number;
  notas: string | null;
  created_at: string;
  updated_at?: string | null;
  items?: PedidoItem[];
};

type PedidoQRRow = Omit<PedidoQR, "estado" | "total" | "items"> & {
  estado: string | null;
  total: number | string | null;
  pedido_qr_items?: PedidoItem[] | null;
};

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type TabVista = "cocina" | "mesas" | "historial";

type MesaAbierta = {
  mesaKey: string;
  mesaId: string | null;
  mesaLabel: string;
  pedidos: PedidoQR[];
  items: PedidoItem[];
  total: number;
  cantidadProductos: number;
  primerPedido: string;
};

const estadosFinales = new Set<string>(FINAL_QR_STATES);

const columnasCocina = [
  {
    key: "nuevo",
    label: "Nuevo",
    descripcion: "Entra directo desde el QR",
    icon: BellRing,
  },
  {
    key: "preparando",
    label: "En preparación",
    descripcion: "Cocina trabajando",
    icon: ChefHat,
  },
  {
    key: "listo",
    label: "Listo",
    descripcion: "Pendiente de entregar",
    icon: CheckCircle,
  },
];

function normalizarEstado(estado?: string | null) {
  const limpio = String(estado || "").trim().toLowerCase();
  if (!limpio || limpio === "pendiente") return "nuevo";
  if (limpio === "en_preparacion" || limpio === "en preparación") return "preparando";
  if (limpio === "entregado" || limpio === "entregada" || limpio === "servida") return "servido";
  if (limpio === "cobrado" || limpio === "cobrada" || limpio === "cerrado" || limpio === "cerrada") return "cobrado";
  if (limpio === "cancelada") return "cancelado";
  return limpio;
}

function esEstadoFinal(estado?: string | null) {
  return estadosFinales.has(normalizarEstado(estado));
}

function formatearDinero(valor: number | string | null | undefined) {
  return `${Number(valor || 0).toFixed(2)} €`;
}

function formatearFecha(valor: string | null | undefined) {
  if (!valor) return "Sin fecha";

  return new Date(valor).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizarNumero(valor: string | number | null | undefined) {
  const numero = Number(String(valor || "0").replace(",", "."));
  return Number.isFinite(numero) ? Math.max(0, numero) : 0;
}

function minutosDesde(fecha: string | null | undefined, ahora: number) {
  if (!fecha) return 0;
  const inicio = new Date(fecha).getTime();
  if (!Number.isFinite(inicio)) return 0;
  return Math.max(0, Math.floor((ahora - inicio) / 60000));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function escaparHtml(valor: string | null | undefined) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function crearResumenItems(items: PedidoItem[]) {
  const mapa = new Map<string, PedidoItem>();

  items.forEach((item) => {
    const key = `${item.producto_id || item.nombre_producto}-${item.precio_unitario}`;
    const actual = mapa.get(key);

    if (actual) {
      mapa.set(key, {
        ...actual,
        cantidad: actual.cantidad + item.cantidad,
        notas: [actual.notas, item.notas].filter(Boolean).join(" | ") || null,
      });
    } else {
      mapa.set(key, { ...item });
    }
  });

  return Array.from(mapa.values());
}

export default function PedidosQRPage() {
  const { data: restauranteActual, isLoading: cargandoRestaurante } = useRestaurante();
  const restauranteId = restauranteActual?.id as string | undefined;
  const [pedidos, setPedidos] = useState<PedidoQR[]>([]);
  const [vista, setVista] = useState<TabVista>("cocina");
  const [cargando, setCargando] = useState(true);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisoNuevo, setAvisoNuevo] = useState(false);
  const [sonidoActivo, setSonidoActivo] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const [descuentosMesa, setDescuentosMesa] = useState<Record<string, string>>({});
  const [propinasMesa, setPropinasMesa] = useState<Record<string, string>>({});
  const [metodosPagoMesa, setMetodosPagoMesa] = useState<Record<string, string>>({});
  const [pantallaCompleta, setPantallaCompleta] = useState(false);

  const primeraCargaRef = useRef(true);
  const pedidosIdsRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const cargaRef = useRef<AbortController | null>(null);
  const operacionRef = useRef<string | null>(null);
  const vistaScopeRef = useRef<object>({});

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains("dark"));

    read();

    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSonidoActivo(localStorage.getItem("cocina_sonido_activo") === "true");

    const onFullscreenChange = () => setPantallaCompleta(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const pedidosActivos = useMemo(
    () => pedidos.filter((pedido) => pedido.restaurante_id === restauranteId && !esEstadoFinal(pedido.estado)),
    [pedidos, restauranteId]
  );

  const pedidosFinalizados = useMemo(
    () => pedidos.filter((pedido) => pedido.restaurante_id === restauranteId && esEstadoFinal(pedido.estado))
      .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)),
    [pedidos, restauranteId]
  );

  const pedidosNuevos = useMemo(
    () => pedidosActivos.filter((pedido) => normalizarEstado(pedido.estado) === "nuevo"),
    [pedidosActivos]
  );

  const mesasAbiertas = useMemo<MesaAbierta[]>(() => {
    const mapa = new Map<string, MesaAbierta>();

    pedidosActivos.forEach((pedido) => {
      const mesaKey = qrBillKey(pedido);
      const mesaLabel = pedido.mesa ? `Mesa ${pedido.mesa}` : "Sin mesa";
      const actual = mapa.get(mesaKey);
      const itemsPedido = pedido.items || [];

      if (!actual) {
        mapa.set(mesaKey, {
          mesaKey,
          mesaId: pedido.mesa_id || null,
          mesaLabel,
          pedidos: [pedido],
          items: [...itemsPedido],
          total: Number(pedido.total || 0),
          cantidadProductos: itemsPedido.reduce((sum, item) => sum + Number(item.cantidad || 0), 0),
          primerPedido: pedido.created_at,
        });
      } else {
        actual.pedidos.push(pedido);
        actual.items.push(...itemsPedido);
        actual.total += Number(pedido.total || 0);
        actual.cantidadProductos += itemsPedido.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
        if (new Date(pedido.created_at).getTime() < new Date(actual.primerPedido).getTime()) {
          actual.primerPedido = pedido.created_at;
        }
      }
    });

    return Array.from(mapa.values()).map((mesa) => ({ ...mesa, total: qrTotal(mesa.pedidos) }))
      .sort((a, b) => a.mesaLabel.localeCompare(b.mesaLabel, "es", { numeric: true }) || a.primerPedido.localeCompare(b.primerPedido));
  }, [pedidosActivos]);

  const totalActivo = pedidosActivos.reduce((sum, pedido) => sum + Number(pedido.total || 0), 0);
  const totalHistorial = pedidosFinalizados.reduce((sum, pedido) => sum + Number(pedido.total || 0), 0);

  const pageClass = isDark
    ? "min-h-screen bg-slate-950 p-6 text-slate-100"
    : "min-h-screen bg-slate-50 p-6 text-slate-900";

  const iconBoxClass = isDark
    ? "relative rounded-2xl bg-white/5 p-3 text-white shadow-sm ring-1 ring-white/10"
    : "relative rounded-2xl bg-slate-900 p-3 text-white shadow-sm";

  const titleClass = isDark ? "text-3xl font-black text-white" : "text-3xl font-black text-slate-900";
  const subtitleClass = isDark ? "mt-1 text-slate-400" : "mt-1 text-slate-500";
  const mutedTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const mainTextClass = isDark ? "text-white" : "text-slate-900";
  const secondaryTextClass = isDark ? "text-slate-200" : "text-slate-700";

  const primaryButtonClass = isDark
    ? "flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-5 py-3 text-sm font-black text-white shadow-sm ring-1 ring-white/10 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
    : "flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

  const normalCardClass = isDark
    ? "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm"
    : "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";

  const columnClass = isDark
    ? "rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 shadow-sm"
    : "rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm";

  const getAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;

    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContextRef.current = new AudioContextClass();
    }

    return audioContextRef.current;
  }, []);

  const reproducirSonidoNuevoPedido = useCallback((forzar = false) => {
    if (!sonidoActivo && !forzar) return;

    try {
      const audioContext = getAudioContext();
      if (!audioContext) return;

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      [0, 0.18, 0.36].forEach((delay, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(index === 1 ? 740 : 980, audioContext.currentTime + delay);

        gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime + delay);
        gainNode.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + delay + 0.025);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + delay + 0.13);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start(audioContext.currentTime + delay);
        oscillator.stop(audioContext.currentTime + delay + 0.14);
      });
    } catch (error) {
      console.log("No se pudo reproducir sonido", error);
    }
  }, [getAudioContext, sonidoActivo]);

  function activarSonido() {
    const nuevoValor = !sonidoActivo;
    setSonidoActivo(nuevoValor);

    if (typeof window !== "undefined") {
      localStorage.setItem("cocina_sonido_activo", String(nuevoValor));
    }

    if (nuevoValor) {
      setTimeout(() => {
        try {
          const audioContext = getAudioContext();
          if (audioContext?.state === "suspended") audioContext.resume();
        } catch {}
        reproducirSonidoNuevoPedido(true);
      }, 80);
    }
  }

  function repetirSonido() {
    reproducirSonidoNuevoPedido(true);
  }

  async function alternarPantallaCompleta() {
    if (typeof document === "undefined") return;

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setPantallaCompleta(true);
      } else {
        await document.exitFullscreen();
        setPantallaCompleta(false);
      }
    } catch (err) {
      console.log("No se pudo cambiar pantalla completa", err);
    }
  }

  function calcularMesaFinal(mesa: MesaAbierta) {
    const descuento = Math.min(normalizarNumero(descuentosMesa[mesa.mesaKey]), mesa.total);
    const propina = normalizarNumero(propinasMesa[mesa.mesaKey]);
    const metodoPago = metodosPagoMesa[mesa.mesaKey] || "tarjeta";
    const totalFinal = Math.max(0, mesa.total - descuento + propina);

    return { descuento, propina, metodoPago, totalFinal };
  }

  const cargarPedidos = useCallback(async (silencioso = false): Promise<PedidoQR[] | null> => {
    if (!restauranteId) return null;
    // A slow background load must not be aborted by every polling tick.
    if (silencioso && cargaRef.current) return null;
    cargaRef.current?.abort();
    const controller = new AbortController();
    cargaRef.current = controller;
    let timeoutReached = false;
    const timeout = setTimeout(() => {
      timeoutReached = true;
      controller.abort();
    }, 15000);
    if (!silencioso) setCargando(true);

    try {
      const select = `
          *,
          pedido_qr_items (
            id,
            pedido_id,
            producto_id,
            nombre_producto,
            precio_unitario,
            cantidad,
            notas,
            created_at
          )
        `;
      const [activosData, historial] = await Promise.all([
        readAllActiveQrOrders<PedidoQRRow>(async (afterId, limit) => {
          let query = supabase.from("pedidos_qr").select(select)
            .eq("restaurante_id", restauranteId)
            .not("estado", "in", `(${FINAL_QR_STATES.join(",")})`)
            .order("id", { ascending: true }).limit(limit);
          if (afterId) query = query.gt("id", afterId);
          const response = await query.abortSignal(controller.signal);
          if (response.error) throw response.error;
          return (response.data || []) as unknown as PedidoQRRow[];
        }),
        supabase.from("pedidos_qr").select(select)
          .eq("restaurante_id", restauranteId).in("estado", [...FINAL_QR_STATES])
          .order("updated_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false })
          .limit(120).abortSignal(controller.signal),
      ]);
      if (historial.error) throw historial.error;
      if (controller.signal.aborted) return null;
      // An order can move from active to history between both reads. Keep only
      // the final copy; the server validates the full bill again before closing.
      const porId = new Map<string, PedidoQRRow>();
      for (const row of [...activosData, ...((historial.data || []) as unknown as PedidoQRRow[])]) porId.set(row.id, row);
      const data = Array.from(porId.values());

      const pedidosFormateados = ((data || []) as PedidoQRRow[]).map((pedido) => ({
        ...pedido,
        estado: normalizarEstado(pedido.estado),
        total: Number(pedido.total || 0),
        items: pedido.pedido_qr_items || [],
      })).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) as PedidoQR[];

      const activos = pedidosFormateados.filter((pedido) => !esEstadoFinal(pedido.estado));
      qrTotal(activos); // Reject invalid totals before displaying a payable bill.
      const idsActuales = new Set(activos.map((pedido) => pedido.id));

      if (!primeraCargaRef.current) {
        const nuevos = activos.filter((pedido) => !pedidosIdsRef.current.has(pedido.id));

        if (nuevos.length > 0) {
          reproducirSonidoNuevoPedido();
          setAvisoNuevo(true);
          setTimeout(() => setAvisoNuevo(false), 4500);
        }
      }

      pedidosIdsRef.current = idsActuales;
      primeraCargaRef.current = false;
      setPedidos(pedidosFormateados);
      setError(null);
      return pedidosFormateados;
    } catch (err: unknown) {
      if (controller.signal.aborted && !timeoutReached) return null;
      console.error(err);
      setError(timeoutReached
        ? "La consulta ha tardado demasiado. Los pedidos no están actualizados; vuelve a cargarlos antes de registrar un pago."
        : errorMessage(err, "No se pudieron cargar los pedidos"));
      return null;
    } finally {
      clearTimeout(timeout);
      if (cargaRef.current === controller) {
        cargaRef.current = null;
        setCargando(false);
      }
    }
  }, [reproducirSonidoNuevoPedido, restauranteId]);

  async function cambiarEstado(pedidoId: string, nuevoEstado: string) {
    if (operacionRef.current || !restauranteId) return;
    const scope = vistaScopeRef.current;
    operacionRef.current = pedidoId;
    setActualizandoId(pedidoId);
    setError(null);

    try {
      const { data: actualizado, error } = await supabase
        .from("pedidos_qr")
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq("id", pedidoId)
        .eq("restaurante_id", restauranteId)
        .not("estado", "in", `(${FINAL_QR_STATES.join(",")})`)
        .select("id").maybeSingle();

      if (error) throw error;
      if (!actualizado) throw new Error("El pedido ya ha cambiado o se ha cerrado. Actualiza antes de continuar.");
      if (vistaScopeRef.current !== scope) return;

      setPedidos((actual) =>
        actual.map((pedido) =>
          pedido.id === pedidoId
            ? { ...pedido, estado: normalizarEstado(nuevoEstado), updated_at: new Date().toISOString() }
            : pedido
        )
      );

      void cargarPedidos(true);
    } catch (err: unknown) {
      if (vistaScopeRef.current !== scope) return;
      console.error(err);
      setError(errorMessage(err, "No se pudo cambiar el estado del pedido"));
    } finally {
      operacionRef.current = null;
      if (vistaScopeRef.current === scope) setActualizandoId(null);
    }
  }

  async function cerrarMesa(mesa: MesaAbierta) {
    if (!mesa.pedidos.length || operacionRef.current) return;
    const scope = vistaScopeRef.current;
    operacionRef.current = mesa.mesaKey;
    const ids = mesa.pedidos.map((pedido) => pedido.id);
    setActualizandoId(mesa.mesaKey);
    setError(null);

    try {
      const sessionId = mesa.pedidos[0]?.mesa_session_id;
      if (!restauranteId || mesa.pedidos.some((pedido) => pedido.restaurante_id !== restauranteId)
        || !mesa.mesaId || !sessionId) {
        throw new Error("Este pedido no está vinculado a una mesa protegida.");
      }

      const actualizados = await cargarPedidos();
      if (!actualizados || vistaScopeRef.current !== scope) return;
      const cuentaActual = actualizados.filter((pedido) => !esEstadoFinal(pedido.estado) && qrBillKey(pedido) === mesa.mesaKey);
      if (qrQuoteSignature(cuentaActual) !== qrQuoteSignature(mesa.pedidos)) {
        throw new Error("La cuenta ha cambiado. Revisa los pedidos y el importe actualizados antes de confirmar el pago.");
      }
      const { descuento, propina, metodoPago, totalFinal } = calcularMesaFinal(mesa);
      if (!window.confirm(
        `¿Registrar el pago ya recibido y cerrar ${mesa.mesaLabel}?\nTotal productos: ${formatearDinero(mesa.total)}\nDescuento: ${formatearDinero(descuento)}\nPropina: ${formatearDinero(propina)}\nTotal recibido: ${formatearDinero(totalFinal)}\nPago: ${metodoPago}\nEsto no realiza ningún cargo bancario.`,
      )) return;

      // Requires the staged SQL capability. Never fall back to the old RPC:
      // the new endpoint rechecks the quote and session under database locks.
      const { data, error } = await supabase.rpc("cerrar_mesa_qr_validada", {
        p_mesa_id: mesa.mesaId,
        p_pedidos_ids: ids,
        p_mesa_session_id: sessionId,
        p_total_esperado: mesa.total,
        p_descuento: descuento,
        p_propina: propina,
        p_metodo_pago: metodoPago,
        p_notas: `Cierre/cobro desde cocina QR. ${mesa.pedidos.length} pedido(s).`,
      });

      if (error) {
        if (error.code === "PGRST202") throw new Error("El cierre seguro aún no está instalado. No se ha registrado el pago desde este panel.");
        if (/PEDIDOS_|CUENTA_|SESION_|SESSION_|IMPORTE_CAMBIADO/i.test(error.message)) {
          throw new Error("La cuenta o su sesión ha cambiado. Actualiza y revisa el importe antes de registrar el pago.");
        }
        if (/IMPORTES_|TOTAL_ESPERADO_|METODO_PAGO_/i.test(error.message)) {
          throw new Error("Revisa los importes (máximo dos decimales) y el método de pago. No se ha cerrado la cuenta.");
        }
        throw error;
      }

      const resultado = Array.isArray(data) ? data[0] : data;
      if (!resultado?.ok) throw new Error("No se pudo confirmar el cierre de la mesa.");
      if (vistaScopeRef.current !== scope) return;

      setPedidos((actual) =>
        actual.map((pedido) =>
          ids.includes(pedido.id)
            ? { ...pedido, estado: "cobrado", updated_at: new Date().toISOString() }
            : pedido
        )
      );

      setDescuentosMesa((actual) => {
        const copia = { ...actual };
        delete copia[mesa.mesaKey];
        return copia;
      });
      setPropinasMesa((actual) => {
        const copia = { ...actual };
        delete copia[mesa.mesaKey];
        return copia;
      });
      setMetodosPagoMesa((actual) => {
        const copia = { ...actual };
        delete copia[mesa.mesaKey];
        return copia;
      });

      setVista("historial");
      void cargarPedidos(true);
    } catch (err: unknown) {
      if (vistaScopeRef.current !== scope) return;
      console.error(err);
      setError(errorMessage(err, "No se pudo cerrar la mesa"));
    } finally {
      operacionRef.current = null;
      if (vistaScopeRef.current === scope) setActualizandoId(null);
    }
  }

  useEffect(() => {
    let activo = true;
    vistaScopeRef.current = {};
    queueMicrotask(() => {
      if (!activo) return;
      setActualizandoId(null);
      if (!restauranteId) {
        if (!cargandoRestaurante) {
          setCargando(false);
          setError("No hay un restaurante seleccionado para consultar sus pedidos.");
        }
        return;
      }
      primeraCargaRef.current = true;
      pedidosIdsRef.current = new Set();
      void cargarPedidos();
    });
    const refresh = () => { if (document.visibilityState === "visible") void cargarPedidos(true); };
    const interval = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      activo = false;
      vistaScopeRef.current = {};
      clearInterval(interval);
      cargaRef.current?.abort();
      cargaRef.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [cargarPedidos, cargandoRestaurante, restauranteId]);

  function getEstadoClass(estado: string) {
    const normalizado = normalizarEstado(estado);

    if (normalizado === "nuevo") {
      return isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-100 text-blue-700";
    }

    if (normalizado === "preparando") {
      return isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-100 text-blue-700";
    }

    if (normalizado === "listo") {
      return isDark ? "bg-green-500/10 text-green-300" : "bg-green-100 text-green-700";
    }

    if (normalizado === "cobrado") {
      return isDark ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-100 text-emerald-700";
    }

    if (normalizado === "cancelado") {
      return isDark ? "bg-red-500/10 text-red-300" : "bg-red-100 text-red-700";
    }

    return isDark ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-700";
  }

  function getEstadoLabel(estado: string) {
    const normalizado = normalizarEstado(estado);

    const labels: Record<string, string> = {
      nuevo: "Nuevo",
      preparando: "En preparación",
      listo: "Listo",
      servido: "Servido",
      cobrado: "Cobrado",
      cancelado: "Cancelado",
    };

    return labels[normalizado] || estado;
  }

  function getUrgenciaPedido(pedido: PedidoQR) {
    const minutos = minutosDesde(pedido.created_at, ahora);

    if (minutos >= 20) {
      return {
        minutos,
        label: `${minutos} min · urgente`,
        className: isDark ? "bg-red-500/15 text-red-300 ring-1 ring-red-500/20" : "bg-red-50 text-red-700 ring-1 ring-red-100",
      };
    }

    if (minutos >= 12) {
      return {
        minutos,
        label: `${minutos} min · revisar`,
        className: isDark ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/20" : "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
      };
    }

    return {
      minutos,
      label: `${minutos} min`,
      className: isDark ? "bg-white/5 text-slate-300 ring-1 ring-white/10" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
    };
  }

  function getCardClass(estado: string) {
    const normalizado = normalizarEstado(estado);
    const base = isDark
      ? "rounded-3xl border bg-white/5 p-5 shadow-sm transition hover:bg-white/[0.07]"
      : "rounded-3xl border bg-white p-5 shadow-sm transition hover:shadow-md";

    if (normalizado === "nuevo") {
      return isDark
        ? `${base} border-blue-500/30 ring-2 ring-blue-500/20`
        : `${base} border-blue-300 shadow-blue-100 shadow-lg ring-2 ring-blue-100`;
    }

    if (normalizado === "preparando") return isDark ? `${base} border-blue-500/25` : `${base} border-blue-200`;
    if (normalizado === "listo") return isDark ? `${base} border-green-500/25` : `${base} border-green-200`;
    if (normalizado === "cancelado") return isDark ? `${base} border-red-500/25 opacity-80` : `${base} border-red-200 opacity-80`;

    return isDark ? `${base} border-white/10` : `${base} border-slate-200`;
  }

  function imprimirHtml(titulo: string, html: string) {
    const ventana = window.open("", "_blank", "width=420,height=760");
    if (!ventana) return;

    ventana.document.open();
    ventana.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escaparHtml(titulo)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 18px; color: #111; }
            .ticket { max-width: 340px; }
            h1 { margin: 0 0 8px; font-size: 28px; }
            .muted { color: #555; font-size: 12px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            td { border-bottom: 1px dashed #ccc; padding: 8px 0; vertical-align: top; font-size: 14px; }
            .total { display: flex; justify-content: space-between; margin-top: 16px; font-size: 22px; font-weight: 800; }
            .note { margin-top: 14px; padding: 10px; border: 1px solid #ddd; font-size: 13px; }
            .divider { margin: 14px 0; border-top: 2px solid #111; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>${html}<script>window.print(); setTimeout(() => window.close(), 400);</script></body>
      </html>
    `);
    ventana.document.close();
  }

  function tablaItemsHtml(items: PedidoItem[]) {
    return (items || [])
      .map(
        (item) => `
          <tr>
            <td><strong>${item.cantidad}x</strong></td>
            <td>
              <strong>${escaparHtml(item.nombre_producto)}</strong>
              ${item.notas ? `<br><small>Nota: ${escaparHtml(item.notas)}</small>` : ""}
            </td>
            <td style="text-align:right">${formatearDinero(Number(item.precio_unitario || 0) * Number(item.cantidad || 0))}</td>
          </tr>
        `
      )
      .join("");
  }

  function imprimirPedido(pedido: PedidoQR) {
    const html = `
      <div class="ticket">
        <h1>${pedido.mesa ? `MESA ${escaparHtml(pedido.mesa)}` : "SIN MESA"}</h1>
        <div class="muted">${formatearFecha(pedido.created_at)} · ${getEstadoLabel(pedido.estado)}</div>
        <table>${tablaItemsHtml(pedido.items || []) || "<tr><td>Sin productos</td></tr>"}</table>
        ${pedido.notas ? `<div class="note"><strong>Nota general:</strong><br>${escaparHtml(pedido.notas)}</div>` : ""}
        <div class="total"><span>Total</span><span>${formatearDinero(pedido.total)}</span></div>
      </div>
    `;

    imprimirHtml(`Comanda ${pedido.mesa || "sin mesa"}`, html);
  }

  function imprimirCuentaMesa(mesa: MesaAbierta) {
    const resumen = crearResumenItems(mesa.items);
    const { descuento, propina, metodoPago, totalFinal } = calcularMesaFinal(mesa);
    const html = `
      <div class="ticket">
        <h1>${escaparHtml(mesa.mesaLabel.toUpperCase())}</h1>
        <div class="muted">Cuenta de mesa · ${new Date().toLocaleString("es-ES")}</div>
        <div class="muted">${mesa.pedidos.length} pedido${mesa.pedidos.length !== 1 ? "s" : ""} abierto${mesa.pedidos.length !== 1 ? "s" : ""}</div>
        <table>${tablaItemsHtml(resumen) || "<tr><td>Sin productos</td></tr>"}</table>
        <div class="divider"></div>
        <div class="total"><span>Productos</span><span>${formatearDinero(mesa.total)}</span></div>
        ${descuento > 0 ? `<div class="total" style="font-size:16px"><span>Descuento</span><span>-${formatearDinero(descuento)}</span></div>` : ""}
        ${propina > 0 ? `<div class="total" style="font-size:16px"><span>Propina</span><span>${formatearDinero(propina)}</span></div>` : ""}
        <div class="total"><span>Total a cobrar</span><span>${formatearDinero(totalFinal)}</span></div>
        <div class="muted" style="margin-top:10px">Pago: ${escaparHtml(metodoPago)}</div>
      </div>
    `;

    imprimirHtml(`Cuenta ${mesa.mesaLabel}`, html);
  }

  function renderPedidoCard(pedido: PedidoQR, compacto = false) {
    const urgencia = getUrgenciaPedido(pedido);

    return (
      <article key={pedido.id} className={getCardClass(pedido.estado)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-xs font-black uppercase tracking-[0.12em] ${mutedTextClass}`}>Pedido</p>
            <h2 className={`mt-1 text-xl font-black ${mainTextClass}`}>{pedido.mesa ? `Mesa ${pedido.mesa}` : "Sin mesa"}</h2>
            <p className={`mt-2 text-sm ${mutedTextClass}`}>{formatearFecha(pedido.created_at)}</p>
            {!esEstadoFinal(pedido.estado) && (
              <span className={`mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${urgencia.className}`}>
                <Clock3 className="h-3.5 w-3.5" />
                {urgencia.label}
              </span>
            )}
          </div>

          <div className="text-right">
            <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${getEstadoClass(pedido.estado)}`}>
              {getEstadoLabel(pedido.estado)}
            </span>
            <p className={`mt-3 text-2xl font-black ${mainTextClass}`}>{formatearDinero(pedido.total)}</p>
          </div>
        </div>

        <div className={isDark ? "mt-5 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/10" : "mt-5 rounded-2xl bg-slate-50 p-4"}>
          <div className="mb-3 flex items-center gap-2">
            <ReceiptText className={`h-5 w-5 ${mutedTextClass}`} />
            <p className={`font-black ${mainTextClass}`}>Productos</p>
          </div>

          <div className="space-y-2">
            {(!pedido.items || pedido.items.length === 0) && (
              <p className={isDark ? "rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-slate-400 ring-1 ring-white/10" : "rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-500 shadow-sm"}>
                Este pedido no tiene productos asociados.
              </p>
            )}

            {(pedido.items || []).map((item) => (
              <div key={item.id} className={isDark ? "flex items-center justify-between gap-4 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10" : "flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 shadow-sm"}>
                <div className="min-w-0">
                  <p className={`truncate font-bold ${mainTextClass}`}>{item.nombre_producto}</p>
                  <p className={`text-sm ${mutedTextClass}`}>{formatearDinero(item.precio_unitario)} / ud.</p>
                  {item.notas && <p className={`mt-1 text-xs font-bold ${mutedTextClass}`}>Nota: {item.notas}</p>}
                </div>

                <div className="text-right">
                  <p className={`font-black ${mainTextClass}`}>x{item.cantidad}</p>
                  <p className={`text-sm font-bold ${mutedTextClass}`}>{formatearDinero(Number(item.precio_unitario || 0) * item.cantidad)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {pedido.notas && (
          <div className={isDark ? "mt-4 rounded-2xl bg-white/5 p-4 text-sm font-bold text-slate-300 ring-1 ring-white/10" : "mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800 ring-1 ring-amber-100"}>
            Nota general: {pedido.notas}
          </div>
        )}

        {!compacto && !esEstadoFinal(pedido.estado) && (
          <div className={isDark ? "mt-5 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/10" : "mt-5 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"}>
            <p className={`mb-3 text-xs font-black uppercase tracking-[0.14em] ${mutedTextClass}`}>
              Actualizar estado
            </p>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => cambiarEstado(pedido.id, "preparando")} disabled={actualizandoId === pedido.id} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-blue-600 px-2 py-3 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                <ChefHat className="h-5 w-5" />
                Preparando
              </button>
              <button onClick={() => cambiarEstado(pedido.id, "listo")} disabled={actualizandoId === pedido.id} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-green-600 px-2 py-3 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
                <CheckCircle className="h-5 w-5" />
                Listo
              </button>
              <button onClick={() => cambiarEstado(pedido.id, "servido")} disabled={actualizandoId === pedido.id} className={isDark ? "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-white/10 px-2 py-3 text-xs font-black text-white ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50" : "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-slate-900 px-2 py-3 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"}>
                <Utensils className="h-5 w-5" />
                Servido
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => imprimirPedido(pedido)} className={isDark ? "flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-3 py-3 text-xs font-black text-white ring-1 ring-white/10 transition hover:bg-white/10" : "flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-xs font-black text-slate-900 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"}>
                <Printer className="h-4 w-4" />
                Imprimir comanda
              </button>
              <button onClick={() => cambiarEstado(pedido.id, "cancelado")} disabled={actualizandoId === pedido.id} className={isDark ? "flex items-center justify-center gap-2 rounded-2xl bg-red-500/10 px-3 py-3 text-xs font-black text-red-300 ring-1 ring-red-500/20 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50" : "flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-3 py-3 text-xs font-black text-red-700 ring-1 ring-red-200 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"}>
                <XCircle className="h-4 w-4" />
                Cancelar pedido
              </button>
            </div>
          </div>
        )}

        {compacto && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => imprimirPedido(pedido)} className={primaryButtonClass}>
              <Printer className="h-4 w-4" />
              Reimprimir
            </button>
          </div>
        )}

        {actualizandoId === pedido.id && <p className={`mt-3 text-sm font-bold ${mutedTextClass}`}>Cambiando estado del pedido...</p>}
      </article>
    );
  }

  return (
    <main className={pageClass}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className={iconBoxClass}>
              <ShoppingBag className="h-6 w-6" />
              {pedidosNuevos.length > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-500 px-1 text-xs font-black text-white">
                  {pedidosNuevos.length}
                </span>
              )}
            </div>
            <div>
              <h1 className={titleClass}>Cocina / pedidos QR</h1>
              <p className={subtitleClass}>Pedidos por columnas, cierre de mesa e historial.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button onClick={activarSonido} className={primaryButtonClass}>
              {sonidoActivo ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {sonidoActivo ? "Sonido activo" : "Activar sonido"}
            </button>
            <button onClick={repetirSonido} className={primaryButtonClass}>
              <BellRing className="h-4 w-4" />
              Probar aviso
            </button>
            <button onClick={alternarPantallaCompleta} className={primaryButtonClass}>
              <Utensils className="h-4 w-4" />
              {pantallaCompleta ? "Salir pantalla" : "Pantalla cocina"}
            </button>
            <button onClick={() => cargarPedidos()} disabled={cargando} className={primaryButtonClass}>
              <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <div className={normalCardClass}>
            <p className={`text-sm font-black ${mutedTextClass}`}>Activos</p>
            <p className={`mt-1 text-3xl font-black ${mainTextClass}`}>{pedidosActivos.length}</p>
          </div>
          <div className={normalCardClass}>
            <p className={`text-sm font-black ${mutedTextClass}`}>Mesas abiertas</p>
            <p className={`mt-1 text-3xl font-black ${mainTextClass}`}>{mesasAbiertas.length}</p>
          </div>
          <div className={normalCardClass}>
            <p className={`text-sm font-black ${mutedTextClass}`}>Total abierto</p>
            <p className={`mt-1 text-3xl font-black ${mainTextClass}`}>{formatearDinero(totalActivo)}</p>
          </div>
          <div className={normalCardClass}>
            <p className={`text-sm font-black ${mutedTextClass}`}>Historial cargado</p>
            <p className={`mt-1 text-3xl font-black ${mainTextClass}`}>{formatearDinero(totalHistorial)}</p>
          </div>
        </section>

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {[
            { key: "cocina" as TabVista, label: "Cocina", icon: ChefHat },
            { key: "mesas" as TabVista, label: "Mesas abiertas", icon: Table2 },
            { key: "historial" as TabVista, label: "Historial", icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const activo = vista === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setVista(tab.key)}
                className={`flex shrink-0 items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition ${
                  activo
                    ? "bg-blue-500 text-white shadow-sm"
                    : isDark
                    ? "bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
                    : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {avisoNuevo && (
          <div className={isDark ? "mt-6 flex items-center gap-3 rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5 text-blue-300 shadow-sm" : "mt-6 flex items-center gap-3 rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-800 shadow-sm"}>
            <div className="rounded-2xl bg-blue-500 p-3 text-white"><BellRing className="h-5 w-5 animate-pulse" /></div>
            <div>
              <p className="font-black">Nuevo pedido recibido</p>
              <p className={isDark ? "text-sm text-blue-200" : "text-sm text-blue-700"}>Revisa la columna Nuevo.</p>
            </div>
          </div>
        )}

        {cargando && (
          <div className={`mt-8 ${normalCardClass}`}>
            <div className="flex items-center gap-3">
              <Loader2 className={`h-5 w-5 animate-spin ${secondaryTextClass}`} />
              <p className={`font-bold ${secondaryTextClass}`}>Cargando pedidos...</p>
            </div>
          </div>
        )}

        {error && (
          <div className={isDark ? "mt-8 rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-300 shadow-sm" : "mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm"}>
            <p className="font-black">Error</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        )}

        {!cargando && !error && vista === "cocina" && (
          <section className="mt-8 grid gap-5 xl:grid-cols-3">
            {columnasCocina.map((columna) => {
              const Icon = columna.icon;
              const pedidosColumna = pedidosActivos.filter((pedido) => normalizarEstado(pedido.estado) === columna.key);

              return (
                <div key={columna.key} className={columnClass}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={isDark ? "rounded-2xl bg-white/5 p-3 ring-1 ring-white/10" : "rounded-2xl bg-slate-100 p-3"}>
                        <Icon className={`h-5 w-5 ${mutedTextClass}`} />
                      </div>
                      <div>
                        <h2 className={`font-black ${mainTextClass}`}>{columna.label}</h2>
                        <p className={`text-xs font-semibold ${mutedTextClass}`}>{columna.descripcion}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${getEstadoClass(columna.key)}`}>{pedidosColumna.length}</span>
                  </div>

                  <div className="space-y-4">
                    {pedidosColumna.length === 0 && (
                      <div className={isDark ? "rounded-3xl border border-dashed border-white/10 p-6 text-center text-sm font-bold text-slate-500" : "rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400"}>
                        Sin pedidos aquí.
                      </div>
                    )}
                    {pedidosColumna.map((pedido) => renderPedidoCard(pedido))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {!cargando && !error && vista === "mesas" && (
          <section className="mt-8 grid gap-5 xl:grid-cols-2">
            {mesasAbiertas.length === 0 && (
              <div className={normalCardClass}>
                <p className={`font-bold ${secondaryTextClass}`}>No hay mesas abiertas.</p>
              </div>
            )}

            {mesasAbiertas.map((mesa) => {
              const resumen = crearResumenItems(mesa.items);
              const ajuste = calcularMesaFinal(mesa);
              return (
                <article key={mesa.mesaKey} className={normalCardClass}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={isDark ? "rounded-2xl bg-white/5 p-3 ring-1 ring-white/10" : "rounded-2xl bg-slate-100 p-3"}>
                        <Table2 className={`h-5 w-5 ${mutedTextClass}`} />
                      </div>
                      <div>
                        <h2 className={`text-2xl font-black ${mainTextClass}`}>{mesa.mesaLabel}</h2>
                        <p className={`text-sm font-semibold ${mutedTextClass}`}>{mesa.pedidos.length} pedido{mesa.pedidos.length !== 1 ? "s" : ""} · desde {formatearFecha(mesa.primerPedido)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-black uppercase tracking-[0.12em] ${mutedTextClass}`}>Total</p>
                      <p className={`text-3xl font-black ${mainTextClass}`}>{formatearDinero(mesa.total)}</p>
                    </div>
                  </div>

                  <div className={isDark ? "mt-5 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/10" : "mt-5 rounded-2xl bg-slate-50 p-4"}>
                    <div className="space-y-2">
                      {resumen.map((item) => (
                        <div key={`${item.producto_id || item.nombre_producto}-${item.precio_unitario}`} className="flex items-center justify-between gap-4">
                          <div>
                            <p className={`font-black ${mainTextClass}`}>{item.cantidad}x {item.nombre_producto}</p>
                            {item.notas && <p className={`text-xs font-bold ${mutedTextClass}`}>Notas: {item.notas}</p>}
                          </div>
                          <p className={`font-black ${secondaryTextClass}`}>{formatearDinero(Number(item.precio_unitario || 0) * Number(item.cantidad || 0))}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={isDark ? "mt-5 rounded-3xl bg-white/5 p-4 ring-1 ring-white/10" : "mt-5 rounded-3xl bg-white p-4 ring-1 ring-slate-200"}>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="block">
                        <span className={`mb-1 block text-xs font-black uppercase ${mutedTextClass}`}>Descuento €</span>
                        <input
                          value={descuentosMesa[mesa.mesaKey] || ""}
                          onChange={(e) => setDescuentosMesa((actual) => ({ ...actual, [mesa.mesaKey]: e.target.value }))}
                          placeholder="0"
                          inputMode="decimal"
                          className={isDark ? "w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-black text-white outline-none" : "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900 outline-none"}
                        />
                      </label>
                      <label className="block">
                        <span className={`mb-1 block text-xs font-black uppercase ${mutedTextClass}`}>Propina €</span>
                        <input
                          value={propinasMesa[mesa.mesaKey] || ""}
                          onChange={(e) => setPropinasMesa((actual) => ({ ...actual, [mesa.mesaKey]: e.target.value }))}
                          placeholder="0"
                          inputMode="decimal"
                          className={isDark ? "w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-black text-white outline-none" : "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900 outline-none"}
                        />
                      </label>
                      <label className="block">
                        <span className={`mb-1 block text-xs font-black uppercase ${mutedTextClass}`}>Pago</span>
                        <select
                          value={metodosPagoMesa[mesa.mesaKey] || "tarjeta"}
                          onChange={(e) => setMetodosPagoMesa((actual) => ({ ...actual, [mesa.mesaKey]: e.target.value }))}
                          className={isDark ? "w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-black text-white outline-none" : "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900 outline-none"}
                        >
                          <option value="tarjeta">Tarjeta</option>
                          <option value="efectivo">Efectivo</option>
                          <option value="bizum">Bizum</option>
                          <option value="mixto">Mixto</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-green-600 px-4 py-3 text-white">
                      <span className="text-sm font-black uppercase text-white/70">A cobrar</span>
                      <span className="text-2xl font-black">{formatearDinero(ajuste.totalFinal)}</span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <button onClick={() => imprimirCuentaMesa(mesa)} className={primaryButtonClass}>
                      <Printer className="h-4 w-4" />
                      Imprimir cuenta
                    </button>
                    <button onClick={() => cerrarMesa(mesa)} disabled={actualizandoId !== null || !mesa.mesaId || !mesa.pedidos[0]?.mesa_session_id} className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
                      {actualizandoId === mesa.mesaKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      Registrar pago y cerrar
                    </button>
                  </div>
                  <p className={`mt-3 text-xs ${mutedTextClass}`}>Registra únicamente un pago ya recibido. No realiza cargos bancarios ni emite una factura.</p>
                  {(!mesa.mesaId || !mesa.pedidos[0]?.mesa_session_id) && (
                    <p className="mt-2 text-sm font-bold text-amber-600">Pedido sin sesión protegida. Revisa su origen con soporte antes de registrar el cierre.</p>
                  )}
                </article>
              );
            })}
          </section>
        )}

        {!cargando && !error && vista === "historial" && (
          <section className="mt-8 grid gap-5">
            {pedidosFinalizados.length === 0 && (
              <div className={normalCardClass}>
                <p className={`font-bold ${secondaryTextClass}`}>Todavía no hay pedidos cobrados o cancelados.</p>
              </div>
            )}
            {pedidosFinalizados.map((pedido) => renderPedidoCard(pedido, true))}
          </section>
        )}
      </div>
    </main>
  );
}
