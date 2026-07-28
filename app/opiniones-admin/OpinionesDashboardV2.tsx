"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BellRing,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  Gauge,
  Lightbulb,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  MessageSquareText,
  Phone,
  QrCode,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  UserRoundCheck,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";
import ReputationMaterials from "./ReputationMaterials";
import {
  aspectLabels,
  average,
  csvEscape,
  dateWithinDays,
  dayKey,
  followUpLabels,
  formatDateTime,
  originLabels,
  safePercent,
  startOfLocalDay,
  statusLabels,
  type AlertStatus,
  type AspectKey,
  type DashboardTab,
  type FollowUpStatus,
  type Opinion,
  type OpinionAlert,
  type OpinionConfig,
  type OpinionEvent,
  type OpinionStatus,
  type OriginKey,
  type Restaurant,
} from "./reputation";

const tabItems: Array<{
  id: DashboardTab;
  label: string;
  icon: ReactNode;
}> = [
  { id: "resumen", label: "Resumen", icon: <Gauge /> },
  { id: "opiniones", label: "Opiniones", icon: <MessageSquareText /> },
  { id: "insights", label: "Insights", icon: <Sparkles /> },
  { id: "materiales", label: "Materiales QR", icon: <QrCode /> },
  { id: "ajustes", label: "Ajustes", icon: <Settings /> },
];

const ratingColors: Record<number, string> = {
  5: "#2563eb",
  4: "#60a5fa",
  3: "#f59e0b",
  2: "#fb923c",
  1: "#ef4444",
};

