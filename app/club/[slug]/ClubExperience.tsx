"use client";

import Image from "next/image";
import Link from "next/link";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays, Gift, IdCard, LogOut, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import QrCode from "./QrCode";
import styles from "./club.module.css";

export type ClubRestaurant = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  accent: string;
  background: string;
  bookingPath: string | null;
};

type Reward = {
  id: string;
  name: string;
  description: string | null;
  pointsRequired: number;
  imageUrl: string | null;
  levelMinimum: string;
};

type ClubDashboard = {
  restaurant: ClubRestaurant;
  customer: { id: string; name: string | null; memberCode: string; points: number; visits: number; level: string };
  rewards: Reward[];
  redemptions: Array<{ id: string; rewardId: string; points: number; status: string; createdAt: string; confirmedAt: string | null }>;
  history: Array<{ kind: string; type: string; label: string; amount: number | null; occurred_at: string }>;
};

type RedemptionToken = { redemptionId: string; token: string; expiresAt: string; points: number; rewardName: string };
type AuthStep = "phone" | "otp" | "profile" | "loading" | "member";

const CONSENT_VERSION = "club-loyalty-2026-10-04";
let browserClubClient: SupabaseClient | null = null;

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length >= 8) return `+${digits}`;
  if (digits.length === 9) return `+34${digits}`;
  if (digits.startsWith("00") && digits.length >= 10) return `+${digits.slice(2)}`;
  return digits.length >= 8 ? `+${digits}` : null;
}

function messageFor(error: unknown) {
  const value = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error ?? "");
  if (/rate limit/i.test(value)) return "Has hecho demasiados intentos. Espera unos minutos.";
  if (/expired|token/i.test(value)) return "El código no es válido o ha caducado.";
  if (/INSUFFICIENT_POINTS/i.test(value)) return "Tu saldo ya no alcanza para esta recompensa.";
  if (/REDEMPTION_LEGACY_RECONCILIATION_REQUIRED/i.test(value)) return "Hay una solicitud anterior de este premio pendiente de revisión por el restaurante.";
  if (/CLUB_NOT_AVAILABLE/i.test(value)) return "El club de este restaurante no está disponible ahora.";
  if (/CLUB_CONSENT_REQUIRED/i.test(value)) return "Necesitamos tu aceptación para abrir el club.";
  return value || "No se pudo completar la acción.";
}

function clubClient() {
  if (typeof window !== "undefined" && browserClubClient) return browserClubClient;
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storageKey: "gastrohelp-club-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  );
  if (typeof window !== "undefined") browserClubClient = client;
  return client;
}

