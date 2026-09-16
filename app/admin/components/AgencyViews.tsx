"use client";
import Link from "next/link";
import { RestaurantContact } from "./RestaurantContact";
import { InvitationAction } from "./InvitationAction";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Star,
  Store,
  Users,
} from "lucide-react";
import { setActiveRestaurant } from "@/app/(app)/lib/activeRestaurant";
import {
  metricChange,
  shiftDay,
  type AgencyOverview,
  type Metric,
  type RestaurantOverview,
} from "@/lib/admin/overview";
import { whatsappConversationUrl } from "@/lib/reviews/review-customers";
import { useAgencyOverview } from "./useAgencyOverview";

const integer = new Intl.NumberFormat("es-ES");
const euros = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
export const dateLabel = (day: string) =>
  new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
const attention = (restaurant: RestaurantOverview) =>
  restaurant.insights.some((insight) => insight.tone === "warning");
const statusLabel: Record<string, string> = {
  activo: "Activo",
  demo: "Demo",
  pausado: "Pausado",
  baja: "Baja",
  pendiente: "Pendiente",
};

export function PeriodPicker({
  days,
  onChange,
}: {
  days: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="agency-segments">
      <legend className="sr-only">Periodo de las métricas</legend>
      {[7, 30, 90].map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={days === value}
          onClick={() => onChange(value)}
        >
          {value} días
        </button>
      ))}
    </fieldset>
  );
}
export function DataState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return (
    <div className="agency-empty" role={error ? "alert" : "status"}>
      {loading ? (
        <>
          <Loader2 className="animate-spin" size={26} />
          <h2>Cargando tu cartera</h2>
          <p>Preparando los resultados de cada restaurante.</p>
        </>
      ) : (
        <>
          <CircleAlert size={26} />
          <h2>No hemos podido cargar los datos</h2>
          <p>{error}</p>
          <button className="agency-button" onClick={retry}>
            Volver a intentar
          </button>
        </>
      )}
    </div>
  );
}
export function SetupChecklist({
  restaurant,
  onOpen,
}: {
  restaurant: RestaurantOverview;
  onOpen: (href: string, panel?: boolean) => void;
}) {
  return (
    <div className="agency-checklist">
      {restaurant.setup.map((task, index) => (
        <div key={task.id} className="agency-check-row">
          <span className={`agency-step-dot ${task.ready ? "is-ready" : ""}`}>
            {task.ready ? <Check size={15} /> : index + 1}
          </span>
          <div>
            <h3>{task.title}</h3>
            <p>{task.detail}</p>
          </div>
          <button
            className="agency-text-button"
            onClick={() => onOpen(task.href, task.panel)}
          >
            {task.ready ? "Revisar" : "Completar"}
            <ChevronRight size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
function Trend({ value }: { value: Metric }) {
  const direction = value.current - value.previous;
  return (
    <span
      className={`agency-trend ${value.previous > 0 ? (direction > 0 ? "positive" : direction < 0 ? "negative" : "") : ""}`}
    >
      {value.previous > 0 && direction !== 0 ? (
        direction > 0 ? (
          <ArrowUpRight size={14} />
        ) : (
          <ArrowDownRight size={14} />
        )
      ) : null}
      {metricChange(value)}
    </span>
  );
}
function MetricCard({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: Metric | null;
  icon: React.ReactNode;
  detail?: string;
}) {
  return (
    <section className="agency-stat">
      <div className="agency-stat-label">
        {label}
        {icon}
      </div>
      <strong>{value ? integer.format(value.current) : "—"}</strong>
      {value ? (
        <Trend value={value} />
      ) : (
        <span className="agency-muted">Servicio no contratado</span>
      )}
      {detail && <p>{detail}</p>}
    </section>
  );
}
function ActivityChart({
  restaurants,
  days,
}: {
  restaurants: RestaurantOverview[];
  days: number;
}) {
  const [requestedMetric, setMetric] = useState<
    "bookings" | "opinions" | "confirmed"
  >("opinions");
  const available = (key: "bookings" | "opinions" | "confirmed") =>
    restaurants.some((row) =>
      key === "bookings"
        ? row.features.bookings
        : key === "opinions"
          ? row.features.opinions
          : row.features.reviews,
    );
  const metric = available(requestedMetric)
    ? requestedMetric
    : available("bookings")
      ? "bookings"
      : available("opinions")
        ? "opinions"
        : "confirmed";
  const [showTable, setShowTable] = useState(false);
  const labels = {
    bookings: "Reservas",
    opinions: "Opiniones QR",
    confirmed: "Reseñas confirmadas",
  };
  const daily = new Map<string, number>();
  for (const restaurant of restaurants) {
    const enabled =
      metric === "bookings"
        ? restaurant.features.bookings
        : metric === "opinions"
          ? restaurant.features.opinions
          : restaurant.features.reviews;
    if (enabled)
      for (const day of restaurant.series)
        daily.set(day.date, (daily.get(day.date) ?? 0) + day[metric]);
  }
  const source = [...daily].sort(([a], [b]) => a.localeCompare(b));
  const groupSize = Math.ceil(days / 15);
  const buckets = Array.from(
    { length: Math.ceil(source.length / groupSize) },
    (_, i) => {
      const group = source.slice(i * groupSize, (i + 1) * groupSize);
      return {
        start: group[0][0],
        end: group.at(-1)![0],
        value: group.reduce((sum, [, value]) => sum + value, 0),
      };
    },
  );
  const max = Math.max(1, ...buckets.map((bucket) => bucket.value));
  const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
  return (
    <section className="agency-card agency-chart">
      <div className="agency-card-heading">
        <div>
          <span className="agency-eyebrow">Actividad registrada</span>
          <h2>Cómo avanza tu cartera</h2>
        </div>
        <label className="agency-chart-select">
          <span className="sr-only">Métrica del gráfico</span>
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as typeof metric)}
          >
            {Object.entries(labels).map(([key, label]) => (
              <option
                key={key}
                value={key}
                disabled={!available(key as keyof typeof labels)}
              >
                {label}
                {!available(key as keyof typeof labels)
                  ? " · No contratado"
                  : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {buckets.length ? (
        <>
          <div className="agency-chart-total">
            <strong>{integer.format(total)}</strong>
            <span>{labels[metric].toLowerCase()} en el periodo</span>
          </div>
          <div
            className="agency-bars"
            role="img"
            aria-label={`${labels[metric]}: ${total} en el periodo. El detalle por fecha está disponible debajo.`}
          >
            {buckets.map((bucket, index) => (
              <div className="agency-bar-column" key={bucket.start}>
                <span className="agency-bar-value">{bucket.value || ""}</span>
                <div className="agency-bar-space">
                  <div
                    className="agency-bar"
                    title={`${dateLabel(bucket.start)}${bucket.start !== bucket.end ? ` – ${dateLabel(bucket.end)}` : ""}: ${bucket.value}`}
                    style={{
                      height: `${bucket.value ? Math.max(3, (bucket.value / max) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="agency-bar-label">
                  {index % (buckets.length > 10 ? 3 : 2) === 0 ||
                  index === buckets.length - 1
                    ? dateLabel(bucket.start)
                    : ""}
                </span>
              </div>
            ))}
          </div>
          {total === 0 && (
            <p className="agency-muted">
              Todavía no hay {labels[metric].toLowerCase()} en estas fechas.
            </p>
          )}
          <button
            className="agency-text-button"
            aria-expanded={showTable}
            onClick={() => setShowTable(!showTable)}
          >
            {showTable ? "Ocultar" : "Ver"} cifras por fecha
          </button>
          {showTable && (
            <div className="agency-table-wrap">
              <table className="agency-table">
                <thead>
                  <tr>
                    <th>Fechas</th>
                    <th>{labels[metric]}</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((bucket) => (
                    <tr key={bucket.start}>
                      <td>
                        {dateLabel(bucket.start)}
                        {bucket.end !== bucket.start
                          ? ` – ${dateLabel(bucket.end)}`
                          : ""}
                      </td>
                      <td>{bucket.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="agency-chart-empty">
          Este servicio no está activo en los restaurantes seleccionados.
        </div>
      )}
    </section>
  );
}
function RestaurantCard({ restaurant }: { restaurant: RestaurantOverview }) {
  const primary = restaurant.features.opinions
    ? { label: "Opiniones QR", value: restaurant.metrics.opinions }
    : { label: "Reservas", value: restaurant.metrics.bookings };
  const next =
    restaurant.insights.find((insight) => insight.tone === "warning") ??
    restaurant.insights.find((insight) => insight.tone === "good") ??
    restaurant.insights[0];
  return (
    <article className="agency-card agency-restaurant">
      <div className="agency-restaurant-top">
        <span className="agency-avatar">
          {restaurant.name.slice(0, 2).toLocaleUpperCase("es")}
        </span>
        <div>
          <span
            className={`agency-pill ${restaurant.demo ? "neutral" : attention(restaurant) ? "warning" : "good"}`}
          >
            {restaurant.demo
              ? "Demo"
              : attention(restaurant)
                ? "Necesita atención"
                : statusLabel[restaurant.status] || restaurant.status}
          </span>
          <h2>
            <Link href={`/admin/restaurantes/${restaurant.id}`}>
              {restaurant.name}
            </Link>
          </h2>
          <p>{restaurant.services.join(" · ") || "Servicios por configurar"}</p>
        </div>
      </div>
      <div className="agency-card-metrics">
        <div>
          <span>{primary.label}</span>
          <strong>{integer.format(primary.value.current)}</strong>
          <Trend value={primary.value} />
        </div>
        <div>
          <span>
            {restaurant.features.opinions
              ? "Valoración QR"
              : "Reseñas confirmadas"}
          </span>
          <strong>
            {restaurant.features.opinions
              ? restaurant.metrics.rating.current === null
                ? "—"
                : `${restaurant.metrics.rating.current.toFixed(1).replace(".", ",")} / 5`
              : restaurant.features.reviews
                ? restaurant.metrics.confirmed.current
                : "—"}
          </strong>
          <span className="agency-muted">
            {restaurant.features.opinions
              ? "Opiniones del periodo"
              : "Revisadas en el panel"}
          </span>
        </div>
      </div>
      <div className="agency-progress-label">
        <span>Preparación del servicio</span>
        <strong>{restaurant.progress}%</strong>
      </div>
      <progress
        className="agency-progress"
        max={100}
        value={restaurant.progress}
        aria-label={`Preparación de ${restaurant.name}`}
      />
      {next && (
        <div className={`agency-card-insight ${next.tone}`}>
          <span>
            {next.tone === "good" ? (
              <CheckCircle2 size={16} />
            ) : (
              <CircleAlert size={16} />
            )}
          </span>
          <p>{next.title}</p>
        </div>
      )}
      <Link
        className="agency-button secondary agency-card-action"
        href={`/admin/restaurantes/${restaurant.id}`}
      >
        Ver seguimiento
        <ArrowRight size={16} />
      </Link>
    </article>
  );
}
export function AgencyDashboard({
  directory = false,
}: {
  directory?: boolean;
}) {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useAgencyOverview(days);
  return (
    <div className="agency-content">
      <div className="agency-page-heading">
        <div>
          <span className="agency-eyebrow">
            {directory ? "Restaurantes" : "Centro de control"}
          </span>
          <h1>
            {directory
              ? "Cada restaurante, en su sitio."
              : "Tu cartera, de un vistazo."}
          </h1>
          <p>
            Resultados, próximos pasos y servicios de todos tus restaurantes.
          </p>
        </div>
        <Link
          href="/admin/onboarding-restaurante?nuevo=1"
          className="agency-button"
        >
          <Plus size={17} />
          Añadir restaurante
        </Link>
      </div>
      <div className="agency-toolbar">
        <PeriodPicker days={days} onChange={setDays} />
        <button
          className="agency-button secondary"
          disabled={loading}
          onClick={reload}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>
      {loading || error || !data ? (
        <DataState loading={loading} error={error} retry={reload} />
      ) : (
        <OverviewContent data={data} directory={directory} />
      )}
    </div>
  );
}
export function OverviewContent({
  data,
  directory = false,
}: {
  data: AgencyOverview;
  directory?: boolean;
}) {
  const [scope, setScope] = useState("real"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const scoped = data.restaurants.filter(
    (row) => scope === "all" || (scope === "demo" ? row.demo : !row.demo),
  );
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = scoped.filter(
    (row) =>
      normalize(`${row.name} ${row.services.join(" ")}`).includes(
        normalize(query),
      ) &&
      (filter === "all" ||
        (filter === "attention"
          ? attention(row)
          : filter === "setup"
            ? row.progress < 100
            : row.progress === 100)),
  );
  const sumMetric = (
    key: "bookings" | "opinions" | "confirmed",
    feature: "bookings" | "opinions" | "reviews",
  ) =>
    scoped
      .filter((row) => row.features[feature])
      .reduce(
        (sum, row) => ({
          current: sum.current + row.metrics[key].current,
          previous: sum.previous + row.metrics[key].previous,
        }),
        { current: 0, previous: 0 },
      );
  const priorities = scoped
    .flatMap((restaurant) =>
      restaurant.insights
        .filter((item) => item.tone === "warning")
        .map((insight) => ({ restaurant, insight })),
    )
    .slice(0, 4);
  return (
    <>
      <div className="agency-scope">
        <fieldset className="agency-segments">
          <legend className="sr-only">Tipo de restaurantes</legend>
          {[
            ["real", "Clientes"],
            ["demo", "Demos"],
            ["all", "Todos"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setScope(value)}
              aria-pressed={scope === value}
            >
              {label}
              <span>
                {
                  data.restaurants.filter(
                    (row) =>
                      value === "all" ||
                      (value === "demo" ? row.demo : !row.demo),
                  ).length
                }
              </span>
            </button>
          ))}
        </fieldset>
        <p>
          {dateLabel(data.period.start)} –{" "}
          {dateLabel(shiftDay(data.period.end, -1))} · Comparado con los{" "}
          {data.period.days} días anteriores
        </p>
      </div>
      {!directory && (
        <>
          <div className="agency-stats">
            <section className="agency-stat agency-stat-brand">
              <div className="agency-stat-label">
                Restaurantes
                <Store size={18} />
              </div>
              <strong>{scoped.length}</strong>
              <span>{scoped.filter(attention).length} necesitan atención</span>
              <p>
                {scope === "real"
                  ? "Las demos quedan fuera de estas cifras."
                  : scope === "demo"
                    ? "Datos de demostración."
                    : "Incluye clientes y demostraciones."}
              </p>
            </section>
            <MetricCard
              label="Reservas"
              value={
                scoped.some((row) => row.features.bookings)
                  ? sumMetric("bookings", "bookings")
                  : null
              }
              icon={<CalendarDays size={18} />}
            />
            <MetricCard
              label="Opiniones QR"
              value={
                scoped.some((row) => row.features.opinions)
                  ? sumMetric("opinions", "opinions")
                  : null
              }
              icon={<MessageCircle size={18} />}
            />
            <MetricCard
              label="Reseñas confirmadas"
              value={
                scoped.some((row) => row.features.reviews)
                  ? sumMetric("confirmed", "reviews")
                  : null
              }
              icon={<Star size={18} />}
            />
          </div>
          <div className="agency-overview-grid">
            <ActivityChart restaurants={scoped} days={data.period.days} />
            <section className="agency-card">
              <div className="agency-card-heading">
                <div>
                  <span className="agency-eyebrow">Tu siguiente paso</span>
                  <h2>Necesita atención</h2>
                </div>
                <span className="agency-icon-box">
                  <ClipboardList size={20} />
                </span>
              </div>
              {priorities.length ? (
                <div className="agency-priorities">
                  {priorities.map(({ restaurant, insight }) => (
                    <Link
                      key={`${restaurant.id}-${insight.id}`}
                      href={`/admin/restaurantes/${restaurant.id}`}
                    >
                      <span className="agency-priority-dot" />
                      <div>
                        <span>{restaurant.name}</span>
                        <h3>{insight.title}</h3>
                        <p>{insight.detail}</p>
                      </div>
                      <ChevronRight size={16} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="agency-empty small">
                  <CheckCircle2 size={30} />
                  <h3>No hay avisos pendientes</h3>
                  <p>Revisa la actividad y la preparación de los servicios.</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      <section className="agency-directory">
        <div className="agency-card-heading">
          <div>
            <span className="agency-eyebrow">Seguimiento individual</span>
            <h2>
              Tus restaurantes{" "}
              <span className="agency-count">{filtered.length}</span>
            </h2>
          </div>
        </div>
        <div className="agency-filter-row">
          <label className="agency-search">
            <Search size={17} />
            <span className="sr-only">Buscar restaurante o servicio</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar restaurante o servicio"
            />
          </label>
          <label>
            <span className="sr-only">Filtrar restaurantes</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="attention">Necesitan atención</option>
              <option value="setup">Configuración pendiente</option>
              <option value="ready">Configuración completa</option>
            </select>
          </label>
        </div>
        {filtered.length ? (
          <div className="agency-restaurant-grid">
            {filtered.map((restaurant) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} />
            ))}
          </div>
        ) : (
          <div className="agency-empty">
            <Store size={28} />
            <h3>No hay restaurantes en esta vista</h3>
            <p>
              {query || filter !== "all"
                ? "Prueba otra búsqueda o cambia el filtro."
                : "Añade un restaurante o cambia a la vista de demos."}
            </p>
            {query || filter !== "all" ? (
              <button
                className="agency-button secondary"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Limpiar filtros
              </button>
            ) : (
              <Link
                className="agency-button"
                href="/admin/onboarding-restaurante?nuevo=1"
              >
                Añadir restaurante
              </Link>
            )}
          </div>
        )}
      </section>
      <p className="agency-footnote">
        Datos hasta ayer · Fechas de referencia: hora peninsular. Las opiniones
        QR son valoraciones internas. Las reseñas confirmadas se verifican desde
        el panel; abrir Google no equivale a publicar.
      </p>
    </>
  );
}

export function RestaurantWorkspace({
  restaurantId,
}: {
  restaurantId: string;
}) {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useAgencyOverview(days);
  const restaurant = data?.restaurants.find((row) => row.id === restaurantId);
  const open = (href: string, panel?: boolean) => {
    if (panel) setActiveRestaurant(restaurantId);
    router.push(href);
  };
  return (
    <div className="agency-content">
      <Link href="/admin/restaurantes" className="agency-back">
        Restaurantes
        <ChevronRight size={14} />
        Seguimiento
      </Link>
      {loading || error ? (
        <DataState loading={loading} error={error} retry={reload} />
      ) : !restaurant ? (
        <div className="agency-empty">
          <h1>Restaurante no disponible</h1>
          <p>Vuelve al listado y selecciona un restaurante.</p>
        </div>
      ) : (
        <RestaurantDetail
          restaurant={restaurant}
          days={days}
          setDays={setDays}
          open={open}
          reload={reload}
        />
      )}
    </div>
  );
}
export function RestaurantDetail({
  restaurant,
  days,
  setDays,
  open,
  reload,
}: {
  restaurant: RestaurantOverview;
  days: number;
  setDays: (value: number) => void;
  open: (href: string, panel?: boolean) => void;
  reload: () => void;
}) {
  const [tab, setTab] = useState("results");
  const chat = whatsappConversationUrl(restaurant.phone);
  const attendance = restaurant.attendance;
  return (
    <>
      <div className="agency-page-heading">
        <div>
          <span
            className={`agency-pill ${restaurant.demo ? "neutral" : "good"}`}
          >
            {restaurant.demo
              ? "Demostración"
              : statusLabel[restaurant.status] || restaurant.status}
          </span>
          <h1>{restaurant.name}</h1>
          <p>{restaurant.services.join(" · ") || "Servicios por configurar"}</p>
        </div>
        <div className="agency-actions">
          {chat && (
            <a
              className="agency-button secondary"
              href={chat}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} />
              WhatsApp
            </a>
          )}
          <button
            className="agency-button"
            onClick={() =>
              open(
                restaurant.reputationOnly
                  ? `/opiniones-admin?restaurante=${restaurant.id}`
                  : "/dashboard",
                !restaurant.reputationOnly,
              )
            }
          >
            Abrir su panel
            <ExternalLink size={16} />
          </button>
        </div>
      </div>
      <div className="agency-toolbar">
        <fieldset className="agency-segments">
          <legend className="sr-only">Vista del restaurante</legend>
          {[
            ["results", "Resultados"],
            ["setup", "Puesta en marcha"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
              {key === "setup" && <span>{restaurant.progress}%</span>}
            </button>
          ))}
        </fieldset>
        <div className="agency-actions">
          <PeriodPicker days={days} onChange={setDays} />
          <button
            className="agency-icon-button"
            onClick={reload}
            aria-label="Actualizar restaurante"
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>
      {tab === "results" ? (
        <>
          <div className="agency-stats">
            <MetricCard
              label="Reservas"
              value={
                restaurant.features.bookings
                  ? restaurant.metrics.bookings
                  : null
              }
              icon={<CalendarDays size={18} />}
            />
            <MetricCard
              label="Clientes nuevos"
              value={
                restaurant.features.customers
                  ? restaurant.metrics.customers
                  : null
              }
              icon={<Users size={18} />}
            />
            <MetricCard
              label="Opiniones QR"
              value={
                restaurant.features.opinions
                  ? restaurant.metrics.opinions
                  : null
              }
              icon={<MessageCircle size={18} />}
            />
            <MetricCard
              label="Reseñas confirmadas"
              value={
                restaurant.features.reviews
                  ? restaurant.metrics.confirmed
                  : null
              }
              icon={<Star size={18} />}
            />
          </div>
          <div className="agency-overview-grid">
            <ActivityChart restaurants={[restaurant]} days={days} />
            <section className="agency-card">
              <div className="agency-card-heading">
                <div>
                  <span className="agency-eyebrow">Lectura del periodo</span>
                  <h2>Qué va bien y qué revisar</h2>
                </div>
              </div>
              <div className="agency-insights">
                {restaurant.insights.map((insight) => (
                  <div
                    className={`agency-insight ${insight.tone}`}
                    key={insight.id}
                  >
                    {insight.tone === "good" ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <CircleAlert size={18} />
                    )}
                    <div>
                      <h3>{insight.title}</h3>
                      <p>{insight.detail}</p>
                      {insight.href && (
                        <button
                          className="agency-text-button"
                          onClick={() => open(insight.href!, insight.panel)}
                        >
                          Revisar
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="agency-detail-grid">
            {restaurant.features.bookings && (
              <section className="agency-card">
                <h2>Qué pasó con las reservas</h2>
                <p className="agency-muted">
                  Reservas con fecha de visita dentro del periodo.
                </p>
                <div className="agency-breakdown">
                  {[
                    ["Asistieron", attendance.attended],
                    ["Canceladas", attendance.cancelled],
                    ["No se presentaron", attendance.noShow],
                    ["Sin asistencia registrada", attendance.unmarked],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                {attendance.unmarked > 0 && (
                  <p className="agency-footnote">
                    Marcar la asistencia permite medir los resultados de las
                    visitas.
                  </p>
                )}
              </section>
            )}
            {restaurant.features.reviews && (
              <section className="agency-card">
                <h2>Recorrido de las reseñas</h2>
                <p className="agency-muted">
                  Clientes con una solicitud enviada durante el periodo,
                  actualizado a hoy. Cada cliente cuenta una vez.
                </p>
                <div className="agency-funnel">
                  {[
                    ["Contactados", restaurant.reviews.sent],
                    ["Abrieron Google", restaurant.reviews.opened],
                    ["Confirmadas", restaurant.reviews.confirmedFromSent],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <progress
                        max={Math.max(1, restaurant.reviews.sent)}
                        value={Number(value)}
                        aria-label={String(label)}
                      />
                    </div>
                  ))}
                </div>
                <p className="agency-footnote">
                  La cifra superior cuenta todas las confirmaciones del periodo,
                  aunque la solicitud se enviara antes.
                </p>
                {restaurant.reviews.undatedSent > 0 && (
                  <p className="agency-footnote">
                    {restaurant.reviews.undatedSent} clientes tienen solicitudes
                    antiguas sin fecha de envío verificable. Se conservan en el
                    seguimiento y quedan fuera de este recorrido.
                  </p>
                )}
                <button
                  className="agency-text-button"
                  onClick={() => open("/resenas", true)}
                >
                  Revisar solicitudes
                  <ArrowRight size={14} />
                </button>
              </section>
            )}
            {restaurant.features.opinions && (
              <section className="agency-card">
                <h2>La experiencia del cliente</h2>
                <div className="agency-rating">
                  <strong>
                    {restaurant.metrics.rating.current === null
                      ? "—"
                      : restaurant.metrics.rating.current
                          .toFixed(1)
                          .replace(".", ",")}
                  </strong>
                  <span>/ 5 · Opiniones QR del periodo</span>
                </div>
                <div className="agency-breakdown">
                  <div>
                    <span>Valoraciones de 4 o 5</span>
                    <strong>{restaurant.opinion.positive}</strong>
                  </div>
                  <div>
                    <span>Valoraciones de 1 a 3</span>
                    <strong>{restaurant.opinion.low}</strong>
                  </div>
                  <div>
                    <span>Pendientes de seguimiento · todas las fechas</span>
                    <strong>{restaurant.opinion.unresolved}</strong>
                  </div>
                </div>
                {restaurant.opinion.aspects.length > 0 && (
                  <>
                    <h3 className="agency-subheading">
                      Aspectos señalados en valoraciones bajas
                    </h3>
                    {restaurant.opinion.aspects.map((aspect) => (
                      <div className="agency-aspect" key={aspect.label}>
                        <span>{aspect.label}</span>
                        <strong>{aspect.count}</strong>
                      </div>
                    ))}
                  </>
                )}
                <button
                  className="agency-text-button"
                  onClick={() =>
                    open(`/opiniones-admin?restaurante=${restaurant.id}`)
                  }
                >
                  Abrir reputación
                  <ArrowRight size={14} />
                </button>
              </section>
            )}
            {restaurant.features.orders && (
              <section className="agency-card">
                <h2>Cobros QR registrados</h2>
                <div className="agency-rating">
                  <strong>
                    {euros.format(restaurant.metrics.revenue.current)}
                  </strong>
                </div>
                <Trend value={restaurant.metrics.revenue} />
                <p className="agency-footnote">
                  Importes cobrados al cerrar mesas QR. No representa la
                  facturación total del restaurante.
                </p>
              </section>
            )}
          </div>
        </>
      ) : (
        <div className="agency-setup-grid">
          <section className="agency-card">
            <div className="agency-card-heading">
              <div>
                <span className="agency-eyebrow">
                  Configuración del servicio
                </span>
                <h2>
                  {restaurant.setup.filter((task) => task.ready).length} de{" "}
                  {restaurant.setup.length} pasos completados
                </h2>
              </div>
              <strong>{restaurant.progress}%</strong>
            </div>
            <progress
              className="agency-progress"
              value={restaurant.progress}
              max={100}
              aria-label="Preparación del restaurante"
            />
            <SetupChecklist restaurant={restaurant} onOpen={open} />
            <p className="agency-footnote">
              Esta lista comprueba la configuración guardada. Antes de entregar,
              prueba los enlaces y las funciones de los servicios contratados.
            </p>
          </section>
          <section className="agency-card">
            <h2>Antes de entregar</h2>
            <ol className="agency-delivery-list">
              <li>Comprueba los datos y servicios contratados.</li>
              <li>Entra con el acceso del restaurante.</li>
              <li>Prueba los enlaces de los servicios activos.</li>
              {restaurant.features.bookings && (
                <li>Completa una reserva y revisa su llegada al panel.</li>
              )}
              {restaurant.services.includes("Chatbot") && (
                <li>Envía un mensaje de prueba al número conectado.</li>
              )}
              {(restaurant.features.reviews ||
                restaurant.features.opinions) && (
                <li>
                  Comprueba que el enlace de reseñas abre el negocio correcto.
                </li>
              )}
            </ol>
            <Link
              className="agency-button secondary"
              href={`/admin/onboarding-restaurante?restaurante=${restaurant.id}`}
            >
              Continuar puesta en marcha
              <ArrowRight size={15} />
            </Link>
          </section>
        </div>
      )}
      <section className="agency-card agency-contact-card" id="access">
        <RestaurantContact
          key={restaurant.id}
          restaurant={restaurant}
          onSaved={reload}
        />
        <div>
          <span className={`agency-pill ${restaurant.channel.tone}`}>
            {restaurant.channel.label}
          </span>
          <p className="agency-muted">{restaurant.channel.detail}</p>
          <p>{restaurant.setup.find((task) => task.id === "access")?.detail}</p>
          {restaurant.invitationPending && <InvitationAction restaurantId={restaurant.id} onSaved={reload} />}
          <Link
            className="agency-text-button"
            href={
              restaurant.reputationOnly
                ? `/opiniones-admin?restaurante=${restaurant.id}`
                : `/admin/herramientas?restaurante=${restaurant.id}`
            }
          >
            Configuración avanzada
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </>
  );
}
