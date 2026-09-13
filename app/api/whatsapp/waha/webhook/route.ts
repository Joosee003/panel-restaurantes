import { NextRequest, NextResponse } from "next/server";
import { normalizeWahaEvent, verifyWahaSignature } from "@/lib/whatsapp/waha-contract.mjs";
import { handleWahaEvent } from "@/lib/whatsapp/waha-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(status: string, code = 200) {
  return NextResponse.json({ ok: code < 400, status }, { status: code, headers: { "Cache-Control": "private, no-store" } });
}

// Only the provider's signed session identifies the restaurant. Neither a
// restaurant ID nor a phone number supplied in arbitrary text authorizes access.
export async function POST(request: NextRequest) {
  const secret = process.env.WAHA_WEBHOOK_SECRET;
  if (!secret) return json("CONNECTION_NOT_CONFIGURED", 503);
  if (Number(request.headers.get("content-length") || 0) > 131_072) return json("PAYLOAD_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 131_072) { await reader.cancel(); return json("PAYLOAD_TOO_LARGE", 413); }
        chunks.push(chunk.value);
      }
    }
  } catch { return json("INVALID_EVENT", 400); }
  const raw = Buffer.concat(chunks);
  if (!verifyWahaSignature(raw, request.headers, secret)) return json("FORBIDDEN", 403);
  let input: unknown;
  try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); } catch { return json("INVALID_EVENT", 400); }
  const event = normalizeWahaEvent(input);
  if (event.kind === "ignore") return json("IGNORED");
  return handleWahaEvent(event);
}
