import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { communityWindow, campaignPhase, campaignPercent, communityCampaignId, emptyCampaign } from "../functions/community-progress.mjs";
import { paymentContribution } from "../functions/community-store.mjs";
import { validSquareSignature, processSquareEvent } from "../functions/square-webhook.mjs";
import { loadCommunityProgress } from "../functions/square.mjs";
import { communityEnvironment, environment } from "./square-fixtures.mjs";

const settings = { communities: ["Northgate"], startTime: "19:00", endTime: "20:00" };
export const window = { startAt: "2026-09-27T02:00:00.000Z", endAt: "2026-09-27T03:00:00.000Z" };
export const campaign = emptyCampaign("test-campaign", "Northgate", window, "sandbox");
export const money = amount => ({ amount, currency: "USD" });
export const paid = { id: "payment-1", location_id: "test-location", order_id: "order-1", status: "COMPLETED", total_money: money(5500), updated_at: "2026-09-27T02:30:01Z", card_details: { card_payment_timeline: { captured_at: "2026-09-27T02:30:00Z" } } };
export const order = { id: "order-1", location_id: "test-location", state: "OPEN", version: 2, total_money: money(5500), line_items: [{ total_money: money(5500), total_tax_money: money(500) }] };
const completed = "2026-09-27T02:30:00Z";

