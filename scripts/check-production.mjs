import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";

const load = path => existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
const backend = load("functions/.env.deccanflame-website");
const frontend = { ...load(".env.local"), ...process.env };
const failures = [];
if (backend.SQUARE_ENVIRONMENT !== "production") failures.push("Set the Firebase backend environment to production (leave .dev.vars in Sandbox).");
if (!backend.SQUARE_LOCATION_ID) failures.push("Add the Production location ID to functions/.env.deccanflame-website.");
if (backend.SQUARE_ACCESS_TOKEN) failures.push("Remove the access token from the Functions env file; use Firebase Secret Manager.");
if (!backend.ORDERING_APP_ID || backend.ORDERING_APP_ID !== frontend.NEXT_PUBLIC_FIREBASE_APP_ID) failures.push("ORDERING_APP_ID must match the frontend Firebase app ID.");
if (!frontend.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY) failures.push("Configure the public reCAPTCHA Enterprise site key for Firebase App Check.");
const origins = (backend.ORDERING_ALLOWED_ORIGINS || "").split(",").map(value => value.trim());
if (!origins.length || origins.some(origin => !["https://deccanflame.com", "https://www.deccanflame.com"].includes(origin))) failures.push("Only approved HTTPS production domains may create payment links.");
if (backend.SQUARE_PICKUP_MINUTES !== "20") failures.push("Confirm the agreed 20-minute pickup preparation time.");
if (!["true", "false"].includes(backend.SQUARE_ORDERING_ENABLED)) failures.push("Set the explicit ordering enabled/paused switch.");
if (failures.length) {
  console.error("Launch configuration is incomplete:\n" + failures.map(message => `- ${message}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Local production configuration passes. This does not verify the remote secret, App Check registration, live catalog, deployed rules, or payment acceptance. Complete the launch checklist before enabling real orders.");
}
