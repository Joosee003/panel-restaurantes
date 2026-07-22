import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Restaurante demo | GastroHelp",
  description: "Entorno público de demostración del panel GastroHelp con datos ficticios.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
