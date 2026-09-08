"use client";

import { supabase } from "../lib/supabaseClient";
import ReviewRequestsPanelView, { type ReviewPanelClient } from "./ReviewRequestsPanelView";

const client: ReviewPanelClient = {
  async rpc(name, args) { return await supabase.rpc(name, args); },
  async channelConfigured(restaurantId) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    const response = await fetch(`/api/reviews/availability?restaurantId=${encodeURIComponent(restaurantId)}`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store",
    });
    if (!response.ok) return false;
    return (await response.json()).configured === true;
  },
};

export default function ReviewRequestsPanel({ restauranteId, dark }: { restauranteId: string; dark: boolean }) {
  return <ReviewRequestsPanelView restauranteId={restauranteId} dark={dark} client={client} />;
}
