import type { Metadata } from "next";
import type { ReactNode } from "react";
import WhiteLabelLayoutClient from "./WhiteLabelLayoutClient";

export const metadata: Metadata = {
  title: "Panel privado | GastroHelp",
  robots: { index: false, follow: false },
};

export default function WhiteLabelLayout({ children }: { children: ReactNode }) {
  return <WhiteLabelLayoutClient>{children}</WhiteLabelLayoutClient>;
}
