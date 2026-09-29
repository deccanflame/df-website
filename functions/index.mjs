import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAppCheck } from "firebase-admin/app-check";
import { createHash } from "node:crypto";
import { handleOrderingRequest } from "./square.mjs";
import { checkOrderingRequest } from "./request-security.mjs";
import { DELIVERY_SETTINGS_PATH } from "./community-delivery.mjs";
import { communityStore } from "./community-store.mjs";
import { validSquareSignature, processSquareEvent } from "./square-webhook.mjs";

initializeApp();
const token = defineSecret("SQUARE_ACCESS_TOKEN");
const mapsKey = defineSecret("GOOGLE_MAPS_API_KEY");
const webhookKey = defineSecret("SQUARE_WEBHOOK_SIGNATURE_KEY");
const webhookUrl = defineString("SQUARE_WEBHOOK_NOTIFICATION_URL", { default: "" });
const location = defineString("SQUARE_LOCATION_ID");
const environment = defineString("SQUARE_ENVIRONMENT", { default: "sandbox" });
const enabled = defineString("SQUARE_ORDERING_ENABLED", { default: "false" });
const prep = defineString("SQUARE_PICKUP_MINUTES", { default: "20" });
const appId = defineString("ORDERING_APP_ID", { default: "" });
const categories = defineString("SQUARE_MENU_CATEGORY_IDS", { default: "" });
const origins = defineString("ORDERING_ALLOWED_ORIGINS", { default: "https://deccanflame.com,https://www.deccanflame.com" });

export const squareOrdering = onRequest({
  region: "us-central1", secrets: [token, mapsKey], timeoutSeconds: 60,
  memory: "256MiB", minInstances: 0, maxInstances: 5, concurrency: 20, invoker: "public",
}, async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  try {
    const boundary = await checkOrderingRequest(req, {
      SQUARE_ENVIRONMENT: environment.value(), ORDERING_ALLOWED_ORIGINS: origins.value(), ORDERING_APP_ID: appId.value(),
    }, token => getAppCheck().verifyToken(token));
    if (boundary.error) return res.status(boundary.status).json({ error: boundary.error });
    const { path, checkout } = boundary;
    // Shared across function instances. No raw IP addresses or customer details are stored.
    const minute = Math.floor(Date.now() / 60000);
    const key = createHash("sha256").update(`${req.ip}|${minute}|${checkout ? "checkout" : "menu"}`).digest("hex");
    const ref = getFirestore().collection("_orderingRateLimits").doc(key);
    const allowed = await getFirestore().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const count = snapshot.data()?.count || 0;
      if (count >= (checkout ? 10 : 60)) return false;
      transaction.set(ref, { count: count + 1, expiresAt: Timestamp.fromMillis((minute + 60) * 60000) });
      return true;
    });
    if (!allowed) { res.set("Retry-After", "60"); return res.status(429).json({ error: "Please wait a minute before trying again." }); }
    const headers = new Headers();
    for (const name of ["content-type", "origin"]) if (req.get(name)) headers.set(name, req.get(name));
    const request = new Request(`https://ordering.internal${path}`, {
      method: req.method, headers, ...(checkout ? { body: req.rawBody } : {}),
    });
    const response = await handleOrderingRequest(request, {
      SQUARE_ACCESS_TOKEN: token.value(), SQUARE_LOCATION_ID: location.value(),
      GOOGLE_MAPS_API_KEY: mapsKey.value(),
      SQUARE_ENVIRONMENT: environment.value(), SQUARE_ORDERING_ENABLED: enabled.value(),
      SQUARE_PICKUP_MINUTES: prep.value(), SQUARE_MENU_CATEGORY_IDS: categories.value(),
      ORDERING_ALLOWED_ORIGINS: origins.value(),
      readDeliverySettings: async () => (await getFirestore().doc(DELIVERY_SETTINGS_PATH).get()).data(),
    });
    res.status(response.status).type("json").send(await response.text());
  } catch {
    res.status(503).json({ error: "Online ordering is temporarily unavailable. Please call us to order." });
  }
});

// Square calls this endpoint directly, not through browser App Check. Authenticate
// the exact raw request before parsing or making any database/API calls.
export const squareCommunityWebhook = onRequest({
  region: "us-central1", secrets: [token, webhookKey], timeoutSeconds: 60,
  memory: "256MiB", minInstances: 0, maxInstances: 5, concurrency: 20, invoker: "public",
}, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  if (!webhookUrl.value()) return res.status(503).send("Not configured");
  if (!req.rawBody || req.rawBody.length > 1000000) return res.status(413).send("Invalid request");
  if (!validSquareSignature(req.rawBody, req.get("x-square-hmacsha256-signature"), webhookKey.value(), webhookUrl.value())) return res.status(403).send("Invalid signature");
  let event;
  try { event = JSON.parse(req.rawBody.toString("utf8")); } catch { return res.status(400).send("Invalid JSON"); }
  try {
    await processSquareEvent(event, { SQUARE_ACCESS_TOKEN: token.value(), SQUARE_LOCATION_ID: location.value(), SQUARE_ENVIRONMENT: environment.value() }, communityStore(getFirestore(), environment.value(), location.value()));
    return res.status(200).send("Received");
  } catch {
    // No payment/customer details in logs; non-2xx asks Square to retry.
    return res.status(503).send("Please retry");
  }
});
