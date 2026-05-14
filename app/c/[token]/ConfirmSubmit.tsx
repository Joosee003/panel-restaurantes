"use client";

import React from "react";

export default function ConfirmSubmit({
  children,
  message,
}: {
  children: React.ReactNode;
  message: string;
}) {
  return (
    <div
      onClickCapture={(e) => {
        const ok = window.confirm(message);
        if (!ok) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}