(function () {
  "use strict";

  const content = window.NEW_TALGO_CONTENT;
  const toggle = document.querySelector(".menu-toggle");
  const mobileNav = document.querySelector(".mobile-nav");

  if (toggle && mobileNav) {
    toggle.addEventListener("click", function () {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Abrir menú" : "Cerrar menú");
      mobileNav.hidden = isOpen;
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !mobileNav.hidden) {
        mobileNav.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir menú");
        toggle.focus();
      }
    });
  }

  document.querySelectorAll("#year").forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });

  if (!content) return;

  document.querySelectorAll("[data-address]").forEach(function (node) {
    node.textContent = content.addressPublished;
  });

  document.querySelectorAll(".maps-link").forEach(function (mapsLink) {
    mapsLink.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(content.addressPublished);
  });

  if (content.phoneConfirmed && /^\+?[0-9\s()-]{7,20}$/.test(content.phone)) {
    document.querySelectorAll("[data-phone-action]").forEach(function (placeholder) {
      const link = document.createElement("a");
      link.className = "text-link phone-link";
      link.href = "tel:" + content.phone.replace(/[^+0-9]/g, "");
      link.textContent = "Llamar " + content.phone;
      placeholder.replaceWith(link);
    });
  }

  // This is a photo gallery while the original GastroHelp menu is unpublished.
  // It never supplies products, prices or availability to the live menu.
  if (document.body.dataset.page === "menu" && content.gallery) {
    const previewJump = document.getElementById("photo-preview-jump");
    const previewList = document.getElementById("photo-preview-list");
    const slugs = ["tapas", "bocadillos", "hamburguesas", "pizzas", "pizzas-gourmet", "tostas", "sandwiches", "paninis", "platos-combinados", "huevos-rotos", "revueltos", "enrollados", "perritos", "sugerencias", "ensaladas", "salaitos"];
    const photoKeys = ["tapas", "bocadillos", "hamburguesas", "pizzas", "pizzasGourmet", "tostas", "sandwiches", "paninis", "platosCombinados", "huevosRotos", "revueltos", "enrollados", "perritos", "sugerencias", "ensaladas", "salaitos"];
    function figureFor(key, className) {
      const photo = content.photos && content.photos[key];
      if (!photo) return null;
      const figure = document.createElement("figure");
      figure.className = "photo-slot " + className;
      figure.dataset.photoKey = key;
      const frame = document.createElement("div");
      frame.className = "photo-placeholder";
      const caption = document.createElement("figcaption");
      caption.textContent = photo.caption || photo.alt;
      figure.append(frame, caption);
      return figure;
    }
    if (previewJump && previewList && Array.isArray(content.menuCategories)) {
      slugs.forEach(function (slug, index) {
        const name = content.menuCategories[index];
        const primary = figureFor(photoKeys[index], "menu-v2-thumb");
        if (!name || !primary) return;
        const id = "foto-" + slug;
        const link = document.createElement("a");
        link.href = "#" + id;
        link.textContent = name;
        previewJump.append(link);
        const row = document.createElement("article");
        row.className = "menu-v2-row";
        row.id = id;
        const number = document.createElement("span");
        number.className = "menu-v2-number";
        number.textContent = String(index + 1).padStart(2, "0");
        const copy = document.createElement("div");
        copy.className = "menu-v2-row-copy";
        const heading = document.createElement("h3");
        heading.textContent = name;
        const note = document.createElement("p");
        note.textContent = "Fotografías recibidas. Carta y disponibilidad por confirmar.";
        copy.append(heading, note);
        row.append(number, copy, primary);
        const extras = content.gallery[slug];
        if (Array.isArray(extras) && extras.length) {
          const gallery = document.createElement("div");
          gallery.className = "menu-v2-extras";
          extras.forEach(function (key) {
            const figure = figureFor(key, "menu-v2-extra");
            if (figure) gallery.append(figure);
          });
          if (gallery.childElementCount) row.append(gallery);
        }
        previewList.append(row);
      });
    }
  }

  document.querySelectorAll("[data-photo-key]").forEach(function (slot) {
    const photo = content.photos && content.photos[slot.dataset.photoKey];
    if (!photo || !/^assets\/photos\/[a-z0-9._-]+\.(webp|avif|jpg|jpeg|png)$/i.test(photo.src || "") || !photo.alt) return;
    const frame = slot.querySelector(".photo-placeholder");
    if (!frame) return;
    const image = document.createElement("img");
    image.alt = photo.alt;
    image.decoding = "async";
    const aboveFold = slot.dataset.photoKey === "hero" || slot.dataset.photoKey === "menu";
    image.loading = aboveFold ? "eager" : "lazy";
    if (aboveFold) image.setAttribute("fetchpriority", "high");
    if (Number.isInteger(photo.width) && Number.isInteger(photo.height)) {
      image.width = photo.width;
      image.height = photo.height;
    }
    if (/^assets\/photos\/[a-z0-9._-]+\.webp$/i.test(photo.small || "") && Number.isInteger(photo.smallWidth) && Number.isInteger(photo.width)) {
      image.srcset = photo.small + " " + photo.smallWidth + "w, " + photo.src + " " + photo.width + "w";
      image.sizes = aboveFold ? "(max-width: 760px) 100vw, 45vw" : slot.classList.contains("menu-v2-thumb") ? "(max-width: 520px) 75vw, 220px" : slot.classList.contains("menu-v2-extra") ? "(max-width: 520px) 85vw, (max-width: 760px) 40vw, 27vw" : "(max-width: 520px) 100vw, (max-width: 760px) 50vw, 33vw";
    }
    image.addEventListener("load", function () { slot.classList.add("has-photo"); }, { once: true });
    image.addEventListener("error", function () { image.remove(); }, { once: true });
    image.src = photo.src;
    frame.prepend(image);
    const caption = slot.querySelector("figcaption");
    if (caption) caption.textContent = photo.caption || photo.alt;
  });
})();
