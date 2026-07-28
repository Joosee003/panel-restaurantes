"use client";

import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Download,
  ExternalLink,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquareText,
  QrCode,
  RefreshCcw,
  Search,
  Settings,
  Sparkles,
  Star,
  TrendingUp,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";
import ReputationMaterials from "./ReputationMaterials";
import { buildEliteInsights, calculateEliteMetrics } from "./eliteLogic";
import {
  aspectLabels,
  csvEscape,
  followUpLabels,
  formatDateTime,
  originLabels,
  statusLabels,
  type FollowUpStatus,
  type Opinion,
  type OpinionAlert,
  type OpinionConfig,
  type OpinionEvent,
  type OpinionStatus,
  type Restaurant,
} from "./reputation";

type Tab =
  | "inicio"
  | "opiniones"
  | "seguimiento"
  | "insights"
  | "materiales"
  | "ajustes";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none transition focus:border-blue-500";

const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: "inicio", label: "Vista general", icon: <LayoutDashboard /> },
  { id: "opiniones", label: "Opiniones", icon: <MessageSquareText /> },
  { id: "seguimiento", label: "Seguimiento", icon: <UserRoundCheck /> },
  { id: "insights", label: "Insights", icon: <Sparkles /> },
  { id: "materiales", label: "Materiales QR", icon: <QrCode /> },
  { id: "ajustes", label: "Ajustes", icon: <Settings /> },
];

