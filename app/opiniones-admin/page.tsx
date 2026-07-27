import type { Metadata } from "next";
import OpinionesDashboard from "./OpinionesDashboard";

export const metadata: Metadata = {
  title: "Opiniones QR | GastroHelp",
  description: "Panel de gestión del sistema de opiniones QR.",
  robots: { index: false, follow: false },
};

export default function OpinionesAdminPage() {
  return <OpinionesDashboard />;
}
