"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";

type Product = { id: string; nombre: string; restaurante_id: string };
type Dish = Product & { activo: boolean };
type Mapping = { restaurante_id: string; producto_id: string; plato_id: string };
type CostStatus = "calculado" | "sin_vinculo" | "receta_incompleta" | "menu_sin_escandallo" | "origen_desconocido";
type Sale = {
  id: string;
  restaurante_id: string;
  nombre_producto: string;
  cantidad: number;
  ingreso_total: number | string;
  coste_total: number | string | null;
  beneficio_total: number | string | null;
  estado_coste: CostStatus;
  fecha: string;
};

const PAGE_SIZE = 500;
const MAX_ROWS = 30_000;
const DISPLAY_ROWS = 20;
const costLabels: Record<CostStatus, string> = {
  calculado: "Coste guardado al cerrar",
  sin_vinculo: "Producto sin plato vinculado",
  receta_incompleta: "Receta o costes incompletos",
  menu_sin_escandallo: "Menú sin escandallo",
  origen_desconocido: "Producto de origen desconocido",
};
const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

function monthInMadrid() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
}

function monthBounds(month: string) {
  const [year, value] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}-01` };
}

function cents(value: number | string | null) {
  if (value === null || !/^-?\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const [whole, fraction = ""] = String(value).replace(/^-/, "").split(".");
  const parsed = (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"))) * (String(value).startsWith("-") ? BigInt(-1) : BigInt(1));
  const result = Number(parsed);
  return Number.isSafeInteger(result) ? result : null;
}

function formatCents(value: number) {
  const absolute = BigInt(Math.abs(value));
  const whole = absolute / BigInt(100);
  const formatted = euro.formatToParts(value < 0 ? (whole === BigInt(0) ? -0 : -whole) : whole);
  return formatted.map((part) => part.type === "fraction" ? String(absolute % BigInt(100)).padStart(2, "0") : part.value).join("");
}

function parseSalesResult(value: unknown, restaurantId: string, from: string, to: string) {
  if (!value || typeof value !== "object") throw new Error("No se pudo interpretar la consulta de ventas QR.");
  const result = value as { rows?: Sale[]; snapshot?: string; has_more?: boolean };
  if (!Array.isArray(result.rows) || typeof result.snapshot !== "string" || !Number.isFinite(Date.parse(result.snapshot)) || typeof result.has_more !== "boolean") throw new Error("La consulta de ventas QR no está completa.");
  if (result.has_more || result.rows.length > MAX_ROWS) throw new Error("La consulta supera las 30.000 filas. No se muestran totales parciales; solicita una consulta de un periodo menor.");
  const ids = new Set<string>();
  let income = 0;
  let cost = 0;
  let margin = 0;
  let pending = 0;
  for (const row of result.rows) {
    if (!row || row.restaurante_id !== restaurantId || typeof row.id !== "string" || ids.has(row.id) || typeof row.nombre_producto !== "string" || typeof row.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.fecha) || row.fecha < from || row.fecha >= to || !Number.isSafeInteger(row.cantidad) || row.cantidad <= 0 || !Object.hasOwn(costLabels, row.estado_coste)) throw new Error("Hay filas de ventas QR que no se pudieron verificar. No se muestran totales incompletos.");
    ids.add(row.id);
    const rowIncome = cents(row.ingreso_total);
    const rowCost = cents(row.coste_total);
    const rowMargin = cents(row.beneficio_total);
    if (rowIncome === null || rowIncome < 0 || (row.coste_total !== null && (rowCost === null || rowCost < 0)) || (row.beneficio_total !== null && rowMargin === null)) throw new Error("Hay importes que no se pueden representar con precisión. No se muestran totales aproximados.");
    income += rowIncome;
    if (row.estado_coste !== "calculado" || rowCost === null || rowMargin === null) pending += 1;
    else { cost += rowCost; margin += rowMargin; }
    if (![income, cost, margin].every(Number.isSafeInteger)) throw new Error("Los importes superan el rango de cálculo exacto. No se muestran totales aproximados.");
  }
  const rows = [...result.rows].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.id.localeCompare(b.id));
  return { rows, snapshot: result.snapshot, income, cost: pending ? null : cost, margin: pending ? null : margin, pending };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo consultar la información. Vuelve a intentarlo.";
}

// Keyset pagination also works when the server returns fewer than PAGE_SIZE rows.
// Never present a capped subset as a complete monthly total.
async function readAll<T>(table: string, columns: string, restaurantId: string, signal: AbortSignal, cursorColumn = "id"): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = supabase.from(table).select(columns).eq("restaurante_id", restaurantId).order(cursorColumn, { ascending: true }).limit(PAGE_SIZE).abortSignal(signal);
    if (cursor) query = query.gt(cursorColumn, cursor);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const page = result.data as unknown as Array<T & Record<string, unknown>>;
    if (!page?.length) return rows;
    if (rows.length + page.length > MAX_ROWS) throw new Error("La consulta supera las 30.000 filas. No se muestran totales parciales; solicita una consulta de un periodo menor.");
    if (page.some((row) => row.restaurante_id !== restaurantId)) throw new Error("La consulta no corresponde al restaurante seleccionado.");
    const nextCursor = page[page.length - 1][cursorColumn];
    if (typeof nextCursor !== "string" || nextCursor === cursor) throw new Error("No se pudo completar la consulta. Actualiza para intentarlo de nuevo.");
    rows.push(...page);
    cursor = nextCursor;
  }
}

type Props = { restaurantId: string | null; showConfiguration?: boolean };

export default function QrProfitability({ restaurantId, showConfiguration = false }: Props) {
  if (!restaurantId) return null;
  // Reset selections and in-flight UI feedback immediately on restaurant changes.
  return <RestaurantQrProfitability key={restaurantId} restaurantId={restaurantId} showConfiguration={showConfiguration} />;
}

function RestaurantQrProfitability({ restaurantId, showConfiguration }: { restaurantId: string; showConfiguration: boolean }) {
  const { dark } = useTheme();
  const [month, setMonth] = useState(monthInMadrid);
  const card = `rounded-3xl border p-5 shadow-sm ${dark ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-950"}`;
  const muted = dark ? "text-slate-400" : "text-slate-600";
  const input = `rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-900"}`;
  return (
    <section className={card} aria-label="Ventas QR y costes de receta">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Ventas QR y costes de receta</h2>
          <p className={`mt-1 max-w-3xl text-sm ${muted}`}>Cuentas QR cerradas, separadas de los registros manuales. Los importes incluyen los descuentos y excluyen las propinas.</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Mes de los cierres
          <input type="month" value={month} min="2000-01" max="2100-12" onChange={(event) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value); }} className={input} />
        </label>
      </div>
      {showConfiguration ? <QrConfiguration restaurantId={restaurantId} dark={dark} /> : <Link href="/dashboard/rentabilidad/ventas#conexion-qr" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">Configurar conexión y platos de la carta QR</Link>}
      <QrSales key={month} restaurantId={restaurantId} month={month} dark={dark} />
    </section>
  );
}

