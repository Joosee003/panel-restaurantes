"use client";

import { useEffect, useRef } from "react";
import { googleReviewUrl } from "@/lib/reviews/review-flow";

export default function DirectGoogleReview({ token, target }: { token: string; target: string }) {
  const started = useRef(false);
  const safeTarget = googleReviewUrl(target);

  useEffect(() => {
    const open = () => {
      if (started.current || !safeTarget || document.visibilityState !== "visible"
          || (document as Document & { prerendering?: boolean }).prerendering) return;
      started.current = true;
      const form = new FormData();
      form.set("action", "google");
      // Keep the existing same-origin POST tracking. It must not delay Google,
      // and a tracking outage must never prevent the customer writing a review.
      try {
        void fetch(`/api/public/review-requests/${token}`, {
          method: "POST", body: form, keepalive: true, cache: "no-store", credentials: "omit",
        }).catch(() => {});
      } catch { /* The destination remains usable if tracking is unavailable. */ }
      window.location.replace(safeTarget);
    };
    open();
    document.addEventListener("visibilitychange", open);
    document.addEventListener("prerenderingchange", open);
    return () => {
      document.removeEventListener("visibilitychange", open);
      document.removeEventListener("prerenderingchange", open);
    };
  }, [safeTarget, token]);

  return <main className="flex min-h-screen items-center justify-center bg-white px-5 text-slate-700">
    <div className="text-center">
      <p>Abriendo Google…</p>
      {safeTarget && <a href={safeTarget} referrerPolicy="no-referrer" className="mt-4 inline-block text-indigo-700 underline">Abrir el formulario de reseña</a>}
    </div>
  </main>;
}
