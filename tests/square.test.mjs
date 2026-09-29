import assert from "node:assert/strict";
import test from "node:test";
import { createCheckout, handleOrderingRequest, isLocationOpen, loadMenu } from "../functions/square.mjs";
import { isCommunityDeliveryWindow, validateDeliverySettings, readPublicDeliverySettings } from "../functions/community-delivery.mjs";
import { catalogFixture, environment, communityEnvironment, locationFixture, openTime, orderFixture, squareMock } from "./square-fixtures.mjs";


test("loads every catalog page, category, image and required option", async () => {
  const mock = squareMock({ paginated: true });
  const menu = await loadMenu(environment, mock.fetcher, openTime);
  assert.equal(menu.items[0].name, "Chicken Dum Biryani");
  assert.equal(menu.items[0].category, "Biryani");
  assert.equal(menu.items[0].modifierGroups[0].min, 1);
  assert.equal(menu.items[0].variations[0].price, 1399);
  assert.equal(menu.acceptingOrders, true);
  assert.equal(menu.sandbox, true);
  assert.equal(mock.calls.filter(call => call.url.includes("/catalog/list")).length, 2);
  assert.ok(mock.calls.every(call => call.url.startsWith("https://connect.squareupsandbox.com/")));
  assert.ok(!JSON.stringify(menu).includes(environment.SQUARE_ACCESS_TOKEN));
});

test("uses location prices, tracks stock and respects manually sold-out items", async () => {
  const objects = catalogFixture();
  objects[3].item_data.variations[0].item_variation_data.location_overrides = [{ location_id: "test-location", price_money: { amount: 1599, currency: "USD" }, track_inventory: true, sold_out: true }];
  const mock = squareMock({ objects, counts: [{ catalog_object_id: "regular", quantity: "3" }] });
  const menu = await loadMenu(environment, mock.fetcher, openTime);
  assert.deepEqual(menu.items[0].variations[0], { id: "regular", name: "Regular", price: 1599, available: false, trackInventory: true, stock: 3 });
});

test("filters archived, absent and out-of-scope dishes", async () => {
  const objects = catalogFixture();
  const archived = structuredClone(objects[3]); archived.id = "archived"; archived.item_data.is_archived = true;
  const absent = structuredClone(objects[3]); absent.id = "absent"; absent.absent_at_location_ids = ["test-location"];
  objects.push(archived, absent);
  assert.equal((await loadMenu(environment, squareMock({ objects }).fetcher, openTime)).items.length, 1);
  assert.equal((await loadMenu({ ...environment, SQUARE_MENU_CATEGORY_IDS: "other" }, squareMock().fetcher, openTime)).items.length, 0);
});

test("hidden modifiers cannot be ordered and item limits override inherited ones", async () => {
  const objects = catalogFixture();
  objects[2].modifier_list_data.modifiers[1].modifier_data.hidden_online = true;
  const menu = await loadMenu(environment, squareMock({ objects }).fetcher, openTime);
  assert.deepEqual(menu.items[0].modifierGroups[0].options.map(option => option.id), ["mild"]);
  await assert.rejects(createCheckout(environment, orderFixture(), squareMock({ objects }).fetcher, openTime), /option is no longer available/);
});

test("checkout sends only authoritative catalog IDs, pickup details and Square tax rules", async () => {
  const mock = squareMock();
  const order = orderFixture(); order.items[0].price = 1; order.total = 1; order.locationId = "attacker-location";
  const result = await createCheckout(environment, order, mock.fetcher, openTime);
  assert.equal(result.url, "https://sandbox.square.link/u/test-checkout");
  const request = mock.calls.at(-1).body;
  assert.deepEqual(request.order.line_items, [{ catalog_object_id: "regular", quantity: "2", modifiers: [{ catalog_object_id: "hot" }] }]);
  assert.equal(request.order.location_id, "test-location");
  assert.equal(request.order.fulfillments[0].type, "PICKUP");
  assert.equal(request.order.fulfillments[0].pickup_details.recipient.phone_number, "+14805550123");
  assert.equal(request.order.fulfillments[0].pickup_details.prep_time_duration, "PT25M");
  assert.equal(request.order.pricing_options.auto_apply_taxes, true);
  assert.equal(request.checkout_options.redirect_url, undefined);
});

