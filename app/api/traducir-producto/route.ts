import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "La traducción automática está desactivada. Edita las traducciones manualmente desde el panel de productos.",
    },
    { status: 410 }
  );
}
