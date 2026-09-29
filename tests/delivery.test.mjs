import assert from "node:assert/strict";
import test from "node:test";
import { quoteDelivery, validateDeliveryAddress, communityDeliverySlot } from "../functions/delivery.mjs";
import { createCheckout, handleOrderingRequest } from "../functions/square.mjs";
import { checkOrderingRequest } from "../functions/request-security.mjs";
import { environment, orderFixture, squareMock, openTime } from "./square-fixtures.mjs";

const address = { address_line_1: "123 Test Street", address_line_2: "Unit 2", locality: "Phoenix", administrative_district_level_1: "AZ", postal_code: "85053" };
const env = { ...environment, GOOGLE_MAPS_API_KEY: "test-routes-key" };
const route = meters => ({ routes: [{ distanceMeters: meters }], geocodingResults: { destination: { placeId: "test-place", type: ["street_address"] } } });
function mocked(meters = 8047) {
  const square = squareMock(), routes = [];
  return { ...square, routes, fetcher: async (url, init) => {
    if (url.startsWith("https://routes.googleapis.com/")) { routes.push({ url, ...init }); return Response.json(route(meters)); }
    return square.fetcher(url, init);
  } };
}

test("driving distance costs $1 per mile, rounded to cents, with no radius limit", async () => {
  for (const [meters, expected] of [[8047, 500], [10000, 621], [160934, 10000]]) {
    const mock = mocked(meters), quote = await quoteDelivery(env, address, "Restaurant address", mock.fetcher);
    assert.equal(quote.fee, expected); assert.equal(quote.currency, "USD");
    assert.equal(quote.address.address_line_2, "Unit 2");
    const body = JSON.parse(mock.routes[0].body);
    assert.equal(body.origin.address, "Restaurant address"); assert.equal(body.travelMode, "DRIVE");
    assert.equal(mock.routes[0].headers["X-Goog-Api-Key"], env.GOOGLE_MAPS_API_KEY);
    assert.equal(JSON.stringify(quote).includes(env.GOOGLE_MAPS_API_KEY), false);
  }
});
test("malformed, PO box, partial and unroutable addresses fail closed", async () => {
  for (const value of [null, {}, { ...address, postal_code: "invalid" }, { ...address, address_line_1: "PO Box 123" }, { ...address, locality: "Phoenix\nforged" }]) assert.throws(() => validateDeliveryAddress(value));
  for (const body of [{ routes: [] }, { ...route(100), geocodingResults: { destination: { placeId: "partial", partialMatch: true, type: ["street_address"] } } }, { ...route(100), geocodingResults: { destination: { placeId: "city", type: ["locality"] } } }, route(-1)]) {
    await assert.rejects(quoteDelivery(env, address, "origin", async () => Response.json(body)), e => e.status === 422);
  }
  await assert.rejects(quoteDelivery(environment, address, "origin"), e => e.status === 503);
  await assert.rejects(quoteDelivery(env, address, "origin", async () => { throw new Error("PRIVATE PROVIDER DATA"); }), e => e.status === 503 && !e.message.includes("PRIVATE"));
});
test("checkout recalculates the fee and adds a separate authoritative Square service charge", async () => {
  const mock = mocked();
  await createCheckout(env, { ...orderFixture(), orderType: "delivery", community: "Northgate", deliveryAddress: address, deliveryFee: 500, distanceMeters: 1 }, mock.fetcher, openTime);
  const order = mock.calls.at(-1).body.order;
  assert.equal(order.service_charges[0].amount_money.amount, 500);
  assert.equal(order.service_charges[0].taxable, true);
  assert.equal(order.fulfillments[0].pickup_details.recipient.address.address_line_2, "Unit 2");
  assert.equal(order.fulfillments[0].pickup_details.recipient.display_name, "Test Customer");
  assert.equal(order.fulfillments[0].pickup_details.schedule_type, "ASAP");
  assert.match(order.fulfillments[0].pickup_details.note, /Website delivery order/);
  assert.equal(mock.routes.length, 1);
});
test("missing and tampered quotes never reach Square checkout", async () => {
  for (const fee of [undefined, -1, 0, 1, "500"]) {
    const mock = mocked();
    await assert.rejects(createCheckout(env, { ...orderFixture(), orderType: "delivery", deliveryAddress: address, deliveryFee: fee }, mock.fetcher, openTime));
    assert.equal(mock.calls.some(call => call.url.includes("payment-links")), false);
  }
});
test("quotes have the same App Check and origin protection as payment links", async () => {
  const config = { SQUARE_ENVIRONMENT: "production", ORDERING_APP_ID: "app", ORDERING_ALLOWED_ORIGINS: "https://deccanflame.com" };
  const req = { path: "/api/square/delivery-quote/", method: "POST", rawBody: Buffer.from("{}"), get: name => ({ origin: "https://deccanflame.com", "content-type": "application/json" })[name.toLowerCase()] };
  assert.equal((await checkOrderingRequest(req, config, async () => ({}))).status, 403);
  const malicious = new Request("http://localhost/api/square/delivery-quote/", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ address }) });
  assert.equal((await handleOrderingRequest(malicious, env, mocked().fetcher)).status, 403);
});
test("community delivery date is the Phoenix calendar date, not the next UTC day", () => {
  const slot = communityDeliverySlot(new Date("2026-09-27T01:00:00Z"));
  assert.equal(slot.deliveryDate, "2026-09-26"); assert.equal(slot.startAt, "2026-09-27T02:00:00.000Z");
  assert.equal(communityDeliverySlot(new Date("2026-09-27T01:30:00Z")).deliveryDate, "2026-09-27");
});
