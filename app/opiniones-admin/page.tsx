import type { Metadata } from "next";
import HispanosReputationSuite from "./HispanosReputationSuite";

export const metadata: Metadata = {
  title: "Panel de reputación | GastroHelp",
  description:
    "Centro privado de reputación, seguimiento, insights y materiales QR.",
  robots: { index: false, follow: false },
};

export default function OpinionesAdminPage() {
  return <HispanosReputationSuite />;
}
