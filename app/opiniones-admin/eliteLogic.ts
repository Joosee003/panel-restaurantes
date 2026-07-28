import {
  aspectLabels,
  average,
  dateWithinDays,
  safePercent,
  type AspectKey,
  type Opinion,
  type OpinionEvent,
} from "./reputation";

export function calculateEliteMetrics(
  opinions: Opinion[],
  events: OpinionEvent[],
  threshold: number,
) {
  const averageRating = average(opinions.map((item) => item.rating));
  const last30 = opinions.filter((item) => dateWithinDays(item.created_at, 30)).length;
  const last7 = opinions.filter((item) => dateWithinDays(item.created_at, 7)).length;
  const lowRatings = opinions.filter((item) => item.rating <= threshold).length;
  const pendingFollowUps = opinions.filter(
    (item) =>
      item.seguimiento !== "resuelto" &&
      (item.rating <= threshold || item.solicita_contacto),
  ).length;
  const googleOpened = events.filter(
    (item) => item.event_type === "google_opened",
  ).length;
  const submitted = Math.max(
    1,
    events.filter((item) => item.event_type === "submitted").length ||
      opinions.length,
  );
  const followUpEligible = opinions.filter(
    (item) =>
      item.rating <= threshold || item.solicita_contacto || item.contacto,
  ).length;
  const resolved = opinions.filter(
    (item) => item.seguimiento === "resuelto",
  ).length;

  return {
    total: opinions.length,
    averageRating,
    last30,
    last7,
    lowRatings,
    pendingFollowUps,
    googleOpened,
    googleRate: safePercent(googleOpened, submitted),
    positiveRate: safePercent(
      opinions.filter((item) => item.rating >= 4).length,
      opinions.length,
    ),
    resolutionRate: safePercent(resolved, followUpEligible),
  };
}

export function buildEliteInsights(opinions: Opinion[], threshold: number) {
  const recent = opinions.filter((item) => dateWithinDays(item.created_at, 30));
  const previous = opinions.filter(
    (item) =>
      dateWithinDays(item.created_at, 60) &&
      !dateWithinDays(item.created_at, 30),
  );
  const recentAverage = average(recent.map((item) => item.rating));
  const previousAverage = average(previous.map((item) => item.rating));

  const ranking = (Object.keys(aspectLabels) as AspectKey[])
    .map((key) => {
      const matching = opinions.filter((item) => item.aspectos.includes(key));
      return {
        key,
        count: matching.length,
        average: average(matching.map((item) => item.rating)),
      };
    })
    .sort((a, b) => b.count - a.count);

  const strongest = [...ranking]
    .filter((item) => item.count > 0)
    .sort((a, b) => b.average - a.average)[0];
  const weakest = [...ranking]
    .filter((item) => item.count > 0)
    .sort((a, b) => a.average - b.average)[0];
  const critical = opinions.filter((item) => item.rating <= threshold);
  const contactable = critical.filter((item) => item.contacto).length;

  const trend =
    previous.length === 0
      ? "Sin histórico suficiente"
      : recentAverage > previousAverage + 0.2
        ? "Mejorando"
        : recentAverage < previousAverage - 0.2
          ? "Descendiendo"
          : "Estable";

  const headline =
    trend === "Descendiendo"
      ? "Hay una señal que conviene corregir ahora."
      : critical.length
        ? "La reputación es sólida, con oportunidades claras de mejora."
        : "La experiencia está funcionando muy bien.";

  return {
    headline,
    trend,
    summary: `${recent.length} opiniones en los últimos 30 días y una media de ${
      recentAverage ? recentAverage.toFixed(1) : "—"
    }/5. ${
      previous.length
        ? `La tendencia es ${trend.toLowerCase()} frente al periodo anterior.`
        : "Se está construyendo el histórico para comparar tendencias."
    }`,
    strength: strongest
      ? `${aspectLabels[strongest.key]} destaca con una valoración media de ${strongest.average.toFixed(1)}/5.`
      : "Las valoraciones positivas dominan, aunque faltan más datos por aspecto.",
    opportunity: weakest
      ? `${aspectLabels[weakest.key]} es el aspecto con menor valoración media (${weakest.average.toFixed(1)}/5). Conviene revisar el proceso asociado durante 7 días.`
      : "Todavía no hay un patrón negativo repetido.",
    nextAction: critical.length
      ? `Revisar los ${critical.length} casos críticos y priorizar los ${contactable} que tienen datos de contacto.`
      : "Mantener la captación y reforzar el punto QR que mejor convierte.",
    executiveSummary: `El sistema detecta ${critical.length} opiniones dentro del umbral crítico. ${
      contactable
        ? `${contactable} permiten contactar directamente con el cliente.`
        : "No hay contactos disponibles en esos casos."
    }`,
    ranking,
  };
}
