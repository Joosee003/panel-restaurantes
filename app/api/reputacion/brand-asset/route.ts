import { NextRequest, NextResponse } from "next/server";
import { HISPANOS_BRAND } from "@/lib/opiniones/hispanos-brand";

export const dynamic = "force-dynamic";

const assets: Record<string, string> = {
  logo: HISPANOS_BRAND.logo,
  hero: HISPANOS_BRAND.hero,
  exterior: HISPANOS_BRAND.exterior,
  food1: HISPANOS_BRAND.food[0],
  food2: HISPANOS_BRAND.food[1],
  food3: HISPANOS_BRAND.food[2],
};

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const source = assets[id];

  if (!source) {
    return NextResponse.json({ error: "Recurso no disponible" }, { status: 404 });
  }

  try {
    const response = await fetch(source, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "GastroHelp-Reputation/1.0" },
    });

    if (!response.ok) {
      throw new Error(`No se pudo cargar el recurso (${response.status})`);
    }

    const body = await response.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar el recurso de marca" },
      { status: 502 },
    );
  }
}