test("pickup checkout supplies contact details only through the fulfillment", async () => {
  const mock = squareMock();
  const order = orderFixture();
  await createCheckout(environment, order, mock.fetcher, openTime);
  const request = mock.calls.at(-1).body;
  assert.equal(request.pre_populated_data, undefined, "Square rejects pre_populated_data together with a fulfillment");
  assert.deepEqual(request.order.fulfillments[0].pickup_details.recipient, {
    display_name: order.customer.name.trim(),
    email_address: order.customer.email.trim(),
    phone_number: "+14805550123",
  });
});

for (const [time, active] of [
  ["2026-09-26T20:59:59.999Z", false],
  ["2026-09-26T21:00:00.000Z", true],
  ["2026-09-27T01:29:59.999Z", true],
  ["2026-09-27T01:30:00.000Z", false],
  ["2026-01-26T21:00:00.000Z", true],
]) test(`community orders at ${time}: ${active}`, async () => {
  const mock = squareMock(), now = new Date(time);
  const body = { ...orderFixture(), orderType: "community_delivery", community: "Northgate" };
  if (!active) {
    await assert.rejects(createCheckout(environment, body, mock.fetcher, now), e => e.status === 409 && /2–6:30/.test(e.message));
    assert.equal(mock.calls.some(c => c.url.includes("payment-links")), false);
    return;
  }
  await createCheckout(environment, body, mock.fetcher, now);
  const request = mock.calls.at(-1).body, fulfillment = request.order.fulfillments[0];
  assert.equal(fulfillment.type, "PICKUP");
  assert.equal(fulfillment.pickup_details.recipient.display_name, "Test Customer - Northgate");
  assert.equal(fulfillment.pickup_details.schedule_type, "SCHEDULED");
  assert.equal(fulfillment.pickup_details.pickup_window_duration, "PT1H");
  assert.equal(fulfillment.pickup_details.pickup_at, new Date(Date.parse(now.toISOString().slice(0,10)+"T00:00:00Z") + (time.includes("01:") ? 2 : 26)*3600000).toISOString());
  assert.equal(request.order.service_charges, undefined);
  assert.match(request.payment_note, /No order minimum/);
  assert.match(fulfillment.pickup_details.note, /No cutlery/);
});

test("community delivery has no campaign, payment minimum or terms gate; honors the pause switch", async () => {
  let recorded = false;
  const env = { ...communityEnvironment, recordCommunityCheckout: async () => { recorded = true; } };
  const body = { ...orderFixture(), orderType: "community_delivery", community: "Northgate" };
  await createCheckout(env, body, squareMock().fetcher, new Date("2026-09-26T21:00:00Z"));
  assert.equal(recorded, false);
  await assert.rejects(createCheckout({ ...env, SQUARE_ORDERING_ENABLED: "false" }, body, squareMock().fetcher, new Date("2026-09-26T21:00:00Z")), e => e.status === 409);
});

test("community delivery accepts during its own window even if pickup is closed", async () => {
  const location = locationFixture(); location.business_hours.periods = [];
  const now = new Date("2026-09-26T21:00:00Z"), mock = squareMock({ location });
  const menu = await loadMenu(environment, mock.fetcher, now);
  assert.equal(menu.acceptingOrders, false); assert.equal(menu.communityAcceptingOrders, true);
  await createCheckout(environment, { ...orderFixture(), orderType: "community_delivery", community: "Northgate" }, mock.fetcher, now);
  await assert.rejects(createCheckout(environment, orderFixture(), mock.fetcher, now), e => e.status === 409);
});

test("pickup retains the original name, ASAP preparation and zero delivery fee", async () => {
  const mock = squareMock();
  await createCheckout(environment, { ...orderFixture(), orderType: "pickup", community: "Northgate", deliveryFee: 1 }, mock.fetcher, new Date("2026-09-26T21:00:00Z"));
  const order = mock.calls.at(-1).body.order;
  assert.equal(order.fulfillments[0].pickup_details.recipient.display_name, "Test Customer");
  assert.equal(order.fulfillments[0].pickup_details.schedule_type, "ASAP");
  assert.equal(order.service_charges, undefined);
});

test("community and order type are validated before creating checkout", async () => {
  for (const fields of [{orderType:"community_delivery"}, {orderType:"community_delivery",community:"Forged"}, {orderType:"community_delivery",community:["Northgate"]}, {orderType:"courier"}, {orderType:null}]) {
    const mock = squareMock();
    await assert.rejects(createCheckout(environment, { ...orderFixture(), ...fields }, mock.fetcher, new Date("2026-09-26T21:00:00Z")));
    assert.equal(mock.calls.some(c => c.url.includes("payment-links")), false);
  }
});