export default function ClubExperience({ slug, restaurant }: { slug: string; restaurant: ClubRestaurant }) {
  const supabase = useMemo(() => clubClient(), []);
  const [step, setStep] = useState<AuthStep>("loading");
  const [phone, setPhone] = useState("+34 ");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ClubDashboard | null>(null);
  const [redemption, setRedemption] = useState<RedemptionToken | null>(null);
  const [pendingReward, setPendingReward] = useState<Reward | null>(null);
  const [memberQrOpen, setMemberQrOpen] = useState(false);

  const loadDashboard = useCallback(async (db: SupabaseClient) => {
    const { data, error: loadError } = await db.rpc("club_get_dashboard", { p_slug: slug });
    if (loadError) throw loadError;
    setDashboard(data as ClubDashboard);
    setStep("member");
  }, [slug]);

  const join = useCallback(async (db: SupabaseClient, customerName?: string, consentVersion?: string) => {
    const { error: joinError } = await db.rpc("club_join_restaurant", {
      p_slug: slug,
      p_nombre: customerName || null,
      p_consent_version: consentVersion ?? null,
    });
    if (joinError) {
      if (/CLUB_NAME_REQUIRED/i.test(joinError.message)) {
        setStep("profile");
        return;
      }
      throw joinError;
    }
    await loadDashboard(db);
  }, [loadDashboard, slug]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (!data.session?.user?.phone) {
        setStep("phone");
        return;
      }
      setVerifiedPhone(data.session.user.phone);
      try {
        await join(supabase);
      } catch (cause) {
        if (active) {
          setError(messageFor(cause));
          setStep("phone");
        }
      }
    });
    return () => { active = false; };
  }, [join, supabase]);

  const sendOtp = async () => {
    const normalized = normalizePhone(phone);
    if (!normalized || !consent) {
      setError(!consent ? "Acepta las condiciones del club para continuar." : "Introduce un teléfono válido con prefijo.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: sendError } = await supabase.auth.signInWithOtp({ phone: normalized, options: { shouldCreateUser: true } });
    if (sendError) setError(messageFor(sendError));
    else {
      setVerifiedPhone(normalized);
      setStep("otp");
    }
    setBusy(false);
  };

  const verifyOtp = async () => {
    if (!verifiedPhone || !/^\d{6}$/.test(otp.trim())) {
      setError("Introduce el código de 6 cifras.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone: verifiedPhone, token: otp.trim(), type: "sms" });
    if (verifyError) setError(messageFor(verifyError));
    else {
      try {
        await join(supabase, undefined, CONSENT_VERSION);
      } catch (cause) {
        setError(messageFor(cause));
      }
    }
    setBusy(false);
  };

  const finishProfile = async () => {
    if (name.trim().length < 2 || !consent) {
      setError("Indica tu nombre y acepta las condiciones del club.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await join(supabase, name.trim(), CONSENT_VERSION);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  };

  const requestReward = async (reward: Reward) => {
    setBusy(true);
    setError(null);
    const { data, error: redeemError } = await supabase.rpc("club_create_redemption", { p_slug: slug, p_premio_id: reward.id });
    if (redeemError) setError(messageFor(redeemError));
    else {
      setRedemption({ ...(data as Omit<RedemptionToken, "rewardName">), rewardName: reward.name });
      setPendingReward(null);
    }
    setBusy(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    setDashboard(null);
    setStep("phone");
  };

  const brandStyle = { "--club-accent": restaurant.accent, "--club-bg": restaurant.background } as React.CSSProperties;

  if (step === "loading") {
    return <main className={styles.page} style={brandStyle}><div className={styles.shell}><div className={styles.loading}><div><div className={styles.loadingMark} /><strong>Abriendo tu club…</strong></div></div></div></main>;
  }

  if (step !== "member" || !dashboard) {
    return (
      <main className={styles.page} style={brandStyle}>
        <div className={styles.shell}>
          <Brand restaurant={restaurant} />
          <section className={styles.hero}>
            <div className={styles.heroInner}>
              <div className={styles.heroLabel}>Club privado</div>
              <h1>Bienvenido al club.</h1>
              <p>Tus puntos y recompensas de {restaurant.name}, siempre a mano. Entrar no registra una visita.</p>
              {step === "phone" ? (
                <div className={styles.form}>
                  <label className={styles.field}><span>Tu teléfono</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="+34 600 000 000" /></label>
                  <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Acepto el acceso al club y el tratamiento de mi teléfono para identificar mi cuenta en este restaurante. No implica aceptar comunicaciones comerciales.</span></label>
                  <button className={styles.primary} type="button" disabled={busy} onClick={() => void sendOtp()}><ShieldCheck size={18} /> {busy ? "Enviando…" : "Recibir código"}</button>
                </div>
              ) : null}
              {step === "otp" ? (
                <div className={styles.form}>
                  <label className={styles.field}><span>Código temporal</span><input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /></label>
                  <button className={styles.primary} type="button" disabled={busy} onClick={() => void verifyOtp()}>{busy ? "Comprobando…" : "Entrar en mi club"}</button>
                  <button className={styles.secondary} type="button" disabled={busy} onClick={() => setStep("phone")}>Cambiar teléfono</button>
                </div>
              ) : null}
              {step === "profile" ? (
                <div className={styles.form}>
                  <label className={styles.field}><span>¿Cómo te llamas?</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Tu nombre" /></label>
                  <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Acepto crear mi ficha de fidelización en {restaurant.name}. Mis datos quedan vinculados solo a este restaurante.</span></label>
                  <button className={styles.primary} type="button" disabled={busy} onClick={() => void finishProfile()}><Gift size={18} /> {busy ? "Creando…" : "Crear mi cuenta"}</button>
                </div>
              ) : null}
              {error ? <div role="alert" className={styles.notice}>{error}</div> : null}
            </div>
          </section>
          <div className={styles.footer}>Tecnología de fidelización <strong>GastroHelp</strong></div>
        </div>
      </main>
    );
  }

  const points = Number(dashboard.customer.points || 0);
  const rewards = [...(dashboard.rewards || [])].sort((a, b) => a.pointsRequired - b.pointsRequired);
  const nextReward = rewards.find((item) => item.pointsRequired > points) ?? null;
  const progress = nextReward ? Math.min(100, Math.round((points / Math.max(1, nextReward.pointsRequired)) * 100)) : 100;
  const featuredReward = [...rewards].reverse().find((item) => item.pointsRequired <= points) ?? null;

  return (
    <main className={styles.page} style={brandStyle}>
      <div className={styles.shell}>
        <div className={styles.topline}>
          <div><Brand restaurant={dashboard.restaurant} /><h1>Hola, {dashboard.customer.name?.split(" ")[0] || "cliente"}</h1></div>
          <button className={styles.iconButton} type="button" aria-label="Cerrar sesión" onClick={() => void signOut()}><LogOut size={18} /></button>
        </div>

        <section className={styles.memberCard}>
          <div className={styles.memberHead}><span className={styles.memberName}>Club {dashboard.restaurant.name}</span><span className={styles.level}>{dashboard.customer.level}</span></div>
          <div className={styles.points}><strong>{points}</strong><span>puntos disponibles</span></div>
          <div className={styles.stats}><span><strong>{dashboard.customer.visits}</strong> visitas</span><span><strong>{rewards.filter((item) => item.pointsRequired <= points).length}</strong> premios disponibles</span></div>
        </section>

        <div className={styles.progress}>
          <div className={styles.progressCopy}><span>{nextReward ? `${nextReward.pointsRequired - points} puntos para ${nextReward.name}` : "Has desbloqueado todas las recompensas"}</span><strong>{progress}%</strong></div>
          <div className={styles.track}><span style={{ width: `${progress}%` }} /></div>
        </div>

        {featuredReward ? <section className={styles.featuredReward} aria-label="Premio disponible"><div className={styles.featuredLabel}>Ya puedes disfrutarlo</div><div className={styles.featuredTop}><div><h2>{featuredReward.name}</h2><p>{featuredReward.description || "Una recompensa para tu próxima visita."}</p></div><span>{featuredReward.pointsRequired} pts</span></div><button className={styles.primary} type="button" disabled={busy} onClick={() => setPendingReward(featuredReward)}>Elegir este premio</button></section> : null}

        <div className={styles.quickActions}>
          {dashboard.restaurant.bookingPath ? <Link href={dashboard.restaurant.bookingPath}><CalendarDays size={18} /> Reservar</Link> : <button type="button" disabled><CalendarDays size={18} /> Reservar</button>}
          <button type="button" onClick={() => setMemberQrOpen(true)}><IdCard size={18} /> Identificarme</button>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}><div><h2>Más recompensas</h2><p>Los puntos se descuentan al confirmar el restaurante.</p></div><button className={styles.iconButton} type="button" aria-label="Actualizar saldo" disabled={busy} onClick={() => void loadDashboard(supabase)}><RefreshCw size={17} /></button></div>
          <div className={styles.rewardList}>
            {rewards.length === 0 ? <div className={styles.empty}>Pronto habrá recompensas para ti.</div> : rewards.filter((reward) => reward.id !== featuredReward?.id).map((reward) => {
              const ready = points >= reward.pointsRequired;
              return <article className={styles.reward} key={reward.id}><div className={styles.rewardTop}><div><h3>{reward.name}</h3><p>{reward.description || "Una recompensa para tu próxima visita."}</p></div><span className={styles.pill}>{reward.pointsRequired} pts</span></div><button className={styles.primary} type="button" disabled={!ready || busy} onClick={() => setPendingReward(reward)}>{ready ? "Elegir premio" : `Te faltan ${reward.pointsRequired - points} puntos`}</button></article>;
            })}
          </div>
        </section>

        <details className={styles.historyDisclosure}>
          <summary>Tu historial <span>Visitas y puntos recientes</span></summary>
          {dashboard.history?.length ? <div className={styles.history}>{dashboard.history.slice(0, 12).map((item, index) => <div className={styles.historyItem} key={`${item.kind}-${item.occurred_at}-${index}`}><div><strong>{item.label || (item.kind === "visit" ? "Visita" : "Movimiento de puntos")}</strong><span>{new Date(item.occurred_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}</span></div><span className={styles.historyAmount}>{item.kind === "points" && item.amount !== null ? `${item.amount > 0 ? "+" : ""}${item.amount} pts` : item.kind === "visit" && item.amount !== null ? `${item.amount} €` : "Visita"}</span></div>)}</div> : <div className={styles.empty}>Tu historial aparecerá después de la primera visita registrada.</div>}
        </details>

        {error ? <div role="alert" className={styles.notice}>{error}</div> : null}
        <div className={styles.footer}>Club de {dashboard.restaurant.name} · Tecnología <strong>GastroHelp</strong></div>
      </div>

      {memberQrOpen ? <QrSheet title="Mi QR de cliente" text="Sirve para identificarte. Escanearlo no suma puntos ni visitas." value={`ghm_${dashboard.customer.memberCode}`} onClose={() => setMemberQrOpen(false)} /> : null}
      {pendingReward ? <RewardConfirmSheet reward={pendingReward} points={points} busy={busy} error={error} onConfirm={() => void requestReward(pendingReward)} onClose={() => { setPendingReward(null); setError(null); }} /> : null}
      {redemption ? <QrSheet title="Muestra este QR" text={`${redemption.rewardName} · ${redemption.points} puntos`} value={redemption.token} expiresAt={redemption.expiresAt} onClose={() => setRedemption(null)} /> : null}
    </main>
  );
}

function Brand({ restaurant }: { restaurant: ClubRestaurant }) {
  return <div className={styles.brand}><div className={styles.logo}>{restaurant.logoUrl ? <Image unoptimized src={restaurant.logoUrl} alt={`Logo de ${restaurant.name}`} width={48} height={48} /> : <Gift size={22} />}</div><div className={styles.brandCopy}><div className={styles.eyebrow}>Club de fidelización</div><div className={styles.brandName}>{restaurant.name}</div></div></div>;
}

function RewardConfirmSheet({ reward, points, busy, error, onConfirm, onClose }: { reward: Reward; points: number; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);
  return <div className={styles.sheetBackdrop} role="dialog" aria-modal="true" aria-label="Confirmar premio" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}><section className={`${styles.sheet} ${styles.confirmSheet}`}><div className={styles.sheetHead}><div><div className={styles.eyebrow}>Tu premio</div><h2>¿Preparamos tu QR?</h2></div><button className={styles.iconButton} type="button" aria-label="Cerrar" disabled={busy} onClick={onClose}><X size={18} /></button></div><div className={styles.confirmRewardName}>{reward.name}</div><dl className={styles.confirmNumbers}><div><dt>Coste</dt><dd>− {reward.pointsRequired} puntos</dd></div><div><dt>Tu saldo</dt><dd>{points} puntos</dd></div><div><dt>Después del canje</dt><dd>{Math.max(0, points - reward.pointsRequired)} puntos aprox.</dd></div></dl><p className={styles.confirmHint}>El QR dura poco tiempo. Enséñaselo al personal para que confirme el canje; tus puntos no se descuentan al generarlo.</p>{error ? <div role="alert" className={styles.confirmError}>{error}</div> : null}<div className={styles.confirmActions}><button className={styles.primary} type="button" disabled={busy} onClick={onConfirm}>{busy ? "Generando…" : "Generar QR para canjear"}</button><button className={styles.secondary} type="button" disabled={busy} onClick={onClose}>Cancelar</button></div></section></div>;
}

function QrSheet({ title, text, value, expiresAt, onClose }: { title: string; text: string; value: string; expiresAt?: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className={styles.sheetBackdrop} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={styles.sheet}><div className={styles.sheetHead}><div><h2>{title}</h2><p>{text}</p></div><button className={styles.iconButton} type="button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button></div><div className={styles.qrWrap}><QrCode value={value} label={title} /></div>{expiresAt ? <div className={styles.expiry}>Caduca a las {new Date(expiresAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</div> : <div className={styles.expiry}>Identificación sin registro automático de visita</div>}</section></div>;
}
