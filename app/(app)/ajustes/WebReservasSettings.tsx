"use client";

import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Globe2,
  ImagePlus,
  Loader2,
  Palette,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type WebConfig = {
  slug: string;
  publicada: boolean;
  nombre_publico: string;
  antetitulo: string;
  titular: string;
  subtitulo: string;
  descripcion: string;
  direccion_publica: string;
  telefono_publico: string;
  email_publico: string;
  whatsapp: string;
  google_maps_url: string;
  instagram_url: string;
  facebook_url: string;
  logo_url: string;
  hero_image_url: string;
  galeria_urls: string;
  especialidades: string;
  color_primario: string;
  color_acento: string;
  color_fondo: string;
  seo_titulo: string;
  seo_descripcion: string;
};

type BookingConfig = {
  activo: boolean;
  zona_horaria: string;
  intervalo_minutos: number;
  duracion_minutos: number;
  capacidad_por_turno: number;
  personas_minimas: number;
  personas_maximas: number;
  antelacion_minutos: number;
  dias_maximos_antelacion: number;
  confirmacion_automatica: boolean;
  cancelacion_minutos: number;
  requiere_telefono: boolean;
  requiere_email: boolean;
  aviso_reserva: string;
  politica_cancelacion: string;
};

type ScheduleRow = {
  dia_semana: number;
  turno: string;
  hora_inicio: string;
  hora_fin: string;
  capacidad_override: number | null;
  activo: boolean;
};

type DaySchedule = {
  day: number;
  label: string;
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
  dinnerEnabled: boolean;
  dinnerStart: string;
  dinnerEnd: string;
};

const days = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sábado"],
  [0, "Domingo"],
] as const;

const fieldClass =
  "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

const labelClass =
  "text-[11px] font-black uppercase tracking-[0.15em] text-slate-500";

function defaultDays(): DaySchedule[] {
  return days.map(([day, label]) => ({
    day,
    label,
    lunchEnabled: false,
    lunchStart: "13:00",
    lunchEnd: "16:00",
    dinnerEnabled: false,
    dinnerStart: "20:00",
    dinnerEnd: "23:00",
  }));
}

function timeValue(value: string | null | undefined, fallback: string) {
  return value?.slice(0, 5) || fallback;
}

function splitList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function PanelCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span>
        <span className="block text-sm font-black text-slate-950">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{detail}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only"
        />
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
      </span>
    </label>
  );
}

