import { describe, expect, it } from "vitest";
import { cateringMailto, localDate } from "../lib/catering";

function form(overrides = {}) {
  const data = new FormData();
  Object.entries({ name: "A Guest", email: "guest@example.com", eventType: "Wedding", eventDate: "2099-10-01", guestCount: "100", ...overrides }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("catering enquiry", () => {
  it("addresses the complete draft to the restaurant inbox", () => {
    const url = new URL(cateringMailto(form()));
    expect(url.pathname).toBe("deccanflame1@gmail.com");
    expect(url.searchParams.get("body")).toContain("Guest count: 100");
    expect(url.searchParams.get("subject")).toContain("Wedding");
  });
  it("encodes user content without creating extra mail headers", () => {
    const url = new URL(cateringMailto(form({ notes: "Spice & saffron? #1\n&bcc=evil@example.com" })));
    expect([...url.searchParams.keys()]).toEqual(["subject", "body"]);
    expect(url.searchParams.get("body")).toContain("&bcc=evil@example.com");
  });
  it.each(["0", "-1", "1.5", "NaN", "9007199254740992"])("rejects invalid guest count %s", (guestCount) => {
    expect(() => cateringMailto(form({ guestCount }))).toThrow("whole guest count");
  });
  it("rejects a past event date", () => {
    expect(() => cateringMailto(form({ eventDate: "2000-01-01" }))).toThrow("future event date");
  });
  it("accepts an event today", () => {
    expect(cateringMailto(form({ eventDate: localDate() }))).toContain("mailto:");
  });
  it("rejects whitespace-only required fields", () => {
    expect(() => cateringMailto(form({ name: "   " }))).toThrow("complete your name");
  });
});
