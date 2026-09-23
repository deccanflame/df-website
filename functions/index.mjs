import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAppCheck } from "firebase-admin/app-check";
import { createHash } from "node:crypto";
import { handleOrderingRequest } from "./square.mjs";
import { checkOrderingRequest } from "./request-security.mjs";

initializeApp();
const token = defineSecret("SQUARE_ACCESS_TOKEN");
const location = defineString("SQUARE_LOCATION_ID");
const environment = defineString("SQUARE_ENVIRONMENT", { default: "sandbox" });
const enabled = defineString("SQUARE_ORDERING_ENABLED", { default: "false" });
const prep = defineString("SQUARE_PICKUP_MINUTES", { default: "20" });
const appId = defineString("ORDERING_APP_ID", { default: "" });
const categories = defineString("SQUARE_MENU_CATEGORY_IDS", { default: "" });
const origins = defineString("ORDERING_ALLOWED_ORIGINS", { default: "https://deccanflame.com,https://www.deccanflame.com" });

export const squareOrdering = onRequest({
  region: "us-central1", secrets: [token], timeoutSeconds: 60,
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
      SQUARE_ENVIRONMENT: environment.value(), SQUARE_ORDERING_ENABLED: enabled.value(),
      SQUARE_PICKUP_MINUTES: prep.value(), SQUARE_MENU_CATEGORY_IDS: categories.value(),
      ORDERING_ALLOWED_ORIGINS: origins.value(),
    });
    res.status(response.status).type("json").send(await response.text());
  } catch {
    res.status(503).json({ error: "Online ordering is temporarily unavailable. Please call us to order." });
  }
});
