import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SquareMenu } from "../components/SquareMenu";
import { loadMenu } from "../functions/square.mjs";
import { environment, openTime, squareMock } from "./square-fixtures.mjs";
import { orderingAppCheckHeaders } from "../lib/ordering-app-check";

vi.mock("../lib/ordering-app-check", () => ({ orderingAppCheckHeaders: vi.fn().mockResolvedValue({ "X-Firebase-AppCheck": "test-app-check" }) }));

let menu;
beforeEach(async () => {
  sessionStorage.clear();
  menu = await loadMenu(environment, squareMock().fetcher, openTime);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const renderMenu = () => render(<SquareMenu><p>Restaurant printed menu</p></SquareMenu>);

test("shows the browse-only menu and retry when ordering is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Online ordering is not available yet." }, { status: 503 })));
  renderMenu();
  expect(await screen.findByText(/Online ordering is not available yet/)).toBeTruthy();
  expect(screen.getByText("Restaurant printed menu")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Place Order", exact: true })).toBeNull();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
});

test("supports search, required options, cart totals and removing selections", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  const user = userEvent.setup(); renderMenu();
  await user.click(await screen.findByRole("button", { name: "Add Chicken Dum Biryani" }));
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: /Add to your order/ }));
  expect(within(dialog).getByRole("alert").textContent).toContain("Choose 1");
  await user.click(within(dialog).getByRole("checkbox", { name: /Hot/ }));
  await user.click(within(dialog).getByRole("button", { name: /Add to your order/ }));
  expect(screen.queryByRole("dialog")).toBeNull();
  const cart = screen.getByRole("complementary", { name: "Your order" });
  const checkout = within(cart).getByRole("button", { name: "Place Order", exact: true });
  expect(checkout.textContent).toBe("Place Order");
  expect(checkout.querySelector("svg, i, [aria-hidden]")).toBeNull();
  expect(screen.queryByText("Pickup at Deccan Flame")).toBeNull();
  expect(screen.queryByText("Who’s picking up?")).toBeNull();
  expect(screen.getByRole("combobox", { name: "Order type" }).value).toBe("pickup");
  expect(within(cart).getAllByText("$14.99").length).toBe(2);
  await user.click(within(cart).getByRole("button", { name: /Increase/ }));
  expect(within(cart).getAllByText("$29.98").length).toBe(2);
  await user.type(screen.getByRole("searchbox"), "naan");
  expect(screen.getByText("No dishes found")).toBeTruthy();
  await user.click(within(cart).getByRole("button", { name: /Remove/ }));
  expect(screen.getByText("A little empty. A lot of possibility.")).toBeTruthy();
});

