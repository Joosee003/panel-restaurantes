import type { Metadata } from "next";
import { Suspense } from "react";
import OpinionExperience from "./OpinionExperience";

export const metadata: Metadata = {
  title: "Comparte tu experiencia | GastroHelp",
  description: "Ayuda al restaurante a seguir mejorando con tu opinión.",
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
      <OpinionExperience slug={slug} />
    </Suspense>
  );
}

function OpinionLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#1f5fbf]/20 border-t-[#1f5fbf]" />
        <p className="mt-4 text-sm font-medium text-[#3b241f]/70">
          Preparando tu experiencia…
        </p>
      </div>
    </main>
  );
}
