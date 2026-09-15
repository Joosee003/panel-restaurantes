export type DataRow = Record<string, unknown>;
export type AgencyData = Record<string, DataRow[]>;
export type Period = {
  days: number;
  start: string;
  end: string;
  previousStart: string;
  generatedAt: string;
};
export type Metric = { current: number; previous: number };
export type SetupTask = {
  id: string;
  title: string;
  detail: string;
  ready: boolean;
  href: string;
  panel?: boolean;
};
export type Insight = {
  id: string;
  tone: "good" | "warning" | "info";
  title: string;
  detail: string;
  href?: string;
  panel?: boolean;
};
export type RestaurantOverview = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  demo: boolean;
  plan: string;
  status: string;
  reputationOnly: boolean;
  services: string[];
  features: {
    bookings: boolean;
    opinions: boolean;
    reviews: boolean;
    customers: boolean;
    orders: boolean;
  };
  metrics: {
    bookings: Metric;
    customers: Metric;
    opinions: Metric;
    confirmed: Metric;
    revenue: Metric;
    rating: { current: number | null; previous: number | null };
  };
  attendance: {
    total: number;
    attended: number;
    cancelled: number;
    noShow: number;
    unmarked: number;
  };
  reviews: {
    sent: number;
    opened: number;
    confirmedFromSent: number;
    pending: number;
    failed: number;
  };
  opinion: {
    unresolved: number;
    low: number;
    positive: number;
    aspects: { label: string; count: number }[];
  };
  channel: { label: string; tone: "good" | "warning" | "info"; detail: string };
  setup: SetupTask[];
  progress: number;
  insights: Insight[];
  lastActivity: string | null;
  series: {
    date: string;
    bookings: number;
    opinions: number;
    confirmed: number;
  }[];
};
export type AgencyOverview = {
  period: Period;
  restaurants: RestaurantOverview[];
};

const text = (row: DataRow | undefined, key: string) =>
  typeof row?.[key] === "string" ? (row[key] as string) : "";
const yes = (row: DataRow | undefined, key: string) => row?.[key] === true;
const num = (row: DataRow | undefined, key: string) =>
  Number.isFinite(Number(row?.[key])) ? Number(row?.[key]) : 0;
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
export function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function agencyDay(value: string) {
  if (!value) return "";
  // Legacy reservation timestamps have no offset: their stored calendar date is authoritative.
  if (!/(Z|[+-]\d\d:\d\d)$/.test(value))
    return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key)?.value)
    .join("-");
}
export function createPeriod(days: number, now = new Date()): Period {
  if (![7, 30, 90].includes(days)) throw new Error("INVALID_PERIOD");
  const end = agencyDay(now.toISOString());
  return {
    days,
    end,
    start: shiftDay(end, -days),
    previousStart: shiftDay(end, -days * 2),
    generatedAt: now.toISOString(),
  };
}
function inPeriod(value: string, period: Period, previous = false) {
  const day = agencyDay(value);
  return Boolean(
    day &&
      day >= (previous ? period.previousStart : period.start) &&
      day < (previous ? period.start : period.end),
  );
}
function metric(
  rows: DataRow[],
  date: (row: DataRow) => string,
  period: Period,
  value: (row: DataRow) => number = () => 1,
): Metric {
  return rows.reduce<Metric>(
    (result, row) => {
      if (inPeriod(date(row), period)) result.current += value(row);
      else if (inPeriod(date(row), period, true)) result.previous += value(row);
      return result;
    },
    { current: 0, previous: 0 },
  );
}
function average(rows: DataRow[], period: Period, previous: boolean) {
  const ratings = rows.filter(
    (row) =>
      inPeriod(text(row, "created_at"), period, previous) &&
      num(row, "rating") >= 1 &&
      num(row, "rating") <= 5,
  );
  return ratings.length
    ? ratings.reduce((sum, row) => sum + num(row, "rating"), 0) / ratings.length
    : null;
}
export function metricChange(value: Metric): string {
  if (value.previous === 0)
    return value.current === 0
      ? "Sin actividad en ambos periodos"
      : "Sin base anterior";
  const percent = Math.round(
    ((value.current - value.previous) / value.previous) * 100,
  );
  return `${percent > 0 ? "+" : ""}${percent}% respecto al periodo anterior`;
}
const cancelled = (row: DataRow) =>
  [
    "cancelada",
    "cancelado",
    "cancelled",
    "canceled",
    "rechazada",
    "rechazado",
  ].includes(normalize(text(row, "estado")));
