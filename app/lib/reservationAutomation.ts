import "server-only";

const DEFAULT_NATIVE_BOOKING_WEBHOOK =
  "https://n8n.gastrohelp.es/webhook/gh-reservas-a291d7ee7e9d54e53d761579aba8735ab99410b8694426e8";

export async function notifyReservationAutomation(
  payload: Record<string, unknown>,
) {
  const webhook =
    process.env.N8N_NATIVE_BOOKING_WEBHOOK_URL || DEFAULT_NATIVE_BOOKING_WEBHOOK;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("La automatización de reserva respondió con", response.status);
    }
  } catch (error) {
    console.error("No se ha podido avisar a la automatización de reserva", error);
  } finally {
    clearTimeout(timeout);
  }
}
