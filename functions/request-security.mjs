// Firebase-specific security boundary, separate from the local Sandbox worker.
export async function checkOrderingRequest(req, config, verifyToken) {
  const path = req.path.replace(/\/$/, "");
  if (!["/api/square/menu", "/api/square/checkout"].includes(path)) return { status: 404, error: "Not found" };
  const checkout = path.endsWith("/checkout");
  if (req.method !== (checkout ? "POST" : "GET")) return { status: 405, error: "Method not allowed" };
  if ((req.rawBody?.length || 0) > 16000) return { status: 413, error: "Your cart is too large." };
  if (!checkout) return { path, checkout };
  if (!req.get("content-type")?.split(";")[0].trim().match(/^application\/json$/i)) return { status: 415, error: "Please send a valid order." };
  const origin = req.get("origin");
  const origins = (config.ORDERING_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (!origin || !origins.includes(origin)) return { status: 403, error: "Please order directly from the restaurant website." };
  if (config.SQUARE_ENVIRONMENT === "production") {
    // Origin is a browser CSRF defense, not authentication. App Check adds a
    // verified app identity; clients cannot turn enforcement off in production.
    if (!config.ORDERING_APP_ID || !origin.startsWith("https://")) return { status: 503, error: "Secure checkout is not configured yet." };
    const token = req.get("X-Firebase-AppCheck");
    if (!token || token.length > 8192) return { status: 403, error: "Please refresh the page to verify your browser before checkout." };
    try {
      const claims = await verifyToken(token);
      if (claims.appId !== config.ORDERING_APP_ID) throw new Error("Unexpected app");
    } catch {
      return { status: 403, error: "We couldn't verify this browser. Please refresh and try again." };
    }
  }
  return { path, checkout };
}
