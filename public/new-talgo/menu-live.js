(function () {
  "use strict";
  const status = document.getElementById("live-menu-status");
  const jump = document.getElementById("live-menu-jump");
  const list = document.getElementById("live-menu-list");
  const preview = document.getElementById("photo-preview");
  const label = document.getElementById("menu-section-label");
  const intro = document.getElementById("menu-section-intro");
  if (!status || !jump || !list) return;

  const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  const node = (tag, className, value) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (value != null) result.textContent = String(value);
    return result;
  };
  function showMessage(message) {
    status.textContent = message;
    jump.replaceChildren();
    list.replaceChildren();
    if (preview) preview.hidden = false;
    if (label) label.textContent = "01 / LA CARTA";
    if (intro) intro.textContent = "Descubre algunos de nuestros platos y visítanos para conocer la carta del día.";
  }
  function render(menu) {
    const categories = Array.isArray(menu.categorias) ? menu.categorias : [];
    const products = Array.isArray(menu.productos) ? menu.productos : [];
    if ((menu.status !== "publicada" && menu.status !== "vista_previa") || !products.length) {
      showMessage("Para conocer la carta de hoy, consulta en el local.");
      return;
    }
    if (preview) preview.hidden = true;
    if (label) label.textContent = "01 / LA CARTA ACTUAL";
    if (intro) intro.textContent = "Encuentra tu favorito entre tapas, bocadillos, pizzas y mucho más.";
    status.textContent = "";
    status.hidden = true;
    const menuNav = document.createDocumentFragment();
    const menuList = document.createDocumentFragment();
    // Four real product photos punctuate the long menu. Every product remains in a text row.
    const featuredSections = new Set(["Bocadillos", "Pizzas", "Platos combinados", "Sugerencias"]);
    categories.forEach((category, index) => {
      const items = products.filter((product) => product.categoriaId === category.id);
      if (!items.length) return;
      const id = "categoria-" + String(index + 1);
      const link = node("a", "", category.nombre);
      link.href = "#" + id;
      link.append(node("small", "", String(items.length).padStart(2, "0")));
      menuNav.append(link);
      const section = node("section", "menu-category");
      section.id = id;
      section.setAttribute("aria-labelledby", id + "-title");
      const head = node("div", "menu-category-head");
      head.append(node("span", "menu-category-number", String(index + 1).padStart(2, "0")));
      const heading = node("h3", "", category.nombre);
      heading.id = id + "-title";
      head.append(heading, node("span", "menu-category-count", items.length + (items.length === 1 ? " producto" : " productos")));
      section.append(head);
      if (featuredSections.has(category.nombre)) {
        const featured = items.find((product) => product.imagenUrl);
        if (featured) {
          const figure = node("figure", "menu-feature");
          const image = document.createElement("img");
          image.src = featured.imagenUrl;
          image.alt = featured.nombre;
          image.loading = "lazy";
          image.decoding = "async";
          image.addEventListener("error", () => figure.remove(), { once: true });
          figure.append(image);
          section.append(figure);
        }
      }
      const rows = node("div", "menu-product-list");
      items.forEach((product, itemIndex) => {
        const row = node("article", "menu-product");
        row.append(node("span", "menu-product-number", String(itemIndex + 1).padStart(2, "0")));
        const detail = node("div", "menu-product-detail");
        detail.append(node("h4", "", product.nombre));
        if (product.descripcion) detail.append(node("p", "", product.descripcion));
        if (Array.isArray(product.alergenos) && product.alergenos.length) {
          detail.append(node("small", "menu-allergens", "Alérgenos declarados: " + product.alergenos.join(", ")));
        }
        row.append(detail, node("strong", "menu-price", euro.format(product.precio)));
        rows.append(row);
      });
      section.append(rows);
      menuList.append(section);
    });
    jump.replaceChildren(menuNav);
    list.replaceChildren(menuList);
  }
  // Deployment URLs are protected by Vercel Authentication. The private route
  // independently rejects custom domains and every non-preview deployment.
  const privatePreview = location.hostname.endsWith(".vercel.app");
  const endpoint = privatePreview ? "/api/private/new-talgo/draft-menu" : "/api/public/new-talgo/menu";
  fetch(endpoint, { cache: "no-store", credentials: "same-origin" })
    .then((response) => { if (!response.ok) throw new Error("MENU_UNAVAILABLE"); return response.json(); })
    .then(render)
    .catch(() => showMessage("No podemos mostrar la carta en este momento. Consulta directamente en el local."));
})();
