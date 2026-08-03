import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLegalDocument } from "../../lib/publicLegal";
import { getPublicRestaurantByDomain } from "../../lib/publicRestaurant";
import LegalPage from "../../restaurante/[slug]/legal/LegalPage";

export const dynamic = "force-dynamic";

export default async function DomainLegalDocument({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!isLegalDocument(document)) notFound();
  const requestHeaders = await headers();
  const restaurant = await getPublicRestaurantByDomain(requestHeaders.get("host") || "");
  if (!restaurant) notFound();
  return <LegalPage restaurant={restaurant} document={document} />;
}
