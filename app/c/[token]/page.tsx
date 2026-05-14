// app/c/[token]/page.tsx
import React from "react";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  Gift,
  History,
  Home,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  TicketPercent,
  User,
  Users,
  WalletCards,
  XCircle,
  Zap,
  Settings2,
  QrCode,
  BadgeCheck,
  CalendarClock,
  MessageCircle,
  IdCard,
} from "lucide-react";
import PremioImage from "./PremioImage";
import ConfirmSubmit from "./ConfirmSubmit";
import { crearNotificacionCliente } from "@/app/(app)/lib/crearNotificacionCliente";

export const dynamic = "force-dynamic";

type RestauranteBrand = {
  id: string;
  nombre: string | null;
  telefono?: string | null;
  color_primario?: string | null;
  color_fondo?: string | null;
  logo_url?: string | null;
  puntos_por_euro?: number | null;
  puntos_activo?: boolean | null;
};

type ClienteRow = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  restaurante_id: string;
  public_token: string;
  fecha_nacimiento?: string | null;
};

type PremioPuntos = {
  id: string;
  nombre: string;
  descripcion: string | null;
  puntos_requeridos: number;
  imagen_url: string | null;
  activo: boolean;
  creado_en: string;
};

type Cupon = {
  id: string;
  nombre: string;
  beneficio: string;
  condiciones: any;
  activo: boolean;
  creado_en?: string;
};

type CanjePuntos = {
  id: string;
  premio_id: string;
  puntos_usados: number;
  estado: "pendiente" | "confirmado" | "cancelado";
  creado_en: string;
  confirmado_en: string | null;
};

type CuponClienteRow = {
  cupon_id: string;
  estado: "activo" | "canjeado" | "caducado";
  creado_en?: string | null;
  canjeado_en?: string | null;
  caduca_en?: string | null;
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
  amelia_appointment_id: number | null;
  amelia_booking_id: number | null;
  amelia_cancel_url: string | null;
  amelia_booking_token: string | null;
  created_at: string | null;
};

type ClienteHistorialRow = {
  id: string;
  cliente_id: string;
  restaurante_id: string;
  reserva_id: string | null;
  tipo: string | null;
  descripcion: string | null;
  created_at: string | null;
  personas: number | null;
  gasto_eur: number | null;
  turno: string | null;
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

type TabKey = "inicio" | "reservas" | "premios" | "cupones" | "perfil";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, service, { auth: { persistSession: false } });
}

function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function hexToRgb(hex: string) {
  const clean = String(hex || "#2563eb").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((x) => x + x).join("") : clean;
  const n = Number.parseInt(full, 16);

  if (Number.isNaN(n)) return { r: 37, g: 99, b: 235 };

  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function onlyDate(v: string | null | undefined) {
  return String(v ?? "").slice(0, 10);
}

function validationCode(id: string | null | undefined) {
  const clean = String(id ?? "").replace(/-/g, "").toUpperCase();
  if (!clean) return "GH-0000";
  return `GH-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

function AppShell({ children, accent, bg }: { children: React.ReactNode; accent: string; bg: string }) {
  return (
    <div
      className="min-h-screen text-slate-950"
      style={{
        background: `
          radial-gradient(900px 420px at 0% -10%, ${rgba(accent, 0.32)}, transparent 62%),
          radial-gradient(700px 360px at 100% 0%, ${rgba(accent, 0.18)}, transparent 58%),
          linear-gradient(180deg, ${bg}, #ffffff 42%, #f8fafc 100%)
        `,
      }}
    >
      <div className="mx-auto min-h-screen w-full max-w-[520px] px-4 pb-28 pt-4 sm:pt-6">{children}</div>
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
  variant?: "soft" | "solid" | "danger" | "dark" | "success";
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
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-black leading-none tracking-tight",
        className
      )}
      style={style}
    >
      {children}
    </span>
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
    <section
      className={clsx(
        "overflow-hidden rounded-[30px] border border-white/70 bg-white/86 p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? <IconBubble accent={accent}>{icon}</IconBubble> : null}
          <div className="min-w-0">
            <h2 className="text-[19px] font-black leading-tight tracking-[-0.03em] text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p> : null}
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
    <div
      className="rounded-[24px] border border-dashed p-6 text-center"
      style={{ borderColor: rgba(accent, 0.22), backgroundColor: rgba(accent, 0.06) }}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm" style={{ color: accent }}>
        {icon}
      </div>
      <div className="mt-3 text-base font-black tracking-tight text-slate-950">{title}</div>
      <div className="mt-1 text-sm font-medium text-slate-500">{text}</div>
    </div>
  );
}

function ProgressBar({ pct, accent }: { pct: number; accent: string }) {
  const v = Math.max(0, Math.min(100, pct));

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/75">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${v}%`, background: `linear-gradient(90deg, ${accent}, ${rgba(accent, 0.62)})` }}
      />
    </div>
  );
}

function ScoreRing({ pct, points }: { pct: number; points: number }) {
  const v = Math.max(0, Math.min(100, pct));
  const r = 38;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;

  return (
    <div className="relative h-[112px] w-[112px] shrink-0">
      <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
        <circle cx="56" cy="56" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="12" />
        <circle
          cx="56"
          cy="56"
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <div className="text-2xl font-black tracking-[-0.05em]">{points}</div>
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/75">puntos</div>
      </div>
    </div>
  );
}

function TopAppHeader({
  restauranteNombre,
  clienteNombre,
  logo,
  accent,
  puntos,
  donutPct,
  donutTop,
  donutBottom,
  avisosSinLeer,
}: {
  restauranteNombre: string;
  clienteNombre: string;
  logo: string | null;
  accent: string;
  puntos: number;
  donutPct: number;
  donutTop: string;
  donutBottom: string;
  avisosSinLeer: number;
}) {
  return (
    <header
      className="relative overflow-hidden rounded-[34px] p-5 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]"
      style={{
        background: `
          radial-gradient(500px 210px at 100% 0%, rgba(255,255,255,0.24), transparent 58%),
          linear-gradient(135deg, ${accent}, #0f172a 92%)
        `,
      }}
    >
      <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-white/10" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white/15 shadow-lg backdrop-blur">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={restauranteNombre} className="h-full w-full object-cover" />
            ) : (
              <Crown className="h-7 w-7 text-white" />
            )}
          </div>

          <div className="min-w-0">
            <div className="truncate text-xs font-black uppercase tracking-[0.2em] text-white/70">{restauranteNombre}</div>
            <h1 className="mt-1 truncate text-3xl font-black tracking-[-0.06em] text-white">Hola, {clienteNombre}</h1>
          </div>
        </div>

        <a href="#avisos-app" className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
          <Bell className="h-5 w-5" />
          {avisosSinLeer > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-slate-950">
              {avisosSinLeer}
            </span>
          ) : null}
        </a>
      </div>

      <div className="relative z-10 mt-7 grid grid-cols-[1fr_auto] items-end gap-4">
        <div>
          <div className="inline-flex items-center rounded-full border border-white/20 bg-white/12 px-3 py-1 text-xs font-black text-white/85 backdrop-blur">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            App cliente
          </div>
          <div className="mt-5 text-sm font-bold text-white/70">Próximo objetivo</div>
          <div className="mt-1 text-xl font-black tracking-[-0.04em] text-white">{donutTop}</div>
          <div className="mt-1 max-w-[220px] text-sm font-semibold text-white/70">{donutBottom}</div>
        </div>

        <ScoreRing pct={donutPct} points={puntos} />
      </div>
    </header>
  );
}

