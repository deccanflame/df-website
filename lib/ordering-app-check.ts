import type { AppCheck } from "firebase/app-check";
import { firebaseApp } from "./firebase";

let appCheckPromise: Promise<AppCheck> | undefined;

// Production checkout requires a verified Firebase App Check token. No debug
// tokens or credentials are compiled into the frontend. Local Sandbox can run
// without a site key; the production backend still enforces verification.
export async function orderingAppCheckHeaders(): Promise<Record<string, string>> {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!siteKey) return {};
  if (!firebaseApp) throw new Error("Secure checkout is unavailable. Please call us to order.");
  try {
    const app = firebaseApp;
    const { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } = await import("firebase/app-check");
    appCheckPromise ??= Promise.resolve().then(() => initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true,
    })).catch(error => {
      appCheckPromise = undefined;
      throw error;
    });
    const { token } = await getToken(await appCheckPromise);
    return { "X-Firebase-AppCheck": token };
  } catch {
    throw new Error("We couldn't verify this browser. Please refresh and try again, or call us to order.");
  }
}
