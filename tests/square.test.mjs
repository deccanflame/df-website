import assert from "node:assert/strict";
import test from "node:test";
import { createCheckout, handleOrderingRequest, isLocationOpen, loadMenu } from "../functions/square.mjs";
import { catalogFixture, environment, locationFixture, openTime, orderFixture, squareMock } from "./square-fixtures.mjs";

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
