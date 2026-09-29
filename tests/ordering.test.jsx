import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
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

test("order preferences precede the dishes and community selection is never duplicated", async () => {
  menu.deliverySettings = { communities: ["Northgate", "Westgate"], startTime: "14:00", endTime: "18:30" };
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  const user = userEvent.setup(); renderMenu();
  const type = await screen.findByRole("combobox", { name: "Order type" });
  const preferences = screen.getByRole("region", { name: "Choose how to receive your order" });
  expect(preferences.contains(type)).toBe(true);
  expect(preferences.compareDocumentPosition(screen.getByRole("region", { name: "Menu and order" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Community" })).toBeNull();
  await user.selectOptions(type, "community_delivery");
  expect(screen.getAllByRole("combobox", { name: "Community" })).toHaveLength(1);
  await user.selectOptions(screen.getByRole("combobox", { name: "Community" }), "Westgate");
  await fillOrder(user);
  expect(screen.getAllByRole("combobox", { name: "Order type" })).toHaveLength(1);
  expect(screen.getAllByRole("combobox", { name: "Community" })).toHaveLength(1);
  expect(screen.getByText("Community Delivery · Westgate")).toBeTruthy();
  await user.selectOptions(type, "pickup");
  expect(screen.getByLabelText("Name").value).toBe("Test Customer");
  expect(within(screen.getByRole("complementary", { name: "Your order" })).getByRole("button", { name: /Remove/ })).toBeTruthy();
});

test("Sandbox is clearly labelled without presenting its test address as the restaurant", async () => {
  menu.sandbox = true;
  menu.location.address = "1600 Pennsylvania Ave NW, Washington, DC, 20500";
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  renderMenu();
  expect(await screen.findByText(/Square Sandbox · test catalog and location/)).toBeTruthy();
  expect(screen.queryByText(menu.location.address)).toBeNull();
});

test("production continues to display the actual Square restaurant address", async () => {
  menu.sandbox = false;
  menu.location.address = "3502 W Greenway Rd, Phoenix, AZ 85053";
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  renderMenu();
  expect(await screen.findByText(menu.location.address)).toBeTruthy();
  expect(screen.queryByText(/Square Sandbox · test catalog and location/)).toBeNull();
});

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

test("community delivery is free with no terms gate and sends the selected community", async () => {
  menu.serverTime = "2026-09-26T22:00:00Z"; menu.communityOrderingEnabled = true; menu.communityAcceptingOrders = true;
  const fetchMock = vi.fn().mockImplementation(async url => url.endsWith("/menu/") ? Response.json(menu) : Response.json({ error: "Test checkout stopped." }, { status: 502 }));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup(); renderMenu(); await fillOrder(user);
  const type = screen.getByRole("combobox", { name: "Order type" });
  expect(within(type).getAllByRole("option").map(o=>o.textContent)).toEqual(["Community Delivery", "Delivery", "Pickup"]);
  await user.selectOptions(type, "community_delivery");
  expect(screen.getByRole("combobox", { name: "Community" }).value).toBe("Northgate");
  expect(screen.queryByRole("checkbox", { name: /I agree/ })).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Place Order", exact: true }));
  await screen.findByRole("alert");
  const payload = JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout/"))[1].body);
  expect(payload.orderType).toBe("community_delivery"); expect(payload.community).toBe("Northgate");
  expect(payload.communityTermsAccepted).toBeUndefined(); expect(payload.deliveryFee).toBeUndefined();
  await user.selectOptions(type, "pickup");
  expect(screen.queryByRole("combobox", { name: "Community" })).toBeNull();
});

test("community ordering cutoff disables checkout without losing cart or contact details", async () => {
  menu.serverTime = "2026-09-27T01:29:59Z"; menu.communityOrderingEnabled = true;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  let elapsed = 0; vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const user = userEvent.setup(); renderMenu(); await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox", { name: "Order type" }), "community_delivery");
  expect(screen.getByRole("button", { name: "Place Order", exact: true }).disabled).toBe(false);
  elapsed = 1000;
  await waitFor(()=>expect(screen.getByRole("button", { name: "Place Order", exact: true }).disabled).toBe(true),{timeout:2000});
  expect(screen.getByLabelText("Name").value).toBe("Test Customer");
});

test("community delivery opens at 2 p.m. without reloading and shows saved communities", async () => {
  menu.serverTime = "2026-09-26T20:59:59Z"; menu.communityOrderingEnabled = true;
  menu.deliverySettings = { communities: ["Westgate","Northgate"], startTime: "19:00", endTime: "20:00" };
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>Response.json(menu)));
  let elapsed = 0; vi.spyOn(performance,"now").mockImplementation(()=>elapsed);
  const user=userEvent.setup(); renderMenu(); await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox",{name:"Order type"}),"community_delivery");
  expect(screen.getByRole("combobox",{name:"Community"}).value).toBe("Westgate");
  expect(screen.getByRole("button",{name:"Place Order",exact:true}).disabled).toBe(true);
  elapsed=1000;
  await waitFor(()=>expect(screen.getByRole("button",{name:"Place Order",exact:true}).disabled).toBe(false),{timeout:2000});
});

test("paid delivery requires an address quote, clears it on address edits, and sends fee separately", async () => {
  menu.paidDeliveryAvailable = true;
  const fetchMock=vi.fn().mockImplementation(async url=>url.endsWith("/menu/")?Response.json(menu):url.endsWith("/delivery-quote/")?Response.json({fee:500,miles:5,currency:"USD"}):Response.json({error:"Test checkout stopped."},{status:502}));
  vi.stubGlobal("fetch",fetchMock);
  const user=userEvent.setup(); renderMenu(); await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox",{name:"Order type"}),"delivery");
  expect(screen.queryByRole("combobox",{name:"Community"})).toBeNull();
  expect(screen.getByRole("button",{name:"Place Order",exact:true}).disabled).toBe(true);
  await user.type(screen.getByLabelText("Street address"),"123 Test Street");
  await user.type(screen.getByLabelText("City"),"Phoenix");
  await user.type(screen.getByLabelText("ZIP code"),"85053");
  await user.click(screen.getByRole("button",{name:"Calculate delivery fee"}));
  await screen.findByText(/5.00 driving miles/);
  await user.type(screen.getByLabelText(/Apartment or unit/),"2");
  expect(screen.getByRole("button",{name:"Place Order",exact:true}).disabled).toBe(true);
  await user.click(screen.getByRole("button",{name:"Calculate delivery fee"}));
  await screen.findByText(/5.00 driving miles/);
  await user.click(screen.getByRole("button",{name:"Place Order",exact:true}));
  await screen.findByRole("alert");
  const payload=JSON.parse(fetchMock.mock.calls.find(([url])=>url.endsWith("/checkout/"))[1].body);
  expect(payload.deliveryFee).toBe(500); expect(payload.deliveryAddress.address_line_2).toBe("2"); expect(payload.community).toBeUndefined();
  const quoteCall=fetchMock.mock.calls.find(([url])=>url.endsWith("/delivery-quote/"));
  expect(quoteCall[1].headers["X-Firebase-AppCheck"]).toBe("test-app-check");
});

test("paid delivery fails safely while routing is not configured", async () => {
  menu.paidDeliveryAvailable=false;
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>Response.json(menu)));
  const user=userEvent.setup();renderMenu();await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox",{name:"Order type"}),"delivery");
  expect(screen.getByRole("button",{name:"Calculate delivery fee"}).disabled).toBe(true);
  expect(screen.getByRole("button",{name:"Place Order",exact:true}).disabled).toBe(true);
  expect(screen.getByText(/Address-based delivery is not connected/)).toBeTruthy();
});

test("an in-flight quote for an old address cannot enable checkout after the address changes", async () => {
  menu.paidDeliveryAvailable = true;
  let finishQuote;
  const pending = new Promise(resolve => { finishQuote = resolve; });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async url => url.endsWith("/menu/") ? Response.json(menu) : pending));
  const user = userEvent.setup(); renderMenu(); await fillOrder(user);
  await user.selectOptions(screen.getByRole("combobox", { name: "Order type" }), "delivery");
  await user.type(screen.getByLabelText("Street address"), "123 Test Street");
  await user.type(screen.getByLabelText("City"), "Phoenix");
  await user.type(screen.getByLabelText("ZIP code"), "85053");
  await user.click(screen.getByRole("button", { name: "Calculate delivery fee" }));
  await user.type(screen.getByLabelText("Street address"), " East");
  await act(async () => { finishQuote(Response.json({ fee: 500, miles: 5, currency: "USD" })); });
  expect(screen.queryByText(/5.00 driving miles/)).toBeNull();
  expect(screen.getByRole("button", { name: "Place Order", exact: true }).disabled).toBe(true);
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
