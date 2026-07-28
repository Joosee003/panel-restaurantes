import type { Metadata } from "next";
import ReputationElite from "./ReputationElite";

export const metadata: Metadata = {
  title: "Reputation Suite | GastroHelp",
  description:
    "Centro de control privado para opiniones, recuperación de clientes, insights y materiales QR.",
  robots: { index: false, follow: false },
};

export default function OpinionesAdminPage() {
  return <ReputationElite />;
}
