"use client";

import {
  BarChart3,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  FileDown,
  Filter,
  Loader2,
  LogIn,
  LogOut,
  MessageSquareText,
  Printer,
  QrCode,
  RefreshCcw,
  Save,
  Settings,
  Star,
} from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";

type Tab = "resumen" | "opiniones" | "materiales" | "ajustes";
type OpinionStatus = "nueva" | "revisada" | "respondida";
type Origin = "mesa" | "caja" | "entrada" | "portacuentas";

type OpinionConfig = {
  id: string;
  restaurante_id: string;
  slug: string;
  google_review_url: string;
  logo_url: string | null;
  color_primary: string;
  color_secondary: string;
  color_background: string;
  headline: string;
  subheadline: string;
  feedback_email: string | null;
  feedback_whatsapp: string | null;
  active: boolean;
};

type Opinion = {
  id: string;
  restaurante_id: string;
  rating: number;
  comentario: string | null;
  nombre_cliente: string | null;
  origen: string;
  estado: OpinionStatus;
  created_at: string;
};

type Restaurant = {
  id: string;
  nombre: string;
};

type MaterialDefinition = {
  origin: Origin;
  label: string;
  title: string;
  subtitle: string;
};

const materials: MaterialDefinition[] = [
  {
    origin: "mesa",
    label: "Mesas",
    title: "Tu opinión nos hace mejores",
    subtitle: "Escanea y cuéntanos cómo ha sido tu experiencia en Hispanos Grill",
  },
  {
    origin: "caja",
    label: "Caja",
    title: "Antes de irte…",
    subtitle: "Cuéntanos qué te ha parecido",
  },
  {
    origin: "entrada",
    label: "Entrada",
    title: "¿Has comido con nosotros?",
    subtitle: "Escanea y cuéntanos tu experiencia",
  },
  {
    origin: "portacuentas",
    label: "Portacuentas",
    title: "Gracias por visitarnos",
    subtitle: "Escanea y déjanos tu opinión",
  },
];

const originLabels: Record<string, string> = {
  mesa: "Mesa",
  caja: "Caja",
  entrada: "Entrada",
  portacuentas: "Portacuentas",
  redes: "Redes",
  desconocido: "Sin identificar",
};

