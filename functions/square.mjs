// Shared by Firebase Functions and the local vinext Worker. Never import into a client component.
const API_VERSION = "2026-09-16";
const MAX_QUANTITY = 20;

export class OrderingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function config(env) {
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    throw new OrderingError(503, "Online ordering is not available yet. Please call us to order.");
  }
  const environment = env.SQUARE_ENVIRONMENT || "sandbox";
  if (!["sandbox", "production"].includes(environment)) throw new OrderingError(503, "Online ordering is temporarily unavailable.");
  return {
    token: env.SQUARE_ACCESS_TOKEN,
    locationId: env.SQUARE_LOCATION_ID,
    base: environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com",
    environment,
    enabled: env.SQUARE_ORDERING_ENABLED === "true",
    prepMinutes: Number(env.SQUARE_PICKUP_MINUTES || 20),
    categoryIds: (env.SQUARE_MENU_CATEGORY_IDS || "").split(",").map(id => id.trim()).filter(Boolean),
  };
}

async function squareApi(cfg, path, body, fetcher) {
  let response;
  try {
    response = await fetcher(`${cfg.base}/v2${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${cfg.token}`, "Square-Version": API_VERSION, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new OrderingError(502, "We couldn't reach Square. Please try again shortly.");
  }
  if (!response.ok) {
    // Never return provider responses or credentials to a browser/log.
    throw new OrderingError(response.status === 429 ? 429 : 502, "Square couldn't complete this request. Please try again or call us.");
  }
  return response.json();
}

function present(object, locationId) {
  if (!object || object.is_deleted) return false;
  if (object.absent_at_location_ids?.includes(locationId)) return false;
  return object.present_at_all_locations !== false || object.present_at_location_ids?.includes(locationId);
}

function money(value, currency) {
  return value?.currency === currency && Number.isSafeInteger(value.amount) && value.amount >= 0 ? value.amount : null;
}

function safeImage(value) {
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
}

// Square location hours are evaluated in its timezone, including overnight service.
export function isLocationOpen(location, now = new Date()) {
  const periods = location.business_hours?.periods;
  if (!periods?.length || !location.timezone) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: location.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map(part => [part.type, part.value]));
  // Square uses SUN/MON/... (not full weekday names) in BusinessHoursPeriod.
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const day = days.indexOf(parts.weekday.toUpperCase());
  const current = Number(parts.hour) * 60 + Number(parts.minute);
  const minutes = time => { const [h, m] = (time || "").split(":").map(Number); return h * 60 + m; };
  return periods.some(period => {
    const start = minutes(period.start_local_time), end = minutes(period.end_local_time);
    const periodDay = days.indexOf(period.day_of_week);
    if (!Number.isFinite(start) || !Number.isFinite(end) || periodDay < 0) return false;
    if (end > start) return periodDay === day && current >= start && current < end;
    return (periodDay === day && current >= start) || ((periodDay + 1) % 7 === day && current < end);
  });
}

function modifierGroups(item, objects, cfg, currency) {
  return (item.modifier_list_info || []).filter(info => info.enabled !== false).map(info => {
    const list = objects.get(info.modifier_list_id);
    const data = list?.modifier_list_data;
    // Fail closed for unsupported text/nested modifiers; do not silently omit required choices.
    if (!present(list, cfg.locationId) || !data || (data.modifier_type && data.modifier_type !== "LIST")) return null;
    const inherit = (info.min_selected_modifiers ?? -1) === -1 && (info.max_selected_modifiers ?? -1) === -1;
    const min = Math.max(0, (inherit ? data.min_selected_modifiers : info.min_selected_modifiers) || 0);
    const configuredMax = inherit ? data.max_selected_modifiers : info.max_selected_modifiers;
    const max = configuredMax > 0 ? configuredMax : (data.modifiers || []).length;
    const options = (data.modifiers || []).filter(mod => present(mod, cfg.locationId)).map(mod => {
      const details = mod.modifier_data;
      const override = details?.location_overrides?.find(entry => entry.location_id === cfg.locationId);
      const price = money(override?.price_money || details?.price_money || { amount: 0, currency }, currency);
      const itemOverride = info.modifier_overrides?.find(entry => entry.modifier_id === mod.id);
      const hidden = itemOverride?.hidden_online_override === "YES" || (itemOverride?.hidden_online_override !== "NO" && (itemOverride?.hidden_online ?? details?.hidden_online));
      if (!details?.name || hidden || price === null || details.child_modifier_list_id || override?.sold_out) return null;
      const selected = itemOverride?.on_by_default_override === "YES" || (itemOverride?.on_by_default_override !== "NO" && (itemOverride?.on_by_default ?? details.on_by_default ?? false));
      return { id: mod.id, name: details.name, price, selected };
    }).filter(Boolean);
    const allowQuantities = info.allow_quantities === "YES" || (info.allow_quantities !== "NO" && data.allow_quantities);
    if (min > options.length || max < min || allowQuantities || info.is_conversational === "YES") return null;
    return { id: list.id, name: data.name, min, max, options };
  });
}

