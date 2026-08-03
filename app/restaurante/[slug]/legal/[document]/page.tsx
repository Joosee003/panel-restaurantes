import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLegalDocument } from "../../../../lib/publicLegal";
import { getPublicRestaurant, publicRestaurantUrl } from "../../../../lib/publicRestaurant";
import LegalPage from "../LegalPage";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; document: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, document } = await params;
  const restaurant = await getPublicRestaurant(slug);
  if (!restaurant || !isLegalDocument(document)) return { title: "Documento no encontrado" };
  return {
    title: `${document === "privacidad" ? "Privacidad" : document === "cookies" ? "Cookies" : document === "aviso-legal" ? "Aviso legal" : "Condiciones de reserva"} | ${restaurant.name}`,
    robots: { index: true, follow: true },
    alternates: { canonical: `${publicRestaurantUrl(restaurant)}/legal/${document}` },
  };
}

export default async function RestaurantLegalDocument({ params }: Props) {
  const { slug, document } = await params;
  if (!isLegalDocument(document)) notFound();
  const restaurant = await getPublicRestaurant(slug);
  if (!restaurant) notFound();
  return <LegalPage restaurant={restaurant} document={document} />;
}