test("countdown starts 10 minutes before the Phoenix window; end is exclusive", () => {
  assert.deepEqual(communityWindow(settings, new Date("2026-09-27T01:50:00Z")), window);
  assert.notDeepEqual(communityWindow(settings, new Date("2026-09-27T01:49:59Z")), window);
  assert.equal(campaignPhase(campaign, Date.parse("2026-09-27T01:55:00Z")), "countdown");
  assert.equal(campaignPhase(campaign, Date.parse(window.startAt)), "collecting");
  assert.equal(campaignPhase(campaign, Date.parse(window.endAt)), "settling");
  assert.equal(campaignPhase(campaign, Date.parse(window.endAt) + 120000), "fallback");
  assert.equal(campaignPhase({ ...campaign, qualifiedAt: completed }, Date.parse(window.endAt)), "confirmed");
  assert.equal(communityWindow(settings, new Date("2026-09-28T01:50:00Z")).startAt, "2026-09-28T02:00:00.000Z");
});
test("overnight windows remain attached to their starting Phoenix day", () => {
  const overnight = { ...settings, startTime: "23:00", endTime: "01:00" };
  assert.deepEqual(communityWindow(overnight, new Date("2026-09-27T07:30:00Z")), { startAt: "2026-09-27T06:00:00.000Z", endAt: "2026-09-27T08:00:00.000Z" });
});
test("one bar uses the closer goal and either minimum qualifies", () => {
  assert.equal(campaignPercent({ ...campaign, paidOrders: 3, foodSubtotal: 3800 }), 76);
  assert.equal(campaignPercent({ ...campaign, paidOrders: 5 }), 100);
  assert.equal(campaignPercent({ ...campaign, foodSubtotal: 5000 }), 100);
  assert.equal(campaignPercent({ ...campaign, qualifiedAt: completed }), 100);
});
test("campaign IDs isolate communities, windows, locations and Sandbox/production", async () => {
  const id = await communityCampaignId("sandbox", "location", "Northgate", window);
  assert.equal(id, await communityCampaignId("sandbox", "location", "NORTHGATE", window));
  for (const args of [["production", "location", "Northgate", window], ["sandbox", "other", "Northgate", window], ["sandbox", "location", "Westgate", window], ["sandbox", "location", "Northgate", { ...window, endAt: completed }]]) assert.notEqual(id, await communityCampaignId(...args));
});
test("only completed fully paid orders in the window count; exclude tax, tip, fees and refunds", () => {
  assert.deepEqual(paymentContribution(paid, order, campaign, completed), { paidOrders: 1, foodSubtotal: 5000, late: false });
  for (const status of ["PENDING", "APPROVED", "FAILED", "CANCELED"]) assert.equal(paymentContribution({ ...paid, status }, order, campaign, completed).paidOrders, 0);
  assert.equal(paymentContribution(paid, { ...order, state: "CANCELED" }, campaign, completed).paidOrders, 0);
  assert.equal(paymentContribution(paid, order, campaign, window.endAt).late, true);
  assert.equal(paymentContribution(paid, order, campaign, null).paidOrders, 0);
  assert.equal(paymentContribution({ ...paid, total_money: money(1000) }, order, campaign, completed).paidOrders, 0);
  assert.equal(paymentContribution({ ...paid, refunded_money: money(5500) }, order, campaign, completed).paidOrders, 0);
  assert.equal(paymentContribution({ ...paid, refunded_money: money(1000) }, order, campaign, completed).foodSubtotal, 4000);
  assert.equal(paymentContribution({ ...paid, total_money: money(6500) }, { ...order, line_items: [{ total_money: money(5500), total_tax_money: money(500), total_service_charge_money: money(300) }] }, campaign, completed).foodSubtotal, 4700);
});
test("signature covers raw bytes and exact notification URL", () => {
  const raw = Buffer.from('{"type":"payment.updated"}'), key = "test-secret", url = "https://example.test/webhook";
  const signature = createHmac("sha256", key).update(url).update(raw).digest("base64");
  assert.equal(validSquareSignature(raw, signature, key, url), true);
  for (const args of [[Buffer.from("{}"), signature, key, url], [raw, signature, key, `${url}/`], [raw, "invalid", key, url], [raw, signature, "", url]]) assert.equal(validSquareSignature(...args), false);
});
test("webhooks re-fetch authoritative Square payment/order and ignore other locations/untracked orders", async () => {
  let updates = 0, tracked = true, payment = paid;
  const store = { getTrackedOrder: async () => tracked ? {} : null, recordPayment: async (id, p, o, time) => { updates++; assert.equal(id, order.id); assert.equal(p.status, "COMPLETED"); assert.equal(o.version, 2); assert.equal(time, completed); } };
  const fetcher = async url => Response.json(url.includes("/payments/") ? { payment } : { order });
  const event = { type: "payment.updated", created_at: completed, data: { object: { payment: { id: paid.id, status: "FAILED" } } } };
  await processSquareEvent(event, environment, store, fetcher); assert.equal(updates, 1);
  tracked = false; await processSquareEvent(event, environment, store, fetcher); assert.equal(updates, 1);
  tracked = true; payment = { ...paid, location_id: "other" }; await processSquareEvent(event, environment, store, fetcher); assert.equal(updates, 1);
  await assert.rejects(processSquareEvent(event, environment, store, async () => new Response("failure", { status: 503 })));
});
test("refund notifications also reconcile the current payment", async () => {
  let called = false;
  await processSquareEvent({ type: "refund.updated", data: { object: { refund: { payment_id: paid.id } } } }, environment, { getTrackedOrder: async () => ({}), recordPayment: async () => { called = true; } }, async url => Response.json(url.includes("/payments/") ? { payment: paid } : { order }));
  assert.equal(called, true);
});
test("order updates reconcile cancellations and stale provider reads request a retry", async () => {
  let updates = 0;
  const store = { getTrackedOrder: async () => ({ paymentId: paid.id }), recordPayment: async (_id, _p, o) => { assert.equal(o.state, "CANCELED"); updates++; } };
  const event = { type: "order.updated", data: { object: { order_updated: { order_id: order.id, location_id: order.location_id, version: 3 } } } };
  const fetcher = async url => Response.json(url.includes("/payments/") ? { payment: paid } : { order: { ...order, version: 3, state: "CANCELED" } });
  await processSquareEvent(event, environment, store, fetcher); assert.equal(updates, 1);
  event.data.object.order_updated.version = 4;
  await assert.rejects(processSquareEvent(event, environment, store, fetcher), /behind event/);
  await assert.rejects(processSquareEvent({ type: "refund.updated", data: { object: { refund: { payment_id: paid.id, status: "COMPLETED", amount_money: money(500) } } } }, environment, store, fetcher), /not reflected/);
});
test("legacy progress endpoint is retired without exposing old campaign totals", async () => {
  const data = await loadCommunityProgress(communityEnvironment, new Date(completed));
  assert.equal(data.enabled, false); assert.deepEqual(data.campaigns, []);
  assert.match(data.message, /no longer has a minimum/);
});
