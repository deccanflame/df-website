export const environment = {
  SQUARE_ACCESS_TOKEN: "test-token-not-a-real-credential", SQUARE_LOCATION_ID: "test-location",
  SQUARE_ENVIRONMENT: "sandbox", SQUARE_ORDERING_ENABLED: "true", SQUARE_PICKUP_MINUTES: "25",
  ORDERING_ALLOWED_ORIGINS: "http://localhost:3000",
};
export const openTime = new Date("2026-09-16T19:00:00Z");
export function catalogFixture() {
  return [
    { type: "CATEGORY", id: "biryani", category_data: { name: "Biryani" } },
    { type: "IMAGE", id: "photo", image_data: { url: "https://images.example.com/biryani.jpg" } },
    { type: "MODIFIER_LIST", id: "spice", modifier_list_data: { name: "Spice level", min_selected_modifiers: 1, max_selected_modifiers: 1, modifiers: [
      { id: "mild", modifier_data: { name: "Mild", price_money: { amount: 0, currency: "USD" } } },
      { id: "hot", modifier_data: { name: "Hot", price_money: { amount: 100, currency: "USD" } } },
    ] } },
    { type: "ITEM", id: "chicken", item_data: {
      name: "Chicken Dum Biryani", description_plaintext: "Dum cooked with saffron.", product_type: "REGULAR", categories: [{ id: "biryani" }], image_ids: ["photo"],
      modifier_list_info: [{ modifier_list_id: "spice", min_selected_modifiers: -1, max_selected_modifiers: -1 }],
      variations: [{ id: "regular", item_variation_data: { name: "Regular", pricing_type: "FIXED_PRICING", price_money: { amount: 1399, currency: "USD" } } }],
    } },
  ];
}
export function locationFixture() {
  return { id: "test-location", status: "ACTIVE", name: "Deccan Flame", currency: "USD", timezone: "America/Phoenix", address: { address_line_1: "3502 W Greenway Rd", locality: "Phoenix" },
    business_hours: { periods: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(day_of_week => ({ day_of_week, start_local_time: "10:00:00", end_local_time: "22:00:00" })) },
  };
}
export function orderFixture() {
  return { idempotencyKey: "12345678-1234-4321-9876-123456789000", items: [{ variationId: "regular", quantity: 2, modifierIds: ["hot"] }], customer: { name: "Test Customer", email: "test@example.com", phone: "4805550123" }, note: "No cutlery" };
}
export function squareMock({ objects = catalogFixture(), location = locationFixture(), counts = [], failure, paginated = false } = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, init, body });
    if (failure) return Response.json({ errors: [{ detail: "PRIVATE PROVIDER DETAIL" }] }, { status: failure });
    if (path.includes("/locations/")) return Response.json({ location });
    if (path.endsWith("/catalog/list")) return Response.json(paginated && !new URL(url).searchParams.has("cursor") ? { objects: objects.slice(0, 2), cursor: "next-page" } : { objects: paginated ? objects.slice(2) : objects });
    if (path.endsWith("/inventory/counts/batch-retrieve")) return Response.json({ counts });
    if (path.endsWith("/online-checkout/payment-links")) return Response.json({ payment_link: { url: "https://sandbox.square.link/u/test-checkout" } });
    throw new Error(`Unexpected Square path: ${path}`);
  };
  return { fetcher, calls };
}
