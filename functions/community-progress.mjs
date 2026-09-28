// Shared public display policy. No credentials or customer information.
export const COMMUNITY_ORDER_TARGET = 5;
export const COMMUNITY_AMOUNT_TARGET = 5000;
export const COMMUNITY_TERMS_VERSION = "community-minimum-v1";
export const COMMUNITY_TERMS = "Community delivery requires 5 paid orders or $50 in combined food subtotal after discounts, excluding tax and tips, during this ordering window. If neither target is reached, collect your order or contact us for a refund. Complete payment before the window closes; late payments are pickup or refund only.";

/** Daily windows in Phoenix (UTC−07:00 year-round), including overnight windows. */
export function communityWindow(settings, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const today = Date.parse(`${date}T00:00:00-07:00`);
  const minutes = time => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
  const startMinutes = minutes(settings.startTime), endMinutes = minutes(settings.endTime);
  const windows = [-1, 0, 1].map(offset => {
    const start = today + offset * 86400000 + startMinutes * 60000;
    const end = today + offset * 86400000 + (endMinutes + (endMinutes < startMinutes ? 1440 : 0)) * 60000;
    return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
  });
  return windows.find(w => now.getTime() >= Date.parse(w.startAt) - 600000 && now.getTime() < Date.parse(w.endAt))
    || [...windows].reverse().find(w => Date.parse(w.endAt) <= now.getTime()) || windows[0];
}

export function campaignPhase(campaign, now = Date.now()) {
  if (now < Date.parse(campaign.startAt)) return "countdown";
  if (campaign.qualifiedAt) return "confirmed";
  if (now < Date.parse(campaign.endAt)) return "collecting";
  // Webhooks are asynchronous. Do not claim a final failure at the exact cutoff.
  if (now < Date.parse(campaign.endAt) + 120000) return "settling";
  return "fallback";
}

export function campaignPercent(campaign) {
  return campaign.qualifiedAt ? 100 : Math.min(100, Math.max(0, campaign.paidOrders / COMMUNITY_ORDER_TARGET, campaign.foodSubtotal / COMMUNITY_AMOUNT_TARGET) * 100);
}

export async function communityCampaignId(environment, locationId, community, window) {
  const bytes = new TextEncoder().encode(JSON.stringify([environment, locationId, community.toLowerCase(), window.startAt, window.endAt]));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}

export function emptyCampaign(id, community, window, environment) {
  return { id, community, ...window, environment, paidOrders: 0, foodSubtotal: 0, qualifiedAt: null, updatedAt: null };
}
