import "server-only";
import { getWalletCapabilities } from "@/lib/wallet/capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  const capabilities = getWalletCapabilities();
  return Response.json({
    apple: { ready: capabilities.apple.ready, supportsUpdates: capabilities.apple.supportsUpdates },
    google: { ready: capabilities.google.ready, supportsUpdates: capabilities.google.supportsUpdates },
  }, { headers: { "cache-control": "no-store" } });
}