export default function OpinionesDashboardV2() {
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<DashboardTab>("resumen");
  const [config, setConfig] = useState<OpinionConfig | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [opinions, setOpinions] = useState<Opinion[]>([]);
  const [events, setEvents] = useState<OpinionEvent[]>([]);
  const [alerts, setAlerts] = useState<OpinionAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ratingFilter, setRatingFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [aspectFilter, setAspectFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("30");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedOpinion, setSelectedOpinion] = useState<Opinion | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingOpinion, setSavingOpinion] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
      setAuthChecked(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setIsAuthenticated(Boolean(session));
        setAuthChecked(true);
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: configs, error: configError } = await supabase
        .from("opinion_config")
        .select("*")
        .order("created_at", { ascending: true });

      if (configError) throw configError;

      const selectedConfig =
        configs?.find((item) => item.slug === "hispanos-grill") ?? configs?.[0];

      if (!selectedConfig) {
        throw new Error(
          "No hay ningún restaurante con el sistema de opiniones configurado para esta cuenta.",
        );
      }

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
            .order("created_at", { ascending: false })
            .limit(5000),
          supabase
            .from("opinion_eventos")
            .select(
              "id,restaurante_id,submission_token,event_type,origen,rating,created_at",
            )
            .eq("restaurante_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(10000),
          supabase
            .from("opinion_alertas")
            .select(
              "id,restaurante_id,opinion_id,tipo,estado,destino_email,destino_whatsapp,payload,created_at,sent_at,dismissed_at",
            )
            .eq("restaurante_id", restaurantId)
            .order("created_at", { ascending: false })
            .limit(3000),
        ]);

      if (restaurantResult.error) throw restaurantResult.error;
      if (opinionsResult.error) throw opinionsResult.error;
      if (eventsResult.error) throw eventsResult.error;
      if (alertsResult.error) throw alertsResult.error;

      setConfig(selectedConfig as OpinionConfig);
      setRestaurant(restaurantResult.data as Restaurant);
      setOpinions((opinionsResult.data ?? []) as Opinion[]);
      setEvents((eventsResult.data ?? []) as OpinionEvent[]);
      setAlerts((alertsResult.data ?? []) as OpinionAlert[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los datos del sistema de reputación.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (isAuthenticated) void loadData();
  }, [isAuthenticated, loadData]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setAuthError("No se pudo iniciar sesión. Revisa el correo y la contraseña.");
      setAuthLoading(false);
      return;
    }

    setPassword("");
    setAuthLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setConfig(null);
    setRestaurant(null);
    setOpinions([]);
    setEvents([]);
    setAlerts([]);
  }

  async function refresh() {
    setRefreshing(true);
    await loadData();
  }

  const filteredOpinions = useMemo(() => {
    const days = dateFilter === "all" ? null : Number(dateFilter);
    const query = searchQuery.trim().toLowerCase();

    return opinions.filter((opinion) => {
      const ratingMatches =
        ratingFilter === "all" || opinion.rating === Number(ratingFilter);
      const originMatches =
        originFilter === "all" || opinion.origen === originFilter;
      const statusMatches =
        statusFilter === "all" || opinion.estado === statusFilter;
      const followUpMatches =
        followUpFilter === "all" || opinion.seguimiento === followUpFilter;
      const aspectMatches =
        aspectFilter === "all" ||
        opinion.aspectos?.includes(aspectFilter as AspectKey);
      const dateMatches = dateWithinDays(opinion.created_at, days);
      const searchMatches =
        !query ||
        [
          opinion.nombre_cliente,
          opinion.comentario,
          opinion.contacto,
          opinion.nota_interna,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query));

      return (
        ratingMatches &&
        originMatches &&
        statusMatches &&
        followUpMatches &&
        aspectMatches &&
        dateMatches &&
        searchMatches
      );
    });
  }, [
    aspectFilter,
    dateFilter,
    followUpFilter,
    opinions,
    originFilter,
    ratingFilter,
    searchQuery,
    statusFilter,
  ]);

  const analytics = useMemo(
    () => buildAnalytics(opinions, events, alerts, config?.low_rating_threshold ?? 3),
    [alerts, config?.low_rating_threshold, events, opinions],
  );

  const insights = useMemo(() => buildInsights(opinions), [opinions]);

  async function updateOpinion(
    id: string,
    patch: Partial<
      Pick<Opinion, "estado" | "seguimiento" | "nota_interna" | "resuelto_at">
    >,
  ) {
    const previous = opinions;
    setOpinions((current) =>
      current.map((opinion) =>
        opinion.id === id ? { ...opinion, ...patch } : opinion,
      ),
    );
    setSavingOpinion(true);

    const { error: updateError } = await supabase
      .from("opiniones_qr")
      .update(patch)
      .eq("id", id);

    if (updateError) {
      setOpinions(previous);
      setError("No se pudo actualizar la opinión.");
      setSavingOpinion(false);
      return false;
    }

    setSelectedOpinion((current) =>
      current?.id === id ? { ...current, ...patch } : current,
    );
    setSavingOpinion(false);
    return true;
  }

  async function saveSelectedOpinion() {
    if (!selectedOpinion) return;
    const success = await updateOpinion(selectedOpinion.id, {
      nota_interna: noteDraft.trim() || null,
    });
    if (success) setNoteDraft(noteDraft.trim());
  }

  async function resolveOpinion(opinion: Opinion) {
    await updateOpinion(opinion.id, {
      seguimiento: "resuelto",
      estado: "respondida",
      resuelto_at: new Date().toISOString(),
    });
  }

  async function updateAlert(id: string, estado: AlertStatus) {
    const previous = alerts;
    const now = new Date().toISOString();
    const patch =
      estado === "descartada"
        ? { estado, dismissed_at: now }
        : estado === "enviada"
          ? { estado, sent_at: now }
          : { estado, sent_at: null, dismissed_at: null };

    setAlerts((current) =>
      current.map((alert) => (alert.id === id ? { ...alert, ...patch } : alert)),
    );

    const { error: updateError } = await supabase
      .from("opinion_alertas")
      .update(patch)
      .eq("id", id);

    if (updateError) {
      setAlerts(previous);
      setError("No se pudo actualizar la alerta.");
    }
  }

  async function saveSettings() {
    if (!config) return;
    setSettingsSaving(true);
    setSettingsMessage(null);

    const patch = {
      google_review_url: config.google_review_url.trim(),
      color_primary: config.color_primary,
      color_secondary: config.color_secondary,
      color_background: config.color_background,
      headline: config.headline.trim(),
      subheadline: config.subheadline.trim(),
      feedback_email: config.feedback_email?.trim() || null,
      feedback_whatsapp: config.feedback_whatsapp?.trim() || null,
      auto_open_google: config.auto_open_google,
      google_delay_ms: Math.max(1200, Math.min(config.google_delay_ms, 12000)),
      low_rating_threshold: Math.max(
        1,
        Math.min(config.low_rating_threshold, 5),
      ),
      contact_prompt_enabled: config.contact_prompt_enabled,
      active: config.active,
    };

    const { error: updateError } = await supabase
      .from("opinion_config")
      .update(patch)
      .eq("id", config.id);

    if (updateError) {
      setSettingsMessage("No se pudieron guardar los cambios.");
    } else {
      setConfig({ ...config, ...patch });
      setSettingsMessage("Cambios guardados correctamente.");
    }
    setSettingsSaving(false);
  }

  function exportCsv() {
    const headers = [
      "Fecha",
      "Valoración",
      "Nombre",
      "Comentario",
      "Aspectos",
      "Origen",
      "Estado",
      "Seguimiento",
      "Contacto",
      "Google abierto",
      "Nota interna",
    ];
    const rows = filteredOpinions.map((opinion) => [
      formatDateTime(opinion.created_at),
      opinion.rating,
      opinion.nombre_cliente ?? "",
      opinion.comentario ?? "",
      (opinion.aspectos ?? []).map((aspect) => aspectLabels[aspect]).join(", "),
      originLabels[opinion.origen] ?? opinion.origen,
      statusLabels[opinion.estado],
      followUpLabels[opinion.seguimiento],
      opinion.contacto ?? "",
      opinion.google_abierto ? "Sí" : "No",
      opinion.nota_interna ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reputacion-${config?.slug ?? "restaurante"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openOpinion(opinion: Opinion) {
    setSelectedOpinion(opinion);
    setNoteDraft(opinion.nota_interna ?? "");
    if (opinion.estado === "nueva") {
      void updateOpinion(opinion.id, { estado: "revisada" });
    }
  }

  if (!authChecked) return <FullPageLoader text="Comprobando sesión…" />;

  if (!isAuthenticated) {
    return (
      <LoginView
        email={email}
        password={password}
        loading={authLoading}
        error={authError}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={signIn}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-7">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
              <Star className="h-5 w-5" fill="currentColor" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">
                GastroHelp Reputation Suite
              </p>
              <h1 className="truncate text-base font-black sm:text-lg">
                {restaurant?.nombre ?? "Sistema de reputación"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={
                config
                  ? `/opinion/${config.slug}?origen=redes`
                  : "/opiniones-admin"
              }
              target="_blank"
              rel="noreferrer"
              className="hidden min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 md:flex"
            >
              Ver experiencia
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              aria-label="Actualizar datos"
            >
              <RefreshCcw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={signOut}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-3 py-4 sm:px-7 sm:py-7">
        <nav className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {tabItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-black transition [&_svg]:h-4 [&_svg]:w-4 ${
                tab === item.id
                  ? "bg-blue-700 text-white shadow-md shadow-blue-700/20"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.icon}
              {item.label}
              {item.id === "opiniones" && analytics.newOpinions > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    tab === item.id
                      ? "bg-white/20 text-white"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {analytics.newOpinions}
                </span>
              )}
            </button>
          ))}
        </nav>

        {error && (
          <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white py-24 text-center shadow-sm">
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-blue-700" />
            <p className="mt-4 text-sm font-bold text-slate-500">
              Construyendo el panel de reputación…
            </p>
          </div>
        ) : !config || !restaurant ? (
          <EmptyState />
        ) : (
          <>
            {tab === "resumen" && (
              <OverviewTab
                config={config}
                analytics={analytics}
                alerts={alerts}
                opinions={opinions}
                onOpenOpinion={openOpinion}
                onOpenOpinions={() => setTab("opiniones")}
                onOpenInsights={() => setTab("insights")}
                onUpdateAlert={updateAlert}
              />
            )}

            {tab === "opiniones" && (
              <OpinionsTab
                opinions={filteredOpinions}
                total={opinions.length}
                config={config}
                filters={{
                  ratingFilter,
                  originFilter,
                  statusFilter,
                  followUpFilter,
                  aspectFilter,
                  dateFilter,
                  searchQuery,
                }}
                setters={{
                  setRatingFilter,
                  setOriginFilter,
                  setStatusFilter,
                  setFollowUpFilter,
                  setAspectFilter,
                  setDateFilter,
                  setSearchQuery,
                }}
                onOpenOpinion={openOpinion}
                onExport={exportCsv}
              />
            )}

            {tab === "insights" && (
              <InsightsTab
                insights={insights}
                analytics={analytics}
                opinions={opinions}
              />
            )}

            {tab === "materiales" && (
              <ReputationMaterials config={config} restaurant={restaurant} />
            )}

            {tab === "ajustes" && (
              <SettingsTab
                config={config}
                saving={settingsSaving}
                message={settingsMessage}
                onChange={setConfig}
                onSave={saveSettings}
              />
            )}
          </>
        )}
      </div>

      {selectedOpinion && (
        <OpinionDrawer
          opinion={selectedOpinion}
          noteDraft={noteDraft}
          saving={savingOpinion}
          onNoteChange={setNoteDraft}
          onClose={() => setSelectedOpinion(null)}
          onSaveNote={saveSelectedOpinion}
          onStatusChange={(estado) =>
            updateOpinion(selectedOpinion.id, { estado })
          }
          onFollowUpChange={(seguimiento) =>
            updateOpinion(selectedOpinion.id, {
              seguimiento,
              resuelto_at:
                seguimiento === "resuelto" ? new Date().toISOString() : null,
            })
          }
          onResolve={() => resolveOpinion(selectedOpinion)}
        />
      )}
    </main>
  );
}

function OverviewTab({
  config,
  analytics,
  alerts,
  opinions,
  onOpenOpinion,
  onOpenOpinions,
  onOpenInsights,
  onUpdateAlert,
}: {
  config: OpinionConfig;
  analytics: ReturnType<typeof buildAnalytics>;
  alerts: OpinionAlert[];
  opinions: Opinion[];
  onOpenOpinion: (opinion: Opinion) => void;
  onOpenOpinions: () => void;
  onOpenInsights: () => void;
  onUpdateAlert: (id: string, status: AlertStatus) => void;
}) {
  const pendingAlerts = alerts.filter((alert) => alert.estado === "pendiente");
  const recentOpinions = opinions.slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Nota media"
          value={analytics.averageRating.toFixed(1)}
          suffix="/5"
          icon={<Star />}
          tone="blue"
          detail={`${analytics.totalOpinions} opiniones recibidas`}
        />
        <MetricCard
          label="Últimos 30 días"
          value={analytics.last30}
          icon={<TrendingUp />}
          tone="green"
          detail={`${analytics.last7} en los últimos 7 días`}
        />
        <MetricCard
          label="Opiniones bajas"
          value={analytics.lowRatings}
          icon={<AlertTriangle />}
          tone="amber"
          detail={`Umbral: ${config.low_rating_threshold} estrellas o menos`}
        />
        <MetricCard
          label="Seguimientos"
          value={analytics.pendingFollowUps}
          icon={<UserRoundCheck />}
          tone="purple"
          detail="Casos pendientes de revisar"
        />
        <MetricCard
          label="Aperturas de Google"
          value={`${analytics.googleRate}%`}
          icon={<ArrowUpRight />}
          tone="slate"
          detail={`${analytics.googleOpens} aperturas registradas`}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                Evolución de la reputación
              </p>
              <h2 className="mt-2 text-xl font-black tracking-tight">
                Opiniones y nota media · últimos 14 días
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenInsights}
              className="inline-flex items-center gap-2 text-xs font-black text-blue-700"
            >
              Ver análisis completo <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.trend}>
                <defs>
                  <linearGradient id="opinionArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: 16, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="opinions" name="Opiniones" stroke="#2563eb" strokeWidth={3} fill="url(#opinionArea)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            Embudo real
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight">
            Del escaneo a Google
          </h2>
          <div className="mt-6 space-y-4">
            <FunnelRow
              label="Páginas abiertas"
              value={analytics.views}
              percent={100}
              color="#1d4ed8"
            />
            <FunnelRow
              label="Opiniones enviadas"
              value={analytics.submissions}
              percent={analytics.submissionRate}
              color="#2563eb"
            />
            <FunnelRow
              label="Google abierto"
              value={analytics.googleOpens}
              percent={analytics.googleRateFromViews}
              color="#60a5fa"
            />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <MiniMetric
              label="Conversión formulario"
              value={`${analytics.submissionRate}%`}
            />
            <MiniMetric
              label="Envío → Google"
              value={`${analytics.googleRate}%`}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                Distribución
              </p>
              <h2 className="mt-2 text-xl font-black">Valoraciones recibidas</h2>
            </div>
            <Star className="h-6 w-6 text-amber-400" fill="currentColor" />
          </div>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.ratingDistribution} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={52} tick={{ fontSize: 12, fontWeight: 800, fill: "#334155" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 16, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="count" name="Opiniones" radius={[0, 8, 8, 0]}>
                  {analytics.ratingDistribution.map((item) => (
                    <Cell key={item.rating} fill={ratingColors[item.rating]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                Rendimiento por soporte
              </p>
              <h2 className="mt-2 text-xl font-black">Dónde funciona mejor</h2>
            </div>
            <Target className="h-6 w-6 text-blue-700" />
          </div>
          <div className="mt-5 space-y-3">
            {analytics.originStats.length ? (
              analytics.originStats.map((origin) => (
                <div key={origin.origin} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{originLabels[origin.origin]}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {origin.views} aperturas · {origin.submissions} opiniones
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-blue-700">{origin.conversion}%</p>
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">conversión</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <SmallEmpty text="Todavía no hay suficientes datos por ubicación." />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                Centro de alertas
              </p>
              <h2 className="mt-2 text-xl font-black">Acciones que necesitan atención</h2>
            </div>
            <BellRing className="h-6 w-6 text-red-500" />
          </div>
          <div className="mt-5 space-y-3">
            {pendingAlerts.length ? (
              pendingAlerts.slice(0, 6).map((alert) => {
                const opinion = opinions.find((item) => item.id === alert.opinion_id);
                return (
                  <div key={alert.id} className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">
                          {alert.tipo === "valoracion_baja"
                            ? `Valoración baja${opinion ? ` · ${opinion.rating} estrellas` : ""}`
                            : "Cliente solicita seguimiento"}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          {opinion?.comentario || "Sin comentario adicional."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUpdateAlert(alert.id, "descartada")}
                        className="shrink-0 text-xs font-black text-slate-400 hover:text-slate-700"
                      >
                        Descartar
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {opinion && (
                        <button
                          type="button"
                          onClick={() => onOpenOpinion(opinion)}
                          className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
                        >
                          Revisar caso
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onUpdateAlert(alert.id, "enviada")}
                        className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700"
                      >
                        Marcar como atendida
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <SmallEmpty text="No hay alertas pendientes. Todo está al día." />
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-semibold leading-5 text-amber-800">
            La cola de alertas ya está preparada. El envío automático por WhatsApp o correo se activará cuando se configure el canal de entrega.
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                Actividad reciente
              </p>
              <h2 className="mt-2 text-xl font-black">Últimas opiniones</h2>
            </div>
            <button type="button" onClick={onOpenOpinions} className="text-xs font-black text-blue-700">
              Ver todas
            </button>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {recentOpinions.length ? (
              recentOpinions.map((opinion) => (
                <button
                  key={opinion.id}
                  type="button"
                  onClick={() => onOpenOpinion(opinion)}
                  className="flex w-full items-start gap-3 py-4 text-left transition first:pt-0 last:pb-0 hover:translate-x-0.5"
                >
                  <RatingBadge rating={opinion.rating} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-black text-slate-900">
                        {opinion.nombre_cliente || "Cliente anónimo"}
                      </p>
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">
                        {formatDateTime(opinion.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">
                      {opinion.comentario || "Opinión enviada únicamente con estrellas."}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))
            ) : (
              <SmallEmpty text="Todavía no hay opiniones." />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function OpinionsTab({
  opinions,
  total,
  config,
  filters,
  setters,
  onOpenOpinion,
  onExport,
}: {
  opinions: Opinion[];
  total: number;
  config: OpinionConfig;
  filters: {
    ratingFilter: string;
    originFilter: string;
    statusFilter: string;
    followUpFilter: string;
    aspectFilter: string;
    dateFilter: string;
    searchQuery: string;
  };
  setters: {
    setRatingFilter: (value: string) => void;
    setOriginFilter: (value: string) => void;
    setStatusFilter: (value: string) => void;
    setFollowUpFilter: (value: string) => void;
    setAspectFilter: (value: string) => void;
    setDateFilter: (value: string) => void;
    setSearchQuery: (value: string) => void;
  };
  onOpenOpinion: (opinion: Opinion) => void;
  onExport: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              Bandeja de opiniones
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">
              {opinions.length} de {total} resultados
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Revisa comentarios, problemas, solicitudes de contacto y el estado de cada caso.
            </p>
          </div>
          <button
            type="button"
            onClick={onExport}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:-translate-y-0.5"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative md:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filters.searchQuery}
              onChange={(event) => setters.setSearchQuery(event.target.value)}
              placeholder="Buscar por cliente, comentario, contacto o nota…"
              className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <SelectFilter value={filters.dateFilter} onChange={setters.setDateFilter} label="Periodo">
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="all">Todo el historial</option>
          </SelectFilter>
          <SelectFilter value={filters.ratingFilter} onChange={setters.setRatingFilter} label="Valoración">
            <option value="all">Todas las estrellas</option>
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>{rating} estrellas</option>
            ))}
          </SelectFilter>
          <SelectFilter value={filters.originFilter} onChange={setters.setOriginFilter} label="Origen">
            <option value="all">Todos los orígenes</option>
            {Object.entries(originLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </SelectFilter>
          <SelectFilter value={filters.statusFilter} onChange={setters.setStatusFilter} label="Estado">
            <option value="all">Todos los estados</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </SelectFilter>
          <SelectFilter value={filters.followUpFilter} onChange={setters.setFollowUpFilter} label="Seguimiento">
            <option value="all">Todos los seguimientos</option>
            {Object.entries(followUpLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </SelectFilter>
          <SelectFilter value={filters.aspectFilter} onChange={setters.setAspectFilter} label="Aspecto">
            <option value="all">Todos los aspectos</option>
            {Object.entries(aspectLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </SelectFilter>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {opinions.length ? (
          opinions.map((opinion) => (
            <OpinionCard
              key={opinion.id}
              opinion={opinion}
              threshold={config.low_rating_threshold}
              onClick={() => onOpenOpinion(opinion)}
            />
          ))
        ) : (
          <div className="xl:col-span-2">
            <EmptyResults />
          </div>
        )}
      </div>
    </div>
  );
}

function InsightsTab({
  insights,
  analytics,
  opinions,
}: {
  insights: ReturnType<typeof buildInsights>;
  analytics: ReturnType<typeof buildAnalytics>;
  opinions: Opinion[];
}) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#0f172a,#1e3a8a)] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em]">
              <Sparkles className="h-4 w-4" /> Inteligencia del restaurante
            </div>
            <h2 className="mt-5 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
              Convierte cada opinión en una decisión concreta
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-blue-100">
              El análisis separa fortalezas, fricciones y oportunidades utilizando las valoraciones estructuradas de tus clientes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DarkMetric label="Aspectos analizados" value={insights.totalTagged} />
            <DarkMetric label="Comentarios con detalle" value={insights.commentsWithText} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <InsightPanel
          title="Lo que mejor funciona"
          eyebrow="Fortalezas"
          icon={<Flame />}
          tone="positive"
          items={insights.strengths.map((item) => ({
            title: aspectLabels[item.aspect],
            value: item.count,
            detail: `${item.share}% de las menciones positivas`,
          }))}
          empty="Todavía no hay suficientes valoraciones positivas etiquetadas."
        />
        <InsightPanel
          title="Lo que necesita atención"
          eyebrow="Fricciones"
          icon={<AlertTriangle />}
          tone="negative"
          items={insights.issues.map((item) => ({
            title: aspectLabels[item.aspect],
            value: item.count,
            detail: `${item.share}% de las menciones críticas`,
          }))}
          empty="No se han detectado patrones negativos suficientes."
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                Mapa de aspectos
              </p>
              <h2 className="mt-2 text-xl font-black">Menciones por categoría</h2>
            </div>
            <BarChart3 className="h-6 w-6 text-blue-700" />
          </div>
          <div className="mt-6 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.aspectChart} margin={{ bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 16, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="positive" name="Positivas" stackId="a" fill="#2563eb" radius={[5, 5, 0, 0]} />
                <Bar dataKey="negative" name="Críticas" stackId="a" fill="#f97316" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-600">
                Recomendaciones
              </p>
              <h2 className="mt-1 text-xl font-black">Qué haría ahora</h2>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            {insights.recommendations.map((recommendation, index) => (
              <div key={recommendation} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold leading-6 text-slate-600">
                  {recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              Diagnóstico operativo
            </p>
            <h2 className="mt-2 text-xl font-black">Indicadores de calidad</h2>
          </div>
          <p className="text-xs font-semibold text-slate-400">
            Basado en {opinions.length} opiniones
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <QualityCard
            label="Satisfacción alta"
            value={`${analytics.highRatingShare}%`}
            detail="Opiniones de 4 y 5 estrellas"
            icon={<Star />}
            tone="blue"
          />
          <QualityCard
            label="Casos resueltos"
            value={`${analytics.resolutionRate}%`}
            detail="Seguimientos finalizados"
            icon={<CheckCircle2 />}
            tone="green"
          />
          <QualityCard
            label="Comentarios útiles"
            value={`${analytics.commentRate}%`}
            detail="Opiniones con texto escrito"
            icon={<ClipboardCheck />}
            tone="purple"
          />
        </div>
      </section>
    </div>
  );
}

function SettingsTab({
  config,
  saving,
  message,
  onChange,
  onSave,
}: {
  config: OpinionConfig;
  saving: boolean;
  message: string | null;
  onChange: (config: OpinionConfig) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
          Configuración general
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">
          Personaliza la experiencia y las alertas
        </h2>

        <div className="mt-7 space-y-6">
          <SettingsGroup title="Experiencia pública" description="Textos, enlace de Google y comportamiento final.">
            <TextField
              label="Titular"
              value={config.headline}
              onChange={(value) => onChange({ ...config, headline: value })}
            />
            <TextField
              label="Subtítulo"
              value={config.subheadline}
              onChange={(value) => onChange({ ...config, subheadline: value })}
            />
            <TextField
              label="Enlace oficial de reseñas de Google"
              value={config.google_review_url}
              onChange={(value) => onChange({ ...config, google_review_url: value })}
              multiline
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <ToggleField
                label="Abrir Google automáticamente"
                description="Después de guardar y copiar el comentario."
                checked={config.auto_open_google}
                onChange={(value) => onChange({ ...config, auto_open_google: value })}
              />
              <NumberField
                label="Espera antes de abrir Google"
                value={config.google_delay_ms}
                min={1200}
                max={12000}
                step={100}
                suffix="ms"
                onChange={(value) => onChange({ ...config, google_delay_ms: value })}
              />
            </div>
          </SettingsGroup>

          <SettingsGroup title="Gestión de incidencias" description="Define cuándo se crea una alerta y cómo puede pedir seguimiento el cliente.">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Umbral de valoración baja"
                value={config.low_rating_threshold}
                min={1}
                max={5}
                step={1}
                suffix="estrellas"
                onChange={(value) => onChange({ ...config, low_rating_threshold: value })}
              />
              <ToggleField
                label="Permitir solicitud de contacto"
                description="Aparece únicamente en valoraciones bajas."
                checked={config.contact_prompt_enabled}
                onChange={(value) => onChange({ ...config, contact_prompt_enabled: value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Correo para alertas"
                value={config.feedback_email ?? ""}
                onChange={(value) => onChange({ ...config, feedback_email: value })}
                placeholder="restaurante@email.com"
              />
              <TextField
                label="WhatsApp para alertas"
                value={config.feedback_whatsapp ?? ""}
                onChange={(value) => onChange({ ...config, feedback_whatsapp: value })}
                placeholder="+34 600 000 000"
              />
            </div>
          </SettingsGroup>

          <SettingsGroup title="Identidad visual" description="Colores aplicados al formulario, materiales y llamadas a la acción.">
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField label="Color principal" value={config.color_primary} onChange={(value) => onChange({ ...config, color_primary: value })} />
              <ColorField label="Color secundario" value={config.color_secondary} onChange={(value) => onChange({ ...config, color_secondary: value })} />
              <ColorField label="Color de fondo" value={config.color_background} onChange={(value) => onChange({ ...config, color_background: value })} />
            </div>
          </SettingsGroup>

          <ToggleField
            label="Sistema activo"
            description="Si se desactiva, los códigos QR dejarán de mostrar el formulario."
            checked={config.active}
            onChange={(value) => onChange({ ...config, active: value })}
          />
        </div>

        {message && (
          <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${message.includes("correctamente") ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {message}
          </div>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition enabled:hover:-translate-y-0.5 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando…" : "Guardar configuración"}
        </button>
      </section>

      <aside className="space-y-5">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            Vista previa
          </p>
          <div className="mt-5 rounded-[1.7rem] border border-black/5 p-5 text-center shadow-inner" style={{ background: config.color_background }}>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-sm">
              <Star className="h-9 w-9" style={{ color: config.color_primary }} fill="currentColor" />
            </div>
            <h3 className="mt-5 font-serif text-2xl font-semibold leading-tight" style={{ color: config.color_secondary }}>
              {config.headline || "Titular de la experiencia"}
            </h3>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              {config.subheadline || "Subtítulo de la experiencia"}
            </p>
            <div className="mt-5 h-12 rounded-xl" style={{ background: config.color_primary }} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <h3 className="text-sm font-black text-amber-900">Estado de automatizaciones</h3>
              <p className="mt-2 text-xs font-semibold leading-5 text-amber-800">
                Las alertas y destinos están guardados. Para enviar WhatsApp o correo de forma real falta conectar un proveedor o webhook de n8n.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function OpinionDrawer({
  opinion,
  noteDraft,
  saving,
  onNoteChange,
  onClose,
  onSaveNote,
  onStatusChange,
  onFollowUpChange,
  onResolve,
}: {
  opinion: Opinion;
  noteDraft: string;
  saving: boolean;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onSaveNote: () => void;
  onStatusChange: (status: OpinionStatus) => void;
  onFollowUpChange: (status: FollowUpStatus) => void;
  onResolve: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm" onMouseDown={onClose}>
      <aside
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Detalle de opinión</p>
            <h2 className="mt-1 text-lg font-black">{opinion.nombre_cliente || "Cliente anónimo"}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          <section className="rounded-[1.7rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <RatingBadge rating={opinion.rating} large />
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400">{formatDateTime(opinion.created_at)}</p>
                <p className="mt-1 text-xs font-black text-blue-700">{originLabels[opinion.origen]}</p>
              </div>
            </div>
            <p className="mt-5 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-700">
              {opinion.comentario || "El cliente envió únicamente la valoración por estrellas."}
            </p>
            {!!opinion.aspectos?.length && (
              <div className="mt-4 flex flex-wrap gap-2">
                {opinion.aspectos.map((aspect) => (
                  <span key={aspect} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">
                    {aspectLabels[aspect]}
                  </span>
                ))}
              </div>
            )}
          </section>

          {opinion.solicita_contacto && opinion.contacto && (
            <section className="rounded-[1.7rem] border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                {opinion.contacto_tipo === "email" ? <Mail className="h-5 w-5 text-amber-700" /> : <Phone className="h-5 w-5 text-amber-700" />}
                <div>
                  <p className="text-sm font-black text-amber-900">El cliente solicita contacto</p>
                  <p className="mt-1 text-sm font-bold text-amber-800">{opinion.contacto}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {opinion.contacto_tipo === "telefono" && (
                  <a href={`tel:${opinion.contacto}`} className="rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-black text-white">Llamar</a>
                )}
                {opinion.contacto_tipo === "email" && (
                  <a href={`mailto:${opinion.contacto}`} className="rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-black text-white">Enviar correo</a>
                )}
              </div>
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <SelectControl
              label="Estado de lectura"
              value={opinion.estado}
              onChange={(value) => onStatusChange(value as OpinionStatus)}
            >
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </SelectControl>
            <SelectControl
              label="Seguimiento"
              value={opinion.seguimiento}
              onChange={(value) => onFollowUpChange(value as FollowUpStatus)}
            >
              {Object.entries(followUpLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </SelectControl>
          </section>

          <section className="rounded-[1.7rem] border border-slate-200 bg-white p-5">
            <label className="block">
              <span className="text-sm font-black text-slate-900">Nota interna</span>
              <span className="mt-1 block text-xs font-semibold text-slate-500">Solo la ve el equipo del restaurante.</span>
              <textarea
                value={noteDraft}
                onChange={(event) => onNoteChange(event.target.value.slice(0, 2000))}
                rows={5}
                placeholder="Añade qué se habló con el cliente, qué se revisó o cómo se resolvió…"
                className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={onSaveNote}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar nota
            </button>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <InfoLine label="Google abierto" value={opinion.google_abierto ? "Sí" : "No"} icon={<ExternalLink />} />
            <InfoLine label="Caso resuelto" value={opinion.resuelto_at ? formatDateTime(opinion.resuelto_at) : "Pendiente"} icon={<CheckCircle2 />} />
          </section>

          {opinion.seguimiento !== "resuelto" && (
            <button
              type="button"
              disabled={saving}
              onClick={onResolve}
              className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 text-sm font-black text-white shadow-lg shadow-green-600/20 disabled:opacity-60"
            >
              <CheckCircle2 className="h-5 w-5" />
              Marcar como resuelto
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function LoginView({
  email,
  password,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  loading: boolean;
  error: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f6fb] px-5 py-10">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-blue-500/15 blur-3xl" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-slate-900/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-[2.2rem] border border-white/70 bg-white/95 p-7 shadow-[0_35px_100px_rgba(15,23,42,.16)] backdrop-blur sm:p-9">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-700 text-white shadow-lg shadow-blue-700/25">
          <Star className="h-7 w-7" fill="currentColor" />
        </div>
        <p className="mt-6 text-center text-xs font-black uppercase tracking-[0.2em] text-blue-700">GastroHelp</p>
        <h1 className="mt-2 text-center text-3xl font-black tracking-tight">Reputation Suite</h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm font-semibold leading-6 text-slate-500">
          Accede al panel privado para revisar opiniones, detectar problemas y gestionar cada seguimiento.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <TextInput label="Correo electrónico" type="email" value={email} onChange={onEmailChange} autoComplete="email" />
          <TextInput label="Contraseña" type="password" value={password} onChange={onPasswordChange} autoComplete="current-password" />
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          <button type="submit" disabled={loading} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white shadow-lg shadow-blue-700/20 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {loading ? "Entrando…" : "Entrar al panel"}
          </button>
        </form>
      </section>
    </main>
  );
}

function buildAnalytics(
  opinions: Opinion[],
  events: OpinionEvent[],
  alerts: OpinionAlert[],
  threshold: number,
) {
  const ratings = opinions.map((opinion) => opinion.rating);
  const totalOpinions = opinions.length;
  const last30 = opinions.filter((opinion) => dateWithinDays(opinion.created_at, 30)).length;
  const last7 = opinions.filter((opinion) => dateWithinDays(opinion.created_at, 7)).length;
  const lowRatings = opinions.filter((opinion) => opinion.rating <= threshold).length;
  const highRatings = opinions.filter((opinion) => opinion.rating >= 4).length;
  const pendingFollowUps = opinions.filter((opinion) => opinion.seguimiento !== "resuelto" && (opinion.rating <= threshold || opinion.solicita_contacto)).length;
  const resolved = opinions.filter((opinion) => opinion.seguimiento === "resuelto").length;
  const followUpCases = opinions.filter((opinion) => opinion.rating <= threshold || opinion.solicita_contacto).length;
  const comments = opinions.filter((opinion) => Boolean(opinion.comentario?.trim())).length;
  const views = events.filter((event) => event.event_type === "view").length;
  const submissions = events.filter((event) => event.event_type === "submitted").length || totalOpinions;
  const googleOpens = events.filter((event) => event.event_type === "google_opened").length || opinions.filter((opinion) => opinion.google_abierto).length;

  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = startOfLocalDay(new Date());
    date.setDate(date.getDate() - (13 - index));
    const key = dayKey(date);
    const daily = opinions.filter((opinion) => dayKey(new Date(opinion.created_at)) === key);
    return {
      key,
      label: date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
      opinions: daily.length,
      average: daily.length ? Math.round(average(daily.map((item) => item.rating)) * 10) / 10 : null,
    };
  });

  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    label: `${rating} ★`,
    count: opinions.filter((opinion) => opinion.rating === rating).length,
  }));

  const originKeys = ["mesa", "caja", "entrada", "portacuentas", "redes"] as OriginKey[];
  const originStats = originKeys
    .map((origin) => {
      const originViews = events.filter((event) => event.origen === origin && event.event_type === "view").length;
      const originSubmissions = opinions.filter((opinion) => opinion.origen === origin).length;
      return {
        origin,
        views: originViews,
        submissions: originSubmissions,
        conversion: safePercent(originSubmissions, originViews),
      };
    })
    .filter((item) => item.views || item.submissions)
    .sort((a, b) => b.submissions - a.submissions);

  return {
    totalOpinions,
    averageRating: average(ratings),
    last30,
    last7,
    lowRatings,
    highRatingShare: safePercent(highRatings, totalOpinions),
    pendingFollowUps,
    resolutionRate: safePercent(resolved, followUpCases),
    commentRate: safePercent(comments, totalOpinions),
    newOpinions: opinions.filter((opinion) => opinion.estado === "nueva").length,
    pendingAlerts: alerts.filter((alert) => alert.estado === "pendiente").length,
    views,
    submissions,
    googleOpens,
    submissionRate: safePercent(submissions, views),
    googleRate: safePercent(googleOpens, submissions),
    googleRateFromViews: safePercent(googleOpens, views),
    trend,
    ratingDistribution,
    originStats,
  };
}

function buildInsights(opinions: Opinion[]) {
  const aspectKeys = Object.keys(aspectLabels) as AspectKey[];
  const positive = opinions.filter((opinion) => opinion.rating >= 4);
  const negative = opinions.filter((opinion) => opinion.rating <= 3);

  const strengths = aspectKeys
    .map((aspect) => ({ aspect, count: positive.filter((opinion) => opinion.aspectos?.includes(aspect)).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((item) => ({ ...item, share: safePercent(item.count, positive.reduce((sum, opinion) => sum + (opinion.aspectos?.length ?? 0), 0)) }))
    .slice(0, 5);

  const issues = aspectKeys
    .map((aspect) => ({ aspect, count: negative.filter((opinion) => opinion.aspectos?.includes(aspect)).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((item) => ({ ...item, share: safePercent(item.count, negative.reduce((sum, opinion) => sum + (opinion.aspectos?.length ?? 0), 0)) }))
    .slice(0, 5);

  const aspectChart = aspectKeys.map((aspect) => ({
    aspect,
    label: aspectLabels[aspect],
    positive: positive.filter((opinion) => opinion.aspectos?.includes(aspect)).length,
    negative: negative.filter((opinion) => opinion.aspectos?.includes(aspect)).length,
  }));

  const recommendations: string[] = [];
  if (issues[0]) recommendations.push(`Prioriza ${aspectLabels[issues[0].aspect].toLowerCase()}: es el patrón crítico que más se repite en las valoraciones de 1 a 3 estrellas.`);
  if (strengths[0]) recommendations.push(`Refuerza ${aspectLabels[strengths[0].aspect].toLowerCase()} en la comunicación del restaurante: es el atributo positivo más mencionado.`);
  const unresolved = opinions.filter((opinion) => opinion.seguimiento !== "resuelto" && (opinion.rating <= 3 || opinion.solicita_contacto)).length;
  if (unresolved) recommendations.push(`Revisa los ${unresolved} casos pendientes y documenta la solución para evitar que el mismo problema vuelva a aparecer.`);
  const lowCommentRate = safePercent(opinions.filter((opinion) => opinion.comentario?.trim()).length, opinions.length);
  if (lowCommentRate < 60) recommendations.push("Mantén las sugerencias de comentario visibles: todavía hay margen para conseguir más contexto escrito en cada valoración.");
  if (!recommendations.length) recommendations.push("Sigue recogiendo opiniones para detectar tendencias fiables y comparar el rendimiento de cada ubicación QR.");

  return {
    strengths,
    issues,
    aspectChart,
    recommendations: recommendations.slice(0, 4),
    totalTagged: opinions.reduce((sum, opinion) => sum + (opinion.aspectos?.length ?? 0), 0),
    commentsWithText: opinions.filter((opinion) => opinion.comentario?.trim()).length,
  };
}

function MetricCard({ label, value, suffix, icon, tone, detail }: { label: string; value: string | number; suffix?: string; icon: ReactNode; tone: "blue" | "green" | "amber" | "purple" | "slate"; detail: string }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl [&_svg]:h-5 [&_svg]:w-5 ${tones[tone]}`}>{icon}</div>
    <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
    <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{value}<span className="ml-1 text-sm text-slate-400">{suffix}</span></p>
    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{detail}</p>
  </div>;
}

function FunnelRow({ label, value, percent, color }: { label: string; value: number; percent: number; color: string }) {
  const safeWidth = Math.max(3, Math.min(percent, 100));
  return <div>
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-black text-slate-700">{label}</p><p className="text-sm font-black text-slate-950">{value}</p></div>
    <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${safeWidth}%`, background: color }} /></div>
    <p className="mt-1 text-right text-[10px] font-black text-slate-400">{Math.round(percent * 10) / 10}%</p>
  </div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-xl font-black text-slate-950">{value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p></div>;
}

function OpinionCard({ opinion, threshold, onClick }: { opinion: Opinion; threshold: number; onClick: () => void }) {
  const needsAttention = opinion.rating <= threshold || opinion.solicita_contacto;
  return <button type="button" onClick={onClick} className="group w-full rounded-[1.7rem] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
    <div className="flex items-start gap-4">
      <RatingBadge rating={opinion.rating} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-black text-slate-950">{opinion.nombre_cliente || "Cliente anónimo"}</p>
            <p className="mt-1 text-[11px] font-bold text-slate-400">{formatDateTime(opinion.created_at)} · {originLabels[opinion.origen]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {needsAttention && opinion.seguimiento !== "resuelto" && <Pill tone="red">Necesita atención</Pill>}
            {opinion.google_abierto && <Pill tone="blue">Google abierto</Pill>}
            <Pill tone={opinion.seguimiento === "resuelto" ? "green" : "slate"}>{followUpLabels[opinion.seguimiento]}</Pill>
          </div>
        </div>
        <p className="mt-4 line-clamp-3 text-sm font-semibold leading-6 text-slate-600">{opinion.comentario || "Opinión enviada únicamente con estrellas."}</p>
        {!!opinion.aspectos?.length && <div className="mt-3 flex flex-wrap gap-1.5">{opinion.aspectos.map((aspect) => <span key={aspect} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{aspectLabels[aspect]}</span>)}</div>}
        {opinion.solicita_contacto && opinion.contacto && <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{opinion.contacto_tipo === "email" ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />} Solicita contacto · {opinion.contacto}</div>}
      </div>
      <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-1" />
    </div>
  </button>;
}

function RatingBadge({ rating, large }: { rating: number; large?: boolean }) {
  return <div className={`flex shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-sm ${large ? "h-20 w-20" : "h-14 w-14"}`} style={{ background: ratingColors[rating] }}><span className={`${large ? "text-3xl" : "text-xl"} font-black`}>{rating}</span><Star className={`${large ? "h-4 w-4" : "h-3 w-3"}`} fill="currentColor" /></div>;
}

function Pill({ children, tone }: { children: ReactNode; tone: "red" | "blue" | "green" | "slate" }) {
  const tones = { red: "bg-red-50 text-red-700", blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700", slate: "bg-slate-100 text-slate-600" };
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${tones[tone]}`}>{children}</span>;
}

function InsightPanel({ title, eyebrow, icon, tone, items, empty }: { title: string; eyebrow: string; icon: ReactNode; tone: "positive" | "negative"; items: Array<{ title: string; value: number; detail: string }>; empty: string }) {
  const positive = tone === "positive";
  return <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex items-center gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl [&_svg]:h-5 [&_svg]:w-5 ${positive ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-600"}`}>{icon}</div><div><p className={`text-xs font-black uppercase tracking-[0.16em] ${positive ? "text-blue-700" : "text-orange-600"}`}>{eyebrow}</p><h2 className="mt-1 text-xl font-black">{title}</h2></div></div>
    <div className="mt-6 space-y-3">{items.length ? items.map((item, index) => <div key={item.title} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-white ${positive ? "bg-blue-700" : "bg-orange-500"}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="font-black text-slate-900">{item.title}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.detail}</p></div><p className="text-2xl font-black text-slate-950">{item.value}</p></div>) : <SmallEmpty text={empty} />}</div>
  </div>;
}

function DarkMetric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-36 rounded-2xl bg-white/10 p-4 backdrop-blur"><p className="text-2xl font-black">{value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wide text-blue-200">{label}</p></div>;
}

function QualityCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: ReactNode; tone: "blue" | "green" | "purple" }) {
  const tones = { blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700", purple: "bg-violet-50 text-violet-700" };
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><div className={`flex h-10 w-10 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5 ${tones[tone]}`}>{icon}</div><p className="mt-4 text-3xl font-black text-slate-950">{value}</p><p className="mt-1 text-sm font-black text-slate-700">{label}</p><p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p></div>;
}

function SelectFilter({ value, onChange, label, children }: { value: string; onChange: (value: string) => void; label: string; children: ReactNode }) {
  return <label><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100">{children}</select></label>;
}

function SelectControl({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label><span className="text-sm font-black text-slate-900">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100">{children}</select></label>;
}

function InfoLine({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-blue-700 [&_svg]:h-5 [&_svg]:w-5">{icon}</div><div><p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-800">{value}</p></div></div>;
}

function SettingsGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-[1.6rem] border border-slate-200 bg-slate-50/70 p-5"><h3 className="text-base font-black text-slate-950">{title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p><div className="mt-5 space-y-4">{children}</div></section>;
}

function TextField({ label, value, onChange, placeholder, multiline }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  const className = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100";
  return <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} placeholder={placeholder} className={`${className} py-3 leading-6`} /> : <input type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${className} min-h-12`} />}</label>;
}

function NumberField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span><div className="relative mt-2"><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-20 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">{suffix}</span></div></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span><div className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0" /><input type="text" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 text-sm font-black uppercase outline-none" /></div></label>;
}

function ToggleField({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"><span><span className="block text-sm font-black text-slate-900">{label}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-blue-700" /></label>;
}

function TextInput({ label, type, value, onChange, autoComplete }: { label: string; type: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  return <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100" /></label>;
}

function FullPageLoader({ text }: { text: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f6fb] px-6"><div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-700" /><p className="mt-4 text-sm font-bold text-slate-500">{text}</p></div></main>;
}

function EmptyState() {
  return <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center shadow-sm"><QrCode className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-5 text-2xl font-black">Sistema sin configurar</h2><p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">No se ha encontrado una configuración de opiniones asociada a esta cuenta.</p></div>;
}

function EmptyResults() {
  return <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-12 text-center"><Filter className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-4 text-lg font-black">No hay resultados</h3><p className="mt-2 text-sm font-semibold text-slate-500">Prueba a cambiar o limpiar los filtros.</p></div>;
}

function SmallEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-xs font-bold text-slate-400">{text}</div>;
}
