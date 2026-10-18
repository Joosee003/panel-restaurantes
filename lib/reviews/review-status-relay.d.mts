export type ReviewProviderStatus = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  at: string;
};

export function parseSignedReviewStatuses(
  raw: Uint8Array,
  headers: Headers | Record<string, string | null | undefined>,
  secret: string,
  allowedPhoneIds: string,
  now?: number,
): ReviewProviderStatus[] | null;

export function parseAuthenticatedReviewStatuses(
  raw: Uint8Array,
  headers: Headers | Record<string, string | null | undefined>,
  secret: string,
  allowedPhoneIds: string,
  now?: number,
): ReviewProviderStatus[] | null;
