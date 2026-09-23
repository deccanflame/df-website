import { afterEach, beforeEach, expect, test, vi } from "vitest";

const sdk = vi.hoisted(() => ({ initializeAppCheck: vi.fn(), getToken: vi.fn() }));
vi.mock("../lib/firebase", () => ({ firebaseApp: { name: "test-app" } }));
vi.mock("firebase/app-check", () => ({
  ...sdk,
  ReCaptchaEnterpriseProvider: class { constructor(key) { this.key = key; } },
}));

beforeEach(() => {
  vi.resetModules();
  sdk.initializeAppCheck.mockReset().mockReturnValue({ name: "app-check" });
  sdk.getToken.mockReset().mockResolvedValue({ token: "verified-token" });
  vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY", "public-test-key");
});
afterEach(() => vi.unstubAllEnvs());

test("reuses App Check after a temporary token failure", async () => {
  sdk.getToken.mockRejectedValueOnce(new Error("Temporary network error"));
  const { orderingAppCheckHeaders } = await import("../lib/ordering-app-check");
  await expect(orderingAppCheckHeaders()).rejects.toThrow("verify this browser");
  await expect(orderingAppCheckHeaders()).resolves.toEqual({ "X-Firebase-AppCheck": "verified-token" });
  expect(sdk.initializeAppCheck).toHaveBeenCalledTimes(1);
});

test("retries failed initialization without exposing SDK errors", async () => {
  sdk.initializeAppCheck.mockImplementationOnce(() => { throw new Error("Internal SDK detail"); });
  const { orderingAppCheckHeaders } = await import("../lib/ordering-app-check");
  await expect(orderingAppCheckHeaders()).rejects.toThrow("verify this browser");
  await expect(orderingAppCheckHeaders()).resolves.toEqual({ "X-Firebase-AppCheck": "verified-token" });
  expect(sdk.initializeAppCheck).toHaveBeenCalledTimes(2);
});

test("local Sandbox needs no App Check key", async () => {
  vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY", "");
  const { orderingAppCheckHeaders } = await import("../lib/ordering-app-check");
  await expect(orderingAppCheckHeaders()).resolves.toEqual({});
  expect(sdk.initializeAppCheck).not.toHaveBeenCalled();
});
