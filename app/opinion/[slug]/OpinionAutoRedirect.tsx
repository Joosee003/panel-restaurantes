"use client";

import { useEffect } from "react";

const INTRO_COPY =
  "Al enviarla, se abrirá Google para que puedas completar la publicación.";

function replaceIntroCopy() {
  const paragraphs = Array.from(document.querySelectorAll("p"));
  const paragraph = paragraphs.find((item) =>
    item.textContent?.includes(
      "Al terminar también podrás publicarla en Google si lo deseas",
    ),
  );

  if (paragraph) paragraph.textContent = INTRO_COPY;
}

function addLogoFallback() {
  const logo = document.querySelector<HTMLImageElement>('img[alt^="Logo de"]');
  if (!logo || logo.dataset.fallbackReady === "true") return;

  logo.dataset.fallbackReady = "true";
  logo.addEventListener(
    "error",
    () => {
      logo.src = "/brand/hispanos-grill-logo-vector.svg";
    },
    { once: true },
  );
}

export default function OpinionAutoRedirect() {
  useEffect(() => {
    let redirecting = false;

    const enhanceExperience = () => {
      replaceIntroCopy();
      addLogoFallback();

      if (redirecting) return;

      const googleLink = Array.from(document.querySelectorAll("a")).find((item) =>
        item.textContent?.includes("Publicar también en Google"),
      ) as HTMLAnchorElement | undefined;

      if (!googleLink) return;

      const redirectKey = `gastrohelp-google-redirect:${window.location.pathname}`;
      if (window.sessionStorage.getItem(redirectKey) === "done") return;

      redirecting = true;
      window.sessionStorage.setItem(redirectKey, "done");

      const destination = googleLink.href;
      const card = googleLink.parentElement;

      if (card) {
        card.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:20px;text-align:center;color:#3b241f;">
            <span aria-hidden="true" style="width:22px;height:22px;border:3px solid rgba(31,95,191,.18);border-top-color:#1f5fbf;border-radius:999px;animation:opinionRedirectSpin .8s linear infinite"></span>
            <div>
              <strong style="display:block;font-size:16px">Abriendo Google…</strong>
              <span style="display:block;margin-top:4px;font-size:13px;opacity:.65">Solo falta confirmar y publicar tu reseña.</span>
            </div>
          </div>
        `;
      }

      window.setTimeout(() => {
        window.location.assign(destination);
      }, 650);
    };

    const style = document.createElement("style");
    style.textContent =
      "@keyframes opinionRedirectSpin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);

    enhanceExperience();
    const observer = new MutationObserver(enhanceExperience);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      style.remove();
    };
  }, []);

  return null;
}
