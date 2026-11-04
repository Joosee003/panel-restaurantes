import { NEW_TALGO_RESTAURANT_ID } from "./new-talgo-live-claim";

// Called only after a successful New Talgo reservation write. Notification
// failure must never turn a committed booking or cancellation into an API error.
export async function kickNewTalgoLiveDispatch(restaurantId: string | null) {
  if (restaurantId !== NEW_TALGO_RESTAURANT_ID ||
      process.env.GASTROHELP_DEPLOYMENT_MODE !== "approved-production") return;

  const secret = process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET?.trim() || "";
  const deploymentHost = process.env.VERCEL_URL?.trim().toLowerCase() || "";
  if (secret.length < 32 || !/^[a-z0-9-]+\.vercel\.app$/.test(deploymentHost)) {
    console.error("New Talgo live dispatch is not configured");
    return;
  }

  try {
    const response = await fetch(`https://${deploymentHost}/api/private/new-talgo/live-dispatch`, {
      method: "POST",
      headers: { "x-new-talgo-dispatch-secret": secret },
      body: "{}",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) console.error("New Talgo live dispatch failed", response.status);
  } catch {
    console.error("New Talgo live dispatch request failed");
  }
}

