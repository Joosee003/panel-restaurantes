import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAgency } from "@/lib/admin/authorize";
import { deliverInvitation } from "@/lib/admin/invitations";
export const runtime = "nodejs";
export const maxDuration = 60;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "no-store, private"}});
export async function POST(request: NextRequest) {
  try {
    const access = await authorizeAgency(request);
    if (access.error) return json({error: access.error}, access.status);
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 2048) return json({error: "INVALID_INPUT"}, 413);
    const input = JSON.parse(body);
    if (!input || typeof input.restaurante_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.restaurante_id))
      return json({error: "INVALID_INPUT"}, 400);
    const status = await deliverInvitation(access.admin, access.user.id, input.restaurante_id, true);
    return json({ok: true, invitation_status: status});
  } catch (error) {
    return json({error: error instanceof SyntaxError ? "INVALID_INPUT" : "INVITATION_UNAVAILABLE"}, error instanceof SyntaxError ? 400 : 503);
  }
}