export async function loadMenu(env, fetcher = fetch, now = new Date()) {
  const cfg = config(env);
  const { location } = await squareApi(cfg, `/locations/${encodeURIComponent(cfg.locationId)}`, null, fetcher);
  if (!location || location.status !== "ACTIVE" || !location.currency) throw new OrderingError(503, "Online ordering is temporarily unavailable.");
  const objects = new Map();
  let cursor;
  const cursors = new Set();
  do {
    const params = new URLSearchParams({ types: "ITEM,CATEGORY,IMAGE,MODIFIER_LIST" });
    if (cursor) params.set("cursor", cursor);
    const page = await squareApi(cfg, `/catalog/list?${params}`, null, fetcher);
    for (const object of page.objects || []) objects.set(object.id, object);
    cursor = page.cursor;
    if (cursor && cursors.has(cursor)) throw new OrderingError(502, "The menu couldn't be loaded. Please try again.");
    cursors.add(cursor);
  } while (cursor);

  const items = [];
  for (const object of objects.values()) {
    const data = object.item_data;
    if (object.type !== "ITEM" || !present(object, cfg.locationId) || !data || data.is_archived || data.is_alcoholic ||
        ![undefined, "REGULAR", "FOOD_AND_BEV"].includes(data.product_type)) continue;
    const categoryIds = data.categories?.map(category => category.id) || (data.category_id ? [data.category_id] : []);
    if (cfg.categoryIds.length && !categoryIds.some(id => cfg.categoryIds.includes(id))) continue;
    const groups = modifierGroups(data, objects, cfg, location.currency);
    const variations = (data.variations || []).filter(variation => present(variation, cfg.locationId)).map(variation => {
      const details = variation.item_variation_data;
      const override = details?.location_overrides?.find(entry => entry.location_id === cfg.locationId);
      const price = money(override?.price_money || details?.price_money, location.currency);
      if (!details || details.sellable === false || details.measurement_unit_id || (override?.pricing_type || details.pricing_type) !== "FIXED_PRICING" || price === null) return null;
      return { id: variation.id, name: details.name || "Regular", price, available: !override?.sold_out, trackInventory: override?.track_inventory ?? details.track_inventory ?? false };
    }).filter(Boolean);
    if (!variations.length) continue;
    const categoryId = categoryIds.find(id => !cfg.categoryIds.length || cfg.categoryIds.includes(id)) || "other";
    items.push({
      id: object.id, name: data.buyer_facing_name || data.name,
      description: data.description_plaintext || data.description || "",
      categoryId, category: objects.get(categoryId)?.category_data?.name || "From our kitchen",
      image: safeImage(objects.get(data.image_ids?.[0])?.image_data?.url),
      variations, modifierGroups: groups.filter(Boolean), customizable: !groups.includes(null),
    });
  }

  const tracked = items.flatMap(item => item.variations.filter(variation => variation.trackInventory).map(variation => variation.id));
  const counts = new Map();
  for (let start = 0; start < tracked.length; start += 100) {
    let inventoryCursor;
    do {
      const page = await squareApi(cfg, "/inventory/counts/batch-retrieve", {
        catalog_object_ids: tracked.slice(start, start + 100), location_ids: [cfg.locationId], states: ["IN_STOCK"],
        ...(inventoryCursor ? { cursor: inventoryCursor } : {}),
      }, fetcher);
      for (const count of page.counts || []) counts.set(count.catalog_object_id, Number(count.quantity));
      inventoryCursor = page.cursor;
    } while (inventoryCursor);
  }
  for (const item of items) for (const variation of item.variations) {
    variation.stock = variation.trackInventory ? Math.max(0, Math.floor(counts.get(variation.id) || 0)) : null;
    variation.available = variation.available && (variation.stock === null || variation.stock > 0) && item.customizable;
  }
  const open = isLocationOpen(location, now);
  const validPrep = Number.isInteger(cfg.prepMinutes) && cfg.prepMinutes >= 5 && cfg.prepMinutes <= 180;
  return {
    items, currency: location.currency, sandbox: cfg.environment === "sandbox",
    acceptingOrders: cfg.enabled && open && validPrep,
    message: !cfg.enabled || !validPrep ? "Online orders are currently paused. Please call us to order." : !open ? "Online pickup is currently closed. Please call us for opening hours." : "",
    pickupMinutes: cfg.prepMinutes, location: {
      name: location.business_name || location.name,
      address: [location.address?.address_line_1, location.address?.locality, location.address?.administrative_district_level_1, location.address?.postal_code].filter(Boolean).join(", "),
      phone: location.phone_number || "+14805771274",
    },
  };
}

function bad(message) { throw new OrderingError(400, message); }

