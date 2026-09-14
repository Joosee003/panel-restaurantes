import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { googleReviewUrl, isReviewToken } from "@/lib/reviews/review-flow";
import DirectGoogleReview from "./DirectGoogleReview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Escribir una reseña en Google",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function DirectReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isReviewToken(token)) notFound();
  // Reading a link for a preview must never record an opening or a review.
  const { data, error } = await getSupabaseAdmin().rpc("get_visit_review_link", { p_token: token });
  if (error) throw new Error("No se pudo cargar el enlace de reseñas.");
  const target = googleReviewUrl(data?.googleUrl);
  if (data?.active !== true || !target) notFound();
  return <DirectGoogleReview token={token} target={target} />;
}
