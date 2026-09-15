import "server-only";
import { NextResponse } from "next/server";
import { authorizeAgency } from "@/lib/admin/authorize";
import {
  buildAgencyOverview,
  createPeriod,
  shiftDay,
  type AgencyData,
  type DataRow,
} from "@/lib/admin/overview";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });

export async function GET(request: Request) {
  try {
    const access = await authorizeAgency(request);
    if (access.error) return json({ error: access.error }, access.status);
    const admin = access.admin;
    const days = Number(new URL(request.url).searchParams.get("days") || 30);
    if (![7, 30, 90].includes(days))
      return json({ error: "INVALID_PERIOD" }, 400);
    const period = createPeriod(days);
    const since = `${shiftDay(period.previousStart, -2)}T00:00:00Z`;
    const data: AgencyData = {};
    type Source = {
      key: string;
      table: string;
      columns: string;
      order?: string;
      since?: string;
      or?: string;
      open?: boolean;
    };
    const sources: Source[] = [
      {
        key: "restaurants",
        table: "restaurantes",
        columns:
          "id,nombre,telefono,direccion,capacidad_total,google_review_url",
      },
      {
        key: "modules",
        table: "restaurante_modulos",
        columns:
          "restaurante_id,plan,estado,reservas,clientes,resenas,chatbot,camarero_digital,menu_digital,fidelizacion,automatizaciones",
        order: "restaurante_id",
      },
      {
        key: "webs",
        table: "restaurante_webs",
        columns:
          "restaurante_id,es_demo,titular_legal,nif_cif,domicilio_legal,email_legal",
        order: "restaurante_id",
      },
      {
        key: "opinionConfig",
        table: "opinion_config",
        columns: "restaurante_id,slug,active,google_review_url,aspect_labels",
        order: "restaurante_id",
      },
      {
        key: "channels",
        table: "whatsapp_channels",
        columns:
          "restaurante_id,status,enabled,chatbot_enabled,reviews_enabled",
        order: "restaurante_id",
      },
      {
        key: "routes",
        table: "whatsapp_restaurant_routes",
        columns: "restaurante_id,enabled,delivery_mode",
        order: "restaurante_id",
      },
      {
        key: "automation",
        table: "automatizaciones_config",
        columns:
          "restaurante_id,enabled,review_enabled,delivery_mode,whatsapp_enabled,email_enabled",
        order: "restaurante_id",
      },
      {
        key: "bookingConfig",
        table: "reservas_config",
        columns: "restaurante_id,activo",
        order: "restaurante_id",
      },
      {
        key: "hours",
        table: "reservas_horarios",
        columns: "id,restaurante_id,activo",
      },
      {
        key: "access",
        table: "usuarios_restaurantes",
        columns: "id,restaurante_id",
      },
      {
        key: "opinionAccess",
        table: "opinion_usuarios_restaurantes",
        columns: "restaurante_id,user_id,active",
        order: "user_id",
      },
      {
        key: "invitations",
        table: "restaurant_invitations",
        columns: "id,restaurante_id,status",
      },
      {
        key: "menus",
        table: "cartas_digitales",
        columns: "id,restaurante_id,estado",
      },
      {
        key: "products",
        table: "carta_productos",
        columns: "id,restaurante_id,activo",
      },
      {
        key: "tables",
        table: "sala_mesas",
        columns: "id,restaurante_id,activa",
      },
      {
        key: "customers",
        table: "clientes",
        columns: "id,restaurante_id,created_at",
        since: "created_at",
      },
      {
        key: "bookings",
        table: "reservas",
        columns:
          "id,restaurante_id,created_at,inicio_at,fecha_hora_reserva,estado,atendida",
        or: `inicio_at.gte.${since},fecha_hora_reserva.gte.${since.slice(0, 10)}`,
      },
      {
        key: "opinions",
        table: "opiniones_qr",
        columns: "id,restaurante_id,rating,created_at,aspectos",
        since: "created_at",
      },
      {
        key: "openOpinions",
        table: "opiniones_qr",
        columns: "id,restaurante_id,seguimiento,resuelto_at",
        open: true,
        or: "rating.lte.3,solicita_contacto.eq.true",
      },
      {
        key: "requests",
        table: "visit_review_requests",
        columns:
          "id,restaurante_id,status,created_at,sent_at,google_opened_at,confirmed_at",
        or: `created_at.gte.${since},sent_at.gte.${since},confirmed_at.gte.${since},and(confirmed_at.is.null,sent_at.not.is.null),and(confirmed_at.is.null,google_opened_at.not.is.null),status.eq.failed`,
      },
      {
        key: "payments",
        table: "cierres_mesa_qr",
        columns: "id,restaurante_id,total_cobrado,creado_en",
        since: "creado_en",
      },
    ];
    // Fetch complete pages with stable ordering. Never turn missing/failed data into zero metrics.
    async function load(source: Source) {
      const rows: DataRow[] = [];
      for (let offset = 0; offset < 50_000; offset += 1000) {
        let query = admin
          .from(source.table)
          .select(source.columns)
          .order(source.order || "id");
        if (source.order === "user_id") query = query.order("restaurante_id");
        if (source.since) query = query.gte(source.since, since);
        if (source.or) query = query.or(source.or);
        if (source.open)
          query = query.is("resuelto_at", null).neq("seguimiento", "resuelto");
        const result = await query.range(offset, offset + 999);
        if (result.error)
          throw new Error(`SOURCE_FAILED:${source.key}:${result.error.code}`);
        const page = result.data as unknown as DataRow[];
        rows.push(...page);
        if (page.length < 1000) {
          data[source.key] = rows;
          return;
        }
      }
      throw new Error(`SOURCE_TOO_LARGE:${source.key}`);
    }
    // Limit fan-out to avoid a large burst of simultaneous database requests.
    for (let i = 0; i < sources.length; i += 5)
      await Promise.all(sources.slice(i, i + 5).map(load));
    return json(buildAgencyOverview(data, period));
  } catch (error) {
    console.error(
      "agency overview",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "OVERVIEW_UNAVAILABLE" }, 503);
  }
}
