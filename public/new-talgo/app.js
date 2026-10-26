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

  // The booking page decides whether the existing widget is available. Its
  // closed state always offers the confirmed restaurant phone number.
  if (!document.querySelector(".nt-mobile-booking")) {
    const bookingLink = document.createElement("a");
    bookingLink.className = "nt-mobile-booking";
    bookingLink.href = "/new-talgo/reservar";
    bookingLink.setAttribute("aria-label", "Reservar mesa; si las reservas online están cerradas, llamar al restaurante");
    bookingLink.innerHTML = 'Reservar mesa <span aria-hidden="true">↗</span>';
    document.body.append(bookingLink);
  }

  const gallery = document.getElementById("nt-gallery-track");
  if (gallery) {
    const items = Array.from(gallery.querySelectorAll(".nt-gallery-item"));
    const count = document.querySelector("[data-gallery-count]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const currentIndex = function () {
      if (!items.length) return 0;
      let nearest = 0;
      let distance = Infinity;
      items.forEach(function (item, index) {
        const delta = Math.abs(item.offsetLeft - items[0].offsetLeft - gallery.scrollLeft);
        if (delta < distance) { distance = delta; nearest = index; }
      });
      return nearest;
    };
    const updateCount = function () {
      if (count) count.textContent = String(currentIndex() + 1).padStart(2, "0") + " / " + String(items.length).padStart(2, "0");
    };
    const goTo = function (index) {
      const item = items[Math.max(0, Math.min(items.length - 1, index))];
      if (item) gallery.scrollTo({ left: item.offsetLeft - items[0].offsetLeft, behavior: reducedMotion.matches ? "auto" : "smooth" });
    };
    document.querySelector("[data-gallery-prev]")?.addEventListener("click", function () { goTo(currentIndex() - 1); });
    document.querySelector("[data-gallery-next]")?.addEventListener("click", function () { goTo(currentIndex() + 1); });
    gallery.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(currentIndex() + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
    let pending = false;
    gallery.addEventListener("scroll", function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { updateCount(); pending = false; });
    }, { passive: true });
    updateCount();
  }

  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const revealNodes = document.querySelectorAll(".nt-reveal");
    const revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.remove("nt-before-reveal");
          entry.target.classList.add("nt-is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -35px 0px", threshold: 0.08 });
    revealNodes.forEach(function (node) {
      if (node.getBoundingClientRect().top > window.innerHeight) node.classList.add("nt-before-reveal");
      revealObserver.observe(node);
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
