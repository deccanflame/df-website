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
afterEach(() => vi.unstubAllGlobals());
const renderMenu = () => render(<SquareMenu><p>Restaurant printed menu</p></SquareMenu>);

test("shows the browse-only menu and retry when ordering is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Online ordering is not available yet." }, { status: 503 })));
  renderMenu();
  expect(await screen.findByText(/Online ordering is not available yet/)).toBeTruthy();
  expect(screen.getByText("Restaurant printed menu")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Continue to Square/ })).toBeNull();
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
  await user.click(screen.getByRole("button", { name: /Continue to Square/ }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Please try again shortly.");
  const first = JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout/"))[1].body);
  expect(fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout/"))[1].headers["X-Firebase-AppCheck"]).toBe("test-app-check");
  expect(first.items).toEqual([{ variationId: "regular", modifierIds: ["mild"], quantity: 1 }]);
  expect(first.customer.email).toBe("test@example.com");
  expect(first.idempotencyKey).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Continue to Square/ }));
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/checkout/")).length).toBe(2));
  const last = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
  expect(last.idempotencyKey).toBe(first.idempotencyKey);
  expect(sessionStorage.getItem("deccan-flame-cart-v1")).not.toContain("test@example.com");
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
  await user.click(screen.getByRole("button", { name: /Continue to Square/ }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Browser verification failed.");
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/checkout/"))).toBe(false);
});

test("restores the cart but blocks removed dishes and never claims a completed payment", async () => {
  sessionStorage.setItem("deccan-flame-cart-v1", JSON.stringify([{ variationId: "removed-dish", modifierIds: [], quantity: 1 }]));
  sessionStorage.setItem("deccan-flame-checkout-v1-started", "true");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(menu)));
  renderMenu();
  expect(await screen.findByText("Unavailable item")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Continue to Square/ }).disabled).toBe(true);
  expect(screen.getByText(/Your Square receipt confirms/)).toBeTruthy();
  expect(screen.queryByText("Payment successful")).toBeNull();
});
