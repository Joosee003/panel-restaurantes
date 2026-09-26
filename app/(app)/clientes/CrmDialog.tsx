"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./crm.module.css";

/** Presentation-only dialog: data and all actions stay in the owning page. */
export function CrmDialog({ children, titleId, onClose, rail = false }: {
  children: ReactNode;
  titleId: string;
  onClose: () => void;
  rail?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);

  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
    ) || []).filter((element) => element.getClientRects().length > 0);
    (panel.current?.querySelector<HTMLElement>("[autofocus]") || focusable()[0] || panel.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); panel.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previousFocus?.focus();
    };
  }, []);

  return <div className={`${styles.backdrop} ${rail ? styles.railBackdrop : ""}`} onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${styles.dialog} ${rail ? styles.dialogRail : ""}`}>
      {children}
    </div>
  </div>;
}