export default function OpinionesDashboard() {
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("resumen");
  const [config, setConfig] = useState<OpinionConfig | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [opinions, setOpinions] = useState<Opinion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [ratingFilter, setRatingFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("30");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
      setAuthChecked(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(session));
      setAuthChecked(true);
    });

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
        setConfig(null);
        setRestaurant(null);
        setOpinions([]);
        throw new Error(
          "No hay ningún restaurante con el sistema de opiniones configurado para esta cuenta.",
        );
      }

      setConfig(selectedConfig as OpinionConfig);

      const [{ data: restaurantData, error: restaurantError }, opinionResult] =
        await Promise.all([
          supabase
            .from("restaurantes")
            .select("id,nombre")
            .eq("id", selectedConfig.restaurante_id)
            .single(),
          supabase
            .from("opiniones_qr")
            .select(
              "id,restaurante_id,rating,comentario,nombre_cliente,origen,estado,created_at",
            )
            .eq("restaurante_id", selectedConfig.restaurante_id)
            .order("created_at", { ascending: false })
            .limit(2000),
        ]);

      if (restaurantError) throw restaurantError;
      if (opinionResult.error) throw opinionResult.error;

      setRestaurant(restaurantData as Restaurant);
      setOpinions((opinionResult.data ?? []) as Opinion[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las opiniones.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (isAuthenticated) loadData();
  }, [isAuthenticated, loadData]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
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
  }

  async function refresh() {
    setRefreshing(true);
    await loadData();
  }

  async function updateStatus(id: string, estado: OpinionStatus) {
    const previous = opinions;
    setOpinions((current) =>
      current.map((opinion) =>
        opinion.id === id ? { ...opinion, estado } : opinion,
      ),
    );

    const { error: updateError } = await supabase
      .from("opiniones_qr")
      .update({ estado })
      .eq("id", id);

    if (updateError) {
      setOpinions(previous);
      setError("No se pudo actualizar el estado de la opinión.");
    }
  }

  async function saveSettings() {
    if (!config) return;

    setSettingsSaving(true);
    setSettingsMessage(null);

    const { error: updateError } = await supabase
      .from("opinion_config")
      .update({
        google_review_url: config.google_review_url.trim(),
        color_primary: config.color_primary,
        color_secondary: config.color_secondary,
        color_background: config.color_background,
        headline: config.headline.trim(),
        subheadline: config.subheadline.trim(),
        feedback_email: config.feedback_email?.trim() || null,
        feedback_whatsapp: config.feedback_whatsapp?.trim() || null,
        active: config.active,
      })
      .eq("id", config.id);

    if (updateError) {
      setSettingsMessage("No se pudieron guardar los cambios.");
    } else {
      setSettingsMessage("Cambios guardados correctamente.");
    }

    setSettingsSaving(false);
  }

  const filteredOpinions = useMemo(() => {
    const now = Date.now();
    const days = dateFilter === "all" ? null : Number(dateFilter);

    return opinions.filter((opinion) => {
      const ratingMatches =
        ratingFilter === "all" || opinion.rating === Number(ratingFilter);
      const originMatches =
        originFilter === "all" || opinion.origen === originFilter;
      const statusMatches =
        statusFilter === "all" || opinion.estado === statusFilter;
      const dateMatches =
        days === null ||
        now - new Date(opinion.created_at).getTime() <= days * 24 * 60 * 60 * 1000;

      return ratingMatches && originMatches && statusMatches && dateMatches;
    });
  }, [opinions, ratingFilter, originFilter, statusFilter, dateFilter]);

  const metrics = useMemo(() => {
    const total = opinions.length;
    const average = total
      ? opinions.reduce((sum, opinion) => sum + opinion.rating, 0) / total
      : 0;
    const last30 = opinions.filter(
      (opinion) =>
        Date.now() - new Date(opinion.created_at).getTime() <=
        30 * 24 * 60 * 60 * 1000,
    ).length;
    const newCount = opinions.filter((opinion) => opinion.estado === "nueva").length;
    const distribution = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: opinions.filter((opinion) => opinion.rating === rating).length,
    }));
    const origins = Object.entries(originLabels)
      .map(([origin, label]) => ({
        origin,
        label,
        count: opinions.filter((opinion) => opinion.origen === origin).length,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);

    return { total, average, last30, newCount, distribution, origins };
  }, [opinions]);

  function exportCsv() {
    const headers = [
      "Fecha",
      "Valoración",
      "Nombre",
      "Comentario",
      "Origen",
      "Estado",
    ];
    const rows = filteredOpinions.map((opinion) => [
      new Date(opinion.created_at).toLocaleString("es-ES"),
      opinion.rating,
      opinion.nombre_cliente ?? "",
      opinion.comentario ?? "",
      originLabels[opinion.origen] ?? opinion.origen,
      opinion.estado,
    ]);

    const escape = (value: string | number) =>
      `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(escape).join(";")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `opiniones-${config?.slug ?? "restaurante"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
    <main className="min-h-screen bg-[#f5f6fa] text-[#111827]">
      <header className="border-b border-black/5 bg-white px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1f5fbf] text-white shadow-lg shadow-[#1f5fbf]/20">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1f5fbf]">
                GastroHelp
              </p>
              <h1 className="text-lg font-semibold text-[#111827]">
                Opiniones QR · {restaurant?.nombre ?? "Restaurante"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb] disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
            <button
              type="button"
              onClick={signOut}
              className="flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb]"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
        <nav className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-black/5 bg-white p-2 shadow-sm">
          <TabButton active={tab === "resumen"} onClick={() => setTab("resumen")} icon={<BarChart3 />}>
            Resumen
          </TabButton>
          <TabButton active={tab === "opiniones"} onClick={() => setTab("opiniones")} icon={<MessageSquareText />}>
            Opiniones
          </TabButton>
          <TabButton active={tab === "materiales"} onClick={() => setTab("materiales")} icon={<QrCode />}>
            Materiales QR
          </TabButton>
          <TabButton active={tab === "ajustes"} onClick={() => setTab("ajustes")} icon={<Settings />}>
            Ajustes
          </TabButton>
        </nav>

        {loading ? (
          <div className="rounded-3xl border border-black/5 bg-white p-12 text-center shadow-sm">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f5fbf]" />
            <p className="mt-3 text-sm text-[#6b7280]">Cargando datos…</p>
          </div>
        ) : error && !config ? (
          <EmptyState title="No se pudo cargar el sistema" text={error} />
        ) : (
          <>
            {error && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            {tab === "resumen" && (
              <SummaryView metrics={metrics} opinions={opinions} config={config} />
            )}
            {tab === "opiniones" && (
              <OpinionsView
                opinions={filteredOpinions}
                ratingFilter={ratingFilter}
                originFilter={originFilter}
                statusFilter={statusFilter}
                dateFilter={dateFilter}
                onRatingFilterChange={setRatingFilter}
                onOriginFilterChange={setOriginFilter}
                onStatusFilterChange={setStatusFilter}
                onDateFilterChange={setDateFilter}
                onStatusChange={updateStatus}
                onExport={exportCsv}
              />
            )}
            {tab === "materiales" && config && restaurant && (
              <MaterialsView config={config} restaurant={restaurant} />
            )}
            {tab === "ajustes" && config && (
              <SettingsView
                config={config}
                saving={settingsSaving}
                message={settingsMessage}
                onConfigChange={setConfig}
                onSave={saveSettings}
              />
            )}
          </>
        )}
      </div>
    </main>
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
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07101f] px-5 py-10">
      <section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white p-7 shadow-2xl sm:p-9">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f5fbf] text-white shadow-lg shadow-[#1f5fbf]/25">
          <QrCode className="h-6 w-6" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#1f5fbf]">
          GastroHelp
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-[#111827]">
          Panel de opiniones QR
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#6b7280]">
          Accede con la misma cuenta que utilizas en el panel del restaurante.
        </p>

        <form onSubmit={onSubmit} className="mt-7 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-[#374151]">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              required
              autoComplete="email"
              className="mt-2 h-12 w-full rounded-xl border border-[#d1d5db] bg-white px-4 text-sm text-[#111827] outline-none focus:border-[#1f5fbf] focus:ring-4 focus:ring-[#1f5fbf]/10"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-[#374151]">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
              autoComplete="current-password"
              className="mt-2 h-12 w-full rounded-xl border border-[#d1d5db] bg-white px-4 text-sm text-[#111827] outline-none focus:border-[#1f5fbf] focus:ring-4 focus:ring-[#1f5fbf]/10"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1f5fbf] px-4 text-sm font-semibold text-white shadow-lg shadow-[#1f5fbf]/20 hover:bg-[#194f9f] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}

function SummaryView({
  metrics,
  opinions,
  config,
}: {
  metrics: {
    total: number;
    average: number;
    last30: number;
    newCount: number;
    distribution: { rating: number; count: number }[];
    origins: { origin: string; label: string; count: number }[];
  };
  opinions: Opinion[];
  config: OpinionConfig | null;
}) {
  const recent = opinions.slice(0, 5);
  const maxDistribution = Math.max(...metrics.distribution.map((item) => item.count), 1);
  const maxOrigin = Math.max(...metrics.origins.map((item) => item.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Opiniones totales" value={String(metrics.total)} icon={<MessageSquareText />} />
        <MetricCard label="Valoración media" value={metrics.average ? metrics.average.toFixed(1) : "—"} suffix="/ 5" icon={<Star />} />
        <MetricCard label="Últimos 30 días" value={String(metrics.last30)} icon={<BarChart3 />} />
        <MetricCard label="Pendientes de revisar" value={String(metrics.newCount)} icon={<CheckCircle2 />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#111827]">Distribución de valoraciones</h2>
              <p className="mt-1 text-sm text-[#6b7280]">Todas las opiniones recibidas.</p>
            </div>
            <div className="rounded-2xl bg-[#fff7df] px-3 py-2 text-sm font-semibold text-[#9a6700]">
              {metrics.average ? `${metrics.average.toFixed(1)} ★` : "Sin datos"}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {metrics.distribution.map((item) => (
              <div key={item.rating} className="grid grid-cols-[52px_1fr_36px] items-center gap-3">
                <span className="text-sm font-semibold text-[#374151]">{item.rating} ★</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
                  <div
                    className="h-full rounded-full bg-[#f4b942]"
                    style={{ width: `${(item.count / maxDistribution) * 100}%` }}
                  />
                </div>
                <span className="text-right text-sm font-medium text-[#6b7280]">{item.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#111827]">Origen de los QR</h2>
          <p className="mt-1 text-sm text-[#6b7280]">Dónde se generan más opiniones.</p>
          <div className="mt-6 space-y-4">
            {metrics.origins.length ? (
              metrics.origins.map((item) => (
                <div key={item.origin}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-[#374151]">{item.label}</span>
                    <span className="text-[#6b7280]">{item.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(item.count / maxOrigin) * 100}%`,
                        background: config?.color_primary ?? "#1f5fbf",
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-[#f9fafb] p-4 text-sm text-[#6b7280]">
                Aún no hay datos de origen.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">Opiniones recientes</h2>
            <p className="mt-1 text-sm text-[#6b7280]">Las últimas respuestas recibidas.</p>
          </div>
        </div>
        <div className="mt-5 divide-y divide-[#eef2f7]">
          {recent.length ? (
            recent.map((opinion) => <CompactOpinion key={opinion.id} opinion={opinion} />)
          ) : (
            <p className="py-8 text-center text-sm text-[#6b7280]">Todavía no hay opiniones.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function OpinionsView({
  opinions,
  ratingFilter,
  originFilter,
  statusFilter,
  dateFilter,
  onRatingFilterChange,
  onOriginFilterChange,
  onStatusFilterChange,
  onDateFilterChange,
  onStatusChange,
  onExport,
}: {
  opinions: Opinion[];
  ratingFilter: string;
  originFilter: string;
  statusFilter: string;
  dateFilter: string;
  onRatingFilterChange: (value: string) => void;
  onOriginFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onDateFilterChange: (value: string) => void;
  onStatusChange: (id: string, status: OpinionStatus) => void;
  onExport: () => void;
}) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#111827]">Opiniones recibidas</h2>
          <p className="mt-1 text-sm text-[#6b7280]">Filtra, revisa y exporta el feedback.</p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#111827] px-4 text-sm font-semibold text-white hover:bg-[#1f2937]"
        >
          <FileDown className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FilterSelect label="Periodo" value={dateFilter} onChange={onDateFilterChange} options={[
          ["30", "Últimos 30 días"],
          ["7", "Últimos 7 días"],
          ["90", "Últimos 90 días"],
          ["all", "Todo el historial"],
        ]} />
        <FilterSelect label="Valoración" value={ratingFilter} onChange={onRatingFilterChange} options={[
          ["all", "Todas"],
          ["5", "5 estrellas"],
          ["4", "4 estrellas"],
          ["3", "3 estrellas"],
          ["2", "2 estrellas"],
          ["1", "1 estrella"],
        ]} />
        <FilterSelect label="Origen" value={originFilter} onChange={onOriginFilterChange} options={[
          ["all", "Todos"],
          ["mesa", "Mesa"],
          ["caja", "Caja"],
          ["entrada", "Entrada"],
          ["portacuentas", "Portacuentas"],
          ["redes", "Redes"],
          ["desconocido", "Sin identificar"],
        ]} />
        <FilterSelect label="Estado" value={statusFilter} onChange={onStatusFilterChange} options={[
          ["all", "Todos"],
          ["nueva", "Nueva"],
          ["revisada", "Revisada"],
          ["respondida", "Respondida"],
        ]} />
      </div>

      <div className="mt-5 flex items-center gap-2 text-sm text-[#6b7280]">
        <Filter className="h-4 w-4" />
        {opinions.length} {opinions.length === 1 ? "resultado" : "resultados"}
      </div>

      <div className="mt-4 space-y-3">
        {opinions.length ? (
          opinions.map((opinion) => (
            <OpinionCard key={opinion.id} opinion={opinion} onStatusChange={onStatusChange} />
          ))
        ) : (
          <p className="rounded-2xl bg-[#f9fafb] px-4 py-10 text-center text-sm text-[#6b7280]">
            No hay opiniones que coincidan con estos filtros.
          </p>
        )}
      </div>
    </section>
  );
}

function MaterialsView({
  config,
  restaurant,
}: {
  config: OpinionConfig;
  restaurant: Restaurant;
}) {
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const getUrl = useCallback(
    (origin: Origin) =>
      `${window.location.origin}/opinion/${config.slug}?origen=${origin}`,
    [config.slug],
  );

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      const entries = await Promise.all(
        materials.map(async (material) => [
          material.origin,
          await QRCode.toDataURL(getUrl(material.origin), {
            width: 460,
            margin: 2,
            errorCorrectionLevel: "H",
            color: { dark: "#111827", light: "#ffffff" },
          }),
        ]),
      );
      if (!cancelled) setQrImages(Object.fromEntries(entries));
    }

    generate();
    return () => {
      cancelled = true;
    };
  }, [getUrl]);

  async function copyLink(origin: Origin) {
    await navigator.clipboard.writeText(getUrl(origin));
    setCopyMessage(origin);
    window.setTimeout(() => setCopyMessage(null), 1800);
  }

  async function createMaterialPng(material: MaterialDefinition) {
    setWorking(material.origin);
    try {
      const dataUrl = await buildMaterialCanvas(material, config, restaurant, getUrl(material.origin));
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `hispanos-grill-${material.origin}.png`;
      anchor.click();
    } finally {
      setWorking(null);
    }
  }

  async function printMaterial(material: MaterialDefinition) {
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;

    setWorking(material.origin);
    try {
      const dataUrl = await buildMaterialCanvas(material, config, restaurant, getUrl(material.origin));
      printWindow.document.write(`<!doctype html><html><head><title>${material.label}</title><style>html,body{margin:0;background:#eee}body{display:grid;place-items:center;min-height:100vh}img{max-width:100%;height:auto}@media print{body{background:white}img{width:100%;page-break-inside:avoid}}</style></head><body><img src="${dataUrl}" alt="Material QR ${material.label}" onload="window.print()"></body></html>`);
      printWindow.document.close();
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#111827]">Materiales QR</h2>
            <p className="mt-1 text-sm text-[#6b7280]">
              Cada ubicación lleva un enlace distinto para medir qué soporte funciona mejor.
            </p>
          </div>
          <a
            href={`/opinion/${config.slug}?origen=redes`}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb]"
          >
            Ver experiencia pública
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {materials.map((material) => (
          <article key={material.origin} className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
            <div className="p-4">
              <div
                className="rounded-[1.4rem] border-2 p-5 text-center"
                style={{
                  background: config.color_background,
                  borderColor: config.color_primary,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={config.logo_url || "/brand/hispanos-grill-logo.svg"} alt="Hispanos Grill" className="mx-auto h-24 w-24 object-contain" />
                <h3 className="mt-3 font-serif text-xl font-semibold" style={{ color: config.color_secondary }}>
                  {material.title}
                </h3>
                <p className="mx-auto mt-2 min-h-10 max-w-[220px] text-xs leading-5 text-[#3b241f]/65">
                  {material.subtitle}
                </p>
                <div className="mx-auto mt-4 flex h-40 w-40 items-center justify-center rounded-2xl bg-white p-2 shadow-sm">
                  {qrImages[material.origin] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrImages[material.origin]} alt={`QR ${material.label}`} className="h-full w-full" />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin text-[#1f5fbf]" />
                  )}
                </div>
                <p className="mt-3 font-serif text-lg italic" style={{ color: config.color_primary }}>
                  ¡Gracias!
                </p>
              </div>
            </div>

            <div className="border-t border-black/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#111827]">{material.label}</p>
                  <p className="text-xs text-[#6b7280]">PNG listo para imprimir</p>
                </div>
                <QrCode className="h-5 w-5 text-[#1f5fbf]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={working === material.origin}
                  onClick={() => createMaterialPng(material)}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#1f5fbf] px-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {working === material.origin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  PNG
                </button>
                <button
                  type="button"
                  onClick={() => printMaterial(material)}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white px-2 text-xs font-semibold text-[#374151]"
                >
                  <Printer className="h-3.5 w-3.5" />
                  PDF / imprimir
                </button>
              </div>
              <button
                type="button"
                onClick={() => copyLink(material.origin)}
                className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#f3f4f6] px-2 text-xs font-semibold text-[#374151]"
              >
                {copyMessage === material.origin ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Clipboard className="h-3.5 w-3.5" />}
                {copyMessage === material.origin ? "Enlace copiado" : "Copiar enlace"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function SettingsView({
  config,
  saving,
  message,
  onConfigChange,
  onSave,
}: {
  config: OpinionConfig;
  saving: boolean;
  message: string | null;
  onConfigChange: (config: OpinionConfig) => void;
  onSave: () => void;
}) {
  function update<K extends keyof OpinionConfig>(key: K, value: OpinionConfig[K]) {
    onConfigChange({ ...config, [key]: value });
  }

  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <h2 className="text-xl font-semibold text-[#111827]">Ajustes del sistema</h2>
        <p className="mt-1 text-sm text-[#6b7280]">
          Cambios de marca, textos, Google y recepción de comentarios.
        </p>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <SettingsField label="Título principal">
            <input value={config.headline} onChange={(event) => update("headline", event.target.value)} className="settings-input" />
          </SettingsField>
          <SettingsField label="Texto de apoyo">
            <textarea value={config.subheadline} onChange={(event) => update("subheadline", event.target.value)} rows={3} className="settings-input resize-none py-3" />
          </SettingsField>
          <SettingsField label="Enlace de Google">
            <input type="url" value={config.google_review_url} onChange={(event) => update("google_review_url", event.target.value)} className="settings-input" />
          </SettingsField>
          <SettingsField label="Correo para avisos (opcional)">
            <input type="email" value={config.feedback_email ?? ""} onChange={(event) => update("feedback_email", event.target.value || null)} placeholder="restaurante@ejemplo.com" className="settings-input" />
          </SettingsField>
          <SettingsField label="WhatsApp para avisos (opcional)">
            <input value={config.feedback_whatsapp ?? ""} onChange={(event) => update("feedback_whatsapp", event.target.value || null)} placeholder="34600000000" className="settings-input" />
          </SettingsField>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ColorField label="Azul" value={config.color_primary} onChange={(value) => update("color_primary", value)} />
            <ColorField label="Marrón" value={config.color_secondary} onChange={(value) => update("color_secondary", value)} />
            <ColorField label="Fondo" value={config.color_background} onChange={(value) => update("color_background", value)} />
          </div>

          <div className="rounded-3xl border border-black/5 p-5" style={{ background: config.color_background }}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: config.color_primary }}>Vista previa</p>
            <h3 className="mt-3 font-serif text-2xl font-semibold" style={{ color: config.color_secondary }}>{config.headline}</h3>
            <p className="mt-2 text-sm leading-6 text-[#3b241f]/65">{config.subheadline}</p>
            <button type="button" className="mt-5 h-11 w-full rounded-xl text-sm font-semibold text-white" style={{ background: config.color_primary }}>
              Compartir mi experiencia
            </button>
          </div>

          <label className="flex items-center justify-between rounded-2xl border border-black/5 bg-[#f9fafb] p-4">
            <div>
              <p className="text-sm font-semibold text-[#111827]">Sistema activo</p>
              <p className="mt-1 text-xs text-[#6b7280]">Si lo desactivas, la página pública dejará de aceptar opiniones.</p>
            </div>
            <input type="checkbox" checked={config.active} onChange={(event) => update("active", event.target.checked)} className="h-5 w-5 accent-[#1f5fbf]" />
          </label>
        </div>
      </div>

      {message && (
        <div className={`mt-6 rounded-2xl px-4 py-3 text-sm font-medium ${message.includes("correctamente") ? "border border-green-200 bg-green-50 text-green-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
          {message}
        </div>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#111827] px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </button>

      <style jsx>{`
        :global(.settings-input) {
          width: 100%;
          min-height: 46px;
          border-radius: 12px;
          border: 1px solid #d1d5db;
          background: white;
          padding-left: 14px;
          padding-right: 14px;
          font-size: 14px;
          color: #111827;
          outline: none;
        }
        :global(.settings-input:focus) {
          border-color: #1f5fbf;
          box-shadow: 0 0 0 4px rgba(31, 95, 191, 0.1);
        }
      `}</style>
    </section>
  );
}

function MetricCard({ label, value, suffix, icon }: { label: string; value: string; suffix?: string; icon: React.ReactNode }) {
  return (
    <article className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[#6b7280]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-[#111827]">
            {value} {suffix && <span className="text-base font-medium text-[#9ca3af]">{suffix}</span>}
          </p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1f5fbf]/10 text-[#1f5fbf] [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      </div>
    </article>
  );
}

function OpinionCard({ opinion, onStatusChange }: { opinion: Opinion; onStatusChange: (id: string, status: OpinionStatus) => void }) {
  return (
    <article className="rounded-2xl border border-black/5 bg-[#fcfcfd] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Stars rating={opinion.rating} />
            <span className="rounded-full bg-[#eef2f7] px-2.5 py-1 text-xs font-semibold text-[#4b5563]">
              {originLabels[opinion.origen] ?? opinion.origen}
            </span>
            <StatusBadge status={opinion.estado} />
          </div>
          <p className="mt-3 text-sm font-semibold text-[#111827]">
            {opinion.nombre_cliente || "Cliente anónimo"}
          </p>
          <p className="mt-1 text-xs text-[#9ca3af]">
            {new Date(opinion.created_at).toLocaleString("es-ES", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#4b5563]">
            {opinion.comentario || "Sin comentario adicional."}
          </p>
        </div>

        <select
          value={opinion.estado}
          onChange={(event) => onStatusChange(opinion.id, event.target.value as OpinionStatus)}
          className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold text-[#374151]"
        >
          <option value="nueva">Nueva</option>
          <option value="revisada">Revisada</option>
          <option value="respondida">Respondida</option>
        </select>
      </div>
    </article>
  );
}

function CompactOpinion({ opinion }: { opinion: Opinion }) {
  return (
    <div className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff7df] text-sm font-bold text-[#9a6700]">
        {opinion.rating}★
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-[#111827]">{opinion.nombre_cliente || "Cliente anónimo"}</p>
          <span className="text-xs text-[#9ca3af]">{originLabels[opinion.origen] ?? opinion.origen}</span>
        </div>
        <p className="mt-1 truncate text-sm text-[#6b7280]">{opinion.comentario || "Sin comentario adicional."}</p>
      </div>
      <span className="hidden text-xs text-[#9ca3af] sm:block">{new Date(opinion.created_at).toLocaleDateString("es-ES")}</span>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} estrellas`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} className="h-4 w-4" fill={value <= rating ? "#f4b942" : "transparent"} stroke={value <= rating ? "#f4b942" : "#d1d5db"} />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: OpinionStatus }) {
  const classes: Record<OpinionStatus, string> = {
    nueva: "bg-blue-50 text-blue-700",
    revisada: "bg-amber-50 text-amber-700",
    respondida: "bg-green-50 text-green-700",
  };
  const labels: Record<OpinionStatus, string> = {
    nueva: "Nueva",
    revisada: "Revisada",
    respondida: "Respondida",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes[status]}`}>{labels[status]}</span>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-medium text-[#374151]">
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#374151]">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block rounded-2xl border border-black/5 bg-[#f9fafb] p-3">
      <span className="text-xs font-semibold text-[#6b7280]">{label}</span>
      <div className="mt-2 flex items-center gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
        <input value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2 py-2 text-xs font-semibold text-[#374151]" />
      </div>
    </label>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${active ? "bg-[#111827] text-white" : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"}`}>
      <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      {children}
    </button>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1f5fbf]/10 text-[#1f5fbf]">
        <MessageSquareText className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-[#111827]">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6b7280]">{text}</p>
    </section>
  );
}

function FullPageLoader({ text }: { text: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f6fa]">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1f5fbf]" />
        <p className="mt-3 text-sm text-[#6b7280]">{text}</p>
      </div>
    </main>
  );
}

async function buildMaterialCanvas(
  material: MaterialDefinition,
  config: OpinionConfig,
  restaurant: Restaurant,
  url: string,
) {
  const width = 1240;
  const height = 1748;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo generar el material.");

  context.fillStyle = config.color_background;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = config.color_primary;
  context.lineWidth = 12;
  roundedRect(context, 38, 38, width - 76, height - 76, 36);
  context.stroke();

  const logo = await loadImage(config.logo_url || "/brand/hispanos-grill-logo.svg");
  const logoSize = 310;
  context.drawImage(logo, (width - logoSize) / 2, 95, logoSize, logoSize);

  context.textAlign = "center";
  context.fillStyle = config.color_secondary;
  context.font = "700 76px Georgia, serif";
  drawWrappedText(context, material.title, width / 2, 490, 980, 88);

  context.fillStyle = "rgba(59,36,31,0.72)";
  context.font = "500 40px Arial, sans-serif";
  const subtitleBottom = drawWrappedText(context, material.subtitle, width / 2, 700, 920, 58);

  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 720,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#111827", light: "#ffffff" },
  });
  const qr = await loadImage(qrDataUrl);
  const qrSize = 720;
  const qrY = Math.max(subtitleBottom + 70, 820);
  context.fillStyle = "#ffffff";
  roundedRect(context, (width - qrSize - 48) / 2, qrY - 24, qrSize + 48, qrSize + 48, 34);
  context.fill();
  context.drawImage(qr, (width - qrSize) / 2, qrY, qrSize, qrSize);

  context.fillStyle = config.color_primary;
  context.font = "italic 700 60px Georgia, serif";
  context.fillText("¡Gracias!", width / 2, qrY + qrSize + 115);

  context.fillStyle = "rgba(59,36,31,0.55)";
  context.font = "500 28px Arial, sans-serif";
  context.fillText(`${restaurant.nombre} · ${material.label}`, width / 2, height - 95);

  return canvas.toDataURL("image/png", 1);
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  lines.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar una imagen del material."));
    image.src = src;
  });
}
