import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import ClubExperience, { type ClubRestaurant } from "./ClubExperience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Club del restaurante",
  description: "Puntos, visitas y recompensas de tu restaurante.",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
};

async function getRestaurant(slug: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("club_public_restaurant", { p_slug: slug });
  if (error || !data) return null;
  return data as ClubRestaurant;
}

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getRestaurant(slug);
  if (!restaurant) notFound();
  return <ClubExperience slug={slug} restaurant={restaurant} />;
}
