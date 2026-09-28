import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createRequire } from "node:module";
import { communityStore } from "../functions/community-store.mjs";
import { emptyCampaign } from "../functions/community-progress.mjs";

// Deliberately refuse any live database. Run only through the demo emulator suite.
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required");
const require = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const app = initializeApp({ projectId: "demo-deccan-flame" }, "community-tests");
const db = getFirestore(app);
after(async () => { await db.terminate(); await deleteApp(app); });
const window = { startAt: "2026-09-27T02:00:00.000Z", endAt: "2026-09-27T03:00:00.000Z" };
const money = amount => ({ amount, currency: "USD" });
const time = "2026-09-27T02:30:00.000Z";
const payment = id => ({ id: `payment-${id}`, status: "COMPLETED", total_money: money(1100), updated_at: time });
const order = { state: "OPEN", version: 1, total_money: money(1100), line_items: [{ total_money: money(1100), total_tax_money: money(100) }] };

test("real transactions deduplicate concurrent webhook replays and preserve a confirmed goal after refunds", async () => {
  const store = communityStore(db, "sandbox", "location");
  const campaign = emptyCampaign("concurrency-test", "Northgate", window, "sandbox");
  await db.collection("communityCampaigns").doc(campaign.id).delete();
  const ids = Array.from({ length: 5 }, (_, i) => `order-${crypto.randomUUID()}-${i}`);
  await Promise.all(ids.map(id => store.recordCheckout(id, campaign, time)));
  await Promise.all(ids.flatMap(id => [store.recordPayment(id, payment(id), order, time), store.recordPayment(id, payment(id), order, time)]));
  let [saved] = await store.readCampaigns([campaign]);
  assert.equal(saved.paidOrders, 5); assert.equal(saved.foodSubtotal, 5000); assert.ok(saved.qualifiedAt);
  const committed = saved.qualifiedAt;
  await store.recordCheckout(ids[0], campaign, time); // checkout retry must not reset payment ledger
  await store.recordPayment(ids[0], { ...payment(ids[0]), refunded_money: money(1100), updated_at: "2026-09-27T02:31:00Z" }, order, time);
  [saved] = await store.readCampaigns([campaign]);
  assert.equal(saved.paidOrders, 4); assert.equal(saved.foodSubtotal, 4000); assert.equal(saved.qualifiedAt, committed);
  await store.recordPayment(ids[0], payment(ids[0]), order, time); // old webhook must not undo refund
  [saved] = await store.readCampaigns([campaign]); assert.equal(saved.paidOrders, 4);
});

test("late, abandoned and failed orders add nothing; communities and environments stay separate", async () => {
  const store = communityStore(db, "sandbox", "location");
  const campaign = emptyCampaign(`late-${crypto.randomUUID()}`, "Westgate", window, "sandbox");
  const id = crypto.randomUUID();
  await store.recordCheckout(id, campaign, time);
  assert.equal((await store.readCampaigns([campaign]))[0].paidOrders, 0);
  await store.recordPayment(id, payment(id), order, window.endAt);
  assert.equal((await store.readCampaigns([campaign]))[0].paidOrders, 0);
  assert.equal((await store.getTrackedOrder(id)).late, true);
  assert.equal(await communityStore(db, "production", "location").getTrackedOrder(id), undefined);
  await store.recordPayment(id, { ...payment(id), status: "FAILED", updated_at: "2026-09-27T03:01:00Z" }, order, null);
  assert.equal((await store.readCampaigns([campaign]))[0].paidOrders, 0);
});

test("$50 qualifies a single paid order and late webhook delivery uses capture time", async () => {
  const store = communityStore(db, "sandbox", "location");
  const campaign = emptyCampaign(`amount-${crypto.randomUUID()}`, "Northgate", window, "sandbox"), id = crypto.randomUUID();
  await store.recordCheckout(id, campaign, time);
  await store.recordPayment(id, { ...payment(id), total_money: money(5500), updated_at: "2026-09-28T01:00:00Z" }, { ...order, total_money: money(5500), line_items: [{ total_money: money(5500), total_tax_money: money(500) }] }, time);
  const [saved] = await store.readCampaigns([campaign]);
  assert.equal(saved.paidOrders, 1); assert.equal(saved.foodSubtotal, 5000); assert.ok(saved.qualifiedAt);
});
