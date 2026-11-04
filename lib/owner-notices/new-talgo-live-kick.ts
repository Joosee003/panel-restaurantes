import { NEW_TALGO_RESTAURANT_ID } from "./new-talgo-live-claim";
import { dispatchNewTalgoLiveEvents } from "./new-talgo-live-delivery";

// A notification error must not turn a committed booking or cancellation
// into an API error. The private endpoint can retry queued events separately.
export async function kickNewTalgoLiveDispatch(restaurantId: string | null) {
  if (restaurantId !== NEW_TALGO_RESTAURANT_ID ||
      process.env.GASTROHELP_DEPLOYMENT_MODE !== "approved-production") return;
  try {
    await dispatchNewTalgoLiveEvents();
  } catch {
    console.error("New Talgo live dispatch failed after reservation write");
  }
}

