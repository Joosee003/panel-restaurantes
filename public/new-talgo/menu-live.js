(function () {
  "use strict";
  const status = document.getElementById("live-menu-status");
  const jump = document.getElementById("live-menu-jump");
  const list = document.getElementById("live-menu-list");
  const preview = document.getElementById("photo-preview");
  const sectionLabel = document.getElementById("menu-section-label");
  const sectionIntro = document.getElementById("menu-section-intro");
  if (!status || !jump || !list) return;

  const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  }
  function showMessage(message) {
    status.textContent = message;
    jump.replaceChildren();
    list.replaceChildren();
    if (preview) preview.hidden = false;
    if (sectionLabel) sectionLabel.textContent = "01 — FOTOGRAFÍAS RECIBIDAS";
    if (sectionIntro) sectionIntro.textContent = "Mientras confirmamos la carta, puedes ver platos fotografiados por Ángel. Las fotos no indican disponibilidad ni precio.";
  }
  function photo(product) {
    if (!product.imagenUrl) return null;
    const frame = element("div", "menu-live-photo");
    const image = document.createElement("img");
    image.src = product.imagenUrl;
    image.alt = product.nombre;
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 640;
    image.height = 480;
    image.addEventListener("error", () => frame.remove(), { once: true });
    frame.append(image);
    return frame;
  }
  function render(menu) {
    const categories = Array.isArray(menu.categorias) ? menu.categorias : [];
    const products = Array.isArray(menu.productos) ? menu.productos : [];
    if (menu.status !== "publicada" || !products.length) {
      showMessage("La carta está pendiente de confirmación. Consulta directamente en el local.");
      return;
    }
    if (preview) preview.hidden = true;
    if (sectionLabel) sectionLabel.textContent = "01 — LA CARTA ACTUAL";
    if (sectionIntro) sectionIntro.textContent = "Platos y precios publicados desde el panel de New Talgo. Los productos ocultos no aparecen en esta carta.";
    status.textContent = "Carta actualizada desde el panel de New Talgo. Los productos visibles y sus precios proceden de GastroHelp.";
    const menuNav = document.createDocumentFragment();
    const menuList = document.createDocumentFragment();
    categories.forEach((category, index) => {
      const id = "categoria-" + String(index + 1);
      const link = element("a", "", category.nombre);
      link.href = "#" + id;
      menuNav.append(link);
      const section = element("section", "menu-live-category");
      section.id = id;
      section.setAttribute("aria-labelledby", id + "-title");
      const heading = element("h3", "", category.nombre);
      heading.id = id + "-title";
      section.append(heading);
      products.filter((product) => product.categoriaId === category.id).forEach((product) => {
        const card = element("article", "menu-live-product");
        const image = photo(product);
        if (image) card.append(image);
        else card.classList.add("menu-live-product--text");
        const copy = element("div", "menu-live-copy");
        const top = element("div", "menu-live-top");
        top.append(element("h4", "", product.nombre), element("strong", "menu-live-price", euro.format(product.precio)));
        copy.append(top);
        if (product.descripcion) copy.append(element("p", "", product.descripcion));
        if (Array.isArray(product.alergenos) && product.alergenos.length) {
          copy.append(element("small", "menu-live-allergens", "Alérgenos declarados: " + product.alergenos.join(", ")));
        }
        card.append(copy);
        section.append(card);
      });
      menuList.append(section);
    });
    jump.replaceChildren(menuNav);
    list.replaceChildren(menuList);
  }
  fetch("/api/public/new-talgo/menu", { cache: "no-store", credentials: "omit" })
    .then((response) => { if (!response.ok) throw new Error("MENU_UNAVAILABLE"); return response.json(); })
    .then(render)
    .catch(() => showMessage("La carta no está disponible en este momento. Consulta directamente en el local."));
})();
