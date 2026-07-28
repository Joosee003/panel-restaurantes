import type { Metadata } from "next";
import HispanosReputationSuite from "./HispanosReputationSuite";

export const metadata: Metadata = {
  title: "Reputation Suite | Hispanos Grill",
  description:
    "Centro privado de reputación, seguimiento, insights y materiales QR de Hispanos Grill.",
  robots: { index: false, follow: false },
};

export default function OpinionesAdminPage() {
  return <HispanosReputationSuite />;
}