export default function ReputationElite() {
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("inicio");
  const [config, setConfig] = useState<OpinionConfig | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [opinions, setOpinions] = useState<Opinion[]>([]);
  const [events, setEvents] = useState<OpinionEvent[]>([]);
  const [alerts, setAlerts] = useState<OpinionAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Opinion | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.href = "/reputacion/acceso";
      else setReady(true);
    });
  }, [supabase]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);

    const configResult = await supabase
      .from("opinion_config")
      .select("*")
      .order("created_at");

    if (configResult.error || !configResult.data?.length) {
      setError(configResult.error?.message ?? "No hay configuración asociada.");
      setLoading(false);
      return;
    }

    const selectedConfig =
      configResult.data.find((item) => item.slug === "hispanos-grill") ??
      configResult.data[0];
    const restaurantId = selectedConfig.restaurante_id as string;

    const [restaurantResult, opinionsResult, eventsResult, alertsResult] =
      await Promise.all([
        supabase
          .from("restaurantes")
          .select("id,nombre")
          .eq("id", restaurantId)
          .single(),
        supabase
          .from("opiniones_qr")
          .select(
            "id,restaurante_id,rating,comentario,nombre_cliente,origen,estado,aspectos,contacto,contacto_tipo,solicita_contacto,seguimiento,nota_interna,resuelto_at,google_abierto,google_abierto_at,created_at,updated_at",
          )
          .eq("restaurante_id", restaurantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("opinion_eventos")
          .select(
            "id,restaurante_id,submission_token,event_type,origen,rating,created_at",
          )
          .eq("restaurante_id", restaurantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("opinion_alertas")
          .select(
            "id,restaurante_id,opinion_id,tipo,estado,destino_email,destino_whatsapp,payload,created_at,sent_at,dismissed_at",
          )
          .eq("restaurante_id", restaurantId)
          .order("created_at", { ascending: false }),
      ]);

    const firstError =
      restaurantResult.error ||
      opinionsResult.error ||
      eventsResult.error ||
      alertsResult.error;

    if (firstError) setError(firstError.message);
    else {
      setConfig(selectedConfig as OpinionConfig);
      setRestaurant(restaurantResult.data as Restaurant);
      setOpinions((opinionsResult.data ?? []) as Opinion[]);
      setEvents((eventsResult.data ?? []) as OpinionEvent[]);
      setAlerts((alertsResult.data ?? []) as OpinionAlert[]);
    }
    setLoading(false);
  }, [ready, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(
    () =>
      calculateEliteMetrics(
        opinions,
        events,
        config?.low_rating_threshold ?? 3,
      ),
    [config?.low_rating_threshold, events, opinions],
  );

  const insights = useMemo(
    () => buildEliteInsights(opinions, config?.low_rating_threshold ?? 3),
    [config?.low_rating_threshold, opinions],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return opinions;
    return opinions.filter((opinion) =>
      [
        opinion.nombre_cliente,
        opinion.comentario,
        opinion.contacto,
        opinion.nota_interna,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [opinions, query]);

  async function updateOpinion(id: string, patch: Partial<Opinion>) {
    setSaving(true);
    const { error: updateError } = await supabase
      .from("opiniones_qr")
      .update(patch)
      .eq("id", id);

    if (updateError) setError("No se pudo guardar el cambio.");
    else {
      setOpinions((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
      setSelected((current) =>
        current?.id === id ? { ...current, ...patch } : current,
      );
    }
    setSaving(false);
  }

  function openOpinion(opinion: Opinion) {
    setSelected(opinion);
    setNote(opinion.nota_interna ?? "");
    if (opinion.estado === "nueva") {
      void updateOpinion(opinion.id, { estado: "revisada" });
    }
  }

  function exportCsv() {
    const rows = [
      [
        "Fecha",
        "Nota",
        "Cliente",
        "Comentario",
        "Aspectos",
        "Origen",
        "Estado",
        "Seguimiento",
        "Contacto",
      ],
      ...filtered.map((opinion) => [
        formatDateTime(opinion.created_at),
        opinion.rating,
        opinion.nombre_cliente ?? "",
        opinion.comentario ?? "",
        opinion.aspectos.map((item) => aspectLabels[item]).join(", "),
        originLabels[opinion.origen],
        statusLabels[opinion.estado],
        followUpLabels[opinion.seguimiento],
        opinion.contacto ?? "",
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(csvEscape).join(";")).join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reputacion-${config?.slug ?? "restaurante"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!ready || loading) return <FullLoader />;
  if (!config || !restaurant)
    return <ErrorView text={error ?? "Sistema sin configurar"} retry={load} />;

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1550px] items-center justify-between px-4 py-3 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 text-white shadow-lg shadow-blue-700/20">
              <Star className="h-5 w-5" fill="currentColor" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-700">
                GastroHelp Reputation
              </p>
              <h1 className="font-black">{restaurant.nombre}</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`/opinion/${config.slug}?origen=redes`}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black md:flex"
            >
              Ver experiencia <ExternalLink className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() => void load()}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/reputacion/acceso";
              }}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1550px] px-3 py-5 sm:px-7">
        <section className="mb-5 rounded-[2rem] bg-gradient-to-r from-[#092566] via-[#1648d8] to-[#5947df] p-6 text-white shadow-xl shadow-blue-950/10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-blue-100">
            Centro de control
          </p>
          <div className="mt-3 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
                Todo lo importante, visible en segundos.
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold text-blue-100">
                Detecta problemas, recupera clientes y potencia la reputación sin
                perder tiempo.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <HeroStat label="Nota" value={metrics.averageRating.toFixed(1)} />
              <HeroStat label="Google" value={`${metrics.googleRate}%`} />
              <HeroStat label="Pendientes" value={metrics.pendingFollowUps} />
            </div>
          </div>
        </section>

        <nav className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-black [&_svg]:h-4 [&_svg]:w-4 ${
                tab === item.id
                  ? "bg-blue-700 text-white shadow-md shadow-blue-700/20"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {item.icon}
              {item.label}
              {item.id === "seguimiento" && metrics.pendingFollowUps > 0 && (
                <span className="rounded-full bg-white/20 px-2">
                  {metrics.pendingFollowUps}
                </span>
              )}
            </button>
          ))}
        </nav>

        {error && (
          <div className="mb-5 flex justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
            <button type="button" onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {tab === "inicio" && (
          <Overview
            metrics={metrics}
            insights={insights}
            opinions={opinions}
            alerts={alerts}
            openOpinion={openOpinion}
            setTab={setTab}
          />
        )}
        {tab === "opiniones" && (
          <OpinionsList
            opinions={filtered}
            query={query}
            setQuery={setQuery}
            openOpinion={openOpinion}
            exportCsv={exportCsv}
          />
        )}
        {tab === "seguimiento" && (
          <FollowUpBoard
            opinions={opinions}
            openOpinion={openOpinion}
            move={(opinion, seguimiento) =>
              void updateOpinion(opinion.id, {
                seguimiento,
                resuelto_at:
                  seguimiento === "resuelto" ? new Date().toISOString() : null,
              })
            }
          />
        )}
        {tab === "insights" && (
          <InsightsPanel insights={insights} metrics={metrics} />
        )}
        {tab === "materiales" && (
          <ReputationMaterials config={config} restaurant={restaurant} />
        )}
        {tab === "ajustes" && (
          <SettingsPanel
            config={config}
            saving={saving}
            save={async (draft) => {
              setSaving(true);
              const { error: updateError } = await supabase
                .from("opinion_config")
                .update({
                  headline: draft.headline,
                  subheadline: draft.subheadline,
                  feedback_email: draft.feedback_email || null,
                  feedback_whatsapp: draft.feedback_whatsapp || null,
                  low_rating_threshold: draft.low_rating_threshold,
                  contact_prompt_enabled: draft.contact_prompt_enabled,
                  auto_open_google: draft.auto_open_google,
                  google_delay_ms: draft.google_delay_ms,
                })
                .eq("id", draft.id);
              if (updateError) setError("No se pudieron guardar los ajustes.");
              else setConfig(draft);
              setSaving(false);
            }}
          />
        )}
      </div>

      {selected && (
        <OpinionDrawer
          opinion={selected}
          note={note}
          setNote={setNote}
          saving={saving}
          close={() => setSelected(null)}
          patch={(patch) => void updateOpinion(selected.id, patch)}
        />
      )}
    </main>
  );
}

function Overview({ metrics, insights, opinions, alerts, openOpinion, setTab }: {
  metrics: ReturnType<typeof calculateEliteMetrics>;
  insights: ReturnType<typeof buildEliteInsights>;
  opinions: Opinion[];
  alerts: OpinionAlert[];
  openOpinion: (opinion: Opinion) => void;
  setTab: (tab: Tab) => void;
}) {
  const priorities = opinions
    .filter(
      (item) =>
        item.seguimiento !== "resuelto" &&
        (item.rating <= 3 || item.solicita_contacto),
    )
    .slice(0, 5);
  const pendingAlerts = alerts.filter((item) => item.estado === "pendiente");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Nota media" value={metrics.averageRating.toFixed(1)} detail={`${metrics.total} opiniones`} icon={<Star />} />
        <Metric title="Últimos 30 días" value={metrics.last30} detail={`${metrics.last7} esta semana`} icon={<TrendingUp />} />
        <Metric title="Opiniones críticas" value={metrics.lowRatings} detail="Requieren atención" icon={<AlertTriangle />} />
        <Metric title="Seguimientos" value={metrics.pendingFollowUps} detail="Casos sin cerrar" icon={<UserRoundCheck />} />
        <Metric title="Aperturas Google" value={`${metrics.googleRate}%`} detail={`${metrics.googleOpened} aperturas`} icon={<ExternalLink />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <Card title="Prioridades de hoy" eyebrow="Acción inmediata" action={<button type="button" onClick={() => setTab("seguimiento")} className="text-xs font-black text-blue-700">Abrir seguimiento →</button>}>
          <div className="space-y-3">
            {priorities.map((opinion) => (
              <button key={opinion.id} type="button" onClick={() => openOpinion(opinion)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50">
                <Rating rating={opinion.rating} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{opinion.nombre_cliente || "Cliente anónimo"}</p>
                  <p className="truncate text-xs font-semibold text-slate-500">{opinion.comentario || "Sin comentario"}</p>
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">{followUpLabels[opinion.seguimiento]}</span>
              </button>
            ))}
            {!priorities.length && <Empty text="Todo bajo control" />}
          </div>
        </Card>

        <Card title="Pulso del restaurante" eyebrow="Análisis automático">
          <Insight title={insights.headline} text={insights.summary} />
          <Insight title="Principal oportunidad" text={insights.opportunity} />
          <Insight title="Fortaleza destacada" text={insights.strength} />
          <button type="button" onClick={() => setTab("insights")} className="mt-4 w-full rounded-2xl bg-slate-950 p-3 text-sm font-black text-white">Ver análisis completo</button>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Actividad reciente" eyebrow="Últimas opiniones">
          {opinions.slice(0, 6).map((opinion) => (
            <button key={opinion.id} type="button" onClick={() => openOpinion(opinion)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50">
              <Rating rating={opinion.rating} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{opinion.nombre_cliente || "Cliente anónimo"}</p>
                <p className="truncate text-xs text-slate-500">{opinion.comentario || "Sin comentario"}</p>
              </div>
            </button>
          ))}
        </Card>
        <Card title="Centro de alertas" eyebrow="Notificaciones internas">
          {pendingAlerts.slice(0, 5).map((alert) => {
            const opinion = opinions.find((item) => item.id === alert.opinion_id);
            return (
              <button key={alert.id} type="button" onClick={() => opinion && openOpinion(opinion)} className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
                <Bell className="h-5 w-5 text-amber-700" />
                <div>
                  <p className="text-sm font-black">{alert.tipo === "valoracion_baja" ? "Valoración baja" : "Cliente solicita contacto"}</p>
                  <p className="text-xs text-amber-800">{opinion ? `${opinion.rating} estrellas · ${opinion.nombre_cliente || "Anónimo"}` : "Revisión necesaria"}</p>
                </div>
              </button>
            );
          })}
          {!pendingAlerts.length && <Empty text="Sin alertas pendientes" />}
        </Card>
      </div>
    </div>
  );
}

function OpinionsList({ opinions, query, setQuery, openOpinion, exportCsv }: {
  opinions: Opinion[];
  query: string;
  setQuery: (value: string) => void;
  openOpinion: (opinion: Opinion) => void;
  exportCsv: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card title="Todas las opiniones" eyebrow={`${opinions.length} resultados`} action={<button type="button" onClick={exportCsv} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Download className="h-4 w-4" /> Exportar</button>}>
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, comentario, contacto o nota" className={`${inputClass} pl-10`} />
        </label>
      </Card>
      {opinions.map((opinion) => (
        <button key={opinion.id} type="button" onClick={() => openOpinion(opinion)} className="grid w-full gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 sm:grid-cols-[auto_1fr_auto]">
          <Rating rating={opinion.rating} />
          <div className="min-w-0">
            <p className="font-black">{opinion.nombre_cliente || "Cliente anónimo"}</p>
            <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{opinion.comentario || "Sin comentario"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {opinion.aspectos.map((aspect) => (
                <span key={aspect} className="text-[10px] font-bold text-blue-700">#{aspectLabels[aspect]}</span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black">{followUpLabels[opinion.seguimiento]}</span>
            <p className="mt-2 text-[10px] text-slate-400">{formatDateTime(opinion.created_at)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function FollowUpBoard({ opinions, openOpinion, move }: {
  opinions: Opinion[];
  openOpinion: (opinion: Opinion) => void;
  move: (opinion: Opinion, status: FollowUpStatus) => void;
}) {
  const eligible = opinions.filter(
    (item) =>
      item.rating <= 3 ||
      item.contacto ||
      item.solicita_contacto ||
      item.seguimiento !== "pendiente",
  );
  const statuses: FollowUpStatus[] = ["pendiente", "en_revision", "resuelto"];

  return (
    <div>
      <div className="mb-5 rounded-[2rem] border border-blue-100 bg-blue-50 p-5">
        <p className="text-xs font-black uppercase tracking-[.18em] text-blue-700">CRM de recuperación</p>
        <h2 className="mt-2 text-2xl font-black">Convierte una mala experiencia en una segunda oportunidad.</h2>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {statuses.map((status) => {
          const items = eligible.filter((item) => item.seguimiento === status);
          return (
            <section key={status} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex justify-between">
                <div>
                  <h3 className="font-black">{followUpLabels[status]}</h3>
                  <p className="text-xs text-slate-500">{status === "pendiente" ? "Por revisar" : status === "en_revision" ? "En gestión" : "Casos cerrados"}</p>
                </div>
                <b className="rounded-xl bg-slate-100 px-3 py-2">{items.length}</b>
              </div>
              <div className="space-y-3">
                {items.map((opinion) => (
                  <article key={opinion.id} className="rounded-2xl border border-slate-200 p-4">
                    <button type="button" onClick={() => openOpinion(opinion)} className="w-full text-left">
                      <Rating rating={opinion.rating} />
                      <p className="mt-3 font-black">{opinion.nombre_cliente || "Cliente anónimo"}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{opinion.comentario || "Sin comentario"}</p>
                      {opinion.contacto && <p className="mt-3 text-xs font-black text-blue-700">{opinion.contacto}</p>}
                    </button>
                    <div className="mt-4 flex gap-2">
                      {status !== "en_revision" && <button type="button" onClick={() => move(opinion, "en_revision")} className="flex-1 rounded-xl bg-blue-50 p-2 text-[10px] font-black text-blue-700">En gestión</button>}
                      {status !== "resuelto" && <button type="button" onClick={() => move(opinion, "resuelto")} className="flex-1 rounded-xl bg-emerald-50 p-2 text-[10px] font-black text-emerald-700">Resolver</button>}
                      {status === "resuelto" && <button type="button" onClick={() => move(opinion, "pendiente")} className="flex-1 rounded-xl bg-slate-100 p-2 text-[10px] font-black">Reabrir</button>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function InsightsPanel({ insights, metrics }: {
  insights: ReturnType<typeof buildEliteInsights>;
  metrics: ReturnType<typeof calculateEliteMetrics>;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-slate-950 p-7 text-white">
        <p className="text-xs font-black uppercase tracking-[.18em] text-blue-300">Motor de insights automático</p>
        <h2 className="mt-4 text-3xl font-black sm:text-5xl">{insights.headline}</h2>
        <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-300">{insights.summary}</p>
      </section>
      <div className="grid gap-5 xl:grid-cols-3">
        <Insight title="Qué está funcionando" text={insights.strength} />
        <Insight title="Qué necesita atención" text={insights.opportunity} />
        <Insight title="Próxima acción" text={insights.nextAction} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Aspectos más mencionados" eyebrow="Frecuencia">
          {insights.ranking.map((item) => (
            <div key={item.key} className="mb-4">
              <div className="mb-1 flex justify-between text-xs font-black"><span>{aspectLabels[item.key]}</span><span>{item.count}</span></div>
              <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.min(100, item.count * 20)}%` }} /></div>
            </div>
          ))}
        </Card>
        <Card title="Lectura ejecutiva" eyebrow="Resumen para dirección">
          <div className="grid grid-cols-2 gap-3">
            <Mini title="Satisfacción" value={`${metrics.averageRating.toFixed(1)}/5`} />
            <Mini title="Riesgo" value={metrics.lowRatings} />
            <Mini title="Google" value={`${metrics.googleRate}%`} />
            <Mini title="Recuperación" value={`${metrics.resolutionRate}%`} />
          </div>
          <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-900">{insights.executiveSummary}</p>
        </Card>
      </div>
    </div>
  );
}

function SettingsPanel({ config, saving, save }: {
  config: OpinionConfig;
  saving: boolean;
  save: (config: OpinionConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Experiencia del cliente" eyebrow="Personalización">
        <Field label="Titular"><input className={inputClass} value={draft.headline} onChange={(event) => setDraft({ ...draft, headline: event.target.value })} /></Field>
        <Field label="Texto de apoyo"><textarea className={`${inputClass} min-h-24`} value={draft.subheadline} onChange={(event) => setDraft({ ...draft, subheadline: event.target.value })} /></Field>
        <Field label="Umbral de alerta"><select className={inputClass} value={draft.low_rating_threshold} onChange={(event) => setDraft({ ...draft, low_rating_threshold: Number(event.target.value) })}><option value={1}>1 estrella</option><option value={2}>2 estrellas o menos</option><option value={3}>3 estrellas o menos</option></select></Field>
        <Toggle checked={draft.contact_prompt_enabled} change={(value) => setDraft({ ...draft, contact_prompt_enabled: value })} title="Solicitar contacto en casos críticos" />
        <Toggle checked={draft.auto_open_google} change={(value) => setDraft({ ...draft, auto_open_google: value })} title="Abrir Google automáticamente" />
      </Card>
      <div className="space-y-5">
        <Card title="Notificaciones" eyebrow="Canales de aviso">
          <Field label="Email de alertas"><input className={inputClass} value={draft.feedback_email ?? ""} onChange={(event) => setDraft({ ...draft, feedback_email: event.target.value })} /></Field>
          <Field label="WhatsApp de alertas"><input className={inputClass} value={draft.feedback_whatsapp ?? ""} onChange={(event) => setDraft({ ...draft, feedback_whatsapp: event.target.value })} /></Field>
          <div className="rounded-2xl bg-blue-50 p-4 text-xs font-semibold text-blue-900"><b className="block">Alertas internas activas</b>Las opiniones críticas aparecen al instante. El envío externo requiere conectar el proveedor de correo o WhatsApp.</div>
        </Card>
        <button type="button" disabled={saving} onClick={() => save(draft)} className="w-full rounded-2xl bg-blue-700 p-4 text-sm font-black text-white disabled:opacity-60">{saving ? "Guardando…" : "Guardar todos los cambios"}</button>
      </div>
    </div>
  );
}

function OpinionDrawer({ opinion, note, setNote, saving, close, patch }: {
  opinion: Opinion;
  note: string;
  setNote: (value: string) => void;
  saving: boolean;
  close: () => void;
  patch: (patch: Partial<Opinion>) => void;
}) {
  const href = opinion.contacto_tipo === "email" ? `mailto:${opinion.contacto}` : `https://wa.me/${(opinion.contacto ?? "").replace(/\D/g, "")}`;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm">
      <aside className="ml-auto h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex justify-between border-b border-slate-200 bg-white p-5">
          <div><p className="text-xs font-black uppercase text-blue-700">Ficha de seguimiento</p><h2 className="text-xl font-black">{opinion.nombre_cliente || "Cliente anónimo"}</h2></div>
          <button type="button" onClick={close}><X /></button>
        </div>
        <div className="space-y-4 p-6">
          <div className="flex justify-between rounded-2xl bg-slate-950 p-4 text-white"><b className="text-3xl">{opinion.rating}/5</b><Rating rating={opinion.rating} /></div>
          <Block title="Comentario" text={opinion.comentario || "Sin comentario"} />
          <div className="grid grid-cols-2 gap-3"><Block title="Origen" text={originLabels[opinion.origen]} /><Block title="Fecha" text={formatDateTime(opinion.created_at)} /></div>
          {opinion.contacto && <div className="rounded-2xl bg-emerald-50 p-4"><b className="text-sm">Contacto disponible</b><p className="mt-1 text-sm">{opinion.contacto}</p><a href={href} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-700 p-3 text-xs font-black text-white">{opinion.contacto_tipo === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} Contactar ahora</a></div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado"><select className={inputClass} value={opinion.estado} onChange={(event) => patch({ estado: event.target.value as OpinionStatus })}>{Object.entries(statusLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
            <Field label="Seguimiento"><select className={inputClass} value={opinion.seguimiento} onChange={(event) => { const seguimiento = event.target.value as FollowUpStatus; patch({ seguimiento, resuelto_at: seguimiento === "resuelto" ? new Date().toISOString() : null }); }}>{Object.entries(followUpLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></Field>
          </div>
          <Field label="Nota interna"><textarea className={`${inputClass} min-h-32`} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          <button type="button" disabled={saving} onClick={() => patch({ nota_interna: note.trim() || null })} className="w-full rounded-2xl bg-blue-700 p-4 text-sm font-black text-white disabled:opacity-60">{saving ? "Guardando…" : "Guardar seguimiento"}</button>
        </div>
      </aside>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string | number }) { return <div className="min-w-20 rounded-2xl bg-white/10 p-3 text-center"><b className="text-2xl">{value}</b><p className="text-[9px] uppercase text-blue-100">{label}</p></div>; }
function Metric({ title, value, detail, icon }: { title: string; value: string | number; detail: string; icon: ReactNode }) { return <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700 [&_svg]:h-4 [&_svg]:w-4">{icon}</div><p className="mt-4 text-xs font-black uppercase text-slate-400">{title}</p><p className="text-3xl font-black">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>; }
function Card({ title, eyebrow, action, children }: { title: string; eyebrow: string; action?: ReactNode; children: ReactNode }) { return <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-700">{eyebrow}</p><h3 className="text-xl font-black">{title}</h3></div>{action}</div>{children}</section>; }
function Rating({ rating }: { rating: number }) { return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black ${rating >= 4 ? "bg-emerald-50 text-emerald-700" : rating === 3 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{rating}★</span>; }
function Insight({ title, text }: { title: string; text: string }) { return <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex gap-3"><Lightbulb className="h-5 w-5 shrink-0 text-blue-700" /><div><b>{title}</b><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{text}</p></div></div></div>; }
function Mini({ title, value }: { title: string; value: string | number }) { return <div className="rounded-2xl border border-slate-200 p-4"><p className="text-[10px] font-black uppercase text-slate-400">{title}</p><b className="text-2xl">{value}</b></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="mb-4 block"><span className="mb-2 block text-xs font-black">{label}</span>{children}</label>; }
function Toggle({ checked, change, title }: { checked: boolean; change: (value: boolean) => void; title: string }) { return <button type="button" onClick={() => change(!checked)} className="mb-3 flex w-full justify-between rounded-2xl border border-slate-200 p-4 text-left"><b className="text-sm">{title}</b><span className={`relative h-7 w-12 rounded-full ${checked ? "bg-blue-700" : "bg-slate-200"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white ${checked ? "left-6" : "left-1"}`} /></span></button>; }
function Block({ title, text }: { title: string; text: string }) { return <div className="rounded-2xl border border-slate-200 p-4"><p className="text-[10px] font-black uppercase text-slate-400">{title}</p><p className="mt-2 text-sm font-semibold">{text}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-black text-slate-400"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />{text}</div>; }
function FullLoader() { return <main className="grid min-h-screen place-items-center bg-[#f3f6fb]"><div className="text-center"><Loader2 className="mx-auto h-9 w-9 animate-spin text-blue-700" /><p className="mt-3 text-sm font-black text-slate-500">Preparando el centro de reputación…</p></div></main>; }
function ErrorView({ text, retry }: { text: string; retry: () => void }) { return <main className="grid min-h-screen place-items-center bg-[#f3f6fb] p-6"><div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center"><AlertTriangle className="mx-auto text-red-600" /><h1 className="mt-4 text-xl font-black">No se pudo cargar</h1><p className="mt-2 text-sm text-slate-500">{text}</p><button type="button" onClick={retry} className="mt-5 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white">Reintentar</button></div></main>; }
