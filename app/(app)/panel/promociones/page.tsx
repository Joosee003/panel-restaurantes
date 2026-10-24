"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRestaurante } from "../../../hooks/useRestaurante";
import { supabase } from "../../lib/supabaseClient";
import styles from "./promociones.module.css";

type Placement = "universitarios" | "partidas" | "estacion";
type Model = "precio_especial" | "porcentaje" | "descuento_fijo" | "grupos" | "dos_por_uno" | "pack" | "evento";
type Status = "borrador" | "programada" | "activa" | "pausada" | "finalizada";
type Target = "carta" | "visitanos" | "contacto";
type Promotion = {
  id: string; restaurante_id: string; ubicacion: Placement; tipo: Model; titulo: string; descripcion: string;
  publico: string; producto_ids: string[]; productos_texto: string; precio: number | null;
  descuento_porcentaje: number | null; descuento_eur: number | null; personas_minimas: number | null;
  imagen_url: string | null; dias_semana: number[]; hora_inicio: string | null; hora_fin: string | null;
  fecha_inicio: string | null; fecha_fin: string | null; condiciones: string; cta_texto: string;
  cta_destino: Target; estado: Status; orden: number;
};
type Product = { id: string; nombre: string; imagen_url: string | null };
type Photo = { src: string; small?: string; alt: string; caption?: string };
type Draft = Omit<Promotion, "id" | "restaurante_id" | "precio" | "descuento_porcentaje" | "descuento_eur" | "personas_minimas"> & {
  id?: string; precio: string; descuento_porcentaje: string; descuento_eur: string; personas_minimas: string;
};

const placements: Array<{ value: Placement; label: string }> = [
  { value: "universitarios", label: "Universitarios" }, { value: "partidas", label: "Tardes de partidas" },
  { value: "estacion", label: "Estación convencional" },
];
const models: Array<{ value: Model; label: string }> = [
  { value: "precio_especial", label: "Precio especial" }, { value: "porcentaje", label: "Descuento porcentual" },
  { value: "descuento_fijo", label: "Descuento fijo" }, { value: "grupos", label: "Promoción para grupos" },
  { value: "dos_por_uno", label: "2 × 1" }, { value: "pack", label: "Pack personalizado" },
  { value: "evento", label: "Evento o actividad" },
];
const weekdays = ["L", "M", "X", "J", "V", "S", "D"];
const blank = (): Draft => ({
  ubicacion: "universitarios", tipo: "evento", titulo: "", descripcion: "", publico: "", producto_ids: [],
  productos_texto: "", precio: "", descuento_porcentaje: "", descuento_eur: "", personas_minimas: "",
  imagen_url: null, dias_semana: [], hora_inicio: null, hora_fin: null, fecha_inicio: null, fecha_fin: null,
  condiciones: "", cta_texto: "Ver carta", cta_destino: "carta", estado: "borrador", orden: 0,
});
const numeric = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."));
const euro = (value: number | null) => value === null ? "" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "No se pudo guardar la promoción.";
function offerText(draft: Draft) {
  if (["precio_especial", "pack"].includes(draft.tipo) && numeric(draft.precio)) return euro(numeric(draft.precio));
  if (draft.tipo === "porcentaje" && numeric(draft.descuento_porcentaje)) return `−${draft.descuento_porcentaje} %`;
  if (draft.tipo === "descuento_fijo" && numeric(draft.descuento_eur)) return `−${euro(numeric(draft.descuento_eur))}`;
  if (draft.tipo === "grupos" && numeric(draft.personas_minimas)) return `Desde ${draft.personas_minimas} personas`;
  if (draft.tipo === "dos_por_uno") return "2 × 1";
  return "";
}

function draftFrom(row: Promotion): Draft {
  return { ...row, precio: row.precio?.toString() ?? "", descuento_porcentaje: row.descuento_porcentaje?.toString() ?? "",
    descuento_eur: row.descuento_eur?.toString() ?? "", personas_minimas: row.personas_minimas?.toString() ?? "" };
}

