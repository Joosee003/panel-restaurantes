// app/c/[token]/page.tsx
import React from "react";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  Gift,
  Home,
  IdCard,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TicketPercent,
  Trophy,
  User,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import PremioImage from "./PremioImage";
import ConfirmSubmit from "./ConfirmSubmit";
import LoadingSubmitButton from "./LoadingSubmitButton";
import ScratchCoupon from "./ScratchCoupon";
import LevelExperience, { type ClientLevelThresholds } from "./LevelExperience";

export const dynamic = "force-dynamic";

type TabKey = "inicio" | "reservas" | "nivel" | "premios" | "cupones" | "perfil";

type ClienteRow = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  restaurante_id: string;
  public_token: string;
  fecha_nacimiento?: string | null;
};

type ReservaCliente = {
  id: string;
  restaurante_id: string;
  cliente_id: string | null;
  nombre_cliente: string | null;
  telefono: string | null;
  email: string | null;
  personas: number | null;
  fecha_hora_reserva: string | null;
  estado: string | null;
  turno: string | null;
  atendida: boolean | null;
  resena_solicitada: boolean | null;
  amelia_appointment_id?: number | null;
  amelia_booking_id?: number | null;
  amelia_cancel_url?: string | null;
  amelia_booking_token?: string | null;
  gestion_token?: string | null;
  inicio_at?: string | null;
  origen?: string | null;
  created_at: string | null;
};

type PremioPuntos = {
  id: string;
  nombre: string;
  descripcion: string | null;
  puntos_requeridos: number;
  imagen_url: string | null;
  activo: boolean;
  creado_en: string | null;
};

type CanjePuntos = {
  id: string;
  premio_id: string;
  puntos_usados: number;
  estado: "pendiente" | "confirmado" | "cancelado" | string;
  creado_en: string | null;
  confirmado_en: string | null;
};

type Cupon = {
  id: string;
  nombre: string;
  beneficio: string;
  condiciones: any;
  activo: boolean;
  creado_en?: string | null;
};

type CuponClienteRow = {
  cupon_id: string;
  estado: "activo" | "canjeado" | "caducado" | string;
  creado_en?: string | null;
  canjeado_en?: string | null;
  caduca_en?: string | null;
};

type ClienteNotificacion = {
  id: string;
  restaurante_id: string;
  cliente_id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  url: string | null;
  leida: boolean;
  created_at: string;
};

type ReprogramarHorasData = {
  ok: boolean;
  reserva_id?: string;
  fecha?: string;
  personas?: number;
  horas: string[];
  error?: string;
  response?: string;
};

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, service, { auth: { persistSession: false } });
}

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function hexToRgb(hex: string) {
  const clean = String(hex || "#2563eb").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((x) => x + x).join("") : clean;
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 37, g: 99, b: 235 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeAccent(hex: string) {
  const clean = String(hex || "#2563eb").trim();
  const { r, g, b } = hexToRgb(clean);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  // Si el restaurante tiene un color muy gris/apagado, la app queda sosa.
  // Usamos un azul premium como acento visual sin romper la marca.
  if (max - min < 20) return "#2563eb";
  if (max > 235 && min > 235) return "#2563eb";
  return clean.startsWith("#") ? clean : `#${clean}`;
}

function normalizeBg(hex: string) {
  const clean = String(hex || "#f8fafc").trim();
  const { r, g, b } = hexToRgb(clean);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 210) return "#f8fafc";
  if (max - min < 18) return "#f8fafc";
  return clean.startsWith("#") ? clean : `#${clean}`;
}

function onlyDate(v: string | null | undefined) {
  return String(v ?? "").slice(0, 10);
}

function normalizePhone(v: string | null | undefined) {
  const clean = String(v ?? "").replace(/\D/g, "");
  if (!clean) return "";
  if (clean.startsWith("34")) return clean;
  if (clean.length === 9) return `34${clean}`;
  return clean;
}

function formatReservaDate(v: string | null | undefined) {
  if (!v) return "Sin fecha";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

function formatReservaTime(v: string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function displayClientName(v: string | null | undefined) {
  const raw = String(v ?? "").trim();
  if (!raw) return "Cliente";
  const clean = raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const first = clean.split(" ")[0] || "Cliente";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function validationCode(id: string | null | undefined) {
  const clean = String(id ?? "").replace(/-/g, "").toUpperCase();
  if (!clean) return "GH-0000";
  return `GH-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

function estadoReservaLabel(estado: string | null | undefined) {
  const e = String(estado ?? "").trim();
  if (!e) return "Sin estado";
  return e.charAt(0).toUpperCase() + e.slice(1);
}

function canCancelReserva(reserva: ReservaCliente) {
  if (!reserva.fecha_hora_reserva) return false;
  const estado = String(reserva.estado ?? "").toLowerCase();
  if (estado === "cancelada") return false;
  const reservaMs = new Date(reserva.fecha_hora_reserva).getTime();
  return reservaMs - Date.now() > 3 * 60 * 60 * 1000;
}

function timeToMinutes(t: string) {
  const [h, m] = String(t || "00:00").split(":").map((x) => Number(x));
  return (h || 0) * 60 + (m || 0);
}

function isNowWithinWindow(nowMin: number, startMin: number, endMin: number) {
  if (startMin <= endMin) return nowMin >= startMin && nowMin <= endMin;
  return nowMin >= startMin || nowMin <= endMin;
}

function getNowMadridParts() {
  const madrid = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const dayJS = madrid.getDay();
  return {
    y: madrid.getFullYear(),
    m: madrid.getMonth() + 1,
    d: madrid.getDate(),
    hh: madrid.getHours(),
    mm: madrid.getMinutes(),
    weekdayMon0: (dayJS + 6) % 7,
  };
}

function isBirthdayPromoActive(args: { fechaNacimiento: string | null | undefined; diasAntes: number; validezDias: number }) {
  const { fechaNacimiento, diasAntes, validezDias } = args;
  if (!fechaNacimiento) return { ok: false, motivo: "Completa tu fecha" };

  const { y, m, d } = getNowMadridParts();
  const today = new Date(Date.UTC(y, m - 1, d));
  const fn = new Date(fechaNacimiento);
  if (Number.isNaN(fn.getTime())) return { ok: false, motivo: "Fecha pendiente" };

  const birthdayThisYear = new Date(Date.UTC(y, fn.getUTCMonth(), fn.getUTCDate()));
  const birthday = birthdayThisYear < today ? new Date(Date.UTC(y + 1, fn.getUTCMonth(), fn.getUTCDate())) : birthdayThisYear;
  const start = new Date(birthday);
  start.setUTCDate(start.getUTCDate() - Math.max(0, diasAntes));
  const end = new Date(birthday);
  end.setUTCDate(end.getUTCDate() + Math.max(0, validezDias) - 1);

  const ok = today >= start && today <= end;
  const daysToStart = Math.ceil((start.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return { ok, motivo: ok ? "Disponible ahora" : daysToStart > 0 ? `Disponible en ${daysToStart} días` : "Fuera de fecha" };
}

function isHappyHourActive(args: { diasSemana: number[]; horaInicio: string; horaFin: string }) {
  const { diasSemana, horaInicio, horaFin } = args;
  const { hh, mm, weekdayMon0 } = getNowMadridParts();
  const dayOk = Array.isArray(diasSemana) ? diasSemana.includes(weekdayMon0) : false;
  const timeOk = isNowWithinWindow(hh * 60 + mm, timeToMinutes(horaInicio), timeToMinutes(horaFin));
  return { ok: dayOk && timeOk, motivo: dayOk ? (timeOk ? "Disponible ahora" : `Horario ${horaInicio}–${horaFin}`) : "Hoy no aplica" };
}

function AppShell({ children, accent, bg }: { children: React.ReactNode; accent: string; bg: string }) {
  return (
    <div
      className="min-h-screen text-slate-950"
      style={{
        background: `radial-gradient(900px 460px at 0% -10%, ${rgba(accent, 0.26)}, transparent 62%), radial-gradient(680px 380px at 105% 0%, ${rgba(accent, 0.14)}, transparent 58%), linear-gradient(180deg, ${bg}, #ffffff 44%, #f8fafc 100%)`,
      }}
    >
      <div className="mx-auto min-h-screen w-full max-w-[500px] px-4 pb-36 pt-4 sm:pt-6">{children}</div>
    </div>
  );
}

function IconBubble({ children, accent, dark = false }: { children: React.ReactNode; accent: string; dark?: boolean }) {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm"
      style={{
        background: dark ? "#0f172a" : `linear-gradient(135deg, ${rgba(accent, 0.16)}, #fff)`,
        borderColor: dark ? "rgba(255,255,255,0.12)" : rgba(accent, 0.18),
        color: dark ? "white" : accent,
      }}
    >
      {children}
    </div>
  );
}