test("saved community CRUD is respected, but legacy campaign hours cannot override the new schedule", async () => {
  let settings = { communities: ["Westgate", "Northgate"], startTime: "19:00", endTime: "20:00" };
  const env = { ...environment, readDeliverySettings: async () => settings };
  const now = new Date("2026-09-26T21:00:00Z"), mock = squareMock();
  assert.deepEqual((await loadMenu(env, mock.fetcher, now)).deliverySettings, {...settings,startTime:"14:00",endTime:"18:30"});
  const body = { ...orderFixture(), orderType: "community_delivery", community: "Westgate" };
  await createCheckout(env, body, mock.fetcher, now);
  assert.equal(mock.calls.at(-1).body.order.fulfillments[0].pickup_details.recipient.display_name, "Test Customer - Westgate");
  settings = { ...settings, communities: ["Northgate"] };
  await assert.rejects(createCheckout(env, body, mock.fetcher, now), e => e.status === 409);
});

test("overnight delivery windows use Phoenix minutes with an exclusive end", () => {
  const settings = { communities: ["Northgate"], startTime: "22:30", endTime: "01:15" };
  for (const [time, active] of [["05:29:59", false], ["05:30:00", true], ["07:00:00", true], ["08:14:59", true], ["08:15:00", false]]) {
    assert.equal(isCommunityDeliveryWindow(new Date(`2026-09-27T${time}Z`), settings), active);
  }
  assert.equal(isCommunityDeliveryWindow(new Date("2026-09-27T07:00:00Z"), { ...settings, communities: [] }), false);
});

test("invalid saved settings and unavailable storage fail closed; absent settings keep defaults", async () => {
  for (const settings of [null, {}, { communities: ["Northgate", "northgate"], startTime: "19:00", endTime: "20:00" }, { communities: [5], startTime: "19:00", endTime: "20:00" }, { communities: ["ok"], startTime: "25:00", endTime: "20:00" }, { communities: ["ok"], startTime: "19:00", endTime: "19:00" }]) {
    assert.throws(() => validateDeliverySettings(settings));
    await assert.rejects(loadMenu({ ...environment, readDeliverySettings: async () => settings }, squareMock().fetcher), error => error.status === 503);
  }
  await assert.rejects(loadMenu({ ...environment, readDeliverySettings: async () => { throw new Error("Database down"); } }, squareMock().fetcher), error => error.status === 503);
  assert.deepEqual((await loadMenu({ ...environment, readDeliverySettings: async () => undefined }, squareMock().fetcher, openTime)).deliverySettings.communities, ["Northgate"]);
});

test("local policy reader handles Firestore REST, missing documents and permission failures", async () => {
  const settings = await readPublicDeliverySettings("demo-deccan-flame", async () => Response.json({ fields: { communities: { arrayValue: { values: [{ stringValue: "Westgate" }] } }, startTime: { stringValue: "18:15" }, endTime: { stringValue: "20:30" } } }));
  assert.deepEqual(settings, { communities: ["Westgate"], startTime: "18:15", endTime: "20:30" });
  assert.equal(await readPublicDeliverySettings("demo-deccan-flame", async () => new Response(null, { status: 404 })), undefined);
  await assert.rejects(readPublicDeliverySettings("demo-deccan-flame", async () => new Response(null, { status: 403 })), /could not be loaded/);
});

test("checkout retries use the same idempotency key; changed orders use a different key", async () => {
  const mock = squareMock(); const order = orderFixture();
  await createCheckout(environment, order, mock.fetcher, openTime); const first = mock.calls.at(-1).body.idempotency_key;
  await createCheckout(environment, order, mock.fetcher, openTime); assert.equal(mock.calls.at(-1).body.idempotency_key, first);
  order.items[0].quantity = 1;
  await createCheckout(environment, order, mock.fetcher, openTime); assert.notEqual(mock.calls.at(-1).body.idempotency_key, first);
});