function validation(draft: Draft, status: Status) {
  if (draft.titulo.trim().length < 3) return "Escribe un título de al menos tres caracteres.";
  if (["precio_especial", "pack"].includes(draft.tipo) && !(numeric(draft.precio)! > 0)) return "Indica el precio confirmado de la oferta.";
  if (draft.tipo === "porcentaje" && !(numeric(draft.descuento_porcentaje)! > 0 && numeric(draft.descuento_porcentaje)! <= 100)) return "Indica un porcentaje entre 0 y 100.";
  if (draft.tipo === "descuento_fijo" && !(numeric(draft.descuento_eur)! > 0)) return "Indica el importe confirmado del descuento.";
  if (draft.tipo === "grupos" && !(Number.isInteger(numeric(draft.personas_minimas)) && numeric(draft.personas_minimas)! >= 2)) return "Indica al menos dos personas para grupos.";
  if (draft.precio.trim() && !(numeric(draft.precio)! > 0)) return "El precio debe ser mayor que cero.";
  if ((draft.hora_inicio && !draft.hora_fin) || (!draft.hora_inicio && draft.hora_fin) || (draft.hora_inicio && draft.hora_fin && draft.hora_fin <= draft.hora_inicio)) return "Indica una franja horaria completa dentro del mismo día.";
  if (draft.fecha_inicio && draft.fecha_fin && draft.fecha_fin < draft.fecha_inicio) return "La fecha final debe ser posterior al inicio.";
  if (status === "programada" && !draft.fecha_inicio) return "Una promoción programada necesita fecha de inicio.";
  if (["activa", "programada"].includes(status) && (!draft.descripcion.trim() || !draft.imagen_url)) return "Para publicar, añade descripción y fotografía autorizada.";
  return null;
}

