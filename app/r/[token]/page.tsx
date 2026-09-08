import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { googleReviewUrl, isReviewToken } from "@/lib/reviews/review-flow";
import ReviewLinkActions from "./ReviewLinkActions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tu opinión después de la visita",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type ReviewLink = { restaurantName: string; googleUrl: string; active: boolean; optedOut: boolean };

export default async function VisitReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isReviewToken(token)) notFound();
  const { data, error } = await getSupabaseAdmin().rpc("get_visit_review_link", { p_token: token });
  if (error) throw new Error("No se pudo cargar el enlace de reseñas.");
  const review = data as ReviewLink | null;
  if (!review) notFound();

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12 text-slate-900">
    <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10">
      <p className="text-sm font-bold text-indigo-700">{review.restaurantName}</p>
      <h1 className="mt-4 text-3xl font-black leading-tight">Gracias por tu visita</h1>
      <p className="mt-4 leading-7 text-slate-600">¿Nos cuentas cómo fue tu experiencia? Puedes compartir tu opinión en Google.</p>
      <ReviewLinkActions token={token} active={review.active && Boolean(googleReviewUrl(review.googleUrl))} optedOut={review.optedOut}/>
    </section>
  </main>;
}
