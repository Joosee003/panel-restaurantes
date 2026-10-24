(function () {
  "use strict";

  const slots = Object.fromEntries(["universitarios", "partidas", "estacion"].map((name) => [name, document.querySelector(`[data-promo-slot="${name}"]`)]));
  if (!slots.universitarios || !slots.partidas || !slots.estacion) return;
  const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  const number = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
  const labels = { universitarios: "ESTUDIANTES", partidas: "TARDES DE PARTIDAS", estacion: "CERCA DE LA ESTACIÓN" };

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value) node.textContent = value;
    return node;
  }

  function offer(promotion) {
    switch (promotion.tipo) {
      case "precio_especial":
      case "pack": return promotion.precio ? euro.format(promotion.precio) : "";
      case "porcentaje": return promotion.descuentoPorcentaje ? `−${number.format(promotion.descuentoPorcentaje)} %` : "";
      case "descuento_fijo": return promotion.descuentoEuros ? `−${euro.format(promotion.descuentoEuros)}` : "";
      case "dos_por_uno": return "2 × 1";
      case "grupos": return promotion.personasMinimas ? `Desde ${promotion.personasMinimas} personas` : "";
      default: return "";
    }
  }

  function destination(promotion) {
    if (promotion.destino === "visitanos") return "visitanos.html";
    if (promotion.destino === "contacto") {
      const content = window.NEW_TALGO_CONTENT;
      if (content?.phoneConfirmed && /^\+?[0-9\s()-]{7,20}$/.test(content.phone || "")) return "tel:" + content.phone.replace(/[^+0-9]/g, "");
      return "visitanos.html";
    }
    return "carta.html";
  }

  function card(promotion) {
    const article = element("article", "nt-promo-card");
    if (promotion.imagenUrl) {
      const frame = element("div", "nt-promo-picture");
      const image = document.createElement("img");
      image.src = promotion.imagenUrl;
      image.alt = `Fotografía asociada a ${promotion.titulo}`;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => frame.remove(), { once: true });
      frame.append(image);
      article.append(frame);
    }
    const body = element("div", "nt-promo-body");
    body.append(element("span", "nt-promo-kicker", labels[promotion.ubicacion] || "NEW TALGO"));
    body.append(element("h3", "", promotion.titulo));
    if (promotion.descripcion) body.append(element("p", "nt-promo-description", promotion.descripcion));
    if (promotion.productos) body.append(element("p", "nt-promo-products", promotion.productos));
    const detail = offer(promotion);
    if (detail) body.append(element("strong", "nt-promo-offer", detail));
    if (promotion.condiciones) body.append(element("small", "nt-promo-terms", promotion.condiciones));
    const link = element("a", "nt-promo-link", promotion.boton || "Ver carta");
    link.href = destination(promotion);
    link.append(element("span", "", "↗"));
    body.append(link);
    article.append(body);
    return article;
  }

  function render(promotions) {
    let activeCommunity = false;
    for (const [location, slot] of Object.entries(slots)) {
      const items = promotions.filter((item) => item.ubicacion === location);
      slot.replaceChildren(...items.map(card));
      slot.hidden = items.length === 0;
      const fallback = document.querySelector(`[data-promo-fallback="${location}"]`);
      if (fallback) fallback.hidden = items.length > 0;
      if (location !== "estacion" && items.length) activeCommunity = true;
    }
    document.querySelector("[data-station-section]").hidden = slots.estacion.hidden;
    const heading = document.querySelector("[data-promo-heading]");
    if (heading) heading.textContent = activeCommunity ? "03 — ACTUALIDAD DE NEW TALGO" : "03 — IDEAS EN ESTUDIO";
  }

  async function refresh() {
    try {
      const response = await fetch("/api/public/new-talgo/promotions", { cache: "no-store" });
      if (!response.ok) throw new Error("PROMOTIONS_UNAVAILABLE");
      const result = await response.json();
      render(Array.isArray(result.promociones) ? result.promociones : []);
    } catch {
      // Existing editorial content remains visible when the public API is unavailable.
      render([]);
    }
  }

  void refresh();
  window.setInterval(() => { if (!document.hidden) void refresh(); }, 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
})();