function Badge({
  children,
  accent,
  variant = "soft",
  className,
}: {
  children: React.ReactNode;
  accent: string;
  variant?: "soft" | "solid" | "danger" | "success" | "dark";
  className?: string;
}) {
  const style =
    variant === "solid"
      ? { backgroundColor: accent, color: "white", borderColor: "transparent" }
      : variant === "danger"
        ? { backgroundColor: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" }
        : variant === "success"
          ? { backgroundColor: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" }
          : variant === "dark"
            ? { backgroundColor: "#0f172a", color: "white", borderColor: "transparent" }
            : { backgroundColor: rgba(accent, 0.1), color: "#0f172a", borderColor: rgba(accent, 0.18) };

  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-black leading-none tracking-tight", className)} style={style}>
      {children}
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/24">
      <div className="h-full rounded-full bg-white transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

function SectionCard({
  children,
  title,
  subtitle,
  accent,
  icon,
  right,
  className,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  accent: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("overflow-hidden rounded-[30px] border border-white/75 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? <IconBubble accent={accent}>{icon}</IconBubble> : null}
          <div className="min-w-0">
            <h2 className="text-[19px] font-black leading-tight tracking-[-0.04em] !text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyState({ title, text, icon, accent }: { title: string; text: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-[24px] border border-dashed p-6 text-center" style={{ borderColor: rgba(accent, 0.22), backgroundColor: rgba(accent, 0.06) }}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm" style={{ color: accent }}>{icon}</div>
      <div className="mt-3 text-base font-black tracking-tight text-slate-950">{title}</div>
      <div className="mt-1 text-sm font-semibold text-slate-500">{text}</div>
    </div>
  );
}

function AppNotice({ type, title, text }: { type: "ok" | "err"; title: string; text: string }) {
  const ok = type === "ok";
  return (
    <div className={clsx("rounded-[26px] border p-4 shadow-sm", ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950")}>
      <div className="flex items-start gap-3">
        {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />}
        <div>
          <div className="text-sm font-black">{title}</div>
          <div className="mt-1 text-sm font-semibold opacity-80">{text}</div>
        </div>
      </div>
    </div>
  );
}

function Hero({
  restauranteNombre,
  clienteNombre,
  logo,
  accent,
  puntos,
  puntosPorEuro,
  fidelizacionActiva,
  nextRewardName,
  nextRewardMissing,
  progressPct,
  mainHref,
  mainLabel,
  mainIcon,
  avisosSinLeer,
}: {
  restauranteNombre: string;
  clienteNombre: string;
  logo: string | null;
  accent: string;
  puntos: number;
  puntosPorEuro: number;
  fidelizacionActiva: boolean;
  nextRewardName: string;
  nextRewardMissing: number;
  progressPct: number;
  mainHref: string;
  mainLabel: string;
  mainIcon: React.ReactNode;
  avisosSinLeer: number;
}) {
  return (
    <header
      className="relative overflow-hidden rounded-[34px] p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
      style={{ background: `radial-gradient(520px 260px at 105% -18%, ${rgba(accent, 0.8)}, transparent 60%), radial-gradient(420px 260px at -12% 90%, ${rgba(accent, 0.45)}, transparent 64%), linear-gradient(135deg, #0f172a, #020617 92%)` }}
    >
      <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/10 blur-sm" />
      <div className="absolute bottom-0 left-0 h-28 w-full bg-gradient-to-t from-black/20 to-transparent" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/12 shadow-lg backdrop-blur">
            {logo ? <img src={logo} alt={restauranteNombre} className="h-full w-full object-cover" /> : <Crown className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-black uppercase tracking-[0.22em] text-white/60">{restauranteNombre}</div>
            <h1 className="mt-1 truncate text-[28px] font-black leading-none tracking-[-0.07em] !text-white">Hola, {clienteNombre}</h1>
          </div>
        </div>

        <a href="#avisos-app" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/12 backdrop-blur active:scale-[0.96]">
          <Bell className="h-5 w-5" />
          {avisosSinLeer > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white ring-2 ring-white">{avisosSinLeer}</span> : null}
        </a>
      </div>

      <div className="relative z-10 mt-6 rounded-[28px] border border-white/14 bg-white/10 p-4 backdrop-blur-xl">
        {fidelizacionActiva ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">Saldo disponible</div>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-5xl font-black leading-none tracking-[-0.09em]">{puntos}</span>
                  <span className="pb-1 text-sm font-black text-white/62">pts</span>
                </div>
                <div className="mt-1 text-xs font-bold text-white/55">{puntosPorEuro} pts por cada € acumulado</div>
              </div>

              <div className="min-w-[104px] rounded-[24px] border border-white/14 bg-white/10 p-3 text-right">
                <Trophy className="ml-auto h-6 w-6 text-white" />
                <div className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">Próximo</div>
                <div className="max-w-[120px] truncate text-sm font-black">{nextRewardName}</div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between text-xs font-black text-white/72">
                <span>{nextRewardMissing > 0 ? `Faltan ${nextRewardMissing} pts` : "Listo para canjear"}</span>
                <span>{Math.round(Math.max(0, Math.min(100, progressPct)))}%</span>
              </div>
              <ProgressBar pct={progressPct} />
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <div className="text-lg font-black tracking-[-0.04em]">Tu zona privada</div>
              <div className="text-sm font-semibold text-white/58">Reservas, avisos y ventajas del restaurante.</div>
            </div>
          </div>
        )}
      </div>

      <a href={mainHref} className="relative z-10 mt-4 inline-flex min-h-[54px] w-full touch-manipulation items-center justify-center gap-2 rounded-[22px] bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-xl transition active:scale-[0.97] active:opacity-90">
        {mainIcon}
        {mainLabel}
      </a>
    </header>
  );
}

function CompactHeader({
  title,
  subtitle,
  restauranteNombre,
  logo,
  accent,
  avisosSinLeer,
}: {
  title: string;
  subtitle: string;
  restauranteNombre: string;
  logo: string | null;
  accent: string;
  avisosSinLeer: number;
}) {
  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-white/70 bg-white/78 px-4 py-3 shadow-[0_14px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[500px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            {logo ? <img src={logo} alt={restauranteNombre} className="h-full w-full object-cover" /> : <Crown className="h-5 w-5" style={{ color: accent }} />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{restauranteNombre}</div>
            <div className="truncate text-xl font-black tracking-[-0.05em] text-slate-950">{title}</div>
            <div className="truncate text-xs font-bold text-slate-500">{subtitle}</div>
          </div>
        </div>

        <a href="#avisos-app" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm active:scale-[0.96]" style={{ backgroundColor: accent }}>
          <Bell className="h-5 w-5" />
          {avisosSinLeer > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white ring-2 ring-white">{avisosSinLeer}</span> : null}
        </a>
      </div>
    </header>
  );
}

function QuickAction({ icon, title, text, href, accent, highlight = false }: { icon: React.ReactNode; title: string; text: string; href?: string | null; accent: string; highlight?: boolean }) {
  const style = highlight ? { background: `linear-gradient(135deg, ${accent}, #0f172a)`, color: "white" } : undefined;
  return (
    <a
      href={href || "#"}
      aria-disabled={!href}
      className={clsx(
        "group rounded-[26px] border p-4 shadow-sm transition active:scale-[0.97] active:opacity-85",
        highlight ? "border-transparent" : "border-slate-100 bg-white",
        !href && "pointer-events-none opacity-50"
      )}
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={clsx("flex h-12 w-12 items-center justify-center rounded-2xl", highlight ? "bg-white/14" : "bg-slate-50")} style={!highlight ? { color: accent } : undefined}>{icon}</div>
        <ChevronRight className={clsx("mt-1 h-4 w-4", highlight ? "text-white/50" : "text-slate-300")} />
      </div>
      <div className={clsx("mt-4 font-black tracking-[-0.03em]", highlight ? "text-white" : "text-slate-950")}>{title}</div>
      <div className={clsx("mt-1 text-xs font-semibold leading-relaxed", highlight ? "text-white/66" : "text-slate-500")}>{text}</div>
    </a>
  );
}

function ClientImpactPanel({
  accent,
  proximaReserva,
  fidelizacionActiva,
  puntos,
  nextRewardName,
  nextRewardMissing,
  recompensaDisponible,
  avisosSinLeer,
  buildTabHref,
}: {
  accent: string;
  proximaReserva: ReservaCliente | null;
  fidelizacionActiva: boolean;
  puntos: number;
  nextRewardName: string;
  nextRewardMissing: number;
  recompensaDisponible: PremioPuntos | null;
  avisosSinLeer: number;
  buildTabHref: (tab: TabKey) => string;
}) {
  const rewardStatus = !fidelizacionActiva
    ? "Ventajas desactivadas"
    : recompensaDisponible
      ? "Premio listo para canjear"
      : nextRewardMissing > 0
        ? `${nextRewardMissing} puntos para ${nextRewardName}`
        : "Premio casi listo";

  return (
    <section className="overflow-hidden rounded-[34px] border border-white/80 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
      <div className="relative p-5">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-15" style={{ backgroundColor: accent }} />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em]" style={{ backgroundColor: rgba(accent, 0.1), color: accent }}>
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Zona privada
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.06em] !text-slate-950">Tus reservas y ventajas</h2>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">Todo lo que el cliente necesita para volver al restaurante, sin mezclarlo con pedidos de mesa.</p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${accent}, #0f172a)` }}>
            <Zap className="h-7 w-7" />
          </div>
        </div>

        <div className="relative mt-5 grid gap-3">
          <a href={buildTabHref("reservas")} className="flex items-center justify-between rounded-[26px] border border-slate-100 bg-slate-50/80 p-4 transition active:scale-[0.98]">
            <div className="flex min-w-0 items-center gap-3">
              <IconBubble accent={accent}><CalendarClock className="h-5 w-5" /></IconBubble>
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-950">{proximaReserva ? "Próxima reserva" : "Reservas"}</div>
                <div className="truncate text-xs font-bold text-slate-500">{proximaReserva ? `${formatReservaDate(proximaReserva.fecha_hora_reserva)} · ${formatReservaTime(proximaReserva.fecha_hora_reserva)}` : "Gestionar próximas visitas"}</div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300" />
          </a>

          {fidelizacionActiva ? (
            <a href={buildTabHref("nivel")} className="flex items-center justify-between rounded-[26px] border border-slate-100 bg-white p-4 transition active:scale-[0.98]">
              <div className="flex min-w-0 items-center gap-3">
                <IconBubble accent={accent}><Trophy className="h-5 w-5" /></IconBubble>
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-950">Tu nivel y progreso</div>
                  <div className="truncate text-xs font-bold text-slate-500">{puntos} puntos · {rewardStatus}</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300" />
            </a>
          ) : null}

          <a href={buildTabHref("perfil")} className="flex items-center justify-between rounded-[26px] border border-slate-100 bg-slate-50/80 p-4 transition active:scale-[0.98]">
            <div className="flex min-w-0 items-center gap-3">
              <IconBubble accent={accent}><Bell className="h-5 w-5" /></IconBubble>
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-950">Avisos y ventajas</div>
                <div className="truncate text-xs font-bold text-slate-500">{avisosSinLeer > 0 ? `${avisosSinLeer} aviso${avisosSinLeer === 1 ? "" : "s"} sin leer` : "Sin avisos pendientes"}</div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300" />
          </a>
        </div>
      </div>
    </section>
  );
}

function BottomNav({
  currentTab,
  buildTabHref,
  avisosSinLeer,
  accent,
  fidelizacionActiva,
}: {
  currentTab: TabKey;
  buildTabHref: (tab: TabKey) => string;
  avisosSinLeer: number;
  accent: string;
  fidelizacionActiva: boolean;
}) {
  const items: Array<{ key: TabKey; label: string; icon: React.ReactNode; count?: number }> = [
    { key: "inicio", label: "Inicio", icon: <Home className="h-5 w-5" /> },
    { key: "reservas", label: "Reservas", icon: <CalendarDays className="h-5 w-5" /> },
    ...(fidelizacionActiva
      ? [
          { key: "nivel" as TabKey, label: "Nivel", icon: <Trophy className="h-5 w-5" /> },
          { key: "premios" as TabKey, label: "Premios", icon: <Gift className="h-5 w-5" /> },
        ]
      : []),
    { key: "perfil", label: "Perfil", icon: <User className="h-5 w-5" />, count: avisosSinLeer },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[540px] px-4 pb-4">
      <div className="rounded-[26px] border border-white/85 bg-white/95 px-2 py-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className={clsx("grid gap-1", fidelizacionActiva ? "grid-cols-5" : "grid-cols-3")}>
          {items.map((item) => {
            const active = currentTab === item.key;
            return (
              <a
                key={item.key}
                href={buildTabHref(item.key)}
                className={clsx(
                  "relative flex touch-manipulation flex-col items-center justify-center rounded-2xl px-1 py-2 text-[10px] font-black transition active:scale-[0.94] active:opacity-80",
                  active ? "text-white" : "text-slate-400 hover:text-slate-700"
                )}
                style={active ? { backgroundColor: accent } : undefined}
              >
                {item.icon}
                <span className="mt-1 truncate">{item.label}</span>
                {item.count && item.count > 0 ? <span className="absolute right-2 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black text-white">{item.count}</span> : null}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function ReservaCard({
  reserva,
  accent,
  token,
  whatsappHref,
  managementHref,
  canCancel,
  canChange,
  cancelarReservaAction,
  featured = false,
}: {
  reserva: ReservaCliente;
  accent: string;
  token: string;
  whatsappHref: string | null;
  managementHref: string | null;
  canCancel: boolean;
  canChange: boolean;
  cancelarReservaAction: (formData: FormData) => Promise<void>;
  featured?: boolean;
}) {
  return (
    <div className={clsx("rounded-[28px] border bg-white p-4 shadow-sm", featured ? "border-transparent" : "border-slate-100")} style={featured ? { boxShadow: `0 18px 58px ${rgba(accent, 0.12)}` } : undefined}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <IconBubble accent={accent}><CalendarClock className="h-5 w-5" /></IconBubble>
          <div className="min-w-0">
            <div className="text-lg font-black tracking-[-0.04em] text-slate-950">{formatReservaDate(reserva.fecha_hora_reserva)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-500">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />{formatReservaTime(reserva.fecha_hora_reserva)}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{reserva.personas ?? 0} personas</span>
            </div>
            {reserva.turno ? <div className="mt-1 text-sm font-semibold text-slate-400">{reserva.turno}</div> : null}
          </div>
        </div>
        <Badge accent={accent} variant={String(reserva.estado ?? "").toLowerCase() === "cancelada" ? "danger" : "solid"}>{estadoReservaLabel(reserva.estado)}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {managementHref ? (
          <a href={managementHref} className="col-span-2 inline-flex min-h-[46px] w-full touch-manipulation items-center justify-center rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm transition active:scale-[0.97]" style={{ backgroundColor: accent }}>
            Gestionar reserva
          </a>
        ) : canChange ? (
          <a href={`/c/${token}?tab=reservas&cambiar=${reserva.id}`} className="inline-flex min-h-[46px] w-full touch-manipulation items-center justify-center rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm transition active:scale-[0.97]" style={{ backgroundColor: accent }}>
            Cambiar hora
          </a>
        ) : whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[46px] w-full touch-manipulation items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition active:scale-[0.97]">
            WhatsApp
          </a>
        ) : (
          <button type="button" disabled className="inline-flex min-h-[46px] w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-400">Cambiar</button>
        )}

        {!managementHref ? (
          canCancel ? (
            <ConfirmSubmit message="¿Seguro que quieres cancelar esta reserva?">
              <form action={cancelarReservaAction}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="reserva_id" value={reserva.id} />
                <LoadingSubmitButton loadingText="Cancelando..." className="min-h-[46px] bg-red-600">Cancelar</LoadingSubmitButton>
              </form>
            </ConfirmSubmit>
          ) : (
            <button type="button" disabled className="inline-flex min-h-[46px] w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-400">Cancelar</button>
          )
        ) : null}
      </div>

      <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold leading-relaxed text-slate-500">
        {managementHref ? "Usa Gestionar reserva para cambiarla o cancelarla de forma segura." : "Cambios y cancelaciones disponibles hasta 3 horas antes."}
      </div>
    </div>
  );
}

function ValidationCard({ title, subtitle, code, accent, status }: { title: string; subtitle: string; code: string; accent: string; status: string }) {
  const ok = status === "confirmado" || status === "canjeado";
  const bad = status === "cancelado" || status === "caducado";
  return (
    <div className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
      <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${accent}, #0f172a)` }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-white/65">Mostrar al personal</div>
            <div className="mt-2 text-2xl font-black tracking-[-0.06em]">{title}</div>
            <div className="mt-1 text-sm font-semibold text-white/70">{subtitle}</div>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/14"><IdCard className="h-7 w-7" /></div>
        </div>
      </div>
      <div className="p-5">
        <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Código</div>
          <div className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-950">{code}</div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Badge accent={accent} variant={ok ? "success" : bad ? "danger" : "soft"}>{status}</Badge>
          <div className="text-xs font-bold text-slate-400">Validación en restaurante</div>
        </div>
      </div>
    </div>
  );
}


function RewardHeroPanel({
  accent,
  puntos,
  puntosPorEuro,
  premioDestacado,
  canjeables,
  canjesPendientes,
  levelLabel,
  levelText,
}: {
  accent: string;
  puntos: number;
  puntosPorEuro: number;
  premioDestacado: PremioPuntos | null;
  canjeables: PremioPuntos[];
  canjesPendientes: CanjePuntos[];
  levelLabel: string;
  levelText: string;
}) {
  const faltan = premioDestacado ? Math.max(0, premioDestacado.puntos_requeridos - puntos) : 0;
  const pct = premioDestacado && premioDestacado.puntos_requeridos > 0 ? Math.min(100, (puntos / premioDestacado.puntos_requeridos) * 100) : 0;
  const hayPremioListo = canjeables.length > 0;

  return (
    <section
      className="relative overflow-hidden rounded-[34px] p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
      style={{ background: `radial-gradient(520px 260px at 105% -20%, ${rgba(accent, 0.92)}, transparent 58%), radial-gradient(420px 300px at -10% 110%, ${rgba(accent, 0.52)}, transparent 62%), linear-gradient(135deg, #0f172a, #020617 92%)` }}
    >
      <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
      <div className="absolute bottom-0 left-0 h-28 w-full bg-gradient-to-t from-black/20 to-transparent" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/70">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Club privado
          </div>
          <h2 className="mt-4 text-4xl font-black leading-none tracking-[-0.08em] !text-white">{puntos}</h2>
          <div className="mt-1 text-sm font-black text-white/68">puntos disponibles</div>
        </div>
        <div className="rounded-[24px] border border-white/14 bg-white/10 p-3 text-right backdrop-blur">
          <Trophy className="ml-auto h-6 w-6" />
          <div className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/48">Nivel</div>
          <div className="text-sm font-black">{levelLabel}</div>
        </div>
      </div>

      <div className="relative z-10 mt-5 rounded-[28px] border border-white/12 bg-white/10 p-4 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/52">Mejor oportunidad</div>
            <div className="mt-1 truncate text-xl font-black tracking-[-0.05em]">{premioDestacado?.nombre ?? "Premios por activar"}</div>
            <div className="mt-1 text-sm font-semibold text-white/60">
              {premioDestacado ? (faltan === 0 ? "Disponible para canjear en el restaurante" : `Te faltan ${faltan} puntos`) : "El restaurante puede añadir recompensas desde el panel"}
            </div>
          </div>
          <Badge accent={accent} variant={hayPremioListo ? "success" : "dark"}>{hayPremioListo ? `${canjeables.length} listo` : `${Math.round(pct)}%`}</Badge>
        </div>
        {premioDestacado ? <div className="mt-4"><ProgressBar pct={Math.max(8, pct)} /></div> : null}
      </div>

      <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur">
          <div className="text-lg font-black">{canjeables.length}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/48">Canjeables</div>
        </div>
        <a href="#premios-validacion" className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur active:scale-[0.97]">
          <div className="text-lg font-black">{canjesPendientes.length}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/48">Pendientes</div>
        </a>
        <div className="rounded-2xl bg-white/10 p-3 text-center backdrop-blur">
          <div className="text-lg font-black">{puntosPorEuro}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/48">Pts/€</div>
        </div>
      </div>

      <p className="relative z-10 mt-4 text-xs font-semibold leading-relaxed text-white/55">{levelText}. Los premios se validan enseñando el código al personal del restaurante.</p>
    </section>
  );
}

function RewardCard({
  premio,
  puntos,
  accent,
  token,
  canjeActivo,
  canjearAction,
  confirmMessage,
}: {
  premio: PremioPuntos;
  puntos: number;
  accent: string;
  token: string;
  canjeActivo: CanjePuntos | null;
  canjearAction: (formData: FormData) => Promise<void>;
  confirmMessage: string;
}) {
  const faltan = Math.max(0, premio.puntos_requeridos - puntos);
  const pct = premio.puntos_requeridos > 0 ? Math.min(100, (puntos / premio.puntos_requeridos) * 100) : 0;
  const disponible = faltan === 0 && !canjeActivo;
  const pendiente = canjeActivo?.estado === "pendiente";
  const confirmado = canjeActivo?.estado === "confirmado";

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-[30px] border bg-white shadow-[0_16px_48px_rgba(15,23,42,0.08)]",
        disponible ? "border-transparent" : "border-slate-100"
      )}
      style={disponible ? { boxShadow: `0 22px 70px ${rgba(accent, 0.18)}` } : undefined}
    >
      <div className="p-4">
        <div className="flex items-start gap-4">
          <PremioImage src={premio.imagen_url} alt={premio.nombre} accent={accent} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-black tracking-[-0.05em] text-slate-950">{premio.nombre}</div>
                <div className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">{premio.descripcion || `${premio.puntos_requeridos} puntos para canjear.`}</div>
              </div>
              {pendiente ? <Badge accent={accent} variant="solid">Pendiente</Badge> : confirmado ? <Badge accent={accent} variant="success">Usado</Badge> : disponible ? <Badge accent={accent} variant="solid">Listo</Badge> : <Badge accent={accent}>{faltan} pts</Badge>}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-[11px] font-black text-slate-400">
                <span>{puntos} / {premio.puntos_requeridos} pts</span>
                <span>{Math.round(Math.max(0, Math.min(100, pct)))}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(6, pct)}%`, backgroundColor: disponible || pendiente ? accent : rgba(accent, 0.55) }} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {pendiente ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm font-bold text-slate-600">Premio solicitado. Muestra el pase de validación al personal.</div>
          ) : confirmado ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Premio validado por el restaurante.</div>
          ) : disponible ? (
            <ConfirmSubmit message={confirmMessage}>
              <form action={canjearAction}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="premio_id" value={premio.id} />
                <LoadingSubmitButton loadingText="Preparando premio..." style={{ backgroundColor: accent }}>Canjear ahora</LoadingSubmitButton>
              </form>
            </ConfirmSubmit>
          ) : (
            <button type="button" disabled className="inline-flex min-h-[46px] w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-400">Faltan {faltan} puntos</button>
          )}
        </div>
      </div>
    </div>
  );
}

function RewardSteps({ accent }: { accent: string }) {
  const items = [
    { title: "Suma puntos", text: "Cada visita y consumo puede acercarte a una recompensa.", icon: <Sparkles className="h-5 w-5" /> },
    { title: "Elige premio", text: "Cuando tengas puntos suficientes, prepara el canje desde la app.", icon: <Gift className="h-5 w-5" /> },
    { title: "Valida en local", text: "Muestra el código al personal. No se usa para pedir desde fuera.", icon: <IdCard className="h-5 w-5" /> },
  ];

  return (
    <SectionCard accent={accent} title="Cómo funciona" subtitle="Simple para el cliente y seguro para el restaurante" icon={<ShieldCheck className="h-5 w-5" />}>
      <div className="grid gap-3">
        {items.map((item, index) => (
          <div key={item.title} className="flex items-start gap-3 rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: accent }}>{item.icon}</div>
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Paso {index + 1}</div>
              <div className="mt-1 text-base font-black tracking-[-0.03em] text-slate-950">{item.title}</div>
              <div className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">{item.text}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function nextBestAction(args: {
  proximaReserva: ReservaCliente | null;
  fidelizacionActiva: boolean;
  canjesPendientes: CanjePuntos[];
  recompensaDisponible: PremioPuntos | null;
  buildTabHref: (tab: TabKey) => string;
}) {
  if (args.canjesPendientes.length > 0) {
    return { href: args.buildTabHref("premios"), label: "Mostrar premio", icon: <IdCard className="h-5 w-5" /> };
  }
  if (args.recompensaDisponible) {
    return { href: args.buildTabHref("premios"), label: "Canjear premio", icon: <Gift className="h-5 w-5" /> };
  }
  if (args.proximaReserva) {
    return { href: args.buildTabHref("reservas"), label: "Ver mi reserva", icon: <CalendarDays className="h-5 w-5" /> };
  }
  if (args.fidelizacionActiva) {
    return { href: args.buildTabHref("cupones"), label: "Ver ventajas", icon: <TicketPercent className="h-5 w-5" /> };
  }
  return { href: args.buildTabHref("reservas"), label: "Gestionar visitas", icon: <CalendarDays className="h-5 w-5" /> };
}

function pickPromoDate(row: CuponClienteRow) {
  return row.canjeado_en ?? row.creado_en ?? null;
}

export default async function ClientePremiosPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; err?: string; tab?: string; cambiar?: string; hora?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const supabase = getAdmin();

  const tabValues: TabKey[] = ["inicio", "reservas", "nivel", "premios", "cupones", "perfil"];
  const currentTab: TabKey = tabValues.includes((sp.tab ?? "") as TabKey) ? (sp.tab as TabKey) : "inicio";
  const buildTabHref = (tab: TabKey) => `/c/${token}?tab=${tab}`;
  const CONFIRM_MSG = "IMPORTANTE: canjea solo cuando estés en el restaurante. Muestra esta pantalla al personal para validarlo. ¿Quieres continuar?";

  async function completarPerfilAction(formData: FormData) {
    "use server";
    const tokenLocal = String(formData.get("token") ?? "").trim();
    const nombre = String(formData.get("nombre") ?? "").trim();
    const telefono = String(formData.get("telefono") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const fechaNacimiento = String(formData.get("fecha_nacimiento") ?? "").trim();
    const admin = getAdmin();

    const { data: c } = await admin.from("clientes").select("id, restaurante_id, public_token").eq("public_token", tokenLocal).maybeSingle();
    if (!c) redirect(`/c/${tokenLocal}?err=cliente`);
    if (!nombre || !telefono || !email || !fechaNacimiento) redirect(`/c/${tokenLocal}?err=perfil`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`/c/${tokenLocal}?err=email`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) redirect(`/c/${tokenLocal}?err=fecha`);

    const { error } = await admin.from("clientes").update({ nombre, telefono, email, fecha_nacimiento: fechaNacimiento }).eq("id", c.id);
    if (error) redirect(`/c/${tokenLocal}?err=save`);
    redirect(`/c/${tokenLocal}?ok=perfil&tab=inicio`);
  }

  async function actualizarPerfilAction(formData: FormData) {
    "use server";
    const tokenLocal = String(formData.get("token") ?? "").trim();
    const nombre = String(formData.get("nombre") ?? "").trim();
    const telefono = String(formData.get("telefono") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const fechaNacimiento = String(formData.get("fecha_nacimiento") ?? "").trim();
    const admin = getAdmin();

    const { data: cliente } = await admin.from("clientes").select("id, restaurante_id, public_token").eq("public_token", tokenLocal).maybeSingle();
    if (!cliente) redirect(`/c/${tokenLocal}?tab=perfil&err=cliente`);
    if (!nombre || !telefono || !email || !fechaNacimiento) redirect(`/c/${tokenLocal}?tab=perfil&err=perfil`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`/c/${tokenLocal}?tab=perfil&err=email`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) redirect(`/c/${tokenLocal}?tab=perfil&err=fecha`);

    const { error } = await admin.from("clientes").update({ nombre, telefono, email, fecha_nacimiento: fechaNacimiento }).eq("id", cliente.id);
    if (error) redirect(`/c/${tokenLocal}?tab=perfil&err=save`);
    redirect(`/c/${tokenLocal}?tab=perfil&ok=perfil`);
  }

  async function canjearAction(formData: FormData) {
    "use server";
    const premioId = String(formData.get("premio_id") ?? "").trim();
    const tokenLocal = String(formData.get("token") ?? "").trim();
    const admin = getAdmin();

    const { data: cliente } = await admin.from("clientes").select("id,restaurante_id,public_token").eq("public_token", tokenLocal).maybeSingle();
    if (!cliente) redirect(`/c/${tokenLocal}?tab=premios&err=cliente`);

    const { data: restauranteCfg } = await admin.from("restaurantes").select("puntos_activo,puntos_por_euro").eq("id", cliente.restaurante_id).maybeSingle();
    const fidelizacionOk = Boolean((restauranteCfg as any)?.puntos_activo) && Number((restauranteCfg as any)?.puntos_por_euro ?? 0) > 0;
    if (!fidelizacionOk) redirect(`/c/${tokenLocal}?tab=inicio&err=premio`);

    const { data: existente } = await admin
      .from("canjes_puntos")
      .select("id, estado")
      .eq("cliente_id", cliente.id)
      .eq("restaurante_id", cliente.restaurante_id)
      .eq("premio_id", premioId)
      .in("estado", ["pendiente", "confirmado"])
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente) redirect(`/c/${tokenLocal}?tab=premios&ok=premio`);

    const { error } = await admin.rpc("rpc_canjear_premio", { p_cliente_id: cliente.id, p_restaurante_id: cliente.restaurante_id, p_premio_id: premioId });
    if (error) {
      const code = /insuficientes/i.test(error.message) ? "puntos" : /no disponible/i.test(error.message) ? "premio" : "canje";
      redirect(`/c/${tokenLocal}?tab=premios&err=${code}`);
    }
    redirect(`/c/${tokenLocal}?tab=premios&ok=premio`);
  }

  async function canjearCuponAction(formData: FormData) {
    "use server";
    const tokenLocal = String(formData.get("token") ?? "").trim();
    const cuponId = String(formData.get("cupon_id") ?? "").trim();
    const admin = getAdmin();

    const { data: cliente } = await admin.from("clientes").select("id, restaurante_id, public_token").eq("public_token", tokenLocal).maybeSingle();
    if (!cliente) redirect(`/c/${tokenLocal}?tab=cupones&err=cliente`);

    const { data: cupon } = await admin.from("cupones").select("id, restaurante_id, activo").eq("id", cuponId).maybeSingle();
    if (!cupon || cupon.restaurante_id !== cliente.restaurante_id || !cupon.activo) redirect(`/c/${tokenLocal}?tab=cupones&err=premio`);

    const { data: existing } = await admin
      .from("cupon_cliente")
      .select("id, estado")
      .eq("cliente_id", cliente.id)
      .eq("restaurante_id", cliente.restaurante_id)
      .eq("cupon_id", cuponId)
      .in("estado", ["activo", "canjeado"])
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) redirect(`/c/${tokenLocal}?tab=cupones&ok=cupon`);

    const ahora = new Date();
    const caduca = new Date(ahora.getTime() + 60 * 60 * 1000);

    const { error } = await admin.from("cupon_cliente").insert({
      cliente_id: cliente.id,
      restaurante_id: cliente.restaurante_id,
      cupon_id: cuponId,
      estado: "activo",
      creado_en: ahora.toISOString(),
      caduca_en: caduca.toISOString(),
    });

    if (error) {
      console.error("Error canjeando cupón de cliente", error);
      redirect(`/c/${tokenLocal}?tab=cupones&err=canje`);
    }
    redirect(`/c/${tokenLocal}?tab=cupones&ok=cupon`);
  }

  async function cancelarReservaAction(formData: FormData) {
    "use server";
    const tokenLocal = String(formData.get("token") ?? "").trim();
    const reservaId = String(formData.get("reserva_id") ?? "").trim();
    if (!tokenLocal || !reservaId) redirect(`/c/${tokenLocal || token}?tab=reservas&err=cancel`);

    const admin = getAdmin();
    const { data: cliente } = await admin.from("clientes").select("id, restaurante_id").eq("public_token", tokenLocal).maybeSingle();
    if (!cliente) redirect(`/c/${tokenLocal}?tab=reservas&err=cliente`);

    const { data: reserva } = await admin
      .from("reservas")
      .select("id,fecha_hora_reserva,estado,cliente_id,restaurante_id")
      .eq("id", reservaId)
      .eq("cliente_id", cliente.id)
      .eq("restaurante_id", cliente.restaurante_id)
      .maybeSingle();

    if (!reserva) redirect(`/c/${tokenLocal}?tab=reservas&err=reserva`);
    if (!canCancelReserva(reserva as ReservaCliente)) redirect(`/c/${tokenLocal}?tab=reservas&err=cancel_tarde`);

    const { error } = await admin
      .from("reservas")
      .update({ estado: "cancelada" })
      .eq("id", reservaId)
      .eq("cliente_id", cliente.id)
      .eq("restaurante_id", cliente.restaurante_id);

    if (error) {
      console.error("Error cancelando reserva desde cliente", error);
      redirect(`/c/${tokenLocal}?tab=reservas&err=cancel`);
    }
    redirect(`/c/${tokenLocal}?tab=reservas&ok=reserva_cancelada`);
  }

  async function confirmarCambioHoraAction(formData: FormData) {
    "use server";
    const tokenLocal = String(formData.get("token") || "").trim();
    const reservaId = String(formData.get("reserva_id") || "").trim();
    const nuevaFecha = String(formData.get("nueva_fecha") || "").trim();
    const nuevaHora = String(formData.get("nueva_hora") || "").trim();
    if (!tokenLocal || !reservaId || !nuevaFecha || !nuevaHora) redirect(`/c/${tokenLocal || token}?tab=reservas&err=reprogramar`);

    const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha);
    const horaOk = /^\d{2}:\d{2}$/.test(nuevaHora);
    if (!fechaOk || !horaOk) redirect(`/c/${tokenLocal}?tab=reservas&err=reprogramar`);

    const admin = getAdmin();
    const { data: cliente } = await admin.from("clientes").select("id, restaurante_id").eq("public_token", tokenLocal).maybeSingle();
    if (!cliente) redirect(`/c/${tokenLocal}?tab=reservas&err=cliente`);

    const { data: reserva } = await admin
      .from("reservas")
      .select("id,fecha_hora_reserva,estado,cliente_id,restaurante_id")
      .eq("id", reservaId)
      .eq("cliente_id", cliente.id)
      .eq("restaurante_id", cliente.restaurante_id)
      .maybeSingle();

    if (!reserva) redirect(`/c/${tokenLocal}?tab=reservas&err=reserva`);
    if (!canCancelReserva(reserva as ReservaCliente)) redirect(`/c/${tokenLocal}?tab=reservas&err=cancel_tarde`);

    const horaNumero = Number(nuevaHora.slice(0, 2));
    const nuevoTurno = horaNumero >= 17 ? "cena" : "comida";
    const nuevaFechaHora = `${nuevaFecha} ${nuevaHora}:00`;

    const { error } = await admin
      .from("reservas")
      .update({ fecha_hora_reserva: nuevaFechaHora, turno: nuevoTurno, estado: "confirmada" })
      .eq("id", reservaId)
      .eq("cliente_id", cliente.id)
      .eq("restaurante_id", cliente.restaurante_id);

    if (error) {
      console.error("Error reprogramando reserva desde cliente", error);
      redirect(`/c/${tokenLocal}?tab=reservas&err=reprogramar`);
    }
    redirect(`/c/${tokenLocal}?tab=reservas&ok=reserva_reprogramada`);
  }

  async function marcarAvisoLeidoAction(formData: FormData) {
    "use server";
    const tokenLocal = String(formData.get("token") ?? "").trim();
    const avisoId = String(formData.get("aviso_id") ?? "").trim();
    const admin = getAdmin();
    const { data: cliente } = await admin.from("clientes").select("id, restaurante_id, public_token").eq("public_token", tokenLocal).maybeSingle();
    if (!cliente || !avisoId) redirect(`/c/${tokenLocal}?tab=perfil&err=aviso`);
    const { error } = await admin.from("cliente_notificaciones").update({ leida: true }).eq("id", avisoId).eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id);
    if (error) redirect(`/c/${tokenLocal}?tab=perfil&err=aviso`);
    redirect(`/c/${tokenLocal}?tab=perfil&ok=aviso_leido#avisos-app`);
  }

  const { data: clienteData, error: clienteErr } = await supabase
    .from("clientes")
    .select("id,nombre,telefono,email,restaurante_id,public_token,fecha_nacimiento")
    .eq("public_token", token)
    .maybeSingle();

  const cliente = clienteData as ClienteRow | null;
  if (clienteErr || !cliente) {
    return (
      <AppShell accent="#2563eb" bg="#f8fafc">
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="w-full rounded-[32px] border border-slate-100 bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white"><XCircle className="h-7 w-7" /></div>
            <div className="mt-4 text-xl font-black tracking-tight text-slate-950">Enlace no válido</div>
            <div className="mt-2 text-sm font-semibold text-slate-500">Revisa el enlace o pide uno nuevo en el restaurante.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  const needsOnboarding = !String(cliente.nombre ?? "").trim() || !String(cliente.telefono ?? "").trim() || !String(cliente.email ?? "").trim() || !String(cliente.fecha_nacimiento ?? "").trim();
  if (needsOnboarding) {
    return (
      <AppShell accent="#2563eb" bg="#f8fafc">
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="w-full overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.12)]">
            <div className="bg-slate-950 p-6 text-white">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12"><User className="h-7 w-7" /></div>
              <div className="mt-5 text-3xl font-black tracking-[-0.06em]">Activa tu app</div>
              <div className="mt-2 text-sm font-semibold text-white/65">Completa tus datos para usar puntos, promos y reservas.</div>
            </div>
            <div className="p-5">
              {sp.err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{sp.err === "perfil" ? "Rellena todos los campos." : sp.err === "email" ? "Email no válido." : sp.err === "fecha" ? "Fecha no válida." : "No se pudo guardar."}</div> : null}
              <form action={completarPerfilAction} className="space-y-3">
                <input type="hidden" name="token" value={token} />
                <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Nombre</span><input name="nombre" defaultValue={String(cliente.nombre ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" placeholder="Tu nombre" required /></label>
                <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Teléfono</span><input name="telefono" defaultValue={String(cliente.telefono ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" placeholder="600123123" required /></label>
                <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Email</span><input name="email" type="email" defaultValue={String(cliente.email ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" placeholder="tu@email.com" required /></label>
                <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Fecha de nacimiento</span><input name="fecha_nacimiento" type="date" defaultValue={onlyDate(cliente.fecha_nacimiento)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <LoadingSubmitButton loadingText="Entrando..." className="mt-3 bg-slate-950 py-4 shadow-lg">Entrar a mi app</LoadingSubmitButton>
              </form>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const [restauranteRes, clienteResumenRes, nivelesClienteRes] = await Promise.all([
    supabase.from("restaurantes").select("id,nombre,telefono,color_primario,color_fondo,logo_url,puntos_por_euro,puntos_activo").eq("id", cliente.restaurante_id).maybeSingle(),
    supabase.from("vw_clientes_resumen").select("visitas_totales,visitas_reales,ranking_posicion").eq("id", cliente.id).eq("restaurante_id", cliente.restaurante_id).maybeSingle(),
    supabase.from("fidelizacion_config").select("nivel_frecuente_desde,nivel_habitual_desde,nivel_vip_desde,nivel_maestro_desde").eq("restaurante_id", cliente.restaurante_id).maybeSingle(),
  ]);
  const restaurante = (restauranteRes.data ?? null) as any;
  const clienteResumen = (clienteResumenRes.data ?? null) as any;
  const rawLevels = (nivelesClienteRes.data ?? null) as any;

  const restoNombre = String(restaurante?.nombre ?? "Restaurante");
  const rawAccent = String(restaurante?.color_primario ?? "#2563eb");
  const accent = normalizeAccent(rawAccent);
  const bg = normalizeBg(String(restaurante?.color_fondo ?? "#f8fafc"));
  const logo = (restaurante?.logo_url ?? null) as string | null;
  const restauranteTelefono = normalizePhone(restaurante?.telefono);
  const puntosPorEuro = Number(restaurante?.puntos_por_euro ?? 0);
  const fidelizacionActiva = Boolean(restaurante?.puntos_activo) && puntosPorEuro > 0;

  const levelThresholds: ClientLevelThresholds = {
    silver: Math.max(1, Number(rawLevels?.nivel_frecuente_desde ?? 2)),
    gold: Math.max(2, Number(rawLevels?.nivel_habitual_desde ?? 5)),
    diamond: Math.max(3, Number(rawLevels?.nivel_vip_desde ?? 10)),
    master: Math.max(4, Number(rawLevels?.nivel_maestro_desde ?? 20)),
  };
  levelThresholds.gold = Math.max(levelThresholds.gold, levelThresholds.silver + 1);
  levelThresholds.diamond = Math.max(levelThresholds.diamond, levelThresholds.gold + 1);
  levelThresholds.master = Math.max(levelThresholds.master, levelThresholds.diamond + 1);

  const visitasCliente = Math.max(0, Number(clienteResumen?.visitas_reales ?? clienteResumen?.visitas_totales ?? 0));
  const rankingCliente = Number(clienteResumen?.ranking_posicion ?? 0) || null;
  const clientLevel = visitasCliente >= levelThresholds.master
    ? { label: "Maestro", text: "Estás en el nivel más exclusivo del club" }
    : visitasCliente >= levelThresholds.diamond
      ? { label: "Diamante", text: "Formas parte de los clientes VIP" }
      : visitasCliente >= levelThresholds.gold
        ? { label: "Oro", text: "Tu fidelidad ya destaca" }
        : visitasCliente >= levelThresholds.silver
          ? { label: "Plata", text: "Ya eres cliente frecuente" }
          : { label: "Bronce", text: "Sigue sumando visitas para desbloquear nuevos niveles" };

  if (!fidelizacionActiva && (currentTab === "nivel" || currentTab === "premios" || currentTab === "cupones")) redirect(`/c/${token}?tab=inicio`);

  function buildWhatsAppReprogramar(reserva: ReservaCliente) {
    if (!restauranteTelefono) return null;
    const msg = `Hola, quiero cambiar mi reserva del ${formatReservaDate(reserva.fecha_hora_reserva)} a las ${formatReservaTime(reserva.fecha_hora_reserva)} para ${reserva.personas ?? ""} personas.`;
    return `https://wa.me/${restauranteTelefono}?text=${encodeURIComponent(msg)}`;
  }

  const [saldoRes, premiosRes, canjesRes, cuponesRes, cuponClienteRes, reservasRes, notificacionesRes] = await Promise.all([
    fidelizacionActiva ? supabase.from("puntos_saldos").select("puntos").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).maybeSingle() : Promise.resolve({ data: null }),
    fidelizacionActiva ? supabase.from("premios_puntos").select("id,nombre,descripcion,puntos_requeridos,imagen_url,activo,creado_en").eq("restaurante_id", cliente.restaurante_id).eq("activo", true).order("puntos_requeridos", { ascending: true }).limit(8) : Promise.resolve({ data: [] }),
    fidelizacionActiva ? supabase.from("canjes_puntos").select("id,premio_id,puntos_usados,estado,creado_en,confirmado_en").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).order("creado_en", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
    fidelizacionActiva ? supabase.from("cupones").select("id,nombre,beneficio,condiciones,activo,creado_en").eq("restaurante_id", cliente.restaurante_id).eq("activo", true).order("creado_en", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
    fidelizacionActiva ? supabase.from("cupon_cliente").select("cupon_id,estado,creado_en,canjeado_en,caduca_en").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).order("creado_en", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    supabase.from("reservas").select("id,restaurante_id,cliente_id,nombre_cliente,telefono,email,personas,fecha_hora_reserva,inicio_at,estado,turno,atendida,resena_solicitada,amelia_appointment_id,amelia_booking_id,amelia_cancel_url,amelia_booking_token,gestion_token,origen,created_at").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).order("fecha_hora_reserva", { ascending: true }).limit(30),
    supabase.from("cliente_notificaciones").select("id,restaurante_id,cliente_id,tipo,titulo,mensaje,url,leida,created_at").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).order("created_at", { ascending: false }).limit(12),
  ]);

  const puntos = fidelizacionActiva ? Number((saldoRes.data as any)?.puntos ?? 0) : 0;
  const premiosPuntos = ((premiosRes.data ?? []) as any[]).map((x) => ({ id: x.id, nombre: x.nombre, descripcion: x.descripcion ?? null, puntos_requeridos: Number(x.puntos_requeridos ?? 0), imagen_url: x.imagen_url ?? null, activo: Boolean(x.activo), creado_en: x.creado_en ?? null })) as PremioPuntos[];
  const canjes = ((canjesRes.data ?? []) as any[]).map((x) => ({ id: x.id, premio_id: x.premio_id, puntos_usados: Number(x.puntos_usados ?? 0), estado: String(x.estado ?? "pendiente"), creado_en: x.creado_en ?? null, confirmado_en: x.confirmado_en ?? null })) as CanjePuntos[];
  const cupones = ((cuponesRes.data ?? []) as any[]) as Cupon[];
  const cuponClienteRaw = ((cuponClienteRes.data ?? []) as any[]) as CuponClienteRow[];
  const reservas = ((reservasRes.data ?? []) as any[]) as ReservaCliente[];
  const notificaciones = ((notificacionesRes.data ?? []) as any[]) as ClienteNotificacion[];

  const nowMs = Date.now();
  const proximasReservas = reservas.filter((r) => r.fecha_hora_reserva && String(r.estado ?? "").toLowerCase() !== "cancelada" && new Date(r.fecha_hora_reserva).getTime() >= nowMs);
  const historialReservas = reservas.filter((r) => r.fecha_hora_reserva && new Date(r.fecha_hora_reserva).getTime() < nowMs).sort((a, b) => new Date(b.fecha_hora_reserva ?? "").getTime() - new Date(a.fecha_hora_reserva ?? "").getTime());
  const proximaReserva = proximasReservas[0] ?? null;
  const reservaSeleccionadaCambio = sp.cambiar
    ? proximasReservas.find((r) => r.id === sp.cambiar && canCancelReserva(r) && !r.gestion_token) ?? null
    : null;
  const horaSeleccionadaCambio = String(sp.hora ?? "").trim();

  let horasCambio: ReprogramarHorasData | null = null;
  if (reservaSeleccionadaCambio && canCancelReserva(reservaSeleccionadaCambio)) {
    try {
      const res = await fetch("https://n8n.gastrohelp.es/webhook/panel-reprogramar-horas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reserva_id: reservaSeleccionadaCambio.id }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok === false) {
        horasCambio = { ok: false, horas: [], error: String(data?.error || data?.message || `HTTP_${res.status}`), response: String(data?.response || "No se pudieron cargar las horas disponibles.") };
      } else {
        horasCambio = { ok: true, reserva_id: String(data?.reserva_id || reservaSeleccionadaCambio.id), fecha: String(data?.fecha || onlyDate(reservaSeleccionadaCambio.fecha_hora_reserva)), personas: Number(data?.personas || reservaSeleccionadaCambio.personas || 1), horas: Array.isArray(data?.horas) ? data.horas.map((h: any) => String(h)) : [] };
      }
    } catch (error: any) {
      horasCambio = { ok: false, horas: [], error: String(error?.message || "WEBHOOK_ERROR"), response: "No se pudieron cargar las horas disponibles." };
    }
  }

  const avisosSinLeer = notificaciones.filter((n) => !n.leida).length;
  const canjesPendientes = canjes.filter((c) => c.estado === "pendiente");
  const premiosById = new Map(premiosPuntos.map((p) => [p.id, p]));
  const recompensaDisponible = premiosPuntos.find((p) => puntos >= p.puntos_requeridos) ?? null;
  const next = premiosPuntos.find((p) => p.puntos_requeridos > puntos) ?? null;
  const best = premiosPuntos[0] ?? null;
  const target = next ?? recompensaDisponible ?? best;
  const nextRewardName = target?.nombre ?? "Tu próxima ventaja";
  const nextRewardMissing = target ? Math.max(0, target.puntos_requeridos - puntos) : 0;
  const progressPct = target && target.puntos_requeridos > 0 ? Math.min(100, (puntos / target.puntos_requeridos) * 100) : 0;
  const canjesActivosByPremioId = new Map(
    canjes
      .filter((c) => ["pendiente", "confirmado"].includes(String(c.estado ?? "").toLowerCase()))
      .map((c) => [c.premio_id, c])
  );
  const premiosCanjeables = premiosPuntos.filter((p) => puntos >= p.puntos_requeridos && !canjesActivosByPremioId.has(p.id));
  const premioDestacado = premiosCanjeables[0] ?? next ?? target ?? null;

  const hiddenCuponIds = new Set<string>();
  const cuponEstadoById = new Map<string, { estado: string; fecha: string | null; creado_en: string | null; canjeado_en: string | null; caduca_en: string | null }>();
  const CUPON_VISIBLE_AFTER_CANJE_MS = 30 * 60 * 1000;

  for (const row of cuponClienteRaw) {
    if (!row?.cupon_id) continue;
    const estado = String(row.estado ?? "").toLowerCase();
    const fechaBase = row.canjeado_en ?? row.caduca_en ?? row.creado_en ?? null;
    const fechaMs = fechaBase ? new Date(fechaBase).getTime() : NaN;
    const caducaMs = row.caduca_en ? new Date(row.caduca_en).getTime() : NaN;
    const caducado = estado === "activo" && !Number.isNaN(caducaMs) && Date.now() > caducaMs;
    const viejo = (estado === "canjeado" || estado === "caducado") && !Number.isNaN(fechaMs) && Date.now() - fechaMs > CUPON_VISIBLE_AFTER_CANJE_MS;
    if (caducado || viejo) {
      hiddenCuponIds.add(row.cupon_id);
      continue;
    }
    if (!cuponEstadoById.has(row.cupon_id)) cuponEstadoById.set(row.cupon_id, { estado: row.estado, fecha: pickPromoDate(row), creado_en: row.creado_en ?? null, canjeado_en: row.canjeado_en ?? null, caduca_en: row.caduca_en ?? null });
  }

  const promosEspeciales = cupones
    .filter((c) => !hiddenCuponIds.has(c.id))
    .filter((c) => ["cumpleanos", "horas_valle"].includes(c.condiciones?.tipo ?? ""))
    .map((c) => {
      const tipo = c.condiciones?.tipo ?? "";
      if (tipo === "cumpleanos") {
        const r = isBirthdayPromoActive({ fechaNacimiento: cliente.fecha_nacimiento, diasAntes: Number(c.condiciones?.dias_antes ?? 0), validezDias: Number(c.condiciones?.validez_dias ?? 1) });
        return { cupon: c, tipo, ok: r.ok, texto: r.motivo, prioridad: r.ok ? 1 : 3 };
      }
      const r = isHappyHourActive({ diasSemana: (c.condiciones?.dias_semana ?? []) as number[], horaInicio: String(c.condiciones?.hora_inicio ?? "00:00"), horaFin: String(c.condiciones?.hora_fin ?? "23:59") });
      return { cupon: c, tipo, ok: r.ok, texto: r.motivo, prioridad: r.ok ? 1 : 3 };
    })
    .sort((a, b) => {
      const ea = cuponEstadoById.get(a.cupon.id);
      const eb = cuponEstadoById.get(b.cupon.id);
      const pa = ea?.estado === "activo" ? 0 : a.prioridad;
      const pb = eb?.estado === "activo" ? 0 : b.prioridad;
      return pa - pb;
    });

  const cuponesPreparados = promosEspeciales.filter((promo) => String(cuponEstadoById.get(promo.cupon.id)?.estado ?? "").toLowerCase() === "activo");
  const cuponesDisponibles = promosEspeciales.filter((promo) => promo.ok && !cuponEstadoById.get(promo.cupon.id));
  const cuponesProximos = promosEspeciales.filter((promo) => !promo.ok && !cuponEstadoById.get(promo.cupon.id)).slice(0, 4);
  const cuponesUsadosRecientes = promosEspeciales.filter((promo) => ["canjeado", "caducado"].includes(String(cuponEstadoById.get(promo.cupon.id)?.estado ?? "").toLowerCase())).slice(0, 3);
  const totalCuponesVisibles = cuponesPreparados.length + cuponesDisponibles.length + cuponesProximos.length;

  const okText =
    sp.ok === "perfil" ? { title: "Perfil guardado", desc: "Tus datos se han actualizado." }
    : sp.ok === "premio" ? { title: "Premio solicitado", desc: "Muestra la tarjeta de validación en el restaurante." }
    : sp.ok === "cupon" ? { title: "Cupón preparado", desc: "Muestra el código al personal del restaurante." }
    : sp.ok === "reserva_cancelada" ? { title: "Reserva cancelada", desc: "La reserva se ha cancelado correctamente." }
    : sp.ok === "reserva_reprogramada" ? { title: "Reserva reprogramada", desc: "Tu nueva hora se ha guardado correctamente." }
    : sp.ok === "aviso_leido" ? { title: "Aviso actualizado", desc: "La notificación se ha marcado como leída." }
    : null;

  const errText = sp.err
    ? sp.err === "puntos" ? "Puntos insuficientes."
      : sp.err === "premio" ? "No disponible."
      : sp.err === "perfil" ? "Rellena todos los campos."
      : sp.err === "email" ? "Email no válido."
      : sp.err === "fecha" ? "Fecha no válida."
      : sp.err === "cancel_tarde" ? "No se puede cancelar si faltan menos de 3 horas. Contacta con el restaurante."
      : sp.err === "reserva" ? "No se encontró la reserva."
      : sp.err === "cancel" ? "No se pudo cancelar la reserva."
      : sp.err === "reprogramar" ? "No se pudo cambiar la hora de la reserva."
      : sp.err === "aviso" ? "No se pudo actualizar el aviso."
      : "Inténtalo otra vez."
    : null;

  const tabMeta: Record<TabKey, { title: string; subtitle: string }> = {
    inicio: { title: "Inicio", subtitle: "Resumen de tu app privada" },
    reservas: { title: "Reservas", subtitle: "Consulta y gestiona tus visitas" },
    nivel: { title: "Mi nivel", subtitle: "Tu progreso dentro del club" },
    premios: { title: "Premios", subtitle: "Puntos y recompensas disponibles" },
    cupones: { title: "Cupones", subtitle: "Ventajas privadas del restaurante" },
    perfil: { title: "Perfil", subtitle: "Datos, avisos y contacto" },
  };

  const primary = nextBestAction({ proximaReserva, fidelizacionActiva, canjesPendientes, recompensaDisponible, buildTabHref });

  return (
    <AppShell accent={accent} bg={bg}>
      <div className="space-y-5">
        {currentTab === "inicio" ? (
          <Hero
            restauranteNombre={restoNombre}
            clienteNombre={displayClientName(cliente.nombre)}
            logo={logo}
            accent={accent}
            puntos={puntos}
            puntosPorEuro={puntosPorEuro}
            fidelizacionActiva={fidelizacionActiva}
            nextRewardName={nextRewardName}
            nextRewardMissing={nextRewardMissing}
            progressPct={progressPct}
            mainHref={primary.href}
            mainLabel={primary.label}
            mainIcon={primary.icon}
            avisosSinLeer={avisosSinLeer}
          />
        ) : (
          <CompactHeader
            title={tabMeta[currentTab].title}
            subtitle={tabMeta[currentTab].subtitle}
            restauranteNombre={restoNombre}
            logo={logo}
            accent={accent}
            avisosSinLeer={avisosSinLeer}
          />
        )}

        {okText ? <AppNotice type="ok" title={okText.title} text={okText.desc} /> : null}
        {errText ? <AppNotice type="err" title="No se pudo completar" text={errText} /> : null}

        {currentTab === "inicio" ? (
          <div className="space-y-5">
            <ClientImpactPanel
              accent={accent}
              proximaReserva={proximaReserva}
              fidelizacionActiva={fidelizacionActiva}
              puntos={puntos}
              nextRewardName={nextRewardName}
              nextRewardMissing={nextRewardMissing}
              recompensaDisponible={recompensaDisponible}
              avisosSinLeer={avisosSinLeer}
              buildTabHref={buildTabHref}
            />

            <SectionCard accent={accent} title="Acciones rápidas" subtitle="Lo importante en un toque" icon={<Zap className="h-5 w-5" />}>
              <div className="grid grid-cols-2 gap-3">
                <QuickAction icon={<CalendarDays className="h-6 w-6" />} title="Reservas" text="Gestionar próxima visita" href={buildTabHref("reservas")} accent={accent} highlight={Boolean(proximaReserva)} />
                {fidelizacionActiva ? <QuickAction icon={<Trophy className="h-6 w-6" />} title="Mi nivel" text={`${clientLevel.label} · ${visitasCliente} visitas`} href={buildTabHref("nivel")} accent={accent} highlight /> : null}
                <QuickAction icon={<TicketPercent className="h-6 w-6" />} title="Ventajas" text="Promos y cupones" href={fidelizacionActiva ? buildTabHref("cupones") : buildTabHref("perfil")} accent={accent} highlight={Boolean(promosEspeciales.some((p) => p.ok))} />
                <QuickAction icon={<Bell className="h-6 w-6" />} title="Avisos" text="Novedades del restaurante" href={buildTabHref("perfil")} accent={accent} highlight={avisosSinLeer > 0} />
              </div>
            </SectionCard>

            <SectionCard accent={accent} title="Tu próxima visita" subtitle="Reserva activa y gestión rápida" icon={<CalendarDays className="h-5 w-5" />} right={proximaReserva ? <Badge accent={accent} variant="solid">Activa</Badge> : <Badge accent={accent}>Sin reserva</Badge>}>
              {!proximaReserva ? (
                <EmptyState title="Sin reserva activa" text="Cuando tengas una reserva, podrás gestionarla desde aquí." icon={<CalendarDays className="h-6 w-6" />} accent={accent} />
              ) : (
                <ReservaCard reserva={proximaReserva} accent={accent} token={token} whatsappHref={buildWhatsAppReprogramar(proximaReserva)} managementHref={proximaReserva.gestion_token ? `/reserva/${proximaReserva.gestion_token}` : null} canCancel={canCancelReserva(proximaReserva)} canChange={canCancelReserva(proximaReserva)} cancelarReservaAction={cancelarReservaAction} featured />
              )}
            </SectionCard>

            {fidelizacionActiva ? (
              <SectionCard accent={accent} title="Próxima recompensa" subtitle="Motivo claro para volver" icon={<Trophy className="h-5 w-5" />} right={recompensaDisponible ? <Badge accent={accent} variant="solid">Canjeable</Badge> : <Badge accent={accent}>{nextRewardMissing} pts</Badge>}>
                {target ? (
                  <div className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-4">
                      <PremioImage src={target.imagen_url} alt={target.nombre} accent={accent} />
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-black tracking-[-0.04em] text-slate-950">{target.nombre}</div>
                        <div className="mt-1 text-sm font-semibold text-slate-500">{target.descripcion || `${target.puntos_requeridos} puntos para canjear.`}</div>
                      </div>
                    </div>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, progressPct))}%`, backgroundColor: accent }} /></div>
                    <a href={buildTabHref("premios")} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white" style={{ backgroundColor: accent }}>Ver premios <ArrowRight className="h-4 w-4" /></a>
                  </div>
                ) : (
                  <EmptyState title="Sin premios configurados" text="El restaurante podrá añadir recompensas desde su panel." icon={<Gift className="h-6 w-6" />} accent={accent} />
                )}
              </SectionCard>
            ) : null}

            <SectionCard accent={accent} title="Último aviso" subtitle="Mensajes del restaurante" icon={<Bell className="h-5 w-5" />} right={notificaciones[0] && !notificaciones[0].leida ? <Badge accent={accent} variant="solid">Nuevo</Badge> : null}>
              {notificaciones.length === 0 ? (
                <EmptyState title="Sin avisos todavía" text="Aquí aparecerán promociones, cambios y mensajes para ti." icon={<Bell className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{notificaciones[0].tipo}</div>
                  <div className="mt-2 text-lg font-black tracking-[-0.04em] text-slate-950">{notificaciones[0].titulo}</div>
                  <div className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">{notificaciones[0].mensaje}</div>
                  <a href={buildTabHref("perfil")} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-xs font-black text-white">Ver avisos <ChevronRight className="h-4 w-4" /></a>
                </div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {currentTab === "nivel" && fidelizacionActiva ? (
          <div className="space-y-5">
            <LevelExperience
              customerKey={cliente.id}
              restaurantName={restoNombre}
              visits={visitasCliente}
              points={puntos}
              rankingPosition={rankingCliente}
              thresholds={levelThresholds}
            />

            <SectionCard accent={accent} title="Tus ventajas" subtitle="El nivel y los puntos trabajan juntos" icon={<Sparkles className="h-5 w-5" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <a href={buildTabHref("premios")} className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm transition active:scale-[.98]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${accent}, #0f172a)` }}><Gift className="h-6 w-6" /></div>
                  <div className="mt-4 text-lg font-black tracking-[-.04em] text-slate-950">Premios</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">Usa tus {puntos} puntos en recompensas.</div>
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-black" style={{ color: accent }}>Ver premios <ChevronRight className="h-4 w-4" /></div>
                </a>
                <a href={buildTabHref("cupones")} className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm transition active:scale-[.98]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><TicketPercent className="h-6 w-6" /></div>
                  <div className="mt-4 text-lg font-black tracking-[-.04em] text-slate-950">Ventajas privadas</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">Cupones y promociones para volver.</div>
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-black text-amber-700">Ver ventajas <ChevronRight className="h-4 w-4" /></div>
                </a>
              </div>
            </SectionCard>
          </div>
        ) : null}

        {currentTab === "reservas" ? (
          <div className="space-y-5">
            {sp.cambiar ? (
              <SectionCard accent={accent} title="Cambiar hora" subtitle="Selecciona una nueva hora disponible" icon={<RefreshCw className="h-5 w-5" />} right={<a href={buildTabHref("reservas")} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500">Cerrar</a>}>
                {!reservaSeleccionadaCambio ? (
                  <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">No se encontró esta reserva o ya no se puede modificar.</div>
                ) : horasCambio?.ok === false ? (
                  <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{horasCambio.response || "No se pudieron cargar las horas disponibles."}</div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Reserva actual</div>
                      <div className="mt-2 text-lg font-black tracking-[-0.04em] text-slate-950">{formatReservaDate(reservaSeleccionadaCambio.fecha_hora_reserva)} · {formatReservaTime(reservaSeleccionadaCambio.fecha_hora_reserva)}</div>
                      <div className="mt-1 text-sm font-bold text-slate-500">{reservaSeleccionadaCambio.personas ?? 0} personas</div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {(horasCambio?.horas ?? []).length === 0 ? <div className="col-span-3 rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Sin horas disponibles.</div> : (horasCambio?.horas ?? []).map((h) => (
                        <a key={h} href={`/c/${token}?tab=reservas&cambiar=${reservaSeleccionadaCambio.id}&hora=${encodeURIComponent(h)}`} className={clsx("rounded-2xl px-3 py-3 text-center text-sm font-black", horaSeleccionadaCambio === h ? "text-white" : "bg-slate-100 text-slate-700")} style={horaSeleccionadaCambio === h ? { backgroundColor: accent } : undefined}>{h}</a>
                      ))}
                    </div>

                    {horaSeleccionadaCambio ? (
                      <ConfirmSubmit message={`¿Confirmas cambiar la reserva a las ${horaSeleccionadaCambio}?`}>
                        <form action={confirmarCambioHoraAction}>
                          <input type="hidden" name="token" value={token} />
                          <input type="hidden" name="reserva_id" value={reservaSeleccionadaCambio.id} />
                          <input type="hidden" name="nueva_fecha" value={horasCambio?.fecha || onlyDate(reservaSeleccionadaCambio.fecha_hora_reserva)} />
                          <input type="hidden" name="nueva_hora" value={horaSeleccionadaCambio} />
                          <LoadingSubmitButton loadingText="Guardando..." style={{ backgroundColor: accent }}>Confirmar nueva hora</LoadingSubmitButton>
                        </form>
                      </ConfirmSubmit>
                    ) : null}
                  </div>
                )}
              </SectionCard>
            ) : null}

            <SectionCard accent={accent} title="Reservas" subtitle="Próximas visitas" icon={<CalendarDays className="h-5 w-5" />} right={<Badge accent={accent} variant="solid">{proximasReservas.length}</Badge>}>
              {proximasReservas.length === 0 ? (
                <EmptyState title="Sin próximas reservas" text="Cuando reserves, aparecerá aquí para poder gestionarla." icon={<CalendarDays className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">{proximasReservas.map((r) => <ReservaCard key={r.id} reserva={r} accent={accent} token={token} whatsappHref={buildWhatsAppReprogramar(r)} managementHref={r.gestion_token ? `/reserva/${r.gestion_token}` : null} canCancel={canCancelReserva(r)} canChange={canCancelReserva(r)} cancelarReservaAction={cancelarReservaAction} />)}</div>
              )}
            </SectionCard>

            <SectionCard accent={accent} title="Historial" subtitle="Últimas visitas" icon={<Clock3 className="h-5 w-5" />}>
              {historialReservas.length === 0 ? (
                <EmptyState title="Sin visitas anteriores" text="Tu historial aparecerá cuando completes visitas." icon={<Clock3 className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-2">{historialReservas.slice(0, 6).map((r) => <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"><div><div className="text-sm font-black text-slate-950">{formatReservaDate(r.fecha_hora_reserva)}</div><div className="text-xs font-semibold text-slate-500">{formatReservaTime(r.fecha_hora_reserva)} · {r.personas ?? 0} personas</div></div><Badge accent={accent}>{estadoReservaLabel(r.estado)}</Badge></div>)}</div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {currentTab === "premios" && fidelizacionActiva ? (
          <div className="space-y-5">
            <RewardHeroPanel
              accent={accent}
              puntos={puntos}
              puntosPorEuro={puntosPorEuro}
              premioDestacado={premioDestacado}
              canjeables={premiosCanjeables}
              canjesPendientes={canjesPendientes}
              levelLabel={clientLevel.label}
              levelText={clientLevel.text}
            />

            {canjesPendientes.length > 0 ? (
              <SectionCard accent={accent} title="Premios para validar" subtitle="Muestra este pase al personal" icon={<IdCard className="h-5 w-5" />} right={<Badge accent={accent} variant="solid">{canjesPendientes.length}</Badge>}>
                <div id="premios-validacion" className="space-y-3 scroll-mt-24">
                  {canjesPendientes.map((c) => {
                    const premio = premiosById.get(c.premio_id);
                    return <ValidationCard key={c.id} title={premio?.nombre ?? "Premio"} subtitle={`${c.puntos_usados} puntos usados`} code={validationCode(c.id)} accent={accent} status={c.estado} />;
                  })}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              accent={accent}
              title="Catálogo de premios"
              subtitle="Recompensas claras para volver al restaurante"
              icon={<Gift className="h-5 w-5" />}
              right={<Badge accent={accent} variant={premiosCanjeables.length > 0 ? "solid" : "soft"}>{premiosCanjeables.length} listos</Badge>}
            >
              {premiosPuntos.length === 0 ? (
                <EmptyState title="Sin premios configurados" text="El restaurante todavía no ha añadido recompensas." icon={<Gift className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">
                  {premiosPuntos.map((premio) => (
                    <RewardCard
                      key={premio.id}
                      premio={premio}
                      puntos={puntos}
                      accent={accent}
                      token={token}
                      canjeActivo={canjesActivosByPremioId.get(premio.id) ?? null}
                      canjearAction={canjearAction}
                      confirmMessage={CONFIRM_MSG}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <RewardSteps accent={accent} />
          </div>
        ) : null}

        {currentTab === "cupones" && fidelizacionActiva ? (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-[34px] bg-slate-950 p-5 text-white shadow-[0_22px_70px_rgba(15,23,42,0.20)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.20em] text-white/45">Club privado</div>
                  <h2 className="mt-2 text-[30px] font-black leading-none tracking-[-0.07em] !text-white">Ventajas para volver</h2>
                  <p className="mt-2 max-w-[330px] text-sm font-semibold leading-relaxed text-white/75">Cupones claros para usar en el restaurante. Actívalos solo cuando estés allí y muéstralos al personal.</p>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-white/10 px-4 py-3 text-center backdrop-blur">
                  <div className="text-4xl font-black tracking-[-0.08em]">{cuponesDisponibles.length}</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">listos</div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-[22px] bg-white/10 p-3 text-center"><div className="text-xl font-black">{cuponesPreparados.length}</div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">activos</div></div>
                <div className="rounded-[22px] bg-white/10 p-3 text-center"><div className="text-xl font-black">{cuponesDisponibles.length}</div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">ahora</div></div>
                <div className="rounded-[22px] bg-white/10 p-3 text-center"><div className="text-xl font-black">{cuponesProximos.length}</div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45">próximos</div></div>
              </div>
            </section>

            {totalCuponesVisibles === 0 && cuponesUsadosRecientes.length === 0 ? (
              <SectionCard accent={accent} title="Cupones y ventajas" subtitle="Promos privadas para volver" icon={<TicketPercent className="h-5 w-5" />}>
                <EmptyState title="Sin cupones activos" text="Las promociones del restaurante aparecerán aquí." icon={<TicketPercent className="h-6 w-6" />} accent={accent} />
              </SectionCard>
            ) : null}

            {cuponesPreparados.length > 0 ? (
              <SectionCard accent={accent} title="Listo para enseñar" subtitle="Muestra este pase al personal" icon={<IdCard className="h-5 w-5" />} right={<Badge accent={accent} variant="solid">{cuponesPreparados.length}</Badge>}>
                <div className="space-y-4">
                  {cuponesPreparados.map((promo) => {
                    const estado = cuponEstadoById.get(promo.cupon.id);
                    return (
                      <div key={promo.cupon.id} className="space-y-3">
                        <ScratchCoupon title={promo.cupon.nombre} subtitle={promo.cupon.beneficio} code={validationCode(promo.cupon.id)} accent={accent} status="activo" />
                        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
                          {estado?.caduca_en ? `Válido hasta ${new Date(estado.caduca_en).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : "Enséñalo al personal antes de usarlo."}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            ) : null}

            {cuponesDisponibles.length > 0 ? (
              <SectionCard accent={accent} title="Disponibles ahora" subtitle="Ventajas que el cliente puede activar en el local" icon={<Zap className="h-5 w-5" />} right={<Badge accent={accent} variant="solid">{cuponesDisponibles.length} ahora</Badge>}>
                <div className="space-y-3">
                  {cuponesDisponibles.map((promo, index) => (
                    <div key={promo.cupon.id} className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-sm">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: index === 0 ? accent : "#0f172a" }}>
                              {promo.tipo === "cumpleanos" ? <Crown className="h-6 w-6" /> : <TicketPercent className="h-6 w-6" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Ventaja exclusiva</div>
                              <div className="mt-1 text-lg font-black leading-tight tracking-[-0.04em] text-slate-950">{promo.cupon.nombre}</div>
                              <div className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">{promo.cupon.beneficio}</div>
                            </div>
                          </div>
                          <Badge accent={accent} variant="success">Ahora</Badge>
                        </div>

                        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
                          Pulsa para prepararlo y enseñar el código al personal. No hace pedidos ni afecta al camarero digital.
                        </div>

                        <div className="mt-4">
                          <ConfirmSubmit message={CONFIRM_MSG}>
                            <form action={canjearCuponAction}>
                              <input type="hidden" name="token" value={token} />
                              <input type="hidden" name="cupon_id" value={promo.cupon.id} />
                              <LoadingSubmitButton loadingText="Activando ventaja..." className="bg-slate-950 py-4 shadow-lg">Activar ventaja</LoadingSubmitButton>
                            </form>
                          </ConfirmSubmit>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            {cuponesProximos.length > 0 ? (
              <SectionCard accent={accent} title="Próximas ventajas" subtitle="Aparecen bloqueadas para que el cliente sepa qué puede conseguir" icon={<Clock3 className="h-5 w-5" />} right={<Badge accent={accent}>{cuponesProximos.length}</Badge>}>
                <div className="space-y-3">
                  {cuponesProximos.map((promo) => (
                    <div key={promo.cupon.id} className="rounded-[26px] border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-black tracking-[-0.03em] text-slate-950">{promo.cupon.nombre}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-500">{promo.cupon.beneficio}</div>
                        </div>
                        <Badge accent={accent} variant="soft">{promo.texto}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard accent={accent} title="Cómo funcionan" subtitle="Simple para el cliente y para el restaurante" icon={<ShieldCheck className="h-5 w-5" />}>
              <div className="grid gap-3">
                {["Activa la ventaja cuando estés en el local", "Muestra el código al personal", "El restaurante valida el cupón y lo marca como usado"].map((text, i) => (
                  <div key={text} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: accent }}>{i + 1}</div>
                    <div className="text-sm font-bold text-slate-600">{text}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {currentTab === "perfil" ? (
          <div className="space-y-5">
            <SectionCard accent={accent} title="Tus datos" subtitle="Información para reservas y ventajas" icon={<User className="h-5 w-5" />} right={<Badge accent={accent} variant="solid">Activo</Badge>}>
              <form action={actualizarPerfilAction} className="space-y-3">
                <input type="hidden" name="token" value={token} />
                <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><User className="h-4 w-4" /> Nombre</span><input name="nombre" defaultValue={String(cliente.nombre ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><Phone className="h-4 w-4" /> Teléfono</span><input name="telefono" defaultValue={String(cliente.telefono ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><Mail className="h-4 w-4" /> Email</span><input name="email" type="email" defaultValue={String(cliente.email ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><IdCard className="h-4 w-4" /> Fecha de nacimiento</span><input name="fecha_nacimiento" type="date" defaultValue={onlyDate(cliente.fecha_nacimiento)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <LoadingSubmitButton loadingText="Guardando..." style={{ backgroundColor: accent }}>Guardar cambios</LoadingSubmitButton>
              </form>
            </SectionCard>

            <SectionCard accent={accent} title="Avisos" subtitle="Mensajes del restaurante" icon={<Bell className="h-5 w-5" />} right={<Badge accent={accent} variant={avisosSinLeer > 0 ? "solid" : "soft"}>{avisosSinLeer} sin leer</Badge>}>
              <div id="avisos-app" />
              {notificaciones.length === 0 ? (
                <EmptyState title="Sin avisos" text="Aquí verás novedades, reservas y promos." icon={<Bell className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">
                  {notificaciones.map((n) => (
                    <div key={n.id} className={clsx("rounded-[28px] border bg-white p-4 shadow-sm", n.leida ? "border-slate-100" : "border-white")} style={!n.leida ? { boxShadow: `0 18px 52px ${rgba(accent, 0.14)}` } : undefined}>
                      <div className="flex items-start gap-3">
                        <IconBubble accent={accent}>{n.leida ? <Mail className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</IconBubble>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{n.tipo}</div><div className="mt-1 font-black tracking-[-0.03em] text-slate-950">{n.titulo}</div></div>{!n.leida ? <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: accent }} /> : null}</div>
                          <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{n.mensaje}</div>
                          <div className="mt-2 text-xs font-semibold text-slate-400">{new Date(n.created_at).toLocaleString("es-ES")}</div>
                          <div className="mt-4 flex flex-wrap gap-2">{n.url ? <a href={n.url} className="rounded-2xl px-4 py-2 text-xs font-black text-white" style={{ backgroundColor: accent }}>Ver aviso</a> : null}{n.leida ? <Badge accent={accent}>Leída</Badge> : <form action={marcarAvisoLeidoAction}><input type="hidden" name="token" value={token} /><input type="hidden" name="aviso_id" value={n.id} /><LoadingSubmitButton loadingText="Marcando..." className="w-auto rounded-2xl bg-slate-100 px-4 py-2 text-xs text-slate-600">Marcar leída</LoadingSubmitButton></form>}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard accent={accent} title="Contacto" subtitle={restoNombre} icon={<MessageCircle className="h-5 w-5" />}>
              <div className="grid gap-3">
                {restauranteTelefono ? <a href={`https://wa.me/${restauranteTelefono}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><div><div className="font-black text-slate-950">WhatsApp del restaurante</div><div className="mt-1 text-sm font-semibold text-slate-500">Contactar directamente</div></div><ChevronRight className="h-5 w-5 text-slate-300" /></a> : null}
                <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><ShieldCheck className="h-5 w-5 shrink-0" style={{ color: accent }} /><div><div className="font-black text-slate-950">App privada</div><div className="mt-1 text-sm font-semibold text-slate-500">Guarda este enlace para volver a tus reservas, premios y avisos.</div></div></div></div>
              </div>
            </SectionCard>
          </div>
        ) : null}

        <div className="rounded-[26px] border border-white/80 bg-white/72 p-4 text-center shadow-sm backdrop-blur">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">GastroHelp</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">Reservas, ventajas y avisos privados del restaurante.</div>
        </div>
      </div>

      <BottomNav currentTab={currentTab} buildTabHref={buildTabHref} avisosSinLeer={avisosSinLeer} accent={accent} fidelizacionActiva={fidelizacionActiva} />
    </AppShell>
  );
}
