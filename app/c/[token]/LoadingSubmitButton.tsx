"use client";

import React from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  loadingText?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function LoadingSubmitButton({
  children,
  loadingText = "Procesando...",
  className = "",
  style,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        "relative inline-flex w-full touch-manipulation items-center justify-center rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm transition",
        "active:scale-[0.97] active:opacity-85",
        "disabled:pointer-events-none disabled:opacity-80",
        className,
      ].join(" ")}
      style={style}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          {loadingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
