import { afterEach, expect, test, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommunityProgress } from "../components/CommunityProgress";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const campaign = { id: "northgate", community: "Northgate", startAt: "2026-09-27T02:00:00Z", endAt: "2026-09-27T03:00:00Z", paidOrders: 3, foodSubtotal: 3800, qualifiedAt: null };
function mount({ serverTime = "2026-09-27T02:30:00Z", campaigns = [campaign] } = {}) {
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ enabled: true, serverTime, campaigns }));
  vi.stubGlobal("fetch", fetcher);
  const change = vi.fn();
  render(<CommunityProgress enabled community="Northgate" onCommunityChange={change} />);
  return { fetcher, change };
}
test("shows the OR target visually and lets visitors select a community without a cart", async () => {
  const { change } = mount({ campaigns: [campaign, { ...campaign, id: "westgate", community: "Westgate" }] });
  const bar = await screen.findByRole("progressbar");
  expect(bar.getAttribute("aria-valuenow")).toBe("76");
  expect(bar.getAttribute("aria-valuetext")).toContain("3 of 5 paid orders or $38.00 of $50");
  await userEvent.setup().selectOptions(screen.getByLabelText("Your community"), "Westgate");
  expect(change).toHaveBeenCalledWith("Westgate");
});
test("shows a ten-minute pre-window countdown", async () => {
  mount({ serverTime: "2026-09-27T01:50:00Z", campaigns: [{ ...campaign, paidOrders: 0, foodSubtotal: 0 }] });
  expect(await screen.findByText("Opens in 10:00")).toBeTruthy();
});
test("confirmed commitment remains green even if current totals fall after refunds", async () => {
  mount({ campaigns: [{ ...campaign, qualifiedAt: "2026-09-27T02:20:00Z" }] });
  expect(await screen.findByText("Community delivery confirmed!")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
});
test("closed campaign explains pickup or manually requested refund", async () => {
  mount({ serverTime: "2026-09-27T03:03:00Z" });
  expect(await screen.findByText("This window has closed")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Pickup or refund help/ }).getAttribute("href")).toBe("tel:+14805771274");
});
test("network errors preserve totals and mark them stale instead of resetting to zero", async () => {
  const { fetcher } = mount();
  await screen.findByRole("progressbar");
  fetcher.mockRejectedValue(new Error("offline"));
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("last known totals"));
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("76");
});
test("unconfigured tracking never presents fake progress", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<CommunityProgress enabled={false} community="Northgate" onCommunityChange={() => {}} />);
  expect(screen.getByText(/Live payment tracking is not connected/)).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
});
