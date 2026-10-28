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
    mobileNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        mobileNav.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir menú");
        document.querySelector(".site-header")?.classList.remove("menu-open");
      });
    });
    toggle.addEventListener("click", function () {
      document.querySelector(".site-header")?.classList.toggle("menu-open", toggle.getAttribute("aria-expanded") === "true");
    });
  }

  if (!document.querySelector(".nt-mobile-booking")) {
    const bookingLink = document.createElement("a");
    bookingLink.className = "nt-mobile-booking";
    bookingLink.href = "/new-talgo/reservar";
    bookingLink.setAttribute("aria-label", "Reservar mesa; si las reservas online están cerradas, llamar al restaurante");
    bookingLink.innerHTML = 'Reservar mesa <span aria-hidden="true">↗</span>';
    document.body.append(bookingLink);
  }

  if (document.body.classList.contains("nt-premium")) {
    const header = document.querySelector(".site-header");
    const syncHeader = function () { header?.classList.toggle("is-scrolled", window.scrollY > 45); };
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
      const reveal = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.animate([
            { opacity: 0, transform: "translateY(24px)" },
            { opacity: 1, transform: "translateY(0)" }
          ], { duration: 720, easing: "cubic-bezier(.16,1,.3,1)" });
          reveal.unobserve(entry.target);
        });
      }, { threshold: .12 });
      document.querySelectorAll(".nt-reveal").forEach(function (node) { reveal.observe(node); });
    }

    const gallery = document.querySelector("[data-gallery]");
    if (gallery) {
      const slides = [
        { src: "assets/photos/comedor-real-1600.webp", alt: "Mesas del comedor de New Talgo", kicker: "01 / EL COMEDOR", caption: "Un sitio para sentarse." },
        { src: "assets/photos/barra-real-1600.webp", alt: "Barra de New Talgo", kicker: "02 / LA BARRA", caption: "El corazón del bar." },
        { src: "assets/photos/fachada-real-1600.webp", alt: "Fachada de New Talgo", kicker: "03 / LA FACHADA", caption: "Aquí nos encuentras." }
      ];
      const picture = gallery.querySelector("[data-gallery-image]");
      const dots = Array.from(gallery.querySelectorAll("[data-gallery-dot]"));
      let selected = 0;
      function select(next) {
        selected = (next + slides.length) % slides.length;
        const slide = slides[selected];
        gallery.querySelector(".nt-gallery-stage")?.classList.add("is-changing");
        picture.src = slide.src;
        picture.alt = slide.alt;
        picture.onload = function () { gallery.querySelector(".nt-gallery-stage")?.classList.remove("is-changing"); };
        gallery.querySelector("[data-gallery-kicker]").textContent = slide.kicker;
        gallery.querySelector("[data-gallery-caption]").textContent = slide.caption;
        gallery.querySelector("[data-gallery-count]").textContent = String(selected + 1).padStart(2, "0") + " / 03";
        dots.forEach(function (dot, index) { dot.setAttribute("aria-pressed", String(index === selected)); });
      }
      gallery.querySelector("[data-gallery-prev]").addEventListener("click", function () { select(selected - 1); });
      gallery.querySelector("[data-gallery-next]").addEventListener("click", function () { select(selected + 1); });
      dots.forEach(function (dot, index) { dot.addEventListener("click", function () { select(index); }); });
    }
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

  document.querySelectorAll("[data-photo-key]").forEach(function (slot) {
    const photo = content.photos && content.photos[slot.dataset.photoKey];
    if (!photo || !/^assets\/photos\/[a-z0-9._-]+\.(webp|avif|jpg|jpeg|png)$/i.test(photo.src || "") || !photo.alt) return;
    const frame = slot.querySelector(".photo-placeholder");
    if (!frame) return;
    if (slot.hidden) {
      slot.hidden = false;
      const fallback = document.querySelector('[data-photo-fallback="' + slot.dataset.photoKey + '"]');
      if (fallback) fallback.hidden = true;
    }
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
      image.sizes = aboveFold ? "(max-width: 760px) 100vw, 45vw" : "(max-width: 520px) 100vw, (max-width: 760px) 50vw, 33vw";
    }
    image.addEventListener("load", function () { slot.classList.add("has-photo"); }, { once: true });
    image.addEventListener("error", function () { image.remove(); }, { once: true });
    image.src = photo.src;
    frame.prepend(image);
  });
})();

