"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./service.module.css";

/** Presentation-only rail: all data and action handlers remain in the owning page. */
export function ServiceDetail({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  const rail = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = rail.current;
    const focusable = () => Array.from(node?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
    if (!node?.contains(document.activeElement)) (focusable()[0] ?? node)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); node?.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node?.addEventListener("keydown", onKeyDown);
    return () => { node?.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);

  return <div className={styles.detailBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={rail} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={styles.detailRail}>{children}</div>
  </div>;
}
