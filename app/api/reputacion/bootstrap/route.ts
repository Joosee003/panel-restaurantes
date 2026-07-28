import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SETUP_KEY = "rep-7f4a9c2d6e81";
const EMAIL = "reputacion@gastrohelp.es";
const PASSWORD = "Hispanos#2026!";
const RESTAURANT_ID = "364525c0-27f6-4b99-bd0a-82a2b1b6b02a";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== SETUP_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Falta la clave de servicio de Supabase en Vercel" },
      { status: 500 },
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usersData, error: listError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  let user = usersData.users.find(
    (item) => item.email?.toLowerCase() === EMAIL,
  );

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nombre: "Hispanos Grill", acceso: "reputacion" },
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "No se pudo crear el usuario" },
        { status: 500 },
      );
    }
    user = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { error: accessError } = await supabase
    .from("opinion_usuarios_restaurantes")
    .upsert(
      {
        user_id: user.id,
        restaurante_id: RESTAURANT_ID,
        role: "restaurante",
        active: true,
      },
      { onConflict: "user_id,restaurante_id" },
    );

  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/reputacion/acceso?preparado=1", request.url));
}
