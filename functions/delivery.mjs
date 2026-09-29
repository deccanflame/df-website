// Shared delivery policy; routing credentials never leave the server.
export const COMMUNITY_START_TIME = "19:00";
export const COMMUNITY_END_TIME = "20:00";
export const COMMUNITY_ORDER_START = "14:00";
export const COMMUNITY_ORDER_END = "18:30";
export const DELIVERY_RATE_CENTS = 100;
const METERS_PER_MILE = 1609.344;

export class DeliveryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function communityDeliverySlot(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  let start = Date.parse(`${day}T19:00:00-07:00`);
  if (now.getTime() >= start - 1800000) start += 86400000;
  return { startAt: new Date(start).toISOString(), endAt: new Date(start + 3600000).toISOString(), deliveryDate: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(start)) };
}

export function validateDeliveryAddress(value) {
  const field = (key, min, max) => {
    const text = value?.[key];
    if (typeof text !== "string" || text.trim().length < min || text.trim().length > max || /[\x00-\x1f\x7f]/.test(text)) throw new DeliveryError(400, "Enter a complete delivery address, including street, city, state and ZIP code.");
    return text.trim();
  };
  const address = { address_line_1: field("address_line_1", 5, 120), locality: field("locality", 2, 80), administrative_district_level_1: field("administrative_district_level_1", 2, 2).toUpperCase(), postal_code: field("postal_code", 5, 10), country: "US" };
  if (!/^[A-Z]{2}$/.test(address.administrative_district_level_1) || !/^\d{5}(-\d{4})?$/.test(address.postal_code) || !/\d/.test(address.address_line_1) || /\bP\.?\s*O\.?\s*BOX\b/i.test(address.address_line_1)) throw new DeliveryError(400, "Enter a street delivery address, not a PO box, with a valid state and ZIP code.");
  if (value.address_line_2) address.address_line_2 = field("address_line_2", 1, 40);
  return address;
}

export function deliveryAddressText(address) {
  return [address.address_line_1, address.address_line_2, address.locality, address.administrative_district_level_1, address.postal_code, "US"].filter(Boolean).join(", ");
}

export function paidDeliveryConfigured(env) {
  return Boolean(env.GOOGLE_MAPS_API_KEY);
}

export async function quoteDelivery(env, value, origin, fetcher = fetch) {
  const address = validateDeliveryAddress(value);
  if (!paidDeliveryConfigured(env)) throw new DeliveryError(503, "Address-based delivery is not available yet. Choose Community Delivery or Pickup, or call us.");
  if (!origin) throw new DeliveryError(503, "The restaurant delivery address is unavailable. Please call us.");
  let response;
  try {
    response = await fetcher("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "routes.distanceMeters,geocodingResults" },
      body: JSON.stringify({ origin: { address: origin }, destination: { address: deliveryAddressText({ ...address, address_line_2: undefined }) }, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", computeAlternativeRoutes: false, units: "IMPERIAL", languageCode: "en-US", regionCode: "US" }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new DeliveryError(503, "We couldn't calculate delivery right now. Please try again."); }
  if (!response.ok) throw new DeliveryError(503, "We couldn't calculate delivery right now. Please check the address or call us.");
  const data = await response.json();
  if (data.geocodingResults?.origin?.partialMatch || data.geocodingResults?.origin?.geocoderStatus?.code) throw new DeliveryError(503, "The restaurant routing address could not be verified. Please call us.");
  const destination = data.geocodingResults?.destination;
  const meters = data.routes?.[0]?.distanceMeters;
  if (!destination?.placeId || destination.partialMatch || destination.geocoderStatus?.code || !destination.type?.some(type => ["street_address", "premise", "subpremise"].includes(type)) || !Number.isSafeInteger(meters) || meters < 0) throw new DeliveryError(422, "We couldn't find an exact driving route to that street address. Check your address or call us.");
  const miles = meters / METERS_PER_MILE;
  return { address, distanceMeters: meters, miles: Number(miles.toFixed(2)), fee: Math.round(miles * DELIVERY_RATE_CENTS), currency: "USD", ratePerMile: DELIVERY_RATE_CENTS };
}