for (const [name, change, pattern] of [
  ["unknown variation", order => { order.items[0].variationId = "forged"; }, /no longer available/],
  ["negative quantity", order => { order.items[0].quantity = -1; }, /quantity/],
  ["fractional quantity", order => { order.items[0].quantity = 1.5; }, /quantity/],
  ["missing required modifier", order => { order.items[0].modifierIds = []; }, /Spice level/],
  ["forged modifier", order => { order.items[0].modifierIds = ["free-food"]; }, /option is no longer available/],
  ["duplicate modifier", order => { order.items[0].modifierIds = ["hot", "hot"]; }, /options/],
  ["too many modifiers", order => { order.items[0].modifierIds = ["hot", "mild"]; }, /Spice level/],
  ["invalid email", order => { order.customer.email = "invalid"; }, /email/],
]) test(`rejects ${name} without creating a Square payment link`, async () => {
  const mock = squareMock(); const order = orderFixture(); change(order);
  await assert.rejects(createCheckout(environment, order, mock.fetcher, openTime), pattern);
  assert.equal(mock.calls.some(call => call.url.includes("/payment-links")), false);
});

test("quantities are aggregated across different modifier combinations", async () => {
  const order = orderFixture(); order.items[0].quantity = 15;
  order.items.push({ variationId: "regular", quantity: 10, modifierIds: ["mild"] });
  await assert.rejects(createCheckout(environment, order, squareMock().fetcher, openTime), /reduce the quantity/);
});

test("checks inventory again before creating checkout", async () => {
  const objects = catalogFixture(); objects[3].item_data.variations[0].item_variation_data.track_inventory = true;
  await assert.rejects(createCheckout(environment, orderFixture(), squareMock({ objects, counts: [{ catalog_object_id: "regular", quantity: "1" }] }).fetcher, openTime), /reduce the quantity/);
});

test("paused, closed and unconfigured ordering fail safely", async () => {
  await assert.rejects(loadMenu({}, squareMock().fetcher), /not available yet/);
  await assert.rejects(createCheckout({ ...environment, SQUARE_ORDERING_ENABLED: "false" }, orderFixture(), squareMock().fetcher, openTime), /paused/);
  await assert.rejects(createCheckout(environment, orderFixture(), squareMock().fetcher, new Date("2026-09-16T10:00:00Z")), /closed/);
  const location = locationFixture(); delete location.business_hours;
  assert.equal((await loadMenu(environment, squareMock({ location }).fetcher, openTime)).acceptingOrders, false);
});

test("location timezone and overnight hours are respected", () => {
  const location = locationFixture(); location.business_hours.periods = [{ day_of_week: "TUE", start_local_time: "18:00:00", end_local_time: "02:00:00" }];
  assert.equal(isLocationOpen(location, new Date("2026-09-16T08:00:00Z")), true);
  assert.equal(isLocationOpen(location, new Date("2026-09-16T10:00:00Z")), false);
});

test("Square weekday codes and all-day hours work at local midnight", () => {
  const location = locationFixture();
  location.timezone = "America/Phoenix";
  location.business_hours.periods = [{ day_of_week: "TUE", start_local_time: "00:00:00", end_local_time: "24:00:00" }];
  assert.equal(isLocationOpen(location, new Date("2026-09-22T06:59:00Z")), false);
  assert.equal(isLocationOpen(location, new Date("2026-09-22T07:00:00Z")), true);
  assert.equal(isLocationOpen(location, new Date("2026-09-23T06:59:00Z")), true);
  assert.equal(isLocationOpen(location, new Date("2026-09-23T07:00:00Z")), false);
});

test("API enforces origin, JSON and size limits, and never exposes provider errors", async () => {
  const mock = squareMock();
  const request = (body, headers = {}) => new Request("http://localhost:3000/api/square/checkout", { method: "POST", headers, body });
  assert.equal((await handleOrderingRequest(request("{}"), environment, mock.fetcher)).status, 403);
  assert.equal((await handleOrderingRequest(request("{}", { origin: "http://localhost:3000" }), environment, mock.fetcher)).status, 415);
  const headers = { origin: "http://localhost:3000", "content-type": "application/json" };
  assert.equal((await handleOrderingRequest(request("{broken", headers), environment, mock.fetcher)).status, 400);
  assert.equal((await handleOrderingRequest(request("x".repeat(16001), headers), environment, mock.fetcher)).status, 413);
  const response = await handleOrderingRequest(new Request("http://localhost:3000/api/square/menu"), environment, squareMock({ failure: 401 }).fetcher);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /PRIVATE|test-token/);
});