function StatTile({
  icon,
  title,
  value,
  subtitle,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  accent: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/80 bg-white/88 p-4 shadow-[0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <IconBubble accent={accent}>{icon}</IconBubble>
        <ChevronRight className="mt-1 h-4 w-4 text-slate-300" />
      </div>
      <div className="mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{title}</div>
      <div className="mt-1 text-2xl font-black tracking-[-0.05em] text-slate-950">{value}</div>
      {subtitle ? <div className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function BottomNav({
  currentTab,
  buildTabHref,
  avisosSinLeer,
  accent,
}: {
  currentTab: TabKey;
  buildTabHref: (tab: TabKey) => string;
  avisosSinLeer: number;
  accent: string;
}) {
  const items: Array<{ key: TabKey; label: string; icon: React.ReactNode; count?: number }> = [
    { key: "inicio", label: "Inicio", icon: <Home className="h-5 w-5" /> },
    { key: "reservas", label: "Reservas", icon: <CalendarDays className="h-5 w-5" /> },
    { key: "premios", label: "Premios", icon: <Gift className="h-5 w-5" /> },
    { key: "cupones", label: "Cupones", icon: <TicketPercent className="h-5 w-5" /> },
    { key: "perfil", label: "Perfil", icon: <User className="h-5 w-5" />, count: avisosSinLeer },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[560px] px-4 pb-4">
      <div className="rounded-[28px] border border-white/80 bg-white/88 px-2 py-2 shadow-[0_20px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className="grid grid-cols-5 gap-1">
          {items.map((item) => {
            const active = currentTab === item.key;

            return (
              <a
                key={item.key}
                href={buildTabHref(item.key)}
                className={clsx(
                  "relative flex flex-col items-center justify-center rounded-2xl px-1 py-2 text-[10px] font-black transition",
                  active ? "text-white" : "text-slate-400 hover:text-slate-700"
                )}
                style={active ? { backgroundColor: accent } : undefined}
              >
                <div className="relative">
                  {item.icon}
                  {item.count && item.count > 0 ? (
                    <span
                      className={clsx(
                        "absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black",
                        active ? "bg-white text-slate-950" : "text-white"
                      )}
                      style={!active ? { backgroundColor: accent } : undefined}
                    >
                      {item.count}
                    </span>
                  ) : null}
                </div>
                <span className="mt-1 leading-none">{item.label}</span>
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function AppNotice({ type, title, text, dbg }: { type: "ok" | "err"; title: string; text: string; dbg?: string }) {
  const ok = type === "ok";

  return (
    <div className={clsx("rounded-[24px] border p-4 shadow-sm", ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
      <div className="flex items-start gap-3">
        {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />}
        <div>
          <div className={clsx("text-sm font-black", ok ? "text-emerald-900" : "text-red-900")}>{title}</div>
          <div className={clsx("mt-1 text-sm font-semibold", ok ? "text-emerald-700" : "text-red-700")}>{text}</div>
          {dbg ? <div className="mt-2 break-all text-[10px] text-red-600/70">dbg: {dbg}</div> : null}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, href, accent, disabled = false }: { children: React.ReactNode; href?: string | null; accent: string; disabled?: boolean }) {
  if (disabled || !href) {
    return (
      <button type="button" disabled className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-400">
        {children}
      </button>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm transition" style={{ backgroundColor: accent }}>
      {children}
    </a>
  );
}

function ReservaCard({
  reserva,
  accent,
  token,
  whatsappHref,
  canCancel,
  cancelarReservaAction,
  featured = false,
}: {
  reserva: ReservaCliente;
  accent: string;
  token: string;
  whatsappHref: string | null;
  canCancel: boolean;
  cancelarReservaAction: (formData: FormData) => Promise<void>;
  featured?: boolean;
}) {
  return (
    <div
      className={clsx("rounded-[28px] border bg-white p-4 shadow-[0_14px_42px_rgba(15,23,42,0.07)]", featured ? "border-white/90" : "border-slate-100")}
      style={featured ? { boxShadow: `0 22px 58px ${rgba(accent, 0.16)}` } : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <IconBubble accent={accent} dark={featured}>
            <CalendarDays className="h-5 w-5" />
          </IconBubble>
          <div>
            <div className="text-lg font-black tracking-[-0.04em] text-slate-950">{formatReservaDate(reserva.fecha_hora_reserva)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-500">
              <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" />{formatReservaTime(reserva.fecha_hora_reserva)}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{reserva.personas ?? 0} personas</span>
            </div>
            {reserva.turno ? <div className="mt-1 text-sm font-semibold text-slate-400">{reserva.turno}</div> : null}
          </div>
        </div>

        <Badge accent={accent} variant={String(reserva.estado ?? "").toLowerCase() === "cancelada" ? "danger" : "soft"}>
          {estadoReservaLabel(reserva.estado)}
        </Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <a
          href={`/c/${token}?tab=reservas&cambiar=${reserva.id}`}
          className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm transition"
          style={{ backgroundColor: accent }}
        >
          Cambiar hora
        </a>

        {canCancel ? (
          <ConfirmSubmit message="¿Seguro que quieres cancelar esta reserva?">
            <form action={cancelarReservaAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="reserva_id" value={reserva.id} />
              <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-sm transition">
                Cancelar
              </button>
            </form>
          </ConfirmSubmit>
        ) : (
          <button type="button" disabled className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-400" title="Solo se puede cancelar si faltan más de 3 horas">
            Cancelar
          </button>
        )}
      </div>

      <details className="group mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-relaxed text-slate-500">
        <summary className="flex cursor-pointer list-none items-center justify-between font-black text-slate-600">
          Gestión desde app
          <ChevronRight className="h-4 w-4 transition group-open:rotate-90" />
        </summary>
        <p className="mt-2">
          Puedes cambiar la hora o cancelar la reserva directamente desde el panel.
        </p>
      </details>
    </div>
  );
}

function ValidationCard({
  title,
  subtitle,
  code,
  accent,
  status,
}: {
  title: string;
  subtitle: string;
  code: string;
  accent: string;
  status: "pendiente" | "confirmado" | "cancelado" | "activo" | "canjeado" | "caducado";
}) {
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
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/14">
            <QrCode className="h-7 w-7" />
          </div>
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

function getNowMadridParts() {
  const dtf = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = dtf.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";

  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hh = Number(get("hour"));
  const mm = Number(get("minute"));
  const dayJS = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" })).getDay();
  const weekdayMon0 = (dayJS + 6) % 7;

  return { y, m, d, hh, mm, weekdayMon0 };
}

function timeToMinutes(t: string) {
  const [H, M] = (t ?? "").split(":").map((x) => Number(x));
  return (H || 0) * 60 + (M || 0);
}

function isNowWithinWindow(nowMin: number, startMin: number, endMin: number) {
  if (startMin <= endMin) return nowMin >= startMin && nowMin <= endMin;
  return nowMin >= startMin || nowMin <= endMin;
}

function isBirthdayPromoActive(args: { fechaNacimiento: string | null | undefined; diasAntes: number; validezDias: number }) {
  const { fechaNacimiento, diasAntes, validezDias } = args;
  if (!fechaNacimiento) return { ok: false, motivo: "Sin fecha de nacimiento" };

  const { y, m, d } = getNowMadridParts();
  const today = new Date(Date.UTC(y, m - 1, d));
  const fn = new Date(fechaNacimiento);

  if (Number.isNaN(fn.getTime())) return { ok: false, motivo: "Fecha inválida" };

  const bMonth = fn.getUTCMonth();
  const bDay = fn.getUTCDate();
  let bThis = new Date(Date.UTC(y, bMonth, bDay));
  if (bThis < today) bThis = new Date(Date.UTC(y + 1, bMonth, bDay));

  const start = new Date(bThis);
  start.setUTCDate(start.getUTCDate() - Math.max(0, diasAntes));

  const end = new Date(bThis);
  end.setUTCDate(end.getUTCDate() + Math.max(0, validezDias) - 1);

  const ok = today >= start && today <= end;
  const msDay = 24 * 60 * 60 * 1000;
  const daysToStart = Math.ceil((start.getTime() - today.getTime()) / msDay);

  return { ok, motivo: ok ? "Disponible" : daysToStart > 0 ? `Disponible en ${daysToStart} días` : "Fuera de fecha" };
}

function isHappyHourActive(args: { diasSemana: number[]; horaInicio: string; horaFin: string }) {
  const { diasSemana, horaInicio, horaFin } = args;
  const { hh, mm, weekdayMon0 } = getNowMadridParts();
  const dayOk = Array.isArray(diasSemana) ? diasSemana.includes(weekdayMon0) : false;
  const nowMin = hh * 60 + mm;
  const startMin = timeToMinutes(horaInicio);
  const endMin = timeToMinutes(horaFin);
  const timeOk = isNowWithinWindow(nowMin, startMin, endMin);

  return { ok: dayOk && timeOk, motivo: dayOk ? (timeOk ? "Disponible ahora" : `Horario: ${horaInicio}–${horaFin}`) : "Hoy no aplica" };
}

function pickPromoDate(row: CuponClienteRow) {
  return row.canjeado_en ?? row.creado_en ?? null;
}

function formatReservaDate(v: string | null) {
  if (!v) return "Sin fecha";
  return new Date(v).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

function formatReservaTime(v: string | null) {
  if (!v) return "";
  return new Date(v).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDateTime(v: string | null) {
  if (!v) return "Sin fecha";
  return new Date(v).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function normalizePhone(v: string | null | undefined) {
  const clean = String(v ?? "").replace(/\D/g, "");
  if (!clean) return "";
  if (clean.startsWith("34")) return clean;
  if (clean.length === 9) return `34${clean}`;
  return clean;
}

function estadoReservaLabel(estado: string | null) {
  const e = String(estado ?? "").trim();
  if (!e) return "Sin estado";
  return e.charAt(0).toUpperCase() + e.slice(1);
}

function canCancelReserva(reserva: ReservaCliente) {
  if (!reserva.fecha_hora_reserva) return false;
  const estado = String(reserva.estado ?? "").toLowerCase();
  if (estado === "cancelada") return false;
  const reservaMs = new Date(reserva.fecha_hora_reserva).getTime();
  const nowMs = Date.now();
  const minMs = 3 * 60 * 60 * 1000;
  return reservaMs - nowMs > minMs;
}

export default async function ClientePremiosPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; err?: string; dbg?: string; tab?: string; cambiar?: string; hora?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const supabase = getAdmin();

  const tabValues: TabKey[] = ["inicio", "reservas", "premios", "cupones", "perfil"];
  const currentTab: TabKey = tabValues.includes((sp.tab ?? "") as TabKey) ? (sp.tab as TabKey) : "inicio";
  const buildTabHref = (tab: TabKey) => `/c/${token}?tab=${tab}`;
  const CONFIRM_MSG = "IMPORTANTE: canjea solo cuando estés en el restaurante. Muestra esta pantalla al personal para validarlo. ¿Quieres continuar?";

  async function completarPerfilAction(formData: FormData) {
    "use server";

    const tokenLocal = String(formData.get("token") ?? "");
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

    const tokenLocal = String(formData.get("token") ?? "");
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

    const premioId = String(formData.get("premio_id") ?? "");
    const tokenLocal = String(formData.get("token") ?? "");
    const admin = getAdmin();
    const { data: cliente } = await admin.from("clientes").select("id,restaurante_id,public_token").eq("public_token", tokenLocal).maybeSingle();
    if (!cliente) redirect(`/c/${tokenLocal}?tab=premios&err=cliente`);

    const { error } = await admin.rpc("rpc_canjear_premio", {
      p_cliente_id: cliente.id,
      p_restaurante_id: cliente.restaurante_id,
      p_premio_id: premioId,
    });

    if (error) {
      const code = /insuficientes/i.test(error.message) ? "puntos" : /no disponible/i.test(error.message) ? "premio" : "canje";
      redirect(`/c/${tokenLocal}?tab=premios&err=${code}`);
    }

    redirect(`/c/${tokenLocal}?tab=premios&ok=premio`);
  }

  async function canjearCuponAction(formData: FormData) {
    "use server";

    const tokenLocal = String(formData.get("token") ?? "");
    const cuponId = String(formData.get("cupon_id") ?? "");
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

    const { error } = await admin.from("cupon_cliente").insert({
      cliente_id: cliente.id,
      restaurante_id: cliente.restaurante_id,
      cupon_id: cuponId,
      estado: "activo",
      creado_en: new Date().toISOString(),
    });

    if (error) {
      const msg = encodeURIComponent(`${error.code ?? ""}|${error.message ?? ""}`);
      redirect(`/c/${tokenLocal}?tab=cupones&err=canje&dbg=${msg}`);
    }

    redirect(`/c/${tokenLocal}?tab=cupones&ok=cupon`);
  }

  async function cancelarReservaAction(formData: FormData) {
    "use server";

    const tokenLocal = String(formData.get("token") ?? "").trim();
    const reservaId = String(formData.get("reserva_id") ?? "").trim();

    if (!tokenLocal || !reservaId) {
      redirect(`/c/${tokenLocal || token}?tab=reservas&err=cancel`);
    }

    let ok = false;
    let errorMsg = "";

    try {
      const res = await fetch("https://n8n.gastrohelp.es/webhook/panel-cancelar-reserva", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: tokenLocal,
          reserva_id: reservaId,
        }),
        cache: "no-store",
      });

      let data: any = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || data?.ok === false) {
        errorMsg = String(data?.error || data?.message || `HTTP_${res.status}`);
      } else {
        ok = true;
      }
    } catch (error: any) {
      errorMsg = String(error?.message || "WEBHOOK_ERROR");
    }

    if (ok) {
      redirect(`/c/${tokenLocal}?tab=reservas&ok=reserva_cancelada`);
    }

    redirect(`/c/${tokenLocal}?tab=reservas&err=cancel&dbg=${encodeURIComponent(errorMsg || "UNKNOWN_ERROR")}`);
  }

  async function confirmarCambioHoraAction(formData: FormData) {
    "use server";

    const tokenLocal = String(formData.get("token") || "").trim();
    const reservaId = String(formData.get("reserva_id") || "").trim();
    const nuevaFecha = String(formData.get("nueva_fecha") || "").trim();
    const nuevaHora = String(formData.get("nueva_hora") || "").trim();

    if (!tokenLocal || !reservaId || !nuevaFecha || !nuevaHora) {
      redirect(`/c/${tokenLocal || token}?tab=reservas&err=reprogramar`);
    }

    let ok = false;
    let errorMsg = "";

    try {
      const res = await fetch("https://n8n.gastrohelp.es/webhook/panel-reprogramar-confirmar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: tokenLocal,
          reserva_id: reservaId,
          nueva_fecha: nuevaFecha,
          nueva_hora: nuevaHora,
        }),
        cache: "no-store",
      });

      let data: any = null;

      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok || data?.ok === false) {
        errorMsg = String(data?.error || data?.message || data?.response || `HTTP_${res.status}`);
      } else {
        ok = true;
      }
    } catch (error: any) {
      errorMsg = String(error?.message || "WEBHOOK_ERROR");
    }

    if (ok) {
      redirect(`/c/${tokenLocal}?tab=reservas&ok=reserva_reprogramada`);
    }

    redirect(`/c/${tokenLocal}?tab=reservas&err=reprogramar&dbg=${encodeURIComponent(errorMsg || "UNKNOWN_ERROR")}`);
  }

  async function marcarAvisoLeidoAction(formData: FormData) {
    "use server";

    const tokenLocal = String(formData.get("token") ?? "");
    const avisoId = String(formData.get("aviso_id") ?? "");
    const admin = getAdmin();
    const { data: cliente } = await admin.from("clientes").select("id, restaurante_id, public_token").eq("public_token", tokenLocal).maybeSingle();
    if (!cliente) redirect(`/c/${tokenLocal}?tab=perfil&err=cliente`);

    const { error } = await admin.from("cliente_notificaciones").update({ leida: true }).eq("id", avisoId).eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id);
    if (error) redirect(`/c/${tokenLocal}?tab=perfil&err=aviso`);
    redirect(`/c/${tokenLocal}?tab=perfil&ok=aviso_leido`);
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
            <div className="mt-2 text-sm font-medium text-slate-500">Revisa el enlace o pide uno nuevo en el restaurante.</div>
          </div>
        </div>
      </AppShell>
    );
  }

  const faltaNombre = !String(cliente.nombre ?? "").trim();
  const faltaTelefono = !String(cliente.telefono ?? "").trim();
  const faltaEmail = !String(cliente.email ?? "").trim();
  const faltaNacimiento = !String(cliente.fecha_nacimiento ?? "").trim();
  const needsOnboarding = faltaNombre || faltaTelefono || faltaEmail || faltaNacimiento;

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
              {sp.err ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                  {sp.err === "perfil" ? "Rellena todos los campos." : sp.err === "email" ? "Email no válido." : sp.err === "fecha" ? "Fecha no válida." : "No se pudo guardar."}
                </div>
              ) : null}

              <form action={completarPerfilAction} className="space-y-3">
                <input type="hidden" name="token" value={token} />
                <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Nombre</span><input name="nombre" defaultValue={String(cliente.nombre ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" placeholder="Tu nombre" required /></label>
                <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Teléfono</span><input name="telefono" defaultValue={String(cliente.telefono ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" placeholder="600123123" required /></label>
                <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Email</span><input name="email" type="email" defaultValue={String(cliente.email ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" placeholder="tu@email.com" required /></label>
                <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Fecha de nacimiento</span><input name="fecha_nacimiento" type="date" defaultValue={onlyDate(cliente.fecha_nacimiento)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <button type="submit" className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-4 text-sm font-black text-white shadow-lg">Entrar a mi app</button>
              </form>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  let restaurante: RestauranteBrand | null = null;

  try {
    const r = await supabase.from("restaurantes").select("id,nombre,telefono,color_primario,color_fondo,logo_url,puntos_por_euro,puntos_activo").eq("id", cliente.restaurante_id).maybeSingle();
    restaurante = (r.data as any) ?? null;
  } catch {
    restaurante = null;
  }

  const restoNombre = restaurante?.nombre ?? "Restaurante";
  const accent = restaurante?.color_primario ?? "#2563eb";
  const bg = restaurante?.color_fondo ?? "#f8fafc";
  const logo = restaurante?.logo_url ?? null;
  const restauranteTelefono = normalizePhone(restaurante?.telefono);
  const puntosPorEuro = Number(restaurante?.puntos_por_euro ?? 0);
  const puntosActivo = Boolean(restaurante?.puntos_activo ?? puntosPorEuro > 0);

  function buildWhatsAppReprogramar(reserva: ReservaCliente) {
    if (!restauranteTelefono) return null;
    const fecha = formatReservaDate(reserva.fecha_hora_reserva);
    const hora = formatReservaTime(reserva.fecha_hora_reserva);
    const personas = reserva.personas ?? "";
    const msg = `Hola, quiero cambiar mi reserva del ${fecha} a las ${hora} para ${personas} personas.`;
    return `https://wa.me/${restauranteTelefono}?text=${encodeURIComponent(msg)}`;
  }

  const { data: saldo } = await supabase.from("puntos_saldos").select("puntos").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).maybeSingle();
  const puntos = Number((saldo as any)?.puntos ?? 0);

  const { data: premiosRaw } = await supabase.from("premios_puntos").select("id,nombre,descripcion,puntos_requeridos,imagen_url,activo,creado_en").eq("restaurante_id", cliente.restaurante_id).eq("activo", true).order("puntos_requeridos", { ascending: true });
  const premiosPuntos = ((premiosRaw ?? []) as any[]).map((x) => ({ id: x.id, nombre: x.nombre, descripcion: x.descripcion ?? null, puntos_requeridos: Number(x.puntos_requeridos ?? 0), imagen_url: x.imagen_url ?? null, activo: Boolean(x.activo), creado_en: x.creado_en })) as PremioPuntos[];

  const { data: canjesRaw } = await supabase.from("canjes_puntos").select("id,premio_id,puntos_usados,estado,creado_en,confirmado_en").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).order("creado_en", { ascending: false });
  const canjes = ((canjesRaw ?? []) as any[]).map((x) => ({ id: x.id, premio_id: x.premio_id, puntos_usados: Number(x.puntos_usados ?? 0), estado: x.estado, creado_en: x.creado_en, confirmado_en: x.confirmado_en ?? null })) as CanjePuntos[];
  const canjesPendientes = canjes.filter((c) => c.estado === "pendiente");
  const premiosById = new Map(premiosPuntos.map((p) => [p.id, p]));

  const { data: cuponesRaw } = await supabase.from("cupones").select("id,nombre,beneficio,condiciones,activo,creado_en").eq("restaurante_id", cliente.restaurante_id).eq("activo", true).order("creado_en", { ascending: false });
  const cupones = (cuponesRaw ?? []) as Cupon[];

  const { data: cuponClienteRaw } = await supabase.from("cupon_cliente").select("cupon_id,estado,creado_en,canjeado_en,caduca_en").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).order("creado_en", { ascending: false });
  const cuponEstadoById = new Map<string, { estado: CuponClienteRow["estado"]; fecha: string | null; creado_en: string | null; canjeado_en: string | null; caduca_en: string | null }>();

  for (const row of (cuponClienteRaw ?? []) as CuponClienteRow[]) {
    if (!row?.cupon_id) continue;
    if (!cuponEstadoById.has(row.cupon_id)) {
      cuponEstadoById.set(row.cupon_id, { estado: row.estado, fecha: pickPromoDate(row), creado_en: row.creado_en ?? null, canjeado_en: row.canjeado_en ?? null, caduca_en: row.caduca_en ?? null });
    }
  }

  const promosEspeciales = cupones
    .filter((c) => ["cumpleanos", "horas_valle"].includes(c.condiciones?.tipo ?? ""))
    .map((c) => {
      const tipo = c.condiciones?.tipo ?? "";
      if (tipo === "cumpleanos") {
        const diasAntes = Number(c.condiciones?.dias_antes ?? 0);
        const validezDias = Number(c.condiciones?.validez_dias ?? 1);
        const r = isBirthdayPromoActive({ fechaNacimiento: cliente.fecha_nacimiento, diasAntes, validezDias });
        return { cupon: c, tipo, ok: r.ok, texto: r.motivo };
      }
      const diasSemana = (c.condiciones?.dias_semana ?? []) as number[];
      const horaInicio = String(c.condiciones?.hora_inicio ?? "00:00");
      const horaFin = String(c.condiciones?.hora_fin ?? "23:59");
      const r = isHappyHourActive({ diasSemana, horaInicio, horaFin });
      return { cupon: c, tipo, ok: r.ok, texto: r.motivo };
    });

  const nowMs = Date.now();
  const { data: reservasRaw } = await supabase
    .from("reservas")
    .select(
      "id,restaurante_id,cliente_id,nombre_cliente,telefono,email,personas,fecha_hora_reserva,estado,turno,atendida,resena_solicitada,amelia_appointment_id,amelia_booking_id,amelia_cancel_url,amelia_booking_token,created_at"
    )
    .eq("cliente_id", cliente.id)
    .eq("restaurante_id", cliente.restaurante_id)
    .order("fecha_hora_reserva", { ascending: true });
  const reservas = ((reservasRaw ?? []) as any[]) as ReservaCliente[];
  const proximasReservas = reservas.filter((r) => r.fecha_hora_reserva && String(r.estado ?? "").toLowerCase() !== "cancelada" && new Date(r.fecha_hora_reserva).getTime() >= nowMs);
  const historialReservas = reservas.filter((r) => r.fecha_hora_reserva && new Date(r.fecha_hora_reserva).getTime() < nowMs).sort((a, b) => new Date(b.fecha_hora_reserva ?? "").getTime() - new Date(a.fecha_hora_reserva ?? "").getTime());
  const proximaReserva = proximasReservas[0] ?? null;
  const reservaSeleccionadaCambio = sp.cambiar ? proximasReservas.find((r) => r.id === sp.cambiar) ?? null : null;
  const horaSeleccionadaCambio = String(sp.hora ?? "").trim();

  let horasCambio: ReprogramarHorasData | null = null;

  if (reservaSeleccionadaCambio) {
    try {
      const res = await fetch("https://n8n.gastrohelp.es/webhook/panel-reprogramar-horas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          reserva_id: reservaSeleccionadaCambio.id,
        }),
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || data?.ok === false) {
        horasCambio = {
          ok: false,
          horas: [],
          error: String(data?.error || data?.message || `HTTP_${res.status}`),
          response: String(data?.response || "No se pudieron cargar las horas disponibles."),
        };
      } else {
        horasCambio = {
          ok: true,
          reserva_id: String(data?.reserva_id || reservaSeleccionadaCambio.id),
          fecha: String(data?.fecha || onlyDate(reservaSeleccionadaCambio.fecha_hora_reserva)),
          personas: Number(data?.personas || reservaSeleccionadaCambio.personas || 1),
          horas: Array.isArray(data?.horas) ? data.horas.map((h: any) => String(h)) : [],
        };
      }
    } catch (error: any) {
      horasCambio = {
        ok: false,
        horas: [],
        error: String(error?.message || "WEBHOOK_ERROR"),
        response: "No se pudieron cargar las horas disponibles.",
      };
    }
  }

  const { data: historialRaw } = await supabase.from("clientes_historial").select("id,cliente_id,restaurante_id,reserva_id,tipo,descripcion,created_at,personas,gasto_eur,turno").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).order("created_at", { ascending: false });
  const historialCliente = ((historialRaw ?? []) as any[]) as ClienteHistorialRow[];

  const { data: notificacionesRaw } = await supabase.from("cliente_notificaciones").select("id,restaurante_id,cliente_id,tipo,titulo,mensaje,url,leida,created_at").eq("cliente_id", cliente.id).eq("restaurante_id", cliente.restaurante_id).order("created_at", { ascending: false });
  const notificaciones = ((notificacionesRaw ?? []) as any[]) as ClienteNotificacion[];
  const avisosSinLeer = notificaciones.filter((n) => !n.leida).length;

  const next = premiosPuntos.find((p) => p.puntos_requeridos > puntos) ?? null;
  const best = premiosPuntos[0] ?? null;
  const donutTarget = next ?? best;
  const donutTop = donutTarget ? donutTarget.nombre : "Puntos";
  const donutBottom = donutTarget ? (next ? `Te faltan ${Math.max(0, donutTarget.puntos_requeridos - puntos)} pts` : "Ya puedes canjear") : "Sin premios configurados";
  const donutPct = donutTarget ? (donutTarget.puntos_requeridos > 0 ? Math.min(100, (puntos / donutTarget.puntos_requeridos) * 100) : 0) : 0;

  const okText =
    sp.ok === "perfil" ? { title: "Perfil guardado", desc: "Tus datos se han actualizado." }
    : sp.ok === "premio" ? { title: "Premio solicitado", desc: "Muestra la tarjeta de validación en el restaurante." }
    : sp.ok === "cupon" ? { title: "Cupón preparado", desc: "Muestra el código al personal del restaurante." }
    : sp.ok === "reserva_cancelada" ? { title: "Reserva cancelada", desc: "La reserva se ha cancelado correctamente." }
    : sp.ok === "reserva_reprogramada" ? { title: "Reserva reprogramada", desc: "Tu nueva hora se ha guardado correctamente. La reserva ya está actualizada." }
    : sp.ok === "aviso_leido" ? { title: "Aviso actualizado", desc: "La notificación se ha marcado como leída." }
    : null;

  const errText = sp.err
    ? sp.err === "puntos" ? "Puntos insuficientes."
      : sp.err === "premio" ? "No disponible."
      : sp.err === "perfil" ? "Rellena todos los campos."
      : sp.err === "email" ? "Email no válido."
      : sp.err === "fecha" ? "Fecha no válida."
      : sp.err === "cancel_tarde" ? "No se puede cancelar desde el panel si faltan menos de 3 horas. Contacta con el restaurante."
      : sp.err === "reserva" ? "No se encontró la reserva."
      : sp.err === "cancel" ? "No se pudo cancelar la reserva."
      : sp.err === "reprogramar" ? "No se pudo cambiar la hora de la reserva."
      : sp.err === "aviso" ? "No se pudo actualizar el aviso."
      : "Inténtalo otra vez."
    : null;

  return (
    <AppShell accent={accent} bg={bg}>
      <div className="space-y-5">
        <TopAppHeader restauranteNombre={restoNombre} clienteNombre={String(cliente.nombre ?? "Cliente")} logo={logo} accent={accent} puntos={puntos} donutPct={donutPct} donutTop={donutTop} donutBottom={donutBottom} avisosSinLeer={avisosSinLeer} />

        {okText ? <AppNotice type="ok" title={okText.title} text={okText.desc} /> : null}
        {errText ? <AppNotice type="err" title="No se pudo completar" text={errText} dbg={sp.dbg} /> : null}

        {currentTab === "inicio" ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={<WalletCards className="h-5 w-5" />} title="Saldo" value={puntos} subtitle={puntosActivo ? `${puntosPorEuro} pts por €` : "Desactivados"} accent={accent} />
              <StatTile icon={<CalendarClock className="h-5 w-5" />} title="Próxima" value={proximaReserva ? formatReservaTime(proximaReserva.fecha_hora_reserva) : "—"} subtitle={proximaReserva ? formatReservaDate(proximaReserva.fecha_hora_reserva) : "Sin reserva"} accent={accent} />
              <StatTile icon={<TicketPercent className="h-5 w-5" />} title="Cupones" value={promosEspeciales.length} subtitle="Disponibles o programados" accent={accent} />
              <StatTile icon={<Bell className="h-5 w-5" />} title="Avisos" value={avisosSinLeer} subtitle="Sin leer" accent={accent} />
            </div>

            <SectionCard accent={accent} title="Tu próxima visita" subtitle="Reserva activa y acciones rápidas" icon={<CalendarDays className="h-5 w-5" />} right={proximaReserva ? <Badge accent={accent} variant="solid">Activa</Badge> : <Badge accent={accent}>Sin reserva</Badge>}>
              {!proximaReserva ? (
                <EmptyState title="Sin visitas programadas" text="Cuando reserves, podrás gestionarla desde aquí." icon={<CalendarDays className="h-6 w-6" />} accent={accent} />
              ) : (
                <ReservaCard reserva={proximaReserva} accent={accent} token={token} whatsappHref={buildWhatsAppReprogramar(proximaReserva)} canCancel={canCancelReserva(proximaReserva)} cancelarReservaAction={cancelarReservaAction} featured />
              )}
            </SectionCard>

            <SectionCard accent={accent} title="Accesos rápidos" subtitle="Todo lo importante en un toque" icon={<Zap className="h-5 w-5" />}>
              <div className="grid grid-cols-2 gap-3">
                <a href={buildTabHref("reservas")} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><CalendarDays className="h-6 w-6" style={{ color: accent }} /><div className="mt-3 font-black text-slate-950">Reservas</div><div className="text-xs font-semibold text-slate-400">Ver y gestionar</div></a>
                <a href={buildTabHref("premios")} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><Gift className="h-6 w-6" style={{ color: accent }} /><div className="mt-3 font-black text-slate-950">Premios</div><div className="text-xs font-semibold text-slate-400">Canjear puntos</div></a>
                <a href={buildTabHref("cupones")} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><TicketPercent className="h-6 w-6" style={{ color: accent }} /><div className="mt-3 font-black text-slate-950">Cupones</div><div className="text-xs font-semibold text-slate-400">Promos activas</div></a>
                <a href={buildTabHref("perfil")} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><User className="h-6 w-6" style={{ color: accent }} /><div className="mt-3 font-black text-slate-950">Perfil</div><div className="text-xs font-semibold text-slate-400">Datos y avisos</div></a>
              </div>
            </SectionCard>

            <SectionCard accent={accent} title="Último aviso" subtitle="Mensajes del restaurante" icon={<Bell className="h-5 w-5" />} right={notificaciones[0] && !notificaciones[0].leida ? <Badge accent={accent} variant="solid">Nuevo</Badge> : null}>
              {notificaciones.length === 0 ? (
                <EmptyState title="Sin avisos todavía" text="Aquí verás promos, cambios y mensajes para ti." icon={<Bell className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{notificaciones[0].tipo}</div>
                  <div className="mt-2 text-lg font-black tracking-[-0.04em] text-slate-950">{notificaciones[0].titulo}</div>
                  <div className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{notificaciones[0].mensaje}</div>
                  <div className="mt-3 text-xs font-semibold text-slate-400">{new Date(notificaciones[0].created_at).toLocaleString("es-ES")}</div>
                </div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {currentTab === "reservas" ? (
          <div className="space-y-5">
            {sp.cambiar ? (
              <SectionCard
                accent={accent}
                title="Cambiar hora"
                subtitle="Selecciona una nueva hora disponible"
                icon={<CalendarClock className="h-5 w-5" />}
                right={<a href={buildTabHref("reservas")} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-500">Cerrar</a>}
              >
                {!reservaSeleccionadaCambio ? (
                  <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
                    No se encontró esta reserva o ya no se puede modificar.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Reserva actual</div>
                      <div className="mt-2 text-lg font-black tracking-[-0.04em] text-slate-950">
                        {formatReservaDate(reservaSeleccionadaCambio.fecha_hora_reserva)} · {formatReservaTime(reservaSeleccionadaCambio.fecha_hora_reserva)}
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-500">
                        {reservaSeleccionadaCambio.personas ?? 0} personas{reservaSeleccionadaCambio.turno ? ` · ${reservaSeleccionadaCambio.turno}` : ""}
                      </div>
                    </div>

                    {horasCambio?.ok === false ? (
                      <div className="rounded-[24px] border border-red-200 bg-red-50 p-4">
                        <div className="flex items-start gap-3">
                          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                          <div>
                            <div className="text-sm font-black text-red-900">No se pudieron cargar las horas</div>
                            <div className="mt-1 text-sm font-semibold text-red-700">{horasCambio.response || "Inténtalo otra vez."}</div>
                            {horasCambio.error ? <div className="mt-2 break-all text-[10px] text-red-600/70">dbg: {horasCambio.error}</div> : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Horas disponibles</div>
                            <div className="mt-1 text-sm font-bold text-slate-500">
                              {horasCambio?.fecha ? formatReservaDate(`${horasCambio.fecha}T00:00:00`) : "Mismo día de la reserva"}
                            </div>
                          </div>
                          <Badge accent={accent} variant="soft">{horasCambio?.horas?.length ?? 0} opciones</Badge>
                        </div>

                        {horasCambio && horasCambio.horas.length > 0 ? (
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            {horasCambio.horas.map((hora) => {
                              const active = horaSeleccionadaCambio === hora;

                              return (
                                <a
                                  key={hora}
                                  href={`/c/${token}?tab=reservas&cambiar=${reservaSeleccionadaCambio.id}&hora=${encodeURIComponent(hora)}`}
                                  className={clsx(
                                    "rounded-2xl border px-3 py-3 text-center text-sm font-black transition",
                                    active ? "text-white shadow-sm" : "border-slate-100 bg-slate-50 text-slate-700 hover:bg-white"
                                  )}
                                  style={active ? { backgroundColor: accent, borderColor: accent } : undefined}
                                >
                                  {hora}
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">
                            No hay horas libres para este día.
                          </div>
                        )}

                        {horaSeleccionadaCambio ? (
                          <div className="mt-4 rounded-[24px] border p-4" style={{ borderColor: rgba(accent, 0.18), backgroundColor: rgba(accent, 0.06) }}>
                            <div className="text-sm font-black text-slate-950">Nueva hora seleccionada</div>
                            <div className="mt-1 text-2xl font-black tracking-[-0.05em]" style={{ color: accent }}>{horaSeleccionadaCambio}</div>
                            <div className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                              Al confirmar, actualizaremos tu reserva automáticamente y verás el cambio aplicado al momento.
                            </div>

                            <ConfirmSubmit message={`¿Confirmas cambiar tu reserva a las ${horaSeleccionadaCambio}?`}>
                              <form action={confirmarCambioHoraAction}>
                                <input type="hidden" name="token" value={token} />
                                <input type="hidden" name="reserva_id" value={reservaSeleccionadaCambio.id} />
                                <input
                                  type="hidden"
                                  name="nueva_fecha"
                                  value={horasCambio?.fecha || onlyDate(reservaSeleccionadaCambio.fecha_hora_reserva)}
                                />
                                <input type="hidden" name="nueva_hora" value={horaSeleccionadaCambio} />

                                <button
                                  type="submit"
                                  className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm transition"
                                  style={{ backgroundColor: accent }}
                                >
                                  Confirmar cambio
                                </button>
                              </form>
                            </ConfirmSubmit>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
            ) : null}

            <SectionCard accent={accent} title="Reservas" subtitle="Tus próximas visitas" icon={<CalendarDays className="h-5 w-5" />} right={<Badge accent={accent} variant="solid">{proximasReservas.length}</Badge>}>
              {proximasReservas.length === 0 ? (
                <EmptyState title="Sin reservas futuras" text="Tus próximas reservas aparecerán aquí." icon={<CalendarDays className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">
                  {proximasReservas.map((r) => <ReservaCard key={r.id} reserva={r} accent={accent} token={token} whatsappHref={buildWhatsAppReprogramar(r)} canCancel={canCancelReserva(r)} cancelarReservaAction={cancelarReservaAction} />)}
                </div>
              )}
            </SectionCard>

            <SectionCard accent={accent} title="Cambios automáticos" subtitle="Reprogramación conectada con el sistema" icon={<ShieldCheck className="h-5 w-5" />}>
              <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 p-5">
                <div className="font-black text-slate-950">Cambio de hora activo</div>
                <div className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                  Puedes consultar las horas disponibles, seleccionar una nueva hora y confirmar el cambio desde este panel.
                </div>
              </div>
            </SectionCard>

            <SectionCard accent={accent} title="Historial" subtitle="Reservas anteriores" icon={<History className="h-5 w-5" />} right={<Badge accent={accent}>{historialReservas.length}</Badge>}>
              {historialReservas.length === 0 ? (
                <EmptyState title="Sin historial" text="Tus reservas anteriores aparecerán aquí." icon={<History className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">
                  {historialReservas.map((r) => (
                    <div key={r.id} className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="font-black tracking-[-0.03em] text-slate-950">{formatReservaDate(r.fecha_hora_reserva)}</div>
                      <div className="mt-1 text-sm font-bold text-slate-500">{formatReservaTime(r.fecha_hora_reserva)} · {r.personas ?? 0} personas</div>
                      <div className="mt-3 flex flex-wrap gap-2"><Badge accent={accent}>{estadoReservaLabel(r.estado)}</Badge>{r.atendida ? <Badge accent={accent} variant="solid">Asistida</Badge> : null}{r.resena_solicitada ? <Badge accent={accent}>Reseña solicitada</Badge> : null}</div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {currentTab === "premios" ? (
          <div className="space-y-5">
            <SectionCard accent={accent} title="Premios" subtitle="Puntos, recompensas y validaciones" icon={<Gift className="h-5 w-5" />} right={<Badge accent={accent} variant="solid">{puntos} pts</Badge>}>
              <div className="rounded-[28px] p-5 text-white" style={{ background: `linear-gradient(135deg, ${accent}, #0f172a)` }}>
                <div className="text-sm font-black text-white/70">Tu saldo</div>
                <div className="mt-2 text-5xl font-black tracking-[-0.08em]">{puntos}</div>
                <div className="mt-2 text-sm font-semibold text-white/70">{puntosActivo ? `${puntosPorEuro} puntos por cada euro registrado` : "Puntos desactivados"}</div>
              </div>
            </SectionCard>

            {canjesPendientes.length > 0 ? (
              <SectionCard accent={accent} title="Validar en restaurante" subtitle="Muestra estas tarjetas al personal" icon={<QrCode className="h-5 w-5" />} right={<Badge accent={accent}>{canjesPendientes.length}</Badge>}>
                <div className="space-y-3">
                  {canjesPendientes.map((c) => {
                    const premio = premiosById.get(c.premio_id);
                    return <ValidationCard key={c.id} title={premio?.nombre ?? "Premio"} subtitle={`${c.puntos_usados} puntos`} code={validationCode(c.id)} accent={accent} status={c.estado} />;
                  })}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard accent={accent} title="Catálogo" subtitle="Elige tu próxima recompensa" icon={<Crown className="h-5 w-5" />} right={<Badge accent={accent}>{premiosPuntos.length}</Badge>}>
              {premiosPuntos.length === 0 ? (
                <EmptyState title="Sin premios" text="Cuando el restaurante los active, aparecerán aquí." icon={<Gift className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">
                  {premiosPuntos.map((p) => {
                    const falta = Math.max(0, p.puntos_requeridos - puntos);
                    const ok = puntos >= p.puntos_requeridos;
                    const pct = p.puntos_requeridos > 0 ? Math.min(100, (puntos / p.puntos_requeridos) * 100) : 0;
                    return (
                      <div key={p.id} className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-4">
                          <PremioImage src={p.imagen_url} alt={p.nombre} accent={accent} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3"><div><div className="font-black tracking-[-0.03em] text-slate-950">{p.nombre}</div>{p.descripcion ? <div className="mt-1 text-sm font-medium text-slate-500">{p.descripcion}</div> : null}</div><Badge accent={accent} variant={ok ? "solid" : "soft"}>{p.puntos_requeridos} pts</Badge></div>
                            <div className="mt-4"><ProgressBar pct={pct} accent={accent} /><div className="mt-2 flex justify-between text-xs font-bold text-slate-400"><span>{puntos} pts</span><span>{p.puntos_requeridos} pts</span></div></div>
                            <div className="mt-4">{ok ? <ConfirmSubmit message={CONFIRM_MSG}><form action={canjearAction}><input type="hidden" name="premio_id" value={p.id} /><input type="hidden" name="token" value={token} /><button type="submit" className="w-full rounded-2xl px-4 py-3 text-sm font-black text-white" style={{ backgroundColor: accent }}>Solicitar premio</button></form></ConfirmSubmit> : <div className="rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-black text-slate-500">Te faltan {falta} puntos</div>}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard accent={accent} title="Actividad" subtitle="Visitas registradas" icon={<History className="h-5 w-5" />} right={<Badge accent={accent}>{historialCliente.length}</Badge>}>
              {historialCliente.length === 0 ? (
                <EmptyState title="Sin visitas" text="Cuando el restaurante registre una visita, saldrá aquí." icon={<History className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">
                  {historialCliente.map((h) => {
                    const gasto = Number(h.gasto_eur ?? 0);
                    const puntosGanados = puntosActivo ? Math.floor(gasto * puntosPorEuro) : 0;
                    return (
                      <div key={h.id} className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-4"><div><div className="font-black tracking-[-0.03em] text-slate-950">{h.tipo ?? "Visita"}{h.turno ? ` · ${h.turno}` : ""}</div>{h.descripcion ? <div className="mt-1 text-sm font-medium text-slate-500">{h.descripcion}</div> : null}<div className="mt-2 text-xs font-semibold text-slate-400">{formatShortDateTime(h.created_at)}</div><div className="mt-3 flex flex-wrap gap-2">{h.personas ? <Badge accent={accent}>{h.personas} personas</Badge> : null}<Badge accent={accent}>Gasto: {gasto.toFixed(2)} €</Badge></div></div><div className="rounded-2xl px-3 py-2 text-sm font-black" style={{ backgroundColor: rgba(accent, 0.1), color: accent }}>+{puntosGanados}</div></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {currentTab === "cupones" ? (
          <div className="space-y-5">
            <SectionCard accent={accent} title="Cupones" subtitle="Promos disponibles para ti" icon={<TicketPercent className="h-5 w-5" />} right={<Badge accent={accent}>{promosEspeciales.length}</Badge>}>
              {promosEspeciales.length === 0 ? (
                <EmptyState title="Sin cupones activos" text="Las promos del restaurante aparecerán aquí." icon={<TicketPercent className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">
                  {promosEspeciales.map((p) => {
                    const canje = cuponEstadoById.get(p.cupon.id);
                    const canjeLabel = canje?.estado === "activo" ? "Pendiente" : canje?.estado === "canjeado" ? "Validado" : canje?.estado === "caducado" ? "Caducado" : null;
                    let estadoTexto = p.texto;
                    if (canje?.estado === "activo") estadoTexto = "Pendiente de validación en restaurante";
                    if (canje?.estado === "canjeado") estadoTexto = "Cupón ya validado";
                    if (canje?.estado === "caducado") estadoTexto = "Cupón no disponible";
                    return (
                      <div key={p.cupon.id} className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-sm">
                        <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${p.ok ? accent : "#64748b"}, #0f172a)` }}>
                          <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-[0.18em] text-white/65">{p.tipo === "cumpleanos" ? "Cumpleaños" : "Horas valle"}</div><div className="mt-2 text-2xl font-black tracking-[-0.06em]">{p.cupon.nombre}</div><div className="mt-1 text-sm font-semibold text-white/75">{p.cupon.beneficio}</div></div><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/14">{p.tipo === "cumpleanos" ? <Sparkles className="h-7 w-7" /> : <Zap className="h-7 w-7" />}</div></div>
                        </div>
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-3">{canjeLabel ? <Badge accent={accent} variant={canje?.estado === "canjeado" ? "success" : "soft"}>{canjeLabel}</Badge> : p.ok ? <Badge accent={accent} variant="solid">Disponible</Badge> : <Badge accent={accent}>No disponible</Badge>}<div className="text-xs font-bold text-slate-400">{estadoTexto}</div></div>
                          {canje?.estado === "activo" ? <div className="mt-4"><ValidationCard title={p.cupon.nombre} subtitle={p.cupon.beneficio} code={validationCode(p.cupon.id)} accent={accent} status={canje.estado} /></div> : null}
                          {canje?.fecha ? <div className="mt-3 text-xs font-semibold text-slate-400">{canje.estado === "canjeado" ? "Validado" : "Registrado"}: {new Date(canje.fecha).toLocaleString("es-ES")}</div> : null}
                          {!canjeLabel && p.ok ? <div className="mt-4"><ConfirmSubmit message={CONFIRM_MSG}><form action={canjearCuponAction}><input type="hidden" name="token" value={token} /><input type="hidden" name="cupon_id" value={p.cupon.id} /><button type="submit" className="w-full rounded-2xl px-4 py-3 text-sm font-black text-white" style={{ backgroundColor: accent }}>Preparar cupón</button></form></ConfirmSubmit></div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {currentTab === "perfil" ? (
          <div className="space-y-5">
            <SectionCard accent={accent} title="Perfil" subtitle="Datos del cliente" icon={<User className="h-5 w-5" />} right={<Badge accent={accent} variant="solid">Activo</Badge>}>
              <form action={actualizarPerfilAction} className="space-y-3">
                <input type="hidden" name="token" value={token} />
                <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><User className="h-4 w-4" /> Nombre</span><input name="nombre" defaultValue={String(cliente.nombre ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><Phone className="h-4 w-4" /> Teléfono</span><input name="telefono" defaultValue={String(cliente.telefono ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><Mail className="h-4 w-4" /> Email</span><input name="email" type="email" defaultValue={String(cliente.email ?? "")} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <label className="block"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-slate-400"><IdCard className="h-4 w-4" /> Fecha de nacimiento</span><input name="fecha_nacimiento" type="date" defaultValue={onlyDate(cliente.fecha_nacimiento)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-slate-950" required /></label>
                <button type="submit" className="w-full rounded-2xl px-4 py-3 text-sm font-black text-white" style={{ backgroundColor: accent }}>Guardar cambios</button>
              </form>
            </SectionCard>

            <SectionCard accent={accent} title="Preferencias" subtitle="Ajustes de comunicación" icon={<Settings2 className="h-5 w-5" />}>
              <div className="space-y-3">
                <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><IconBubble accent={accent}><Bell className="h-5 w-5" /></IconBubble><div><div className="font-black text-slate-950">Avisos en el panel</div><div className="mt-1 text-sm font-medium text-slate-500">Promos, cambios de reserva, premios y mensajes del restaurante aparecerán aquí.</div></div></div></div>
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-4"><div className="font-black text-slate-950">Notificaciones push</div><div className="mt-1 text-sm font-medium text-slate-500">Preparado para añadir instalación PWA y avisos al móvil más adelante.</div></div>
              </div>
            </SectionCard>

            <SectionCard accent={accent} title="Seguridad" subtitle="Acceso privado por enlace" icon={<ShieldCheck className="h-5 w-5" />}>
              <div className="grid gap-3">
                <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><BadgeCheck className="h-5 w-5 shrink-0" style={{ color: accent }} /><div><div className="font-black text-slate-950">Acciones protegidas</div><div className="mt-1 text-sm font-medium text-slate-500">Cada reserva y canje se comprueba con cliente y restaurante antes de guardar cambios.</div></div></div></div>
                <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><ShieldCheck className="h-5 w-5 shrink-0" style={{ color: accent }} /><div><div className="font-black text-slate-950">Cancelación limitada</div><div className="mt-1 text-sm font-medium text-slate-500">El panel no permite cancelar si faltan menos de 3 horas.</div></div></div></div>
              </div>
            </SectionCard>

            <SectionCard accent={accent} title="Avisos" subtitle="Mensajes del restaurante" icon={<Bell className="h-5 w-5" />} right={<Badge accent={accent} variant={avisosSinLeer > 0 ? "solid" : "soft"}>{avisosSinLeer} sin leer</Badge>}>
              <div id="avisos-app" />
              {notificaciones.length === 0 ? (
                <EmptyState title="Sin avisos" text="Aquí verás novedades, reservas y promos." icon={<Bell className="h-6 w-6" />} accent={accent} />
              ) : (
                <div className="space-y-3">
                  {notificaciones.map((n) => (
                    <div key={n.id} className={clsx("rounded-[28px] border bg-white p-4 shadow-sm", n.leida ? "border-slate-100" : "border-white")} style={!n.leida ? { boxShadow: `0 18px 52px ${rgba(accent, 0.14)}` } : undefined}>
                      <div className="flex items-start gap-3"><IconBubble accent={accent}>{n.leida ? <Mail className="h-5 w-5" /> : <Bell className="h-5 w-5" />}</IconBubble><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{n.tipo}</div><div className="mt-1 font-black tracking-[-0.03em] text-slate-950">{n.titulo}</div></div>{!n.leida ? <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: accent }} /> : null}</div><div className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{n.mensaje}</div><div className="mt-2 text-xs font-semibold text-slate-400">{new Date(n.created_at).toLocaleString("es-ES")}</div><div className="mt-4 flex flex-wrap gap-2">{n.url ? <a href={n.url} className="rounded-2xl px-4 py-2 text-xs font-black text-white" style={{ backgroundColor: accent }}>Ver aviso</a> : null}{n.leida ? <Badge accent={accent}>Leída</Badge> : <form action={marcarAvisoLeidoAction}><input type="hidden" name="token" value={token} /><input type="hidden" name="aviso_id" value={n.id} /><button type="submit" className="rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">Marcar leída</button></form>}</div></div></div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard accent={accent} title="Contacto" subtitle={restoNombre} icon={<MessageCircle className="h-5 w-5" />}>
              {restauranteTelefono ? <a href={`https://wa.me/${restauranteTelefono}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><div><div className="font-black text-slate-950">WhatsApp del restaurante</div><div className="mt-1 text-sm font-medium text-slate-500">Contactar directamente</div></div><ChevronRight className="h-5 w-5 text-slate-300" /></a> : <div className="rounded-[24px] border border-slate-100 bg-white p-4 text-sm font-medium text-slate-500">El restaurante no tiene teléfono configurado.</div>}
            </SectionCard>
          </div>
        ) : null}

        <div className="rounded-[26px] border border-white/80 bg-white/72 p-4 text-center shadow-sm backdrop-blur">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">GastroHelp</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">Guarda este enlace para volver cuando quieras.</div>
        </div>
      </div>

      <BottomNav currentTab={currentTab} buildTabHref={buildTabHref} avisosSinLeer={avisosSinLeer} accent={accent} />
    </AppShell>
  );
}