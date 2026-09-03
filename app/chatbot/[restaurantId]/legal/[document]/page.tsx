import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getChatbotLegalRestaurant } from "../../../../lib/chatbotLegalRestaurant";
import { isLegalDocument } from "../../../../lib/publicLegal";
import LegalPage from "../../../../restaurante/[slug]/legal/LegalPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ChatbotLegalPage({
  params,
}: {
  params: Promise<{ restaurantId: string; document: string }>;
}) {
  const { restaurantId, document } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      restaurantId,
    ) ||
    !isLegalDocument(document)
  ) {
    notFound();
  }

  const restaurant = await getChatbotLegalRestaurant(restaurantId);
  if (!restaurant) notFound();
  return <LegalPage restaurant={restaurant} document={document} />;
}