const noShow = (row: DataRow) =>
  ["no_show", "noshow", "no_asistio", "ausente"].includes(
    normalize(text(row, "estado")),
  );
const attended = (row: DataRow) =>
  !cancelled(row) &&
  !noShow(row) &&
  (yes(row, "atendida") ||
    ["completada", "completado", "atendida", "finalizada"].includes(
      normalize(text(row, "estado")),
    ));
const bookingDate = (row: DataRow) =>
  text(row, "inicio_at") || text(row, "fecha_hora_reserva");
const aspectNames: Record<string, string> = {
  comida: "Comida",
  servicio: "Servicio",
  atencion: "Atención",
  ambiente: "Ambiente",
  precio: "Precio",
  calidad_precio: "Calidad / precio",
  limpieza: "Limpieza",
  espera: "Tiempo de espera",
  tiempo_espera: "Tiempo de espera",
};

export function buildAgencyOverview(
  data: AgencyData,
  period: Period,
): AgencyOverview {
  // Group once. The restaurant table, including reputation-only clients, drives the directory.
  const groups = new Map<string, Map<string, DataRow[]>>();
  for (const [table, rows] of Object.entries(data)) {
    const byRestaurant = new Map<string, DataRow[]>();
    for (const row of rows) {
      const id = text(row, "restaurante_id");
      const existing = byRestaurant.get(id);
      if (existing) existing.push(row);
      else byRestaurant.set(id, [row]);
    }
    groups.set(table, byRestaurant);
  }
  const restaurants = (data.restaurants ?? []).map(
    (restaurant): RestaurantOverview => {
      const id = text(restaurant, "id");
      const rows = (table: string) => groups.get(table)?.get(id) ?? [];
      const one = (table: string) => rows(table)[0];
      const modules = one("modules"),
        config = one("opinionConfig"),
        web = one("webs"),
        channel = one("channels"),
        automation = one("automation"),
        bookingConfig = one("bookingConfig"),
        route = one("routes");
      const reputationOnly =
        Boolean(config) &&
        ![
          "reservas",
          "clientes",
          "resenas",
          "chatbot",
          "menu_digital",
          "camarero_digital",
          "fidelizacion",
          "metricas",
          "rentabilidad",
        ].some((key) => yes(modules, key));
      const features = {
        bookings: yes(modules, "reservas"),
        opinions: Boolean(config),
        reviews: yes(modules, "resenas"),
        customers: yes(modules, "clientes"),
        orders: yes(modules, "camarero_digital"),
      };
      const services = [
        features.bookings && "Reservas",
        features.opinions && "Reputación QR",
        features.reviews && "Reseñas",
        yes(modules, "chatbot") && "Chatbot",
        yes(modules, "menu_digital") && "Carta QR",
        features.orders && "Pedidos QR",
        yes(modules, "fidelizacion") && "Fidelización",
      ].filter(Boolean) as string[];
      const bookings = rows("bookings"),
        opinions = rows("opinions"),
        requests = rows("requests"),
        customers = rows("customers");
      const currentBookings = bookings.filter((row) =>
        inPeriod(bookingDate(row), period),
      );
      const currentOpinions = opinions.filter((row) =>
        inPeriod(text(row, "created_at"), period),
      );
      const lowOpinions = currentOpinions.filter(
        (row) => num(row, "rating") > 0 && num(row, "rating") <= 3,
      );
      const unresolved = rows("openOpinions").filter(
        (row) =>
          !text(row, "resuelto_at") && text(row, "seguimiento") !== "resuelto",
      ).length;
      const sent = requests.filter((row) =>
        inPeriod(text(row, "sent_at"), period),
      );
      const beforeNow = (value: string) =>
        Boolean(
          value &&
            new Date(value).valueOf() <= new Date(period.generatedAt).valueOf(),
        );
      const review = {
        sent: sent.length,
        opened: sent.filter((row) => beforeNow(text(row, "google_opened_at")))
          .length,
        confirmedFromSent: sent.filter((row) =>
          beforeNow(text(row, "confirmed_at")),
        ).length,
        pending: requests.filter(
          (row) =>
            !text(row, "confirmed_at") &&
            (beforeNow(text(row, "sent_at")) ||
              beforeNow(text(row, "google_opened_at"))),
        ).length,
        failed: requests.filter(
          (row) =>
            text(row, "status") === "failed" && !text(row, "confirmed_at"),
        ).length,
      };
      const metrics = {
        bookings: metric(bookings, bookingDate, period),
        customers: metric(customers, (row) => text(row, "created_at"), period),
        opinions: metric(opinions, (row) => text(row, "created_at"), period),
        confirmed: metric(requests, (row) => text(row, "confirmed_at"), period),
        revenue: metric(
          rows("payments"),
          (row) => text(row, "creado_en"),
          period,
          (row) => num(row, "total_cobrado"),
        ),
        rating: {
          current: average(opinions, period, false),
          previous: average(opinions, period, true),
        },
      };
      const qrConnected =
        text(channel, "status") === "WORKING" && yes(channel, "enabled");
      const sharedConnected =
        yes(route, "enabled") && text(route, "delivery_mode") === "live";
      const needsChatbot = yes(modules, "chatbot");
      const chatbotReady =
        (qrConnected && yes(channel, "chatbot_enabled")) || sharedConnected;
      const channelInfo: RestaurantOverview["channel"] = !needsChatbot
        ? {
            label: "Chatbot no contratado",
            tone: "info",
            detail: "No forma parte de este servicio.",
          }
        : qrConnected && yes(channel, "chatbot_enabled")
          ? {
              label: "Número propio conectado",
              tone: "good",
              detail:
                "Conexión registrada como activa. Comprueba una conversación antes de entregar.",
            }
          : sharedConnected
            ? {
                label: "Número compartido activo",
                tone: "info",
                detail:
                  "La conexión anterior sigue activa. El número propio está pendiente.",
              }
            : {
                label: "Chatbot pendiente",
                tone: "warning",
                detail:
                  "Hay que conectar el número y comprobar una conversación.",
              };
      const setup: SetupTask[] = [];
      const add = (task: SetupTask) => setup.push(task);
      const reputationHref = `/opiniones-admin?restaurante=${id}`;
      const settings = "/ajustes";
      add({
        id: "profile",
        title: "Datos del restaurante",
        detail: "Nombre, dirección y teléfono de contacto.",
        ready: Boolean(
          text(restaurant, "nombre") &&
            text(restaurant, "telefono") &&
            text(restaurant, "direccion"),
        ),
        href: reputationOnly ? reputationHref : settings,
        panel: !reputationOnly,
      });
      const invitations = rows("invitations");
      const pendingInvite = invitations.some((row) =>
        ["pending", "sent"].includes(text(row, "status")),
      );
      const hasAccess =
        rows("access").length > 0 ||
        rows("opinionAccess").some((row) => yes(row, "active"));
      add({
        id: "access",
        title: "Acceso del restaurante",
        detail: pendingInvite
          ? "Invitación enviada; pendiente de que el restaurante la acepte."
          : hasAccess
            ? "El restaurante tiene un usuario asignado."
            : "Falta asignar el acceso del restaurante.",
        ready: hasAccess && !pendingInvite,
        href: `/admin/restaurantes/${id}#access`,
      });
      if (features.bookings || needsChatbot) {
        add({
          id: "hours",
          title: "Horarios y capacidad",
          detail: "Reservas activas, aforo y al menos un turno disponible.",
          ready:
            yes(bookingConfig, "activo") &&
            rows("hours").some((row) => yes(row, "activo")) &&
            num(restaurant, "capacidad_total") > 0,
          href: settings,
          panel: true,
        });
        add({
          id: "legal",
          title: "Datos legales de las reservas",
          detail:
            "Titular, identificación fiscal, domicilio y contacto de privacidad.",
          ready: [
            "titular_legal",
            "nif_cif",
            "domicilio_legal",
            "email_legal",
          ].every((key) => Boolean(text(web, key))),
          href: settings,
          panel: true,
        });
      }
      if (needsChatbot)
        add({
          id: "chatbot",
          title: "Conectar el chatbot",
          detail: channelInfo.detail,
          ready: chatbotReady,
          href: settings,
          panel: true,
        });
      if (features.reviews || features.opinions)
        add({
          id: "google",
          title: "Destino de las reseñas",
          detail: "Enlace de Google configurado para este restaurante.",
          ready: Boolean(
            text(restaurant, "google_review_url") ||
              text(config, "google_review_url"),
          ),
          href: reputationOnly ? reputationHref : "/resenas",
          panel: !reputationOnly,
        });
      if (features.opinions)
        add({
          id: "opinion",
          title: "Página de opinión",
          detail: "Página de reputación activa y lista para recibir opiniones.",
          ready: yes(config, "active") && Boolean(text(config, "slug")),
          href: reputationHref,
        });
      if (features.reviews && yes(modules, "automatizaciones"))
        add({
          id: "review-delivery",
          title: "Envío de reseñas",
          detail:
            "Automatización activa, canal disponible y envío fuera del modo de pruebas.",
          ready:
            yes(automation, "enabled") &&
            yes(automation, "review_enabled") &&
            text(automation, "delivery_mode") === "live" &&
            ((yes(automation, "whatsapp_enabled") &&
              ((qrConnected && yes(channel, "reviews_enabled")) ||
                sharedConnected)) ||
              yes(automation, "email_enabled")),
          href: settings,
          panel: true,
        });
      if (yes(modules, "menu_digital") || features.orders)
        add({
          id: "menu",
          title: "Carta con productos",
          detail: "Carta activa y productos disponibles para los clientes.",
          ready:
            rows("menus").some((row) =>
              ["activa", "activo", "publicada"].includes(text(row, "estado")),
            ) && rows("products").some((row) => yes(row, "activo")),
          href: "/panel/carta-productos",
          panel: true,
        });
      if (features.orders)
        add({
          id: "tables",
          title: "Mesas y códigos QR",
          detail: "Mesas activas para identificar los pedidos.",
          ready: rows("tables").some((row) => yes(row, "activa")),
          href: "/panel/qr-mesas",
          panel: true,
        });
      const progress = Math.round(
        (setup.filter((task) => task.ready).length / setup.length) * 100,
      );
      const insights: Insight[] = [];
      if (unresolved)
        insights.push({
          id: "opinions",
          tone: "warning",
          title: `${unresolved} opiniones necesitan seguimiento`,
          detail:
            "Valoraciones bajas o clientes que han pedido contacto, todavía sin resolver.",
          href: reputationHref,
        });
      if (features.reviews && review.failed)
        insights.push({
          id: "failed",
          tone: "warning",
          title: `${review.failed} solicitudes con error`,
          detail: "Revisa el estado del envío de reseñas.",
          href: "/resenas",
          panel: true,
        });
      if (features.reviews && review.pending)
        insights.push({
          id: "reviews",
          tone: "info",
          title: `${review.pending} reseñas por comprobar`,
          detail: "Abrir Google no confirma que una reseña se haya publicado.",
          href: "/resenas",
          panel: true,
        });
      const nextTask = setup.find((task) => !task.ready);
      if (nextTask)
        insights.push({
          id: "setup",
          tone: "warning",
          title: nextTask.title,
          detail: nextTask.detail,
          href: nextTask.href,
          panel: nextTask.panel,
        });
      if (
        features.bookings &&
        metrics.bookings.previous >= 5 &&
        metrics.bookings.current < metrics.bookings.previous * 0.8
      )
        insights.push({
          id: "bookings-down",
          tone: "warning",
          title: "Menos reservas que en el periodo anterior",
          detail: `${metrics.bookings.current} frente a ${metrics.bookings.previous}. Revisa los canales de entrada.`,
          href: "/reservas",
          panel: true,
        });
      if (
        features.bookings &&
        metrics.bookings.current > metrics.bookings.previous &&
        metrics.bookings.previous >= 5
      )
        insights.push({
          id: "bookings-up",
          tone: "good",
          title: "Las reservas están creciendo",
          detail: `${metrics.bookings.current} frente a ${metrics.bookings.previous} en el periodo anterior.`,
        });
      if (
        metrics.rating.current !== null &&
        metrics.rating.current >= 4 &&
        currentOpinions.length >= 3
      )
        insights.push({
          id: "rating-good",
          tone: "good",
          title: "Buena valoración de los clientes",
          detail: `${metrics.rating.current.toFixed(1).replace(".", ",")} sobre 5 en ${currentOpinions.length} opiniones recibidas.`,
        });
      if (metrics.confirmed.current)
        insights.push({
          id: "confirmed",
          tone: "good",
          title: `${metrics.confirmed.current} reseñas confirmadas`,
          detail: "Confirmadas desde el panel durante este periodo.",
        });
      if (
        !metrics.bookings.current &&
        !metrics.opinions.current &&
        !metrics.confirmed.current &&
        !metrics.customers.current
      )
        insights.push({
          id: "no-activity",
          tone: "info",
          title: "Sin actividad registrada en el periodo",
          detail:
            "Comprueba que el restaurante utiliza sus enlaces y que los canales están configurados.",
        });
      const aspectCounts = new Map<string, number>();
      const labels =
        config?.aspect_labels && typeof config.aspect_labels === "object"
          ? (config.aspect_labels as Record<string, unknown>)
          : {};
      for (const row of lowOpinions)
        for (const key of new Set(
          Array.isArray(row.aspectos)
            ? row.aspectos.filter((v): v is string => typeof v === "string")
            : [],
        )) {
          const label =
            typeof labels[key] === "string"
              ? (labels[key] as string)
              : aspectNames[key] || key;
          aspectCounts.set(label, (aspectCounts.get(label) ?? 0) + 1);
        }
      const activity = [
        ...bookings.map((row) => text(row, "created_at")),
        ...opinions.map((row) => text(row, "created_at")),
        ...requests.map((row) => text(row, "sent_at")),
        ...customers.map((row) => text(row, "created_at")),
      ]
        .filter((value) => beforeNow(value))
        .sort((a, b) => new Date(b).valueOf() - new Date(a).valueOf());
      const series = Array.from({ length: period.days }, (_, i) => ({
        date: shiftDay(period.start, i),
        bookings: 0,
        opinions: 0,
        confirmed: 0,
      }));
      const days = new Map(series.map((day) => [day.date, day]));
      for (const row of bookings) {
        const day = days.get(agencyDay(bookingDate(row)));
        if (day) day.bookings++;
      }
      for (const row of opinions) {
        const day = days.get(agencyDay(text(row, "created_at")));
        if (day) day.opinions++;
      }
      for (const row of requests) {
        const day = days.get(agencyDay(text(row, "confirmed_at")));
        if (day) day.confirmed++;
      }
      return {
        id,
        name: text(restaurant, "nombre") || "Restaurante sin nombre",
        phone: text(restaurant, "telefono") || null,
        address: text(restaurant, "direccion") || null,
        demo:
          yes(web, "es_demo") ||
          text(modules, "estado") === "demo" ||
          text(modules, "plan") === "demo",
        plan:
          text(modules, "plan") ||
          (reputationOnly ? "Reputación" : "Sin configurar"),
        status:
          text(modules, "estado") ||
          (yes(config, "active") ? "activo" : "pendiente"),
        reputationOnly,
        services,
        features,
        metrics,
        attendance: {
          total: currentBookings.length,
          attended: currentBookings.filter(attended).length,
          cancelled: currentBookings.filter(cancelled).length,
          noShow: currentBookings.filter(noShow).length,
          unmarked: currentBookings.filter(
            (row) => !attended(row) && !cancelled(row) && !noShow(row),
          ).length,
        },
        reviews: review,
        opinion: {
          unresolved,
          low: lowOpinions.length,
          positive: currentOpinions.filter((row) => num(row, "rating") >= 4)
            .length,
          aspects: [...aspectCounts]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5),
        },
        channel: channelInfo,
        setup,
        progress,
        insights,
        lastActivity: activity[0] || null,
        series,
      };
    },
  );
  return {
    period,
    restaurants: restaurants.sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
