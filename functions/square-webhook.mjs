import { createHmac, timingSafeEqual } from "node:crypto";

export function validSquareSignature(rawBody, signature, key, url) {
  if (!key || !url?.startsWith("https://") || typeof signature !== "string") return false;
  const expected = createHmac("sha256", key).update(url).update(rawBody).digest("base64");
  const supplied = Buffer.from(signature);
  return supplied.length === expected.length && timingSafeEqual(supplied, Buffer.from(expected));
}

// This handler runs only after authenticating the exact raw request body.
export async function processSquareEvent(event, env, store, fetcher = fetch) {
  if (!["payment.created", "payment.updated", "refund.created", "refund.updated", "order.updated"].includes(event?.type)) return;
  const object = event.data?.object;
  let paymentId = event.type.startsWith("refund.") ? object?.refund?.payment_id : object?.payment?.id;
  if (event.type === "order.updated") {
    const update = object?.order_updated;
    if (update?.location_id !== env.SQUARE_LOCATION_ID || typeof update?.order_id !== "string" || update.order_id.length > 192) return;
    paymentId = (await store.getTrackedOrder(update.order_id))?.paymentId;
  }
  if (!paymentId || typeof paymentId !== "string" || paymentId.length > 192) return;
  const base = env.SQUARE_ENVIRONMENT === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
  async function get(path) {
    const response = await fetcher(`${base}/v2${path}`, { headers: { Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "Square-Version": "2026-09-16" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Square reconciliation failed");
    return response.json();
  }
  const { payment } = await get(`/payments/${encodeURIComponent(paymentId)}`);
  if (!payment?.order_id || payment.location_id !== env.SQUARE_LOCATION_ID || payment.id !== paymentId) return;
  if (Date.parse(object?.payment?.updated_at || "") > Date.parse(payment.updated_at || "")) throw new Error("Payment read is behind event");
  if (object?.refund?.status === "COMPLETED" && (payment.refunded_money?.amount || 0) < (object.refund.amount_money?.amount || 0)) throw new Error("Refund is not reflected yet");
  const tracked = await store.getTrackedOrder(payment.order_id);
  if (!tracked) return; // Never count unrelated POS/pickup orders or someone else's catalog.
  const { order } = await get(`/orders/${encodeURIComponent(payment.order_id)}`);
  if (order?.id !== payment.order_id || order.location_id !== env.SQUARE_LOCATION_ID) return;
  if ((object?.order_updated?.version || 0) > (order.version || 0)) throw new Error("Order read is behind event");
  let completedAt = payment.card_details?.card_payment_timeline?.captured_at || null;
  if (!completedAt && event.type.startsWith("payment.") && object?.payment?.status === "COMPLETED") completedAt = event.created_at;
  if (completedAt && !Number.isFinite(Date.parse(completedAt))) throw new Error("Invalid payment completion timestamp");
  await store.recordPayment(order.id, payment, order, completedAt);
}