export default function PromocionesPage() {
  const { data: restaurant, isLoading: loadingRestaurant } = useRestaurante();
  const restaurantId = restaurant?.id;
  const isNewTalgo = restaurantId === process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID;
  const [rows, setRows] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [publicIds, setPublicIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [promos, items, published] = await Promise.all([
      supabase.from("promociones").select("*").eq("restaurante_id", restaurantId).order("creado_en", { ascending: false }),
      supabase.from("carta_productos").select("id,nombre,imagen_url").eq("restaurante_id", restaurantId).order("nombre"),
      supabase.rpc("obtener_promociones_publicas", { p_restaurante_id: restaurantId }),
    ]);
    setLoading(false);
    if (promos.error) { setError(errorText(promos.error)); return; }
    setRows((promos.data || []) as Promotion[]);
    setProducts((items.data || []) as Product[]);
    setPublicIds(new Set(Array.isArray(published.data) ? published.data.map((item: { id: string }) => item.id) : []));
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [restaurantId, load]);

  useEffect(() => {
    if (!isNewTalgo) return;
    const read = () => {
      const source = (window as Window & { NEW_TALGO_CONTENT?: { photos?: Record<string, Photo | null> } }).NEW_TALGO_CONTENT;
      const unique = new Map<string, Photo>();
      Object.values(source?.photos || {}).forEach(photo => { if (photo?.src && !unique.has(photo.src)) unique.set(photo.src, photo); });
      setPhotos([...unique.values()]);
    };
    if ((window as Window & { NEW_TALGO_CONTENT?: unknown }).NEW_TALGO_CONTENT) { read(); return; }
    const script = document.createElement("script");
    script.src = "/new-talgo/content.js";
    script.onload = read;
    document.head.append(script);
    return () => { script.remove(); };
  }, [isNewTalgo]);

  const counts = useMemo(() => Object.fromEntries(placements.map(({ value }) => [value, rows.filter(row => row.ubicacion === value).length])), [rows]);
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => current ? { ...current, [key]: value } : current);
  const startNew = () => { setDraft(blank()); setPreview(false); setError(""); setMessage(""); };
  const startEdit = (row: Promotion) => { setDraft(draftFrom(row)); setPreview(false); setError(""); setMessage(""); };
  const duplicate = (row: Promotion) => { const copy = draftFrom(row); delete copy.id; setDraft({ ...copy, titulo: `${copy.titulo} (copia)`.slice(0, 90), estado: "borrador" }); setPreview(false); setError(""); };

  async function save(nextStatus = draft?.estado || "borrador") {
    if (!draft || !restaurantId) return;
    const problem = validation(draft, nextStatus);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(""); setMessage("");
    const selectedNames = products.filter(item => draft.producto_ids.includes(item.id)).map(item => item.nombre).join(" · ");
    const payload = {
      restaurante_id: restaurantId, ubicacion: draft.ubicacion, tipo: draft.tipo, titulo: draft.titulo.trim(),
      descripcion: draft.descripcion.trim(), publico: draft.publico.trim(), producto_ids: draft.producto_ids,
      productos_texto: selectedNames, precio: ["precio_especial", "pack"].includes(draft.tipo) ? numeric(draft.precio) : draft.tipo === "grupos" ? numeric(draft.precio) : null,
      descuento_porcentaje: draft.tipo === "porcentaje" ? numeric(draft.descuento_porcentaje) : null,
      descuento_eur: draft.tipo === "descuento_fijo" ? numeric(draft.descuento_eur) : null,
      personas_minimas: draft.tipo === "grupos" ? numeric(draft.personas_minimas) : null,
      imagen_url: draft.imagen_url, dias_semana: draft.dias_semana, hora_inicio: draft.hora_inicio || null,
      hora_fin: draft.hora_fin || null, fecha_inicio: draft.fecha_inicio || null, fecha_fin: draft.fecha_fin || null,
      condiciones: draft.condiciones.trim(), cta_texto: draft.cta_texto.trim() || "Ver carta",
      cta_destino: draft.cta_destino, estado: nextStatus, orden: draft.orden,
    };
    const result = draft.id
      ? await supabase.from("promociones").update(payload).eq("id", draft.id).eq("restaurante_id", restaurantId).select("*").single()
      : await supabase.from("promociones").insert(payload).select("*").single();
    setBusy(false);
    if (result.error) { setError(errorText(result.error)); return; }
    setDraft(draftFrom(result.data as Promotion));
    setMessage("Promoción guardada. La web solo muestra ofertas activas en su horario válido.");
    await load();
  }

  async function setStatus(row: Promotion, state: Status) {
    if (!restaurantId) return;
    const problem = validation(draftFrom(row), state);
    if (problem) { startEdit(row); setError(problem); return; }
    setBusy(true); setError("");
    const result = await supabase.from("promociones").update({ estado: state }).eq("id", row.id).eq("restaurante_id", restaurantId).select("id").single();
    setBusy(false);
    if (result.error) { setError(errorText(result.error)); return; }
    setDraft(current => current?.id === row.id ? { ...current, estado: state } : current);
    setMessage(state === "activa" ? "Promoción activada según sus fechas y horarios." : "Promoción retirada de la web.");
    await load();
  }

  async function upload(file: File | undefined) {
    if (!file || !draft?.id || !restaurantId) { setError("Guarda primero el borrador antes de subir una foto."); return; }
    const extension = file.type === "image/webp" ? "webp" : file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : null;
    if (!extension || file.size > 5_000_000) { setError("Elige una imagen WebP, JPEG o PNG de menos de 5 MB."); return; }
    setBusy(true); setError("");
    const path = `productos/${restaurantId}/promo-${draft.id}-${Date.now()}.${extension}`;
    const result = await supabase.storage.from("menus").upload(path, file, { contentType: file.type, upsert: false });
    if (result.error) { setBusy(false); setError(errorText(result.error)); return; }
    const photoUrl = supabase.storage.from("menus").getPublicUrl(path).data.publicUrl;
    const saved = await supabase.from("promociones").update({ imagen_url: photoUrl }).eq("id", draft.id).eq("restaurante_id", restaurantId).select("id").single();
    setBusy(false);
    if (saved.error) { await supabase.storage.from("menus").remove([path]); setError(errorText(saved.error)); return; }
    let oldPath: string | undefined;
    try { oldPath = draft.imagen_url ? decodeURIComponent(new URL(draft.imagen_url, window.location.origin).pathname).split("/storage/v1/object/public/menus/")[1] : undefined; } catch { /* Old photo is not a managed Storage URL. */ }
    if (oldPath?.startsWith(`productos/${restaurantId}/promo-${draft.id}-`)) {
      const { count } = await supabase.from("promociones").select("id", { count: "exact", head: true }).eq("restaurante_id", restaurantId).eq("imagen_url", draft.imagen_url);
      if (count === 0) await supabase.storage.from("menus").remove([oldPath]);
    }
    setDraft(current => current ? { ...current, imagen_url: photoUrl } : current);
    setMessage("Fotografía asociada a la promoción.");
    await load();
  }

  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>GASTROHELP · CAMPAÑAS</span><h1>Promociones.</h1><p>Controla lo que aparece en la web. Cada nueva oferta empieza como borrador.</p></div><button className={styles.primary} onClick={startNew}>Nueva promoción</button></header>
    <div className={styles.summary}>{placements.map(item => <div key={item.value}><span>{item.label}</span><strong>{counts[item.value] || 0}</strong></div>)}</div>
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.success} role="status">{message}</p>}
    {loadingRestaurant || loading ? <p role="status">Cargando promociones…</p> : rows.length === 0 && !draft ? <div className={styles.empty}><h2>Aún no hay promociones.</h2><p>Las tres ubicaciones permanecen sin ofertas públicas hasta que crees y actives una.</p><button className={styles.primary} onClick={startNew}>Crear el primer borrador</button></div> : null}
    {rows.length > 0 && <div className={styles.list} aria-label="Promociones existentes">{rows.map(row => <article className={styles.listCard} key={row.id}>
      {row.imagen_url ? <Image src={row.imagen_url} alt="" width={150} height={110} unoptimized className={styles.listPhoto} /> : <div className={styles.listPhotoEmpty} aria-hidden="true">NT.</div>}
      <div className={styles.listCopy}><span>{placements.find(item => item.value === row.ubicacion)?.label} · {models.find(item => item.value === row.tipo)?.label}</span><h2>{row.titulo}</h2><p>{publicIds.has(row.id) ? "Publicada ahora" : row.estado === "borrador" ? "Borrador · no visible" : `${row.estado} · fuera de la web ahora`}</p></div>
      <div className={styles.listActions}><button onClick={() => startEdit(row)}>Editar</button><button onClick={() => duplicate(row)}>Duplicar</button><button disabled={busy} onClick={() => void setStatus(row, row.estado === "activa" || row.estado === "programada" ? "pausada" : "activa")}>{row.estado === "activa" || row.estado === "programada" ? "Pausar" : "Activar"}</button></div>
    </article>)}</div>}
    {draft && <section className={styles.editor} aria-labelledby="promo-editor-title"><div className={styles.editorHead}><div><span className={styles.eyebrow}>{draft.id ? "EDITAR PROMOCIÓN" : "NUEVO BORRADOR"}</span><h2 id="promo-editor-title">{draft.id ? draft.titulo : "Define tu propuesta"}</h2></div><button className={styles.quiet} onClick={() => { setDraft(null); setPreview(false); }}>Cerrar</button></div>
      <div className={styles.fields}>
        <label>Ubicación en la web<select value={draft.ubicacion} onChange={event => change("ubicacion", event.target.value as Placement)}>{placements.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label>Modelo de promoción<select value={draft.tipo} onChange={event => change("tipo", event.target.value as Model)}>{models.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className={styles.wide}>Título<input maxLength={90} value={draft.titulo} onChange={event => change("titulo", event.target.value)} placeholder="Nombre que decidirá el restaurante" /></label>
        <label className={styles.wide}>Descripción<textarea maxLength={700} value={draft.descripcion} onChange={event => change("descripcion", event.target.value)} placeholder="Qué incluye y para quién es" rows={3} /></label>
        <label>Público al que se dirige<input maxLength={120} value={draft.publico} onChange={event => change("publico", event.target.value)} placeholder="Opcional" /></label>
        <label>Estado<select value={draft.estado} onChange={event => change("estado", event.target.value as Status)}><option value="borrador">Borrador</option><option value="programada">Programada</option><option value="activa">Activa</option><option value="pausada">Pausada</option><option value="finalizada">Finalizada</option></select></label>
        {(["precio_especial", "pack", "grupos"] as Model[]).includes(draft.tipo) && <label>Precio confirmado (€)<input inputMode="decimal" value={draft.precio} onChange={event => change("precio", event.target.value)} placeholder={draft.tipo === "grupos" ? "Opcional" : "Obligatorio"} /></label>}
        {draft.tipo === "porcentaje" && <label>Descuento (%)<input inputMode="decimal" value={draft.descuento_porcentaje} onChange={event => change("descuento_porcentaje", event.target.value)} placeholder="Obligatorio" /></label>}
        {draft.tipo === "descuento_fijo" && <label>Descuento (€)<input inputMode="decimal" value={draft.descuento_eur} onChange={event => change("descuento_eur", event.target.value)} placeholder="Obligatorio" /></label>}
        {draft.tipo === "grupos" && <label>Personas mínimas<input type="number" min={2} value={draft.personas_minimas} onChange={event => change("personas_minimas", event.target.value)} /></label>}
        <fieldset className={styles.wide}><legend>Productos incluidos</legend>{products.length ? <div className={styles.products}>{products.map(item => <label key={item.id}><input type="checkbox" checked={draft.producto_ids.includes(item.id)} onChange={event => change("producto_ids", event.target.checked ? [...draft.producto_ids, item.id] : draft.producto_ids.filter(id => id !== item.id))} />{item.nombre}</label>)}</div> : <span className={styles.hint}>La carta aún no tiene productos; puedes crear la promoción sin asociarlos.</span>}</fieldset>
        <fieldset className={styles.wide}><legend>Días de validez · ninguno significa todos</legend><div className={styles.days}>{weekdays.map((label, index) => <label key={label}><input type="checkbox" checked={draft.dias_semana.includes(index + 1)} onChange={event => change("dias_semana", event.target.checked ? [...draft.dias_semana, index + 1].sort() : draft.dias_semana.filter(day => day !== index + 1))} /><span>{label}</span></label>)}</div></fieldset>
        <label>Fecha de inicio<input type="date" value={draft.fecha_inicio || ""} onChange={event => change("fecha_inicio", event.target.value || null)} /></label>
        <label>Fecha final<input type="date" value={draft.fecha_fin || ""} onChange={event => change("fecha_fin", event.target.value || null)} /></label>
        <label>Desde las<input type="time" value={draft.hora_inicio || ""} onChange={event => change("hora_inicio", event.target.value || null)} /></label>
        <label>Hasta las<input type="time" value={draft.hora_fin || ""} onChange={event => change("hora_fin", event.target.value || null)} /></label>
        <label className={styles.wide}>Condiciones breves<textarea maxLength={500} value={draft.condiciones} onChange={event => change("condiciones", event.target.value)} rows={2} placeholder="Restricciones confirmadas por el restaurante" /></label>
        <label>Texto del botón<input maxLength={45} value={draft.cta_texto} onChange={event => change("cta_texto", event.target.value)} /></label>
        <label>Destino del botón<select value={draft.cta_destino} onChange={event => change("cta_destino", event.target.value as Target)}><option value="carta">La carta</option><option value="visitanos">Cómo llegar</option><option value="contacto">Contacto confirmado</option></select></label>
      </div>
      <div className={styles.photoArea}><div><h3>Fotografía</h3><p>Selecciona una imagen del restaurante o súbela al almacenamiento original de GastroHelp.</p></div>{draft.imagen_url && <Image src={draft.imagen_url} alt="Vista previa de la promoción" width={180} height={140} unoptimized className={styles.chosenPhoto} />}
        {isNewTalgo && photos.length > 0 && <div className={styles.photoPicker} aria-label="Fotografías reales de New Talgo">{photos.map(photo => { const url = `/new-talgo/${photo.small || photo.src}`; return <button type="button" key={photo.src} className={draft.imagen_url === `/new-talgo/${photo.src}` ? styles.photoSelected : ""} onClick={() => change("imagen_url", `/new-talgo/${photo.src}`)} aria-label={`Elegir ${photo.alt}`}><Image src={url} alt="" width={84} height={84} unoptimized /></button>; })}</div>}
        <label className={styles.upload}>Subir una foto propia<input type="file" accept="image/webp,image/jpeg,image/png" onChange={event => void upload(event.target.files?.[0])} /></label><p className={styles.hint}>Guarda el borrador antes de subir la foto. Las fotografías facilitadas por Ángel están autorizadas.</p>
      </div>
      <div className={styles.editorActions}><button className={styles.primary} disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : draft.estado === "activa" ? "Guardar y activar" : draft.estado === "programada" ? "Guardar programación" : draft.id ? "Guardar cambios" : "Guardar borrador"}</button><button className={styles.quiet} onClick={() => setPreview(value => !value)}>Previsualizar</button>{draft.id && draft.estado === "borrador" && <button className={styles.quiet} disabled={busy} onClick={() => void save("activa")}>Activar</button>}{draft.id && ["activa", "programada"].includes(draft.estado) && <button className={styles.quiet} disabled={busy} onClick={() => void save("pausada")}>Pausar</button>}</div>
      {preview && <div className={styles.preview} aria-label="Vista previa privada de la promoción"><span>VISTA PREVIA · NO PUBLICADA POR ESTE BOTÓN</span>{draft.imagen_url && <Image src={draft.imagen_url} alt="Fotografía seleccionada" width={360} height={200} unoptimized />}<h3>{draft.titulo || "Título pendiente"}</h3><p>{draft.descripcion || "Descripción pendiente"}</p>{offerText(draft) && <strong>{offerText(draft)}</strong>}<small>{draft.condiciones}</small></div>}
    </section>}
  </div>;
}
