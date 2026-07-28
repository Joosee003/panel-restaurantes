import type { Metadata } from "next";
import { Suspense } from "react";
import HispanosOpinionExperience from "./HispanosOpinionExperience";

export const metadata: Metadata = {
  title: "Tu opinión | Hispanos Grill",
  description: "Comparte tu experiencia con Hispanos Grill en unos segundos.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OpinionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <Suspense fallback={<OpinionLoading />}>
      <HispanosOpinionExperience slug={slug} />
    </Suspense>
  );
}

function OpinionLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#062b5c] px-6 text-white">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        <p className="mt-4 text-sm font-bold text-blue-100">
          Preparando tu experiencia…
        </p>
      </div>
    </main>
  );
}
