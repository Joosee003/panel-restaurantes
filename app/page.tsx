import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  getPublicRestaurantByDomain,
  isPlatformDomain,
  publicRestaurantUrl,
} from "./lib/publicRestaurant";
import { RestaurantPageContent } from "./restaurante/[slug]/page";

export const dynamic = "force-dynamic";

async function restaurantFromRequest() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "";
  if (isPlatformDomain(host)) return { host, restaurant: null };
  return { host, restaurant: await getPublicRestaurantByDomain(host) };
}

export async function generateMetadata(): Promise<Metadata> {
  const { restaurant } = await restaurantFromRequest();
  if (!restaurant) return { title: "GastroHelp" };
  return {
    title: restaurant.seoTitle,
    description: restaurant.seoDescription,
    alternates: { canonical: publicRestaurantUrl(restaurant) },
    openGraph: {
      title: restaurant.seoTitle,
      description: restaurant.seoDescription,
      type: "website",
      url: publicRestaurantUrl(restaurant),
      images: restaurant.heroImageUrl ? [restaurant.heroImageUrl] : [],
    },
  };
}

export default async function HomePage() {
  const { host, restaurant } = await restaurantFromRequest();
  if (isPlatformDomain(host)) redirect("/login");
  if (!restaurant) notFound();
  return <RestaurantPageContent slug={restaurant.slug} />;
}
