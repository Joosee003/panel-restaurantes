"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  Send,
  Settings2,
  Star,
  Store,
} from "lucide-react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { setActiveRestaurant } from "@/app/(app)/lib/activeRestaurant";
import {
  applyServicePreset,
  emptyForm,
  serviceFields,
  validateOnboardingStep,
  type OnboardingForm,
} from "@/lib/admin/onboarding";
import { useAgencyOverview } from "./useAgencyOverview";
import { DataState, SetupChecklist } from "./AgencyViews";
import { InvitationAction, invitationMessages } from "./InvitationAction";

export type CreateInstallation = (
  form: OnboardingForm,
  requestId: string,
) => Promise<{ restaurante_id: string; invited_email: string; invitation_status?: string }>;
async function createInstallation(form: OnboardingForm, requestId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("La sesión ha caducado. Vuelve a entrar.");
  let response: Response;
  try {
    response = await fetch("/api/admin/restaurantes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...form, request_id: requestId }),
    });
  } catch {
    throw new Error(
      "Se ha perdido la conexión. Pulsa de nuevo para recuperar esta misma alta sin duplicarla.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.restaurante_id) {
    const messages: Record<string, string> = {
      EMAIL_ALREADY_REGISTERED:
        "Este correo ya está registrado o tiene una invitación pendiente. Revisa el restaurante existente o utiliza otro correo.",
      REQUEST_CONFLICT:
        "Esta solicitud ya se guardó con otros datos. Recupera el alta original desde el listado de restaurantes.",
      INVALID_INPUT:
        "Revisa los datos y las dependencias de los servicios seleccionados.",
      ADMIN_REQUIRED: "Tu usuario no tiene permiso para crear restaurantes.",
      INVALID_SESSION: "La sesión ha caducado. Vuelve a entrar.",
    };
    throw new Error(
      messages[result?.error] ||
        "No se ha podido completar el alta. Tus datos siguen en el formulario.",
    );
  }
  return result as { restaurante_id: string; invited_email: string; invitation_status: string };
}
export function OnboardingWorkspace({
  createNew,
  restaurantId,
}: {
  createNew: boolean;
  restaurantId?: string;
}) {
  return createNew ? (
    <div className="agency-content">
      <div className="agency-page-heading">
        <div>
          <span className="agency-eyebrow">Alta de restaurante</span>
          <h1>Un buen comienzo, paso a paso.</h1>
          <p>Prepara solo los servicios que ha contratado el restaurante.</p>
        </div>
        <Link
          href="/admin/onboarding-restaurante"
          className="agency-button secondary"
        >
          <ArrowLeft size={15} />
          Ver altas
        </Link>
      </div>
      <OnboardingWizard create={createInstallation} />
    </div>
  ) : (
    <OnboardingProgress restaurantId={restaurantId} />
  );
}
function OnboardingProgress({ restaurantId }: { restaurantId?: string }) {
  const { data, loading, error, reload } = useAgencyOverview(30);
  const router = useRouter();
  const restaurant = data?.restaurants.find((row) => row.id === restaurantId);
  return (
    <div className="agency-content">
      <div className="agency-page-heading">
        <div>
          <span className="agency-eyebrow">Puesta en marcha</span>
          <h1>
            {restaurant ? restaurant.name : "De alta a listo para trabajar."}
          </h1>
          <p>
            {restaurant
              ? "Completa lo pendiente y comprueba el servicio antes de entregarlo."
              : "Cada restaurante tiene su propio recorrido según los servicios contratados."}
          </p>
        </div>
        <Link
          className="agency-button"
          href="/admin/onboarding-restaurante?nuevo=1"
        >
          <Plus size={16} />
          Añadir restaurante
        </Link>
      </div>
      {loading || error ? (
        <DataState loading={loading} error={error} retry={reload} />
      ) : restaurant ? (
        <section className="agency-card">
          <div className="agency-card-heading">
            <div>
              <span className="agency-eyebrow">Configuración guardada</span>
              <h2>
                {restaurant.setup.filter((task) => task.ready).length} de{" "}
                {restaurant.setup.length} pasos completos
              </h2>
            </div>
            <strong>{restaurant.progress}%</strong>
          </div>
          <progress
            className="agency-progress"
            max={100}
            value={restaurant.progress}
            aria-label="Progreso de la configuración"
          />
          <SetupChecklist
            restaurant={restaurant}
            onOpen={(href, panel) => {
              if (panel) setActiveRestaurant(restaurant.id);
              router.push(href);
            }}
          />
          <p className="agency-footnote">
            La configuración completa no sustituye la prueba real del servicio.
          </p>
          <Link
            className="agency-button secondary"
            href={`/admin/restaurantes/${restaurant.id}`}
          >
            Ver resultados
            <ArrowRight size={15} />
          </Link>
        </section>
      ) : restaurantId ? (
        <div className="agency-empty">
          <h2>Restaurante no disponible</h2>
          <Link href="/admin/onboarding-restaurante">Volver a las altas</Link>
        </div>
      ) : (
        <div className="agency-onboarding-list">
          {data?.restaurants.map((row) => (
            <Link
              key={row.id}
              href={`/admin/onboarding-restaurante?restaurante=${row.id}`}
            >
              <span className="agency-avatar">
                <Store size={20} />
              </span>
              <div style={{ flex: 1 }}>
                <h3>
                  {row.name}{" "}
                  {row.demo && (
                    <span className="agency-pill neutral">Demo</span>
                  )}
                </h3>
                <p>
                  {row.setup.find((task) => !task.ready)?.title ||
                    "Configuración completa. Comprueba los servicios antes de entregar."}
                </p>
              </div>
              <strong>{row.progress}%</strong>
              <ChevronRight size={18} />
            </Link>
          ))}
          {!data?.restaurants.length && (
            <div className="agency-empty">
              <h2>Empieza con tu primer restaurante</h2>
              <p>El alta preparará los accesos y los servicios que elijas.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OnboardingWizard({ create, draftOwner }: { create: CreateInstallation; draftOwner?: string }) {
  const [form, setForm] = useState<OnboardingForm>({ ...emptyForm });
  const [step, setStep] = useState(0),
    [preset, setPreset] = useState("bookings"),
    [custom, setCustom] = useState(false),
    [error, setError] = useState("");
  const [saving, setSaving] = useState(false),
    [result, setResult] = useState<{
      restaurante_id: string;
      invited_email: string;
      invitation_status?: string;
    } | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const [sessionChanged, setSessionChanged] = useState(false);
  const ownerId = useRef<string | null>(null);
  const requestId = useRef("");
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const owner = draftOwner || (await supabase.auth.getSession()).data.session?.user.id;
        if (!active || !owner) return;
        ownerId.current = owner;
        const key = `gastrohelp:onboarding:${owner}`;
        // Remove another account's draft before reading this account's draft.
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const candidate = sessionStorage.key(i);
          if (candidate?.startsWith("gastrohelp:onboarding:") && candidate !== key) sessionStorage.removeItem(candidate);
        }
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.version === 1 && Date.now() - saved.updatedAt < 24 * 60 * 60 * 1000
            && typeof saved.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.requestId)
            && saved.form && Object.keys(emptyForm).every(k => typeof saved.form[k] === typeof emptyForm[k as keyof OnboardingForm])) {
            setForm(saved.form); setStep(Math.max(0, Math.min(3, saved.step || 0)));
            setPreset(saved.preset || "custom"); setCustom(Boolean(saved.custom));
            requestId.current = saved.requestId;
            setDraftNotice("Hemos recuperado el alta que estabas preparando.");
          }
        }
        setDraftKey(key);
      } catch { setDraftNotice("El navegador no permite guardar el borrador. Mantén esta pestaña abierta hasta terminar."); }
      finally { if (active) setRestored(true); }
    }
    void restore();
    const subscription = draftOwner ? null : supabase.auth?.onAuthStateChange?.((_event, session) => {
      if (!ownerId.current || session?.user.id === ownerId.current) return;
      active = false;
      try { sessionStorage.removeItem(`gastrohelp:onboarding:${ownerId.current}`); } catch { /* No draft is retained in component state. */ }
      setForm({ ...emptyForm }); setResult(null); setDraftKey(null);
      requestId.current = ""; setSessionChanged(true);
    }).data.subscription;
    return () => { active = false; subscription?.unsubscribe(); };
  }, [draftOwner]);
  useEffect(() => {
    if (!restored || !draftKey) return;
    try {
      if (result) { sessionStorage.removeItem(draftKey); return; }
      requestId.current ||= crypto.randomUUID();
      sessionStorage.setItem(draftKey, JSON.stringify({version: 1, form, step, preset, custom, requestId: requestId.current, updatedAt: Date.now()}));
    } catch { setDraftNotice("No se ha podido guardar el borrador en este navegador. Mantén esta pestaña abierta hasta terminar."); }
  }, [form, step, preset, custom, restored, draftKey, result]);
  const heading = useRef<HTMLHeadingElement>(null);
  const update = <K extends keyof OnboardingForm>(
    key: K,
    value: OnboardingForm[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  function go(next: number) {
    if (next > step) {
      const issue = validateOnboardingStep(form, step);
      if (issue) {
        setError(issue);
        return;
      }
    }
    setError("");
    setStep(next);
    queueMicrotask(() => heading.current?.focus());
  }
  async function submit() {
    if (pending.current || !restored || sessionChanged) return;
    for (let i = 0; i < 3; i++) {
      const issue = validateOnboardingStep(form, i);
      if (issue) {
        setStep(i);
        setError(issue);
        return;
      }
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      requestId.current ||= crypto.randomUUID();
      setResult(await create(form, requestId.current));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido completar el alta.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  const selected = serviceFields.filter(([key]) => form[key]);
  if (sessionChanged) return <p role="alert">La sesión ha cambiado. Recarga la página antes de continuar el alta.</p>;
  if (!restored) return <p role="status">Recuperando el borrador del alta…</p>;
  if (result)
    return (
      <section className="agency-card">
        <div className="agency-success" role="status">
          <CheckCircle2 size={26} />
          <h2 style={{ marginTop: 10 }}>Restaurante creado</h2>
          <p>{invitationMessages[result.invitation_status || "uncertain"]}</p>
          <p>Correo de acceso: {result.invited_email}</p>
        </div>
        <div className="agency-wizard-title" style={{ marginTop: 24 }}>
          <h2>Ahora, termina la puesta en marcha</h2>
          <p>
            El restaurante ya tiene su ficha y los servicios preparados. Revisa
            los pasos pendientes antes de entregarlo.
          </p>
        </div>
        {result.invitation_status !== "account_ready" && <InvitationAction restaurantId={result.restaurante_id} />}
        <div className="agency-actions">
          <Link
            className="agency-button"
            href={`/admin/onboarding-restaurante?restaurante=${result.restaurante_id}`}
          >
            Continuar configuración
            <ArrowRight size={16} />
          </Link>
          <Link
            className="agency-button secondary"
            href={`/admin/restaurantes/${result.restaurante_id}`}
          >
            Ver ficha del restaurante
          </Link>
        </div>
      </section>
    );
  return (
    <div className="agency-wizard-layout">
      <section className="agency-card">
        {draftNotice && <p className="agency-footnote" role="status">{draftNotice}</p>}
        <ol className="agency-wizard-steps">
          {["Datos", "Servicios", "Configuración", "Revisar"].map(
            (label, index) => (
              <li key={label}>
                <button
                  type="button"
                  aria-current={step === index ? "step" : undefined}
                  disabled={saving || index > step}
                  onClick={() => go(index)}
                >
                  <span
                    className={`agency-step-dot ${index < step ? "is-ready" : ""}`}
                  >
                    {index < step ? <Check size={13} /> : index + 1}
                  </span>
                  {label}
                </button>
              </li>
            ),
          )}
        </ol>
        <div className="agency-wizard-title">
          <h2 ref={heading} tabIndex={-1}>
            {
              [
                "¿Qué restaurante vamos a preparar?",
                "¿Qué servicios ha contratado?",
                "Prepara los datos del servicio",
                "Comprueba el alta antes de crear",
              ][step]
            }
          </h2>
          <p>
            {
              [
                "Usaremos este correo para enviar el acceso al responsable.",
                "Elige un punto de partida y ajusta los servicios si lo necesitas.",
                "Podrás terminar la configuración de los servicios seleccionados después del alta.",
                "Al confirmar se crea el restaurante y se envía una invitación de acceso.",
              ][step]
            }
          </p>
        </div>
        {error && (
          <div
            className="agency-error"
            role="alert"
            style={{ marginBottom: 20 }}
          >
            {error}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 3) void submit();
            else go(step + 1);
          }}
          className="agency-wizard-form"
        >
          {step === 0 && (
            <>
              <label>
                Nombre del restaurante
                <input
                  autoComplete="organization"
                  value={form.nombre}
                  maxLength={120}
                  onChange={(event) => update("nombre", event.target.value)}
                  required
                />
              </label>
              <label>
                Correo de acceso
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  maxLength={254}
                  onChange={(event) => update("email", event.target.value)}
                  required
                />
                <small>
                  El responsable recibirá aquí el enlace para crear su
                  contraseña.
                </small>
              </label>
              <div className="agency-form-grid">
                <label>
                  Teléfono de contacto
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={form.telefono}
                    maxLength={40}
                    onChange={(event) => update("telefono", event.target.value)}
                    required
                  />
                </label>
                <label>
                  Dirección
                  <input
                    autoComplete="street-address"
                    value={form.direccion}
                    maxLength={300}
                    onChange={(event) =>
                      update("direccion", event.target.value)
                    }
                    required
                  />
                </label>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="agency-service-options">
                {[
                  {
                    key: "reputation",
                    title: "Reputación",
                    description:
                      "Opiniones QR, seguimiento de clientes y enlace a Google.",
                    icon: Star,
                  },
                  {
                    key: "bookings",
                    title: "Reservas y chatbot",
                    description:
                      "Reservas, clientes, WhatsApp y reseñas después de la visita.",
                    icon: Store,
                  },
                  {
                    key: "complete",
                    title: "Servicios completos",
                    description:
                      "Añade carta, pedidos desde la mesa y fidelización.",
                    icon: Settings2,
                  },
                ].map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    className="agency-service-option"
                    aria-pressed={preset === option.key}
                    onClick={() => {
                      setPreset(option.key);
                      setForm((current) =>
                        applyServicePreset(current, option.key),
                      );
                      setError("");
                    }}
                  >
                    <option.icon size={20} />
                    <div>
                      <strong>{option.title}</strong>
                      <p>{option.description}</p>
                    </div>
                    {preset === option.key && <CheckCircle2 size={18} />}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="agency-text-button"
                aria-expanded={custom}
                onClick={() => setCustom(!custom)}
              >
                {custom ? "Ocultar" : "Personalizar"} servicios
              </button>
              {custom && (
                <div className="agency-module-grid">
                  {serviceFields.map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={form[key]}
                        onChange={(event) => {
                          update(key, event.target.checked);
                          setPreset("custom");
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <label>
                Zona horaria
                <select
                  value={form.zonaHoraria}
                  onChange={(event) =>
                    update("zonaHoraria", event.target.value)
                  }
                >
                  <option value="Europe/Madrid">Península y Baleares</option>
                  <option value="Atlantic/Canary">Canarias</option>
                </select>
              </label>
              {(form.activarReservas || form.activarCamarero) && (
                <div className="agency-form-grid">
                  <label>
                    Capacidad del restaurante
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={form.capacidad}
                      onChange={(event) =>
                        update("capacidad", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Mesas iniciales
                    <input
                      type="number"
                      min={1}
                      max={80}
                      value={form.mesas}
                      onChange={(event) => update("mesas", event.target.value)}
                    />
                  </label>
                </div>
              )}
              {(form.activarMenuDigital || form.activarCamarero) && (
                <label>
                  Nombre de la carta
                  <input
                    value={form.cartaNombre}
                    maxLength={120}
                    onChange={(event) =>
                      update("cartaNombre", event.target.value)
                    }
                  />
                  <small>
                    Se prepara una carta vacía para añadir los platos reales.
                  </small>
                </label>
              )}
              {(form.activarReputacion || form.activarResenas) && (
                <label>
                  Enlace de reseñas de Google{" "}
                  <small>Opcional en este paso</small>
                  <input
                    type="url"
                    value={form.googleReviewUrl}
                    maxLength={2048}
                    onChange={(event) =>
                      update("googleReviewUrl", event.target.value)
                    }
                    placeholder="https://…"
                  />
                  <small>
                    Debe corresponder a este restaurante. Si lo dejas vacío
                    quedará pendiente de configurar.
                  </small>
                </label>
              )}
              <div className="agency-note">
                {form.activarChatbot
                  ? "La conexión de WhatsApp se prepara como pendiente. Después podrás vincular el número del restaurante con el QR."
                  : "Tras crear el restaurante tendrás una lista con los pasos necesarios para poner sus servicios en marcha."}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <dl className="agency-review-summary">
                {[
                  ["Restaurante", form.nombre],
                  ["Correo de acceso", form.email],
                  ["Teléfono", form.telefono],
                  ["Dirección", form.direccion],
                  [
                    "Zona horaria",
                    form.zonaHoraria === "Atlantic/Canary"
                      ? "Canarias"
                      : "Península y Baleares",
                  ],
                  ["Servicios", selected.map(([, label]) => label).join(" · ")],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="agency-note">
                <strong>Después de crear</strong>
                <p>
                  El responsable debe aceptar la invitación. Después, completa
                  los pasos de puesta en marcha y prueba los servicios
                  contratados antes de entregarlos.
                </p>
              </div>
            </>
          )}
          <div className="agency-wizard-actions">
            <button
              type="button"
              className="agency-button secondary"
              disabled={step === 0 || saving}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={14} />
              Atrás
            </button>
            <button type="submit" className="agency-button" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creando restaurante…
                </>
              ) : step === 3 ? (
                <>
                  <Send size={15} />
                  Crear y enviar acceso
                </>
              ) : (
                <>
                  Continuar
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </form>
      </section>
      <section className="agency-card agency-summary">
        <span className="agency-eyebrow">Resumen del alta</span>
        <h2 style={{ marginTop: 8 }}>
          {form.nombre || "Tu próximo restaurante"}
        </h2>
        <p>{form.email || "Correo de acceso pendiente"}</p>
        <h3>Servicios seleccionados</h3>
        <ul className="agency-summary-list">
          {selected.map(([key, label]) => (
            <li key={key}>
              <Check size={14} />
              {label}
            </li>
          ))}
        </ul>
        <h3>Qué se prepara</h3>
        <ul className="agency-summary-list">
          <li>
            <Check size={14} />
            Ficha propia del restaurante
          </li>
          <li>
            <Check size={14} />
            Acceso del responsable
          </li>
          <li>
            <Check size={14} />
            Configuración de sus servicios
          </li>
          <li>
            <Check size={14} />
            Seguimiento desde GastroHelp
          </li>
        </ul>
        <p className="agency-footnote">
          El resumen se actualiza con tus elecciones. El alta se guarda al
          confirmar el último paso.
        </p>
      </section>
    </div>
  );
}