export async function createCheckout(env, body, fetcher = fetch, now = new Date()) {
  const cfg = config(env);
  if (!body || typeof body !== "object" || typeof body.idempotencyKey !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.idempotencyKey)) bad("Please refresh your cart and try again.");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 40) bad("Please add between 1 and 40 selections to your cart.");
  const customer = body.customer;
  if (!customer || typeof customer.name !== "string" || customer.name.trim().length < 2 || customer.name.length > 100) bad("Please enter your name for pickup.");
  if (typeof customer.phone !== "string" || !/^\+?[\d ()-]{10,24}$/.test(customer.phone)) bad("Please enter a valid pickup phone number.");
  const digits = customer.phone.replace(/\D/g, "");
  const phone = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) bad("Please enter a valid pickup phone number.");
  if (typeof customer.email !== "string" || customer.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) bad("Please enter a valid email address.");
  if (body.note != null && (typeof body.note !== "string" || body.note.length > 400)) bad("Please keep order notes under 400 characters.");
  const menu = await loadMenu(env, fetcher, now); // Never trust prices, availability or options sent by the browser.
  if (!menu.acceptingOrders) throw new OrderingError(409, menu.message);
  const quantities = new Map();
  const lineItems = body.items.map(line => {
    if (!line || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) bad("Choose a quantity between 1 and 20.");
    const item = menu.items.find(item => item.variations.some(variation => variation.id === line.variationId));
    const variation = item?.variations.find(variation => variation.id === line.variationId);
    if (!variation?.available) throw new OrderingError(409, "An item is no longer available. Refresh the menu and update your cart.");
    const totalQuantity = (quantities.get(variation.id) || 0) + line.quantity;
    quantities.set(variation.id, totalQuantity);
    if (totalQuantity > MAX_QUANTITY || (variation.stock !== null && totalQuantity > variation.stock)) throw new OrderingError(409, `Please reduce the quantity of ${item.name}; that quantity is not available.`);
    const modifierIds = line.modifierIds || [];
    if (!Array.isArray(modifierIds) || modifierIds.length > 40 || new Set(modifierIds).size !== modifierIds.length) bad("Please review your item options.");
    const options = item.modifierGroups.flatMap(group => group.options);
    if (modifierIds.some(id => !options.some(option => option.id === id))) bad("An option is no longer available. Please choose your options again.");
    for (const group of item.modifierGroups) {
      const selected = modifierIds.filter(id => group.options.some(option => option.id === id)).length;
      if (selected < group.min || selected > group.max) bad(`Please review the ${group.name} options for ${item.name}.`);
    }
    return {
      catalog_object_id: variation.id, quantity: String(line.quantity),
      ...(modifierIds.length ? { modifiers: [...modifierIds].sort().map(id => ({ catalog_object_id: id })) } : {}),
    };
  });
  const recipient = { display_name: customer.name.trim(), phone_number: phone, email_address: customer.email.trim() };
  const order = {
    location_id: cfg.locationId, line_items: lineItems,
    pricing_options: { auto_apply_taxes: true, auto_apply_discounts: true },
    fulfillments: [{ type: "PICKUP", state: "PROPOSED", pickup_details: {
      recipient, schedule_type: "ASAP", prep_time_duration: `PT${cfg.prepMinutes}M`,
      note: body.note?.trim() || "Website pickup order",
    } }],
  };
  // The same cart retry receives the same Square link, even across backend instances.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ key: body.idempotencyKey, order })));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const result = await squareApi(cfg, "/online-checkout/payment-links", {
    idempotency_key: key, order,
    checkout_options: { allow_tipping: true, merchant_support_email: "deccanflame1@gmail.com" },
    // Pickup contact details already live in fulfillment.pickup_details.recipient.
    // Square rejects pre_populated_data when an explicit fulfillment is supplied.
  }, fetcher);
  const link = result.payment_link?.url;
  let url;
  try { url = new URL(link); } catch { throw new OrderingError(502, "Square didn't return a checkout link. Please try again."); }
  const checkoutHosts = cfg.environment === "production"
    ? ["square.link", "checkout.square.site"]
    : ["sandbox.square.link", "sandbox.checkout.square.site"];
  if (url.protocol !== "https:" || url.username || url.password || !checkoutHosts.includes(url.hostname)) {
    throw new OrderingError(502, "Square didn't return a valid checkout link.");
  }
  return { url: url.href };
}

export async function handleOrderingRequest(request, env, fetcher = fetch) {
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  try {
    if (path === "/api/square/menu" && request.method === "GET") return json(await loadMenu(env, fetcher));
    if (path === "/api/square/checkout" && request.method === "POST") {
      const origin = request.headers.get("origin");
      const allowed = (env.ORDERING_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
      if (!origin || !allowed.includes(origin)) throw new OrderingError(403, "Please order directly from the restaurant website.");
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new OrderingError(415, "Please send a valid order.");
      const text = await request.text();
      if (text.length > 16000) throw new OrderingError(413, "Your cart is too large. Please call for a catering order.");
      let body;
      try { body = JSON.parse(text); } catch { bad("Please send a valid order."); }
      return json(await createCheckout(env, body, fetcher));
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error instanceof OrderingError ? error.message : "Online ordering is temporarily unavailable. Please try again." }, error instanceof OrderingError ? error.status : 500);
  }
}