export default function WebReservasSettings({
  restauranteId,
  restaurantName,
}: {
  restauranteId: string;
  restaurantName: string;
}) {
  const [web, setWeb] = useState<WebConfig>({
    slug: "",
    publicada: false,
    nombre_publico: restaurantName,
    antetitulo: "",
    titular: restaurantName,
    subtitulo: "",
    descripcion: "",
    direccion_publica: "",
    telefono_publico: "",
    email_publico: "",
    whatsapp: "",
    google_maps_url: "",
    instagram_url: "",
    facebook_url: "",
    logo_url: "",
    hero_image_url: "",
    galeria_urls: "",
    especialidades: "",
    color_primario: "#123c3a",
    color_acento: "#e7b75f",
    color_fondo: "#f7f3e8",
    seo_titulo: "",
    seo_descripcion: "",
  });
  const [booking, setBooking] = useState<BookingConfig>({
    activo: false,
    zona_horaria: "Europe/Madrid",
    intervalo_minutos: 30,
    duracion_minutos: 90,
    capacidad_por_turno: 40,
    personas_minimas: 1,
    personas_maximas: 12,
    antelacion_minutos: 60,
    dias_maximos_antelacion: 60,
    confirmacion_automatica: true,
    cancelacion_minutos: 120,
    requiere_telefono: true,
    requiere_email: false,
    aviso_reserva: "La disponibilidad se comprueba en tiempo real.",
    politica_cancelacion: "",
  });
  const [schedule, setSchedule] = useState<DaySchedule[]>(defaultDays);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const [webResult, configResult, scheduleResult] = await Promise.all([
        supabase
          .from("restaurante_webs")
          .select("*")
          .eq("restaurante_id", restauranteId)
          .maybeSingle(),
        supabase
          .from("reservas_config")
          .select("*")
          .eq("restaurante_id", restauranteId)
          .maybeSingle(),
        supabase
          .from("reservas_horarios")
          .select("dia_semana,turno,hora_inicio,hora_fin,capacidad_override,activo")
          .eq("restaurante_id", restauranteId)
          .order("dia_semana", { ascending: true })
          .order("hora_inicio", { ascending: true }),
      ]);

      if (cancelled) return;

      const firstError = webResult.error || configResult.error || scheduleResult.error;
      if (firstError) {
        console.error("Error cargando web y reservas", firstError);
        setError("Esta sección todavía no está activada en Supabase.");
        setLoading(false);
        return;
      }

      if (webResult.data) {
        const row = webResult.data as Record<string, unknown>;
        setWeb({
          slug: String(row.slug || ""),
          publicada: Boolean(row.publicada),
          nombre_publico: String(row.nombre_publico || restaurantName),
          antetitulo: String(row.antetitulo || ""),
          titular: String(row.titular || ""),
          subtitulo: String(row.subtitulo || ""),
          descripcion: String(row.descripcion || ""),
          direccion_publica: String(row.direccion_publica || ""),
          telefono_publico: String(row.telefono_publico || ""),
          email_publico: String(row.email_publico || ""),
          whatsapp: String(row.whatsapp || ""),
          google_maps_url: String(row.google_maps_url || ""),
          instagram_url: String(row.instagram_url || ""),
          facebook_url: String(row.facebook_url || ""),
          logo_url: String(row.logo_url || ""),
          hero_image_url: String(row.hero_image_url || ""),
          galeria_urls: Array.isArray(row.galeria_urls) ? row.galeria_urls.join("\n") : "",
          especialidades: Array.isArray(row.especialidades) ? row.especialidades.join(", ") : "",
          color_primario: String(row.color_primario || "#123c3a"),
          color_acento: String(row.color_acento || "#e7b75f"),
          color_fondo: String(row.color_fondo || "#f7f3e8"),
          seo_titulo: String(row.seo_titulo || ""),
          seo_descripcion: String(row.seo_descripcion || ""),
        });
      }

      if (configResult.data) {
        const row = configResult.data as Record<string, unknown>;
        setBooking({
          activo: Boolean(row.activo),
          zona_horaria: String(row.zona_horaria || "Europe/Madrid"),
          intervalo_minutos: Number(row.intervalo_minutos || 30),
          duracion_minutos: Number(row.duracion_minutos || 90),
          capacidad_por_turno: Number(row.capacidad_por_turno || 40),
          personas_minimas: Number(row.personas_minimas || 1),
          personas_maximas: Number(row.personas_maximas || 12),
          antelacion_minutos: Number(row.antelacion_minutos || 60),
          dias_maximos_antelacion: Number(row.dias_maximos_antelacion || 60),
          confirmacion_automatica: row.confirmacion_automatica !== false,
          cancelacion_minutos: Number(row.cancelacion_minutos ?? 120),
          requiere_telefono: row.requiere_telefono !== false,
          requiere_email: Boolean(row.requiere_email),
          aviso_reserva: String(row.aviso_reserva || ""),
          politica_cancelacion: String(row.politica_cancelacion || ""),
        });
      }

      const rows = (scheduleResult.data || []) as ScheduleRow[];
      setSchedule(
        defaultDays().map((day) => {
          const lunch = rows.find((row) => row.dia_semana === day.day && row.turno === "comida" && row.activo);
          const dinner = rows.find((row) => row.dia_semana === day.day && row.turno === "cena" && row.activo);
          return {
            ...day,
            lunchEnabled: Boolean(lunch),
            lunchStart: timeValue(lunch?.hora_inicio, day.lunchStart),
            lunchEnd: timeValue(lunch?.hora_fin, day.lunchEnd),
            dinnerEnabled: Boolean(dinner),
            dinnerStart: timeValue(dinner?.hora_inicio, day.dinnerStart),
            dinnerEnd: timeValue(dinner?.hora_fin, day.dinnerEnd),
          };
        }),
      );
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [restauranteId, restaurantName]);

  const activeServices = useMemo(
    () =>
      schedule.reduce(
        (total, day) => total + Number(day.lunchEnabled) + Number(day.dinnerEnabled),
        0,
      ),
    [schedule],
  );

  function updateDay(dayNumber: number, patch: Partial<DaySchedule>) {
    setSchedule((current) =>
      current.map((day) => (day.day === dayNumber ? { ...day, ...patch } : day)),
    );
  }

  async function save() {
    setMessage("");
    setError("");

    if (!web.nombre_publico.trim() || !web.titular.trim()) {
      setError("Completa el nombre público y el titular de la web.");
      return;
    }

    if (booking.personas_maximas < booking.personas_minimas) {
      setError("El máximo de personas no puede ser menor que el mínimo.");
      return;
    }

    if (booking.activo && activeServices === 0) {
      setError("Añade al menos un servicio semanal antes de activar reservas.");
      return;
    }

    const invalidRange = schedule.some(
      (day) =>
        (day.lunchEnabled && day.lunchEnd <= day.lunchStart) ||
        (day.dinnerEnabled && day.dinnerEnd <= day.dinnerStart),
    );
    if (invalidRange) {
      setError("Hay un horario cuya hora de cierre no es posterior a la apertura.");
      return;
    }

    const rows = schedule.flatMap((day) => {
      const values: ScheduleRow[] = [];
      if (day.lunchEnabled) {
        values.push({
          dia_semana: day.day,
          turno: "comida",
          hora_inicio: day.lunchStart,
          hora_fin: day.lunchEnd,
          capacidad_override: null,
          activo: true,
        });
      }
      if (day.dinnerEnabled) {
        values.push({
          dia_semana: day.day,
          turno: "cena",
          hora_inicio: day.dinnerStart,
          hora_fin: day.dinnerEnd,
          capacidad_override: null,
          activo: true,
        });
      }
      return values;
    });

    setSaving(true);
    const { error: saveError } = await supabase.rpc(
      "guardar_configuracion_web_reservas",
      {
        p_restaurante_id: restauranteId,
        p_web: {
          ...web,
          galeria_urls: splitList(web.galeria_urls),
          especialidades: splitList(web.especialidades),
        },
        p_config: booking,
        p_horarios: rows,
      },
    );
    setSaving(false);

    if (saveError) {
      console.error("Error guardando web y reservas", saveError);
      const errorText = /ACTIVE_BOOKING_REQUIRES_SCHEDULE/.test(saveError.message)
        ? "Añade al menos un horario antes de activar reservas."
        : /duplicate key|unique/i.test(saveError.message)
          ? "Esa dirección web ya está ocupada."
          : "No se ha podido guardar. Revisa los campos y vuelve a intentarlo.";
      setError(errorText);
      return;
    }

    setMessage("Web, reservas y horarios guardados correctamente.");
  }

  const previewPath = web.slug ? `/restaurante/${web.slug}` : "";

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center rounded-[28px] border border-slate-200 bg-white">
        <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          Cargando web y reservas...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-300">
              Web pública + reservas nativas
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
              Todo conectado con el panel
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
              La web puede publicarse sin reservas. Las reservas solo se activan cuando el horario está revisado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {previewPath ? (
              <a
                href={previewPath}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15"
              >
                Ver borrador <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || Boolean(error && !web.slug)}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Guardando..." : "Guardar todo"}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/[0.06] p-4">
            <p className="text-xs font-bold text-slate-400">Web</p>
            <p className={`mt-1 text-sm font-black ${web.publicada ? "text-emerald-300" : "text-amber-300"}`}>
              {web.publicada ? "Publicada" : "En borrador"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.06] p-4">
            <p className="text-xs font-bold text-slate-400">Reservas</p>
            <p className={`mt-1 text-sm font-black ${booking.activo ? "text-emerald-300" : "text-slate-300"}`}>
              {booking.activo ? "Activas" : "Desactivadas"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.06] p-4">
            <p className="text-xs font-bold text-slate-400">Servicios semanales</p>
            <p className="mt-1 text-sm font-black text-white">{activeServices}</p>
          </div>
        </div>
      </div>

      {message ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="h-5 w-5" /> {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <PanelCard
          icon={<Globe2 className="h-5 w-5" />}
          title="Contenido principal"
          description="Lo primero que verá una persona al entrar en la web."
        >
          <div className="space-y-4">
            <Toggle
              checked={web.publicada}
              onChange={(value) => setWeb((current) => ({ ...current, publicada: value }))}
              label="Publicar la web"
              detail="Si está apagado, la dirección pública no aparece en Internet."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={labelClass}>Nombre público</span>
                <input className={fieldClass} value={web.nombre_publico} onChange={(event) => setWeb((current) => ({ ...current, nombre_publico: event.target.value }))} />
              </label>
              <label>
                <span className={labelClass}>Texto pequeño superior</span>
                <input className={fieldClass} value={web.antetitulo} onChange={(event) => setWeb((current) => ({ ...current, antetitulo: event.target.value }))} placeholder="El Golfo · Lanzarote" />
              </label>
            </div>
            <label className="block">
              <span className={labelClass}>Titular</span>
              <input className={fieldClass} value={web.titular} onChange={(event) => setWeb((current) => ({ ...current, titular: event.target.value }))} placeholder="El sabor del mar, frente al Atlántico" />
            </label>
            <label className="block">
              <span className={labelClass}>Subtítulo</span>
              <textarea className={fieldClass} rows={3} value={web.subtitulo} onChange={(event) => setWeb((current) => ({ ...current, subtitulo: event.target.value }))} />
            </label>
            <label className="block">
              <span className={labelClass}>Historia / descripción</span>
              <textarea className={fieldClass} rows={5} value={web.descripcion} onChange={(event) => setWeb((current) => ({ ...current, descripcion: event.target.value }))} />
            </label>
            <label className="block">
              <span className={labelClass}>Especialidades, separadas por comas</span>
              <input className={fieldClass} value={web.especialidades} onChange={(event) => setWeb((current) => ({ ...current, especialidades: event.target.value }))} placeholder="Pescado del día, Cocina canaria, Producto local" />
            </label>
          </div>
        </PanelCard>

        <PanelCard
          icon={<ImagePlus className="h-5 w-5" />}
          title="Fotos y contacto"
          description="Las URLs son provisionales; después añadiremos subida directa de imágenes."
        >
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Foto principal</span>
              <input className={fieldClass} value={web.hero_image_url} onChange={(event) => setWeb((current) => ({ ...current, hero_image_url: event.target.value }))} placeholder="https://..." />
            </label>
            <label className="block">
              <span className={labelClass}>Galería, una URL por línea</span>
              <textarea className={fieldClass} rows={4} value={web.galeria_urls} onChange={(event) => setWeb((current) => ({ ...current, galeria_urls: event.target.value }))} placeholder={"https://...\nhttps://..."} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={labelClass}>Dirección</span>
                <input className={fieldClass} value={web.direccion_publica} onChange={(event) => setWeb((current) => ({ ...current, direccion_publica: event.target.value }))} />
              </label>
              <label>
                <span className={labelClass}>Teléfono</span>
                <input className={fieldClass} value={web.telefono_publico} onChange={(event) => setWeb((current) => ({ ...current, telefono_publico: event.target.value }))} />
              </label>
              <label className="sm:col-span-2">
                <span className={labelClass}>Google Maps</span>
                <input className={fieldClass} value={web.google_maps_url} onChange={(event) => setWeb((current) => ({ ...current, google_maps_url: event.target.value }))} placeholder="https://maps.app.goo.gl/..." />
              </label>
              <label>
                <span className={labelClass}>Instagram</span>
                <input className={fieldClass} value={web.instagram_url} onChange={(event) => setWeb((current) => ({ ...current, instagram_url: event.target.value }))} />
              </label>
              <label>
                <span className={labelClass}>Email público</span>
                <input type="email" className={fieldClass} value={web.email_publico} onChange={(event) => setWeb((current) => ({ ...current, email_publico: event.target.value }))} />
              </label>
            </div>
          </div>
        </PanelCard>

        <PanelCard
          icon={<Palette className="h-5 w-5" />}
          title="Identidad visual"
          description="Tres colores controlan toda la plantilla del restaurante."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["color_primario", "Principal"],
              ["color_acento", "Acento"],
              ["color_fondo", "Fondo"],
            ].map(([key, label]) => (
              <label key={key}>
                <span className={labelClass}>{label}</span>
                <div className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2">
                  <input
                    type="color"
                    value={web[key as keyof WebConfig] as string}
                    onChange={(event) => setWeb((current) => ({ ...current, [key]: event.target.value }))}
                    className="h-10 w-12 cursor-pointer rounded-xl border-0 p-0"
                  />
                  <span className="text-xs font-black uppercase text-slate-600">{web[key as keyof WebConfig]}</span>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200" style={{ backgroundColor: web.color_fondo }}>
            <div className="p-6 text-white" style={{ backgroundColor: web.color_primario }}>
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: web.color_acento }}>Vista rápida</p>
              <p className="mt-2 text-2xl font-black text-white">{web.titular || restaurantName}</p>
              <span className="mt-4 inline-flex rounded-full px-4 py-2 text-xs font-black" style={{ backgroundColor: web.color_acento, color: web.color_primario }}>Reservar mesa</span>
            </div>
          </div>
        </PanelCard>

        <PanelCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Reglas de reserva"
          description="Controla qué se puede reservar y con cuánta antelación."
        >
          <div className="space-y-4">
            <Toggle
              checked={booking.activo}
              onChange={(value) => setBooking((current) => ({ ...current, activo: value }))}
              label="Aceptar reservas online"
              detail="Solo actívalo cuando capacidad y horarios estén revisados."
            />
            <Toggle
              checked={booking.confirmacion_automatica}
              onChange={(value) => setBooking((current) => ({ ...current, confirmacion_automatica: value }))}
              label="Confirmación automática"
              detail="Si está apagado, las nuevas reservas entrarán como pendientes."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={labelClass}>Zona horaria</span>
                <select className={fieldClass} value={booking.zona_horaria} onChange={(event) => setBooking((current) => ({ ...current, zona_horaria: event.target.value }))}>
                  <option value="Atlantic/Canary">Canarias</option>
                  <option value="Europe/Madrid">Península / Baleares</option>
                </select>
              </label>
              <label>
                <span className={labelClass}>Capacidad simultánea</span>
                <input type="number" min={1} className={fieldClass} value={booking.capacidad_por_turno} onChange={(event) => setBooking((current) => ({ ...current, capacidad_por_turno: numberValue(event.target.value, 1) }))} />
              </label>
              <label>
                <span className={labelClass}>Cada cuántos minutos</span>
                <select className={fieldClass} value={booking.intervalo_minutos} onChange={(event) => setBooking((current) => ({ ...current, intervalo_minutos: Number(event.target.value) }))}>
                  {[15, 30, 45, 60].map((value) => <option key={value} value={value}>{value} min</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>Duración estimada</span>
                <select className={fieldClass} value={booking.duracion_minutos} onChange={(event) => setBooking((current) => ({ ...current, duracion_minutos: Number(event.target.value) }))}>
                  {[60, 90, 120, 150, 180].map((value) => <option key={value} value={value}>{value} min</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>Mínimo de personas</span>
                <input type="number" min={1} className={fieldClass} value={booking.personas_minimas} onChange={(event) => setBooking((current) => ({ ...current, personas_minimas: numberValue(event.target.value, 1) }))} />
              </label>
              <label>
                <span className={labelClass}>Máximo online</span>
                <input type="number" min={1} className={fieldClass} value={booking.personas_maximas} onChange={(event) => setBooking((current) => ({ ...current, personas_maximas: numberValue(event.target.value, 1) }))} />
              </label>
              <label>
                <span className={labelClass}>Antelación mínima</span>
                <select className={fieldClass} value={booking.antelacion_minutos} onChange={(event) => setBooking((current) => ({ ...current, antelacion_minutos: Number(event.target.value) }))}>
                  {[0, 30, 60, 120, 240, 1440].map((value) => <option key={value} value={value}>{value < 60 ? `${value} min` : value === 1440 ? "1 día" : `${value / 60} h`}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>Días visibles</span>
                <input type="number" min={1} max={365} className={fieldClass} value={booking.dias_maximos_antelacion} onChange={(event) => setBooking((current) => ({ ...current, dias_maximos_antelacion: numberValue(event.target.value, 60) }))} />
              </label>
              <label>
                <span className={labelClass}>Límite para cancelar</span>
                <select className={fieldClass} value={booking.cancelacion_minutos} onChange={(event) => setBooking((current) => ({ ...current, cancelacion_minutos: Number(event.target.value) }))}>
                  <option value={0}>Hasta la hora de reserva</option>
                  <option value={60}>1 hora antes</option>
                  <option value={120}>2 horas antes</option>
                  <option value={240}>4 horas antes</option>
                  <option value={1440}>1 día antes</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={booking.requiere_telefono} onChange={(value) => setBooking((current) => ({ ...current, requiere_telefono: value }))} label="Pedir teléfono" detail="Recomendado para cambios urgentes." />
              <Toggle checked={booking.requiere_email} onChange={(value) => setBooking((current) => ({ ...current, requiere_email: value }))} label="Pedir email" detail="Útil para confirmaciones por correo." />
            </div>
          </div>
        </PanelCard>
      </div>

      <PanelCard
        icon={<CalendarClock className="h-5 w-5" />}
        title="Horario semanal reservable"
        description="Activa comida, cena o ambos. Las fechas especiales y cierres se gestionarán aparte."
      >
        <div className="space-y-3">
          {schedule.map((day) => (
            <div key={day.day} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[8rem_1fr_1fr] lg:items-center">
              <div>
                <p className="text-sm font-black text-slate-950">{day.label}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{Number(day.lunchEnabled) + Number(day.dinnerEnabled)} servicios</p>
              </div>
              {[
                ["Comida", "lunchEnabled", "lunchStart", "lunchEnd"],
                ["Cena", "dinnerEnabled", "dinnerStart", "dinnerEnd"],
              ].map(([label, enabledKey, startKey, endKey]) => {
                const enabled = day[enabledKey as keyof DaySchedule] as boolean;
                return (
                  <div key={label} className={`rounded-2xl border p-3 ${enabled ? "border-blue-200 bg-white" : "border-slate-200 bg-slate-100"}`}>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-black text-slate-700">
                      <input type="checkbox" checked={enabled} onChange={(event) => updateDay(day.day, { [enabledKey]: event.target.checked })} className="h-4 w-4 accent-blue-600" />
                      {label}
                    </label>
                    <div className="mt-3 flex items-center gap-2">
                      <Clock3 className="h-4 w-4 shrink-0 text-slate-400" />
                      <input type="time" disabled={!enabled} value={day[startKey as keyof DaySchedule] as string} onChange={(event) => updateDay(day.day, { [startKey]: event.target.value })} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black disabled:bg-slate-100" />
                      <span className="text-xs font-black text-slate-400">a</span>
                      <input type="time" disabled={!enabled} value={day[endKey as keyof DaySchedule] as string} onChange={(event) => updateDay(day.day, { [endKey]: event.target.value })} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black disabled:bg-slate-100" />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </PanelCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <PanelCard icon={<Users className="h-5 w-5" />} title="Mensajes al cliente" description="Textos visibles dentro del formulario de reserva.">
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Aviso antes de reservar</span>
              <textarea className={fieldClass} rows={3} value={booking.aviso_reserva} onChange={(event) => setBooking((current) => ({ ...current, aviso_reserva: event.target.value }))} />
            </label>
            <label className="block">
              <span className={labelClass}>Política de cancelación</span>
              <textarea className={fieldClass} rows={4} value={booking.politica_cancelacion} onChange={(event) => setBooking((current) => ({ ...current, politica_cancelacion: event.target.value }))} />
            </label>
          </div>
        </PanelCard>

        <PanelCard icon={<Globe2 className="h-5 w-5" />} title="Google y buscadores" description="Título y descripción que aparecerán al compartir o buscar la web.">
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Título SEO</span>
              <input className={fieldClass} maxLength={180} value={web.seo_titulo} onChange={(event) => setWeb((current) => ({ ...current, seo_titulo: event.target.value }))} />
            </label>
            <label className="block">
              <span className={labelClass}>Descripción SEO</span>
              <textarea className={fieldClass} maxLength={320} rows={4} value={web.seo_descripcion} onChange={(event) => setWeb((current) => ({ ...current, seo_descripcion: event.target.value }))} />
            </label>
          </div>
        </PanelCard>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando..." : "Guardar web y reservas"}
        </button>
      </div>
    </div>
  );
}
