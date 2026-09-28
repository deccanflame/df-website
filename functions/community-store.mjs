import { createHash } from "node:crypto";
import { COMMUNITY_ORDER_TARGET, COMMUNITY_AMOUNT_TARGET } from "./community-progress.mjs";

export const campaignCollection = "communityCampaigns";
export const ledgerCollection = "_communityOrders";
const orderKey = (environment, orderId) => createHash("sha256").update(`${environment}:${orderId}`).digest("hex");

export function communityStore(db, environment, locationId) {
  return {
    async readCampaigns(campaigns) {
      if (!campaigns.length) return [];
      const snapshots = await db.getAll(...campaigns.map(c => db.collection(campaignCollection).doc(c.id)));
      return campaigns.map((c, i) => snapshots[i].exists ? { ...c, ...snapshots[i].data() } : c);
    },
    async recordCheckout(orderId, campaign, submittedAt) {
      if (typeof orderId !== "string" || !orderId || orderId.length > 192) throw new Error("Missing Square order ID");
      const orderRef = db.collection(ledgerCollection).doc(orderKey(environment, orderId));
      const campaignRef = db.collection(campaignCollection).doc(campaign.id);
      await db.runTransaction(async tx => {
        const [order, existing] = await Promise.all([tx.get(orderRef), tx.get(campaignRef)]);
        if (!existing.exists) tx.set(campaignRef, campaign);
        if (!order.exists) tx.set(orderRef, { orderId, campaignId: campaign.id, environment, locationId, submittedAt, termsVersion: "community-minimum-v1", paidOrders: 0, foodSubtotal: 0, paymentVersion: "", orderVersion: 0 });
      });
    },
    async getTrackedOrder(orderId) {
      return (await db.collection(ledgerCollection).doc(orderKey(environment, orderId)).get()).data();
    },
    async recordPayment(orderId, payment, order, completedAt) {
      const orderRef = db.collection(ledgerCollection).doc(orderKey(environment, orderId));
      await db.runTransaction(async tx => {
        const prior = (await tx.get(orderRef)).data();
        if (!prior || prior.locationId !== locationId) return;
        const campaignRef = db.collection(campaignCollection).doc(prior.campaignId);
        const campaign = (await tx.get(campaignRef)).data();
        if (!campaign) throw new Error("Missing campaign");
        const version = payment.updated_at;
        // Re-fetching Square plus monotonic versions prevents replay/out-of-order regression.
        if (!version || (prior.paymentVersion && Date.parse(version) < Date.parse(prior.paymentVersion)) || (order.version || 0) < prior.orderVersion) return;
        if (prior.paymentId && prior.paymentId !== payment.id) throw new Error("Multiple payments require manual reconciliation");
        const times = [prior.completedAt, completedAt].filter(value => Number.isFinite(Date.parse(value || ""))).map(value => Date.parse(value));
        const earliest = times.length ? new Date(Math.min(...times)).toISOString() : null;
        const next = paymentContribution(payment, order, campaign, earliest);
        const paidOrders = Math.max(0, campaign.paidOrders + next.paidOrders - prior.paidOrders);
        const foodSubtotal = Math.max(0, campaign.foodSubtotal + next.foodSubtotal - prior.foodSubtotal);
        const now = new Date().toISOString();
        const qualifiedAt = campaign.qualifiedAt || (paidOrders >= COMMUNITY_ORDER_TARGET || foodSubtotal >= COMMUNITY_AMOUNT_TARGET ? now : null);
        tx.set(orderRef, { ...prior, ...next, completedAt: earliest, paymentId: payment.id, paymentVersion: version, orderVersion: order.version || 0, updatedAt: now });
        tx.update(campaignRef, { paidOrders, foodSubtotal, qualifiedAt, updatedAt: now });
      });
    },
  };
}

export function paymentContribution(payment, order, campaign, completedAt) {
  const result = { paidOrders: 0, foodSubtotal: 0, late: false };
  if (payment.status !== "COMPLETED" || order.state === "CANCELED") return result;
  const paidAt = Date.parse(completedAt || "");
  if (!Number.isFinite(paidAt)) return result;
  if (paidAt < Date.parse(campaign.startAt) || paidAt >= Date.parse(campaign.endAt)) return { ...result, late: true };
  const money = value => value?.currency === "USD" && Number.isSafeInteger(value.amount) && value.amount >= 0 ? value.amount : null;
  const total = money(payment.total_money), due = money(order.total_money);
  if (total === null || due === null || total < due || total <= 0) return result;
  const refunded = payment.refunded_money ? money(payment.refunded_money) : 0;
  if (refunded === null || refunded >= total) return result;
  if (!Array.isArray(order.line_items) || !order.line_items.length) return result;
  let food = 0;
  for (const item of order.line_items) {
    const gross = money(item.total_money), tax = money(item.total_tax_money), fees = item.total_service_charge_money ? money(item.total_service_charge_money) : 0;
    if (gross === null || tax === null || fees === null) return result;
    food += Math.max(0, gross - tax - fees);
  }
  // Amount-only refunds cannot identify food vs tax/tip: subtract the full refund
  // conservatively. A confirmed campaign never loses its delivery commitment.
  return { paidOrders: 1, foodSubtotal: Math.max(0, food - refunded), late: false };
}
