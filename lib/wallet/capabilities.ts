import "server-only";
import type { WalletCapabilities } from "./types";

function missing(names: string[]) {
  return names.filter((name) => !String(process.env[name] ?? "").trim());
}

export function getWalletCapabilities(): WalletCapabilities {
  const googleMissing = missing([
    "GOOGLE_WALLET_ISSUER_ID",
    "GOOGLE_WALLET_CLASS_ID",
    "GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_WALLET_PRIVATE_KEY",
    "GOOGLE_WALLET_CONFIGURATION_VERIFIED",
    "NEXT_PUBLIC_SITE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  const appleMissing = missing([
    "APPLE_WALLET_PASS_TYPE_IDENTIFIER",
    "APPLE_WALLET_TEAM_IDENTIFIER",
    "APPLE_WALLET_CERTIFICATE_BASE64",
    "APPLE_WALLET_PRIVATE_KEY_BASE64",
    "APPLE_WALLET_WWDR_CERTIFICATE_BASE64",
    "APPLE_WALLET_APNS_KEY_ID",
    "APPLE_WALLET_APNS_PRIVATE_KEY_BASE64",
  ]);

  return {
    google: {
      ready: googleMissing.length === 0 && process.env.GOOGLE_WALLET_CONFIGURATION_VERIFIED === "1",
      missing: googleMissing,
      // Registration and a transactional outbox are ready; a verified sync
      // processor is still required before claiming automatic pass updates.
      supportsUpdates: false,
    },
    // The adapter contract is present, but pass signing/APNs are deliberately
    // kept disabled until the certified provider is implemented and verified.
    apple: { ready: false, missing: [...appleMissing, "APPLE_WALLET_SIGNER_IMPLEMENTATION"], supportsUpdates: false },
  };
}
