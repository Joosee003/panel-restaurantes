import "server-only";
import { createSign } from "node:crypto";
import { getWalletCapabilities } from "./capabilities";
import type { WalletMemberContext } from "./types";

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function normalizedColour(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#B45309";
}

export function buildGoogleWalletSaveUrl(context: WalletMemberContext) {
  if (!getWalletCapabilities().google.ready) throw new Error("GOOGLE_WALLET_NOT_CONFIGURED");
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!;
  const classId = process.env.GOOGLE_WALLET_CLASS_ID!;
  const email = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL!;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const origin = process.env.NEXT_PUBLIC_SITE_URL!.replace(/\/$/, "");
  const now = Math.floor(Date.now() / 1000);
  const objectId = googleWalletObjectId(context, issuerId);
  const payload = {
    iss: email,
    aud: "google",
    typ: "savetowallet",
    iat: now,
    exp: now + 300,
    origins: [origin],
    payload: {
      loyaltyObjects: [{
        id: objectId,
        classId: classId.includes(".") ? classId : `${issuerId}.${classId}`,
        state: "ACTIVE",
        accountId: context.customerId,
        accountName: context.customerName || "Miembro del club",
        hexBackgroundColor: normalizedColour(context.accent),
        loyaltyPoints: { label: "Puntos", balance: { int: Math.max(0, Math.trunc(context.points)) } },
        barcode: { type: "QR_CODE", value: `ghm_${context.memberCode}`, alternateText: "Identificador de miembro" },
        textModulesData: [
          { id: "visits", header: "Visitas", body: String(Math.max(0, Math.trunc(context.visits))) },
          { id: "restaurant", header: "Tu restaurante", body: context.restaurantName },
        ],
      }],
    },
  };
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${encode(JSON.stringify(header))}.${encode(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  return `https://pay.google.com/gp/v/save/${unsigned}.${encode(signature)}`;
}

export function googleWalletObjectId(context: WalletMemberContext, issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || "") {
  if (!issuerId) throw new Error("GOOGLE_WALLET_NOT_CONFIGURED");
  return `${issuerId}.${context.memberCode.replace(/-/g, "")}`;
}
