"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/app/(app)/components/ThemeProvider";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { getRestauranteUsuario } from "@/app/(app)/lib/getRestauranteUsuario";

type CanjePuntos = {
  id: string;
  cliente_id: string;
  premio_id: string;
  puntos_usados: number;
  estado: "pendiente" | "confirmado" | "cancelado";
  creado_en: string;
  confirmado_en: string | null;
};

type CanjePromo = {
  id: string;
  cliente_id: string;
  cupon_id: string;
  estado: "activo" | "canjeado" | "caducado";
  creado_en?: string | null;
};

type Cliente = {
  id: string;
  nombre: string | null;
  telefono: string | null;
};

type Premio = {
  id: string;
  nombre: string;
  puntos_requeridos: number;
};

type Cupon = {
  id: string;
  nombre: string;
  beneficio: string | null;
};

function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function pickDate(row: { creado_en?: string | null }) {
  return row.creado_en ?? null;
}

function nombreClienteVisible(cl: Cliente | undefined, clienteId: string) {
  const nombre = String(cl?.nombre ?? "").trim();
  if (nombre) return nombre;
  return clienteId;
}

export default function CanjesPage() {
  const { dark } = useTheme();

  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // CANJES PUNTOS
  const [canjes, setCanjes] = useState<CanjePuntos[]>([]);
  const [clientesById, setClientesById] = useState<Record<string, Cliente>>({});
  const [premiosById, setPremiosById] = useState<Record<string, Premio>>({});
  const [emailByClienteId, setEmailByClienteId] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // CANJES PROMOS (cupon_cliente)
  const [canjesPromos, setCanjesPromos] = useState<CanjePromo[]>([]);
  const [cuponesById, setCuponesById] = useState<Record<string, Cupon>>({});
  const [busyPromoId, setBusyPromoId] = useState<string | null>(null);

  const cardBase = useMemo(
    () =>
      clsx(
        "rounded-2xl border shadow-sm",
        dark ? "border-gray-800 bg-gray-950/40" : "border-gray-200 bg-white"
      ),
    [dark]
  );

  const btn = useMemo(
    () =>
      clsx(
        "rounded-xl border px-4 py-2 text-sm font-medium transition",
        dark
          ? "border-gray-800 bg-transparent text-gray-200 hover:bg-gray-900"
          : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
        "disabled:opacity-60"
      ),
    [dark]
  );

  const btnPrimary = useMemo(
    () =>
      clsx(
        "rounded-xl px-4 py-2 text-sm font-semibold transition",
        dark ? "bg-white text-black" : "bg-black text-white",
        "disabled:opacity-60"
      ),
    [dark]
  );

  const badge = (text: string, kind: "pendiente" | "confirmado" | "cancelado") => {
    const base = "inline-flex rounded-full px-3 py-1 text-xs font-semibold";
    const map =
      kind === "pendiente"
        ? dark
          ? "bg-white/10 text-white"
          : "bg-black/10 text-black"
        : kind === "confirmado"
        ? dark
          ? "bg-emerald-500/20 text-emerald-200"
          : "bg-emerald-100 text-emerald-800"
        : dark
        ? "bg-red-500/20 text-red-200"
        : "bg-red-100 text-red-700";

    return <span className={clsx(base, map)}>{text}</span>;
  };

  const crearAvisoCliente = async ({
    clienteId,
    tipo,
    titulo,
    mensaje,
  }: {
    clienteId: string;
    tipo: "reserva" | "cupon" | "premio" | "canje" | "puntos" | "info";
    titulo: string;
    mensaje: string;
  }) => {
    if (!restauranteId || !clienteId) return;

    await supabase.from("cliente_notificaciones").insert({
      restaurante_id: restauranteId,
      cliente_id: clienteId,
      tipo,
      titulo,
      mensaje,
      url: null,
      leida: false,
    });
  };

  const cargarTodo = async (rid: string) => {
    // 1) Canjes puntos
    const { data: canjesData, error: canjesErr } = await supabase
      .from("canjes_puntos")
      .select("id,cliente_id,premio_id,puntos_usados,estado,creado_en,confirmado_en")
      .eq("restaurante_id", rid)
      .order("creado_en", { ascending: false });

    if (canjesErr) throw canjesErr;

    const rowsPuntos = (canjesData ?? []) as CanjePuntos[];
    setCanjes(rowsPuntos);

    // 2) Canjes promos (cupon_cliente)
    // IMPORTANTE: tu tabla NO tiene confirmado_en / created_at
    const { data: promosData, error: promosErr } = await supabase
      .from("cupon_cliente")
      .select("id,cliente_id,cupon_id,estado,creado_en")
      .eq("restaurante_id", rid)
      .in("estado", ["activo", "canjeado", "caducado"])
      .order("creado_en", { ascending: false });

    if (promosErr) throw promosErr;

    const rowsPromos = (promosData ?? []) as CanjePromo[];
    setCanjesPromos(rowsPromos);

    // IDs combinados para clientes
    const clienteIds = Array.from(
      new Set([
        ...rowsPuntos.map((c) => c.cliente_id),
        ...rowsPromos.map((c) => c.cliente_id),
      ])
    );

    const premioIds = Array.from(new Set(rowsPuntos.map((c) => c.premio_id)));
    const cuponIds = Array.from(new Set(rowsPromos.map((c) => c.cupon_id)));

    // 3) Clientes (nombre + teléfono)
    if (clienteIds.length) {
      const { data: clientesData, error: clientesErr } = await supabase
        .from("clientes")
        .select("id,nombre,telefono")
        .in("id", clienteIds);

      if (clientesErr) throw clientesErr;

      const map: Record<string, Cliente> = {};
      (clientesData ?? []).forEach((c: any) => {
        map[c.id] = {
          id: c.id,
          nombre: c.nombre ?? null,
          telefono: c.telefono ?? null,
        };
      });

      setClientesById(map);
    } else {
      setClientesById({});
    }

    // 4) Premios (para recuperar nombres de premios)
    if (premioIds.length) {
      const { data: premiosData, error: premiosErr } = await supabase
        .from("premios_puntos")
        .select("id,nombre,puntos_requeridos")
        .in("id", premioIds)
        .eq("restaurante_id", rid);

      if (premiosErr) throw premiosErr;

      const map: Record<string, Premio> = {};
      (premiosData ?? []).forEach((p: any) => {
        map[p.id] = {
          id: p.id,
          nombre: p.nombre,
          puntos_requeridos: Number(p.puntos_requeridos ?? 0),
        };
      });

      setPremiosById(map);
    } else {
      setPremiosById({});
    }

    // 5) Cupones (promos)
    if (cuponIds.length) {
      const { data: cuponesData, error: cuponesErr } = await supabase
        .from("cupones")
        .select("id,nombre,beneficio")
        .in("id", cuponIds)
        .eq("restaurante_id", rid);

      if (cuponesErr) throw cuponesErr;

      const map: Record<string, Cupon> = {};
      (cuponesData ?? []).forEach((c: any) => {
        map[c.id] = {
          id: c.id,
          nombre: c.nombre,
          beneficio: c.beneficio ?? null,
        };
      });

      setCuponesById(map);
    } else {
      setCuponesById({});
    }

    // 6) Email desde reservas (más reciente)
    if (clienteIds.length) {
      const { data: emailsData, error: emailsErr } = await supabase
        .from("reservas")
        .select("cliente_id,email,fecha_hora_reserva")
        .eq("restaurante_id", rid)
        .in("cliente_id", clienteIds)
        .not("email", "is", null)
        .order("cliente_id", { ascending: true })
        .order("fecha_hora_reserva", { ascending: false });

      if (emailsErr) throw emailsErr;

      const map: Record<string, string> = {};
      (emailsData ?? []).forEach((r: any) => {
        if (!map[r.cliente_id] && r.email) map[r.cliente_id] = r.email;
      });

      setEmailByClienteId(map);
    } else {
      setEmailByClienteId({});
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErrorMsg(null);

      const rid = await getRestauranteUsuario();

      if (!rid) {
        setErrorMsg("No se encontró restaurante_id para este usuario.");
        setLoading(false);
        return;
      }

      setRestauranteId(rid);

      try {
        await cargarTodo(rid);
      } catch (e: any) {
        setErrorMsg(e?.message ?? "Error cargando canjes");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  // ===== CANJES PUNTOS =====
  const confirmar = async (canjeId: string) => {
    if (!restauranteId) return;

    const canjeActual = canjes.find((c) => c.id === canjeId);
    const premio = canjeActual ? premiosById[canjeActual.premio_id] : null;

    setBusyId(canjeId);
    setErrorMsg(null);

    const { error } = await supabase.rpc("rpc_confirmar_canje", {
      p_canje_id: canjeId,
      p_restaurante_id: restauranteId,
    });

    if (error) {
      setErrorMsg(error.message);
      setBusyId(null);
      return;
    }

    if (canjeActual) {
      await crearAvisoCliente({
        clienteId: canjeActual.cliente_id,
        tipo: "premio",
        titulo: "Premio confirmado",
        mensaje: premio?.nombre
          ? `El restaurante ha confirmado tu premio "${premio.nombre}".`
          : "El restaurante ha confirmado tu premio.",
      });
    }

    await cargarTodo(restauranteId);
    setBusyId(null);
  };

  const cancelar = async (canjeId: string) => {
    if (!restauranteId) return;

    const canjeActual = canjes.find((c) => c.id === canjeId);
    const premio = canjeActual ? premiosById[canjeActual.premio_id] : null;

    const ok = window.confirm("Cancelar canje y devolver puntos al cliente?");
    if (!ok) return;

    setBusyId(canjeId);
    setErrorMsg(null);

    const { error } = await supabase.rpc("rpc_cancelar_canje", {
      p_canje_id: canjeId,
      p_restaurante_id: restauranteId,
    });

    if (error) {
      setErrorMsg(error.message);
      setBusyId(null);
      return;
    }

    if (canjeActual) {
      await crearAvisoCliente({
        clienteId: canjeActual.cliente_id,
        tipo: "premio",
        titulo: "Premio cancelado",
        mensaje: premio?.nombre
          ? `El restaurante ha cancelado tu canje del premio "${premio.nombre}". Los puntos se han devuelto a tu cuenta.`
          : "El restaurante ha cancelado tu canje. Los puntos se han devuelto a tu cuenta.",
      });
    }

    await cargarTodo(restauranteId);
    setBusyId(null);
  };

  // ===== CANJES PROMOS (cupon_cliente) =====
  // IMPORTANTE: tu tabla no tiene confirmado_en, así que solo cambiamos estado
  const confirmarPromo = async (cuponClienteId: string) => {
    if (!restauranteId) return;

    const promoActual = canjesPromos.find((c) => c.id === cuponClienteId);
    const cupon = promoActual ? cuponesById[promoActual.cupon_id] : null;

    setBusyPromoId(cuponClienteId);
    setErrorMsg(null);

    const { error } = await supabase
      .from("cupon_cliente")
      .update({ estado: "canjeado" })
      .eq("id", cuponClienteId)
      .eq("restaurante_id", restauranteId)
      .eq("estado", "activo");

    if (error) {
      setErrorMsg(error.message);
      setBusyPromoId(null);
      return;
    }

    if (promoActual) {
      await crearAvisoCliente({
        clienteId: promoActual.cliente_id,
        tipo: "cupon",
        titulo: "Cupón validado",
        mensaje: cupon?.nombre
          ? `El restaurante ha validado tu cupón "${cupon.nombre}".`
          : "El restaurante ha validado tu cupón.",
      });
    }

    await cargarTodo(restauranteId);
    setBusyPromoId(null);
  };

  const caducarPromo = async (cuponClienteId: string) => {
    if (!restauranteId) return;

    const promoActual = canjesPromos.find((c) => c.id === cuponClienteId);
    const cupon = promoActual ? cuponesById[promoActual.cupon_id] : null;

    const ok = window.confirm("Marcar promo como caducada?");
    if (!ok) return;

    setBusyPromoId(cuponClienteId);
    setErrorMsg(null);

    const { error } = await supabase
      .from("cupon_cliente")
      .update({ estado: "caducado" })
      .eq("id", cuponClienteId)
      .eq("restaurante_id", restauranteId)
      .in("estado", ["activo", "canjeado"]);

    if (error) {
      setErrorMsg(error.message);
      setBusyPromoId(null);
      return;
    }

    if (promoActual) {
      await crearAvisoCliente({
        clienteId: promoActual.cliente_id,
        tipo: "cupon",
        titulo: "Cupón caducado",
        mensaje: cupon?.nombre
          ? `El restaurante ha marcado como caducado tu cupón "${cupon.nombre}".`
          : "El restaurante ha marcado como caducado tu cupón.",
      });
    }

    await cargarTodo(restauranteId);
    setBusyPromoId(null);
  };

  // Filtros puntos
  const pendientes = canjes.filter((c) => c.estado === "pendiente");
  const confirmados = canjes.filter((c) => c.estado === "confirmado");
  const cancelados = canjes.filter((c) => c.estado === "cancelado");

  // Filtros promos
  const promosPendientes = canjesPromos.filter((c) => c.estado === "activo");
  const promosCanjeadas = canjesPromos.filter((c) => c.estado === "canjeado");
  const promosCaducadas = canjesPromos.filter((c) => c.estado === "caducado");

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Canjes</h1>
          <div className={clsx("mt-1 text-sm", dark ? "text-gray-400" : "text-gray-500")}>
            Restaurante: {restauranteId ?? "—"}
          </div>
        </div>

        <button
          className={btn}
          onClick={() =>
            restauranteId &&
            cargarTodo(restauranteId).catch((e: any) =>
              setErrorMsg(e?.message ?? "Error")
            )
          }
          disabled={!restauranteId || loading}
        >
          Recargar
        </button>
      </div>

      {errorMsg && (
        <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className={clsx("mt-6 text-sm", dark ? "text-gray-300" : "text-gray-600")}>
          Cargando…
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {/* ===================== CANJES DE PUNTOS ===================== */}
          <div>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">
              Canjes de puntos
            </h2>

            {/* PENDIENTES */}
            <div className={clsx(cardBase, "mb-6")}>
              <div
                className={clsx(
                  "px-5 py-4 border-b",
                  dark ? "border-gray-800" : "border-gray-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Pendientes</div>
                  {badge(String(pendientes.length), "pendiente")}
                </div>
              </div>

              <div className="p-5 space-y-3">
                {pendientes.length === 0 ? (
                  <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    No hay canjes pendientes.
                  </div>
                ) : (
                  pendientes.map((c) => {
                    const cl = clientesById[c.cliente_id];
                    const pr = premiosById[c.premio_id];
                    const email = emailByClienteId[c.cliente_id];
                    const nombreCliente = nombreClienteVisible(cl, c.cliente_id);

                    return (
                      <div
                        key={c.id}
                        className={clsx(
                          "rounded-2xl border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
                          dark ? "border-gray-800 bg-gray-950/20" : "border-gray-200 bg-white"
                        )}
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {pr?.nombre ?? `Premio (${c.premio_id})`} ·{" "}
                            {pr?.puntos_requeridos ?? c.puntos_usados} pts
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Cliente: {nombreCliente}
                            {cl?.telefono ? ` · ${cl.telefono}` : ""}
                            {email ? ` · ${email}` : ""}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Creado: {new Date(c.creado_en).toLocaleString("es-ES")}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {badge("Pendiente", "pendiente")}
                          <button
                            className={btnPrimary}
                            onClick={() => confirmar(c.id)}
                            disabled={busyId === c.id}
                          >
                            Confirmar
                          </button>
                          <button
                            className={btn}
                            onClick={() => cancelar(c.id)}
                            disabled={busyId === c.id}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* CONFIRMADOS */}
            <div className={clsx(cardBase, "mb-6")}>
              <div className={clsx("px-5 py-4 border-b", dark ? "border-gray-800" : "border-gray-200")}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Confirmados</div>
                  {badge(String(confirmados.length), "confirmado")}
                </div>
              </div>

              <div className="p-5 space-y-2">
                {confirmados.length === 0 ? (
                  <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>—</div>
                ) : (
                  confirmados.slice(0, 20).map((c) => {
                    const cl = clientesById[c.cliente_id];
                    const pr = premiosById[c.premio_id];
                    const email = emailByClienteId[c.cliente_id];
                    const nombreCliente = nombreClienteVisible(cl, c.cliente_id);

                    return (
                      <div
                        key={c.id}
                        className={clsx(
                          "rounded-2xl border p-4 flex items-start justify-between gap-4",
                          dark ? "border-gray-800 bg-gray-950/20" : "border-gray-200 bg-white"
                        )}
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {pr?.nombre ?? `Premio (${c.premio_id})`}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Cliente: {nombreCliente}
                            {cl?.telefono ? ` · ${cl.telefono}` : ""}
                            {email ? ` · ${email}` : ""}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Confirmado:{" "}
                            {c.confirmado_en
                              ? new Date(c.confirmado_en).toLocaleString("es-ES")
                              : "—"}
                          </div>
                        </div>
                        {badge("Confirmado", "confirmado")}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* CANCELADOS */}
            <div className={cardBase}>
              <div className={clsx("px-5 py-4 border-b", dark ? "border-gray-800" : "border-gray-200")}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Cancelados</div>
                  {badge(String(cancelados.length), "cancelado")}
                </div>
              </div>

              <div className="p-5 space-y-2">
                {cancelados.length === 0 ? (
                  <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>—</div>
                ) : (
                  cancelados.slice(0, 20).map((c) => {
                    const cl = clientesById[c.cliente_id];
                    const pr = premiosById[c.premio_id];
                    const email = emailByClienteId[c.cliente_id];
                    const nombreCliente = nombreClienteVisible(cl, c.cliente_id);

                    return (
                      <div
                        key={c.id}
                        className={clsx(
                          "rounded-2xl border p-4 flex items-start justify-between gap-4",
                          dark ? "border-gray-800 bg-gray-950/20" : "border-gray-200 bg-white"
                        )}
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {pr?.nombre ?? `Premio (${c.premio_id})`}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Cliente: {nombreCliente}
                            {cl?.telefono ? ` · ${cl.telefono}` : ""}
                            {email ? ` · ${email}` : ""}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Creado: {new Date(c.creado_en).toLocaleString("es-ES")}
                          </div>
                        </div>
                        {badge("Cancelado", "cancelado")}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ===================== PROMOS AUTOMÁTICAS ===================== */}
          <div>
            <h2 className="mb-3 text-lg font-semibold tracking-tight">
              Promos automáticas
            </h2>

            {/* ACTIVAS */}
            <div className={clsx(cardBase, "mb-6")}>
              <div className={clsx("px-5 py-4 border-b", dark ? "border-gray-800" : "border-gray-200")}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Pendientes de validar</div>
                  {badge(String(promosPendientes.length), "pendiente")}
                </div>
              </div>

              <div className="p-5 space-y-3">
                {promosPendientes.length === 0 ? (
                  <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>
                    No hay promos pendientes.
                  </div>
                ) : (
                  promosPendientes.map((c) => {
                    const cl = clientesById[c.cliente_id];
                    const cp = cuponesById[c.cupon_id];
                    const email = emailByClienteId[c.cliente_id];
                    const fecha = pickDate(c);
                    const nombreCliente = nombreClienteVisible(cl, c.cliente_id);

                    return (
                      <div
                        key={c.id}
                        className={clsx(
                          "rounded-2xl border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
                          dark ? "border-gray-800 bg-gray-950/20" : "border-gray-200 bg-white"
                        )}
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {cp?.nombre ?? `Promo (${c.cupon_id})`}
                          </div>
                          {cp?.beneficio ? (
                            <div className={clsx("mt-1 text-xs", dark ? "text-gray-300" : "text-gray-600")}>
                              {cp.beneficio}
                            </div>
                          ) : null}
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Cliente: {nombreCliente}
                            {cl?.telefono ? ` · ${cl.telefono}` : ""}
                            {email ? ` · ${email}` : ""}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Creado:{" "}
                            {fecha ? new Date(fecha).toLocaleString("es-ES") : "—"}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {badge("Pendiente", "pendiente")}
                          <button
                            className={btnPrimary}
                            onClick={() => confirmarPromo(c.id)}
                            disabled={busyPromoId === c.id}
                          >
                            Confirmar
                          </button>
                          <button
                            className={btn}
                            onClick={() => caducarPromo(c.id)}
                            disabled={busyPromoId === c.id}
                          >
                            Caducar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* CANJEADAS */}
            <div className={clsx(cardBase, "mb-6")}>
              <div className={clsx("px-5 py-4 border-b", dark ? "border-gray-800" : "border-gray-200")}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Validadas</div>
                  {badge(String(promosCanjeadas.length), "confirmado")}
                </div>
              </div>

              <div className="p-5 space-y-2">
                {promosCanjeadas.length === 0 ? (
                  <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>—</div>
                ) : (
                  promosCanjeadas.slice(0, 20).map((c) => {
                    const cl = clientesById[c.cliente_id];
                    const cp = cuponesById[c.cupon_id];
                    const email = emailByClienteId[c.cliente_id];
                    const nombreCliente = nombreClienteVisible(cl, c.cliente_id);

                    return (
                      <div
                        key={c.id}
                        className={clsx(
                          "rounded-2xl border p-4 flex items-start justify-between gap-4",
                          dark ? "border-gray-800 bg-gray-950/20" : "border-gray-200 bg-white"
                        )}
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {cp?.nombre ?? `Promo (${c.cupon_id})`}
                          </div>
                          {cp?.beneficio ? (
                            <div className={clsx("mt-1 text-xs", dark ? "text-gray-300" : "text-gray-600")}>
                              {cp.beneficio}
                            </div>
                          ) : null}
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Cliente: {nombreCliente}
                            {cl?.telefono ? ` · ${cl.telefono}` : ""}
                            {email ? ` · ${email}` : ""}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Validado:{" "}
                            {c.creado_en
                              ? new Date(c.creado_en).toLocaleString("es-ES")
                              : "—"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {badge("Confirmado", "confirmado")}
                          <button
                            className={btn}
                            onClick={() => caducarPromo(c.id)}
                            disabled={busyPromoId === c.id}
                          >
                            Caducar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* CADUCADAS */}
            <div className={cardBase}>
              <div className={clsx("px-5 py-4 border-b", dark ? "border-gray-800" : "border-gray-200")}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Caducadas</div>
                  {badge(String(promosCaducadas.length), "cancelado")}
                </div>
              </div>

              <div className="p-5 space-y-2">
                {promosCaducadas.length === 0 ? (
                  <div className={clsx("text-sm", dark ? "text-gray-300" : "text-gray-600")}>—</div>
                ) : (
                  promosCaducadas.slice(0, 20).map((c) => {
                    const cl = clientesById[c.cliente_id];
                    const cp = cuponesById[c.cupon_id];
                    const email = emailByClienteId[c.cliente_id];
                    const fecha = pickDate(c);
                    const nombreCliente = nombreClienteVisible(cl, c.cliente_id);

                    return (
                      <div
                        key={c.id}
                        className={clsx(
                          "rounded-2xl border p-4 flex items-start justify-between gap-4",
                          dark ? "border-gray-800 bg-gray-950/20" : "border-gray-200 bg-white"
                        )}
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {cp?.nombre ?? `Promo (${c.cupon_id})`}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Cliente: {nombreCliente}
                            {cl?.telefono ? ` · ${cl.telefono}` : ""}
                            {email ? ` · ${email}` : ""}
                          </div>
                          <div className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                            Creado:{" "}
                            {fecha ? new Date(fecha).toLocaleString("es-ES") : "—"}
                          </div>
                        </div>
                        {badge("Caducado", "cancelado")}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}