import type { Metadata } from "next";
import OpinionesDashboardV2 from "./OpinionesDashboardV2";

export const metadata: Metadata = {
  title: "Reputation Suite | GastroHelp",
  description:
    "Panel privado para gestionar opiniones, insights, seguimientos y materiales QR.",
  robots: { index: false, follow: false },
};

export default function OpinionesAdminPage() {
  return <OpinionesDashboardV2 />;
}