function QrConfiguration({ restaurantId, dark }: { restaurantId: string; dark: boolean }) {
  const [productId, setProductId] = useState("");
  const [selectedDish, setSelectedDish] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["qr-profitability", "configuration", restaurantId],
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const [config, products, dishes, mappings] = await Promise.all([
        supabase.from("qr_rentabilidad_config").select("restaurante_id,activa").eq("restaurante_id", restaurantId).abortSignal(signal).maybeSingle(),
        readAll<Product>("carta_productos", "id,nombre,restaurante_id", restaurantId, signal),
        readAll<Dish>("platos", "id,nombre,restaurante_id,activo", restaurantId, signal),
        readAll<Mapping>("qr_producto_plato", "restaurante_id,producto_id,plato_id", restaurantId, signal, "producto_id"),
      ]);
      if (config.error) throw new Error(config.error.message);
      if (config.data && config.data.restaurante_id !== restaurantId) throw new Error("La configuración no corresponde al restaurante seleccionado.");
      return { active: config.data?.activa === true, products: products.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), dishes: dishes.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), mappings };
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async (action: { type: "activate"; active: boolean } | { type: "map"; productId: string; dishId: string | null }) => {
      const result = action.type === "activate"
        ? await supabase.rpc("configurar_rentabilidad_qr", { p_restaurante_id: restaurantId, p_activa: action.active })
        : await supabase.rpc("vincular_producto_qr_plato", { p_producto_id: action.productId, p_plato_id: action.dishId });
      if (result.error) throw new Error(result.error.message);
      let confirmed;
      try {
        confirmed = await query.refetch({ throwOnError: true });
      } catch {
        throw new Error("Se envió el cambio, pero no se pudo comprobar el resultado. Actualiza antes de volver a guardarlo.");
      }
      const matches = action.type === "activate"
        ? confirmed.data?.active === action.active
        : (confirmed.data?.mappings.find((mapping) => mapping.producto_id === action.productId)?.plato_id ?? null) === action.dishId;
      if (!matches) throw new Error("La configuración actual no coincide con el cambio enviado. Revisa los valores antes de continuar.");
      return action.type;
    },
    onSuccess: () => setSelectedDish(null),
  });
  const data = !query.isError ? query.data : undefined;
  const currentDish = data?.mappings.find((row) => row.producto_id === productId)?.plato_id ?? "";
  const dishId = selectedDish ?? currentDish;
  const busy = mutation.isPending || query.isFetching;
  const input = `w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60 ${dark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-900"}`;
  const button = `rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${dark ? "border-slate-700 bg-slate-950" : "border-slate-300 bg-white"}`;
  return (
    <div id="conexion-qr" className={`mt-5 rounded-2xl border p-4 ${dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
      <h3 className="font-semibold">Conectar los próximos cierres QR</h3>
      <p className="mt-1 text-sm">Está desactivado al empezar. La activación y los vínculos se aplican a los cierres posteriores; no importan ni recalculan ventas anteriores.</p>
      {query.isPending || query.isFetching ? <p role="status" className="mt-3 text-sm">Comprobando configuración y carta…</p> : null}
      {query.isError ? <div role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300"><p>No se pudo cargar la conexión: {errorText(query.error)}</p><button type="button" onClick={() => { mutation.reset(); void query.refetch(); }} className={`${button} mt-2`}>Volver a consultar</button></div> : null}
      {data && !query.isFetching ? (
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={data.active} disabled={busy} onChange={(event) => mutation.mutate({ type: "activate", active: event.target.checked })} className="h-4 w-4" />
            Registrar automáticamente los nuevos cierres QR
          </label>
          {!data.active ? <p className="text-sm">Conexión desactivada. Las ventas QR ya guardadas siguen disponibles.</p> : null}
          <p className="text-sm">Vincula cada producto con su plato y su receta para guardar el coste al cerrar la cuenta. Sin receta completa, el coste queda pendiente.</p>
          <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1 text-sm font-medium"><span>Producto de carta QR</span><select value={productId} disabled={busy} onChange={(event) => { setProductId(event.target.value); setSelectedDish(null); mutation.reset(); }} className={input}><option value="">Selecciona un producto</option>{data.products.map((product) => <option key={product.id} value={product.id}>{product.nombre} · {product.id.slice(0, 8)}</option>)}</select></label>
            <label className="space-y-1 text-sm font-medium"><span>Plato con receta</span><select value={dishId} disabled={busy || !productId} onChange={(event) => { setSelectedDish(event.target.value); mutation.reset(); }} className={input}><option value="">Sin vincular</option>{data.dishes.filter((dish) => dish.activo || dish.id === currentDish).map((dish) => <option key={dish.id} value={dish.id} disabled={!dish.activo}>{dish.nombre}{!dish.activo ? " (inactivo)" : ""} · {dish.id.slice(0, 8)}</option>)}</select></label>
            <button type="button" disabled={busy || !productId || dishId === currentDish || !data.products.some((product) => product.id === productId)} onClick={() => mutation.mutate({ type: "map", productId, dishId: dishId || null })} className={button}>{dishId ? "Guardar vínculo" : "Quitar vínculo"}</button>
          </div>
          <p className="text-xs">{data.mappings.length} vínculos guardados · {data.products.length} productos. Los menús se registran con el coste pendiente.</p>
        </div>
      ) : null}
      {mutation.isError ? <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-300">{errorText(mutation.error)}</p> : null}
      {mutation.isSuccess ? <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{mutation.data === "activate" ? "Configuración guardada y comprobada." : "Vínculo guardado y comprobado."}</p> : null}
    </div>
  );
}

function QrSales({ restaurantId, month, dark }: { restaurantId: string; month: string; dark: boolean }) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["qr-profitability", "sales", restaurantId, month],
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const { from, to } = monthBounds(month);
      const result = await supabase.rpc("consultar_ventas_qr", { p_restaurante_id: restaurantId, p_desde: from, p_hasta: to }).abortSignal(signal);
      if (result.error) throw new Error(result.error.message);
      return parseSalesResult(result.data, restaurantId, from, to);
    },
  });
  const rows = query.data?.rows ?? [];
  const { pending = 0, income = 0, cost = null, margin = null } = query.data ?? {};
  const pageCount = Math.max(1, Math.ceil(rows.length / DISPLAY_ROWS));
  const currentPage = Math.min(page, pageCount - 1);
  const button = `inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${dark ? "border-slate-700" : "border-slate-300"}`;
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Cierres QR del mes seleccionado</h3><button type="button" disabled={query.isFetching} onClick={() => { setPage(0); void query.refetch(); }} className={button}><RefreshCw size={15} className={query.isFetching ? "animate-spin" : ""} />Actualizar ventas QR</button></div>
      {query.isPending || query.isFetching ? <p role="status" className="mt-4 text-sm">Consultando todos los cierres QR del mes…</p> : query.isError ? <p role="alert" className="mt-4 text-sm text-rose-600 dark:text-rose-300">No se pudieron cargar las ventas QR: {errorText(query.error)}</p> : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[{ label: "Ingresos QR", value: formatCents(income) }, { label: "Coste de recetas QR", value: cost === null ? "Pendiente" : formatCents(cost) }, { label: "Margen sobre recetas QR", value: margin === null ? "Pendiente" : formatCents(margin) }, { label: "Líneas sin coste completo", value: String(pending) }].map((item) => <div key={item.label} className={`rounded-2xl p-4 ${dark ? "bg-slate-950" : "bg-slate-50"}`}><p className="text-sm">{item.label}</p><p className="mt-1 text-2xl font-bold">{item.value}</p></div>)}
          </div>
          <p className="mt-3 text-sm">El margen compara los importes guardados con el coste de las recetas; no es el beneficio neto ni un cálculo fiscal. Si falta algún coste, el total de costes y el margen quedan pendientes.</p>
          <p className={`mt-1 text-xs ${dark ? "text-slate-400" : "text-slate-600"}`}>Captura de {query.data ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(new Date(query.data.snapshot)) : ""} · {rows.length} líneas del mes consultadas · Las ventas anteriores a la activación no se importan.</p>
          {rows.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed p-4 text-sm">No hay ventas QR registradas para este mes.</p> : (
            <>
              <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><caption className="sr-only">Detalle de ventas QR. Registros de solo lectura.</caption><thead><tr className="border-b border-slate-300 dark:border-slate-700"><th scope="col" className="p-2">Fecha y producto</th><th scope="col" className="p-2">Unidades</th><th scope="col" className="p-2">Ingreso</th><th scope="col" className="p-2">Coste</th><th scope="col" className="p-2">Estado</th></tr></thead><tbody>{rows.slice(currentPage * DISPLAY_ROWS, (currentPage + 1) * DISPLAY_ROWS).map((row) => <tr key={row.id} className="border-b border-slate-200 dark:border-slate-800"><td className="p-2"><span className="block text-xs">{row.fecha.split("-").reverse().join("/")}</span>{row.nombre_producto}</td><td className="p-2">{row.cantidad}</td><td className="p-2">{formatCents(cents(row.ingreso_total)!)}</td><td className="p-2">{row.estado_coste === "calculado" && cents(row.coste_total) !== null ? formatCents(cents(row.coste_total)!) : "Pendiente"}</td><td className="p-2">{row.estado_coste === "calculado" && (cents(row.coste_total) === null || cents(row.beneficio_total) === null) ? "Costes incompletos" : costLabels[row.estado_coste]}</td></tr>)}</tbody></table></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><p>Solo lectura · Página {currentPage + 1} de {pageCount}</p><div className="flex gap-2"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className={button}>Anterior</button><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className={button}>Siguiente</button></div></div>
            </>
          )}
        </>
      )}
    </div>
  );
}
