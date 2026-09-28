// Public ordering policy shared by the UI and server; contains no credentials.
export const DELIVERY_COMMUNITIES = Object.freeze(["Northgate"]);
export const DELIVERY_TIME_ZONE = "America/Phoenix";
export const DELIVERY_SETTINGS_PATH = "orderingSettings/communityDelivery";
/** @type {{communities: readonly string[], startTime: string, endTime: string}} */
export const DEFAULT_DELIVERY_SETTINGS = Object.freeze({ communities: DELIVERY_COMMUNITIES, startTime: "19:00", endTime: "20:00" });

export function validateDeliverySettings(value) {
  if (!value || !Array.isArray(value.communities) || value.communities.length > 20 ||
    value.communities.some(name => typeof name !== "string" || name !== name.trim() || !name.length || name.length > 60 || /[\x00-\x1f\x7f]/.test(name)) ||
    new Set(value.communities.map(name => name.toLowerCase())).size !== value.communities.length) {
    throw new Error("Use up to 20 unique community names, each 1–60 characters.");
  }
  if (![value.startTime, value.endTime].every(time => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || value.startTime === value.endTime) {
    throw new Error("Choose different start and end times.");
  }
  return { communities: [...value.communities], startTime: value.startTime, endTime: value.endTime };
}

export function deliveryWindowLabel(settings = DEFAULT_DELIVERY_SETTINGS) {
  const label = time => { const [hour, minute] = time.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "a.m." : "p.m."}`; };
  return `${label(settings.startTime)}–${label(settings.endTime)} Phoenix time`;
}

// Local Sandbox worker reads only the public policy document, never credentials.
export async function readPublicDeliverySettings(projectId, fetcher = fetch) {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw new Error("Invalid Firebase project.");
  const response = await fetcher(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${DELIVERY_SETTINGS_PATH}`, { signal: AbortSignal.timeout(8000) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("Delivery settings could not be loaded.");
  const { fields } = await response.json();
  return validateDeliverySettings({ communities: fields?.communities?.arrayValue?.values?.map(value => value.stringValue) ?? (fields?.communities?.arrayValue ? [] : null), startTime: fields?.startTime?.stringValue, endTime: fields?.endTime?.stringValue });
}

/** @param {Date} now */
export function isCommunityDeliveryWindow(now, settings = DEFAULT_DELIVERY_SETTINGS) {
  if (!Number.isFinite(now.getTime())) return false;
  if (!settings.communities.length) return false;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: DELIVERY_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const time = `${parts.find(part => part.type === "hour")?.value}:${parts.find(part => part.type === "minute")?.value}`;
  // End is exclusive. A start later than end means the window crosses midnight.
  return settings.startTime < settings.endTime ? time >= settings.startTime && time < settings.endTime : time >= settings.startTime || time < settings.endTime;
}
