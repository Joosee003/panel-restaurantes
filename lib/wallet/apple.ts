import "server-only";
import type { WalletMemberContext } from "./types";

export type AppleWalletPassIssuer = {
  issue: (context: WalletMemberContext) => Promise<Uint8Array>;
  requestUpdate: (providerObjectId: string) => Promise<void>;
};

/**
 * Contract for the future certified PassKit signer. It intentionally fails
 * closed until signing certificates, WWDR chain and APNs update transport are
 * configured and an implementation has passed QA.
 */
export function getAppleWalletIssuer(): AppleWalletPassIssuer {
  return {
    async issue() {
      throw new Error("APPLE_WALLET_SIGNER_NOT_CONFIGURED");
    },
    async requestUpdate() {
      throw new Error("APPLE_WALLET_UPDATES_NOT_CONFIGURED");
    },
  };
}