test("checkout sends IDs and customer details; retry preserves the idempotency key", async () => {
  const fetchMock = vi.fn().mockImplementation(async url => url.endsWith("/menu/") ? Response.json(menu) : Response.json({ error: "Please try again shortly." }, { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup(); renderMenu();
  await user.click(await screen.findByRole("button", { name: "Add Chicken Dum Biryani" }));
  await user.click(screen.getByRole("checkbox", { name: /Mild/ }));
  await user.click(screen.getByRole("button", { name: /Add to your order/ }));
  await user.type(screen.getByLabelText("Name"), "Test Customer");
  await user.type(screen.getByLabelText("Phone"), "4805550123");
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Please try again shortly.");
  const first = JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout/"))[1].body);
  expect(fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout/"))[1].headers["X-Firebase-AppCheck"]).toBe("test-app-check");
  expect(first.items).toEqual([{ variationId: "regular", modifierIds: ["mild"], quantity: 1 }]);
  expect(first.customer.email).toBe("test@example.com");
  expect(first.orderType).toBe("pickup");
  expect(first.community).toBeUndefined();
  expect(first.idempotencyKey).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/checkout/")).length).toBe(2));
  const last = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
  expect(last.idempotencyKey).toBe(first.idempotencyKey);
  expect(sessionStorage.getItem("deccan-flame-cart-v1")).not.toContain("test@example.com");
});

async function fillOrder(user) {
  await user.click(await screen.findByRole("button", { name: "Add Chicken Dum Biryani" }));
  await user.click(screen.getByRole("checkbox", { name: /Mild/ }));
  await user.click(screen.getByRole("button", { name: /Add to your order/ }));
  await user.type(screen.getByLabelText("Name"), "Test Customer");
  await user.type(screen.getByLabelText("Phone"), "4805550123");
  await user.type(screen.getByLabelText("Email"), "test@example.com");
}

test("delivery shows Northgate during the Phoenix window and sends it separately from the name", async () => {
  menu.serverTime = "2026-09-27T02:30:00Z";
  const fetchMock = vi.fn().mockImplementation(async url => url.endsWith("/menu/") ? Response.json(menu) : Response.json({ error: "Test checkout stopped." }, { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup(); renderMenu(); await fillOrder(user);
  const type = screen.getByRole("combobox", { name: "Order type" });
  expect(screen.queryByRole("combobox", { name: "Community" })).toBeNull();
  await user.selectOptions(type, "delivery");
  const community = screen.getByRole("combobox", { name: "Community" });
  expect(community.value).toBe("Northgate");
  expect(within(community).getAllByRole("option").map(option => option.textContent)).toEqual(["Northgate"]);
  expect(Boolean(type.compareDocumentPosition(community) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  expect(Boolean(community.compareDocumentPosition(screen.getByLabelText("Name")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: /I agree to this policy/ }));
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  await screen.findByRole("alert");
  const payload = JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout/"))[1].body);
  expect(payload.orderType).toBe("delivery");
  expect(payload.community).toBe("Northgate");
  expect(payload.communityTermsAccepted).toBe("community-minimum-v1");
  expect(payload.customer.name).toBe("Test Customer");
  await user.selectOptions(type, "pickup");
  expect(screen.queryByRole("combobox", { name: "Community" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  await screen.findByRole("alert");
  expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).community).toBeUndefined();
});

test("delivery outside the window sends the original name without a community", async () => {
  menu.serverTime = "2026-09-27T03:00:00Z";
  const fetchMock = vi.fn().mockImplementation(async url => url.endsWith("/menu/") ? Response.json(menu) : Response.json({ error: "Test checkout stopped." }, { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup(); renderMenu(); await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox", { name: "Order type" }), "delivery");
  expect(screen.queryByRole("combobox", { name: "Community" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  await screen.findByRole("alert");
  const payload = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
  expect(payload.orderType).toBe("delivery");
  expect(payload.community).toBeUndefined();
  expect(payload.customer.name).toBe("Test Customer");
});

test("checkout renders saved communities and custom delivery times from the server", async () => {
  menu.serverTime = "2026-09-27T01:30:00Z";
  menu.deliverySettings = { communities: ["Westgate", "Northgate"], startTime: "18:15", endTime: "21:00" };
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  const user = userEvent.setup(); renderMenu(); await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox", { name: "Order type" }), "delivery");
  const community = screen.getByRole("combobox", { name: "Community" });
  expect(within(community).getAllByRole("option").map(option => option.textContent)).toEqual(["Westgate", "Northgate"]);
  expect(community.value).toBe("Westgate");
  expect(screen.getByText(/6:15 p.m.–9:00 p.m. Phoenix time/)).toBeTruthy();
});

test("the community selector opens and closes across time boundaries without a page reload", async () => {
  menu.serverTime = "2026-09-27T01:59:59Z";
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  let elapsed = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const user = userEvent.setup(); renderMenu(); await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox", { name: "Order type" }), "delivery");
  expect(screen.queryByRole("combobox", { name: "Community" })).toBeNull();
  elapsed = 1000;
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Community" })).toBeTruthy(), { timeout: 2000 });
  elapsed = 3_601_000;
  await waitFor(() => expect(screen.queryByRole("combobox", { name: "Community" })).toBeNull(), { timeout: 2000 });
});

test("a checkout crossing into the community window refreshes the selector without losing contact details", async () => {
  menu.serverTime = "2026-09-27T01:59:59Z";
  vi.spyOn(performance, "now").mockReturnValue(0);
  const fetchMock = vi.fn().mockImplementation(async url => {
    if (url.endsWith("/menu/")) return Response.json(menu);
    menu.serverTime = "2026-09-27T02:00:00Z";
    return Response.json({ error: "Please select your community for delivery between 7 and 8 p.m. Phoenix time." }, { status: 409 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup(); renderMenu(); await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox", { name: "Order type" }), "delivery");
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  expect((await screen.findByRole("combobox", { name: "Community" })).value).toBe("Northgate");
  expect(screen.getByLabelText("Name").value).toBe("Test Customer");
  expect(screen.getByRole("combobox", { name: "Order type" }).value).toBe("delivery");
  await user.click(screen.getByRole("checkbox", { name: /I agree to this policy/ }));
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/checkout/"))).toHaveLength(2));
  const payload = JSON.parse(fetchMock.mock.calls.filter(([url]) => url.endsWith("/checkout/")).at(-1)[1].body);
  expect(payload.community).toBe("Northgate");
});

test("App Check failure stops checkout before an order request is sent", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json(menu));
  vi.stubGlobal("fetch", fetchMock);
  orderingAppCheckHeaders.mockRejectedValueOnce(new Error("Browser verification failed."));
  const user = userEvent.setup(); renderMenu();
  await user.click(await screen.findByRole("button", { name: "Add Chicken Dum Biryani" }));
  await user.click(screen.getByRole("checkbox", { name: /Mild/ }));
  await user.click(screen.getByRole("button", { name: /Add to your order/ }));
  await user.type(screen.getByLabelText("Name"), "Test Customer");
  await user.type(screen.getByLabelText("Phone"), "4805550123");
  await user.type(screen.getByLabelText("Email"), "test@example.com");
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Browser verification failed.");
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/checkout/"))).toBe(false);
});

test("restores the cart but blocks removed dishes and never claims a completed payment", async () => {
  sessionStorage.setItem("deccan-flame-cart-v1", JSON.stringify([{ variationId: "removed-dish", modifierIds: [], quantity: 1 }]));
  sessionStorage.setItem("deccan-flame-checkout-v1-started", "true");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  renderMenu();
  expect(await screen.findByText("Unavailable item")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Place Order", exact: true }).disabled).toBe(true);
  expect(screen.getByText(/Your Square receipt confirms/)).toBeTruthy();
  expect(screen.queryByText("Payment successful")).toBeNull();
});
