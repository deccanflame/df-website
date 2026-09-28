import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommunityDeliveryAdmin } from "../components/CommunityDeliveryAdmin";
import { getDoc, runTransaction } from "firebase/firestore";

const state = vi.hoisted(() => ({ saved: undefined, writes: [] }));
vi.mock("../lib/firebase", () => ({ firestore: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db, path) => ({ path }), serverTimestamp: () => "SERVER_TIME",
  getDoc: vi.fn(async () => ({ data: () => state.saved })),
  runTransaction: vi.fn(async (_db, update) => update({ get: async () => ({ data: () => state.saved }), set: (ref, payload) => { state.writes.push({ ref, payload }); state.saved = payload; } })),
}));

beforeEach(() => { state.saved = undefined; state.writes = []; vi.clearAllMocks(); vi.spyOn(window, "confirm").mockReturnValue(true); });
async function openPanel() { render(<CommunityDeliveryAdmin />); await waitFor(() => expect(screen.getByRole("group").disabled).toBe(false)); }
function add(name) { fireEvent.change(screen.getByLabelText("New community"), { target: { value: name } }); fireEvent.submit(screen.getByLabelText("New community").closest("form")); }

test("admins can add, rename, delete, change hours, and persist one atomic settings update", async () => {
  await openPanel(); expect(screen.getByText("Northgate")).toBeTruthy();
  add("Westgate");
  fireEvent.click(screen.getByRole("button", { name: "Edit Westgate" }));
  fireEvent.change(screen.getByLabelText("Community name"), { target: { value: "Westgate Village" } });
  fireEvent.submit(screen.getByLabelText("Community name").closest("form"));
  fireEvent.click(screen.getByRole("button", { name: "Delete Northgate" }));
  fireEvent.change(screen.getByLabelText("Window starts"), { target: { value: "18:30" } });
  fireEvent.change(screen.getByLabelText("Window ends"), { target: { value: "21:15" } });
  expect(state.writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Save delivery settings" }));
  await screen.findByText(/Delivery settings saved/);
  expect(state.writes[0]).toEqual({ ref: { path: "orderingSettings/communityDelivery" }, payload: { communities: ["Westgate Village"], startTime: "18:30", endTime: "21:15", version: 1, updatedAt: "SERVER_TIME" } });
  expect(screen.queryByText("Unsaved changes")).toBeNull();
});

test("duplicate names and equal times cannot be saved", async () => {
  await openPanel(); add("northgate");
  expect(screen.getByRole("alert").textContent).toContain("unique community");
  fireEvent.change(screen.getByLabelText("New community"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Window ends"), { target: { value: "19:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save delivery settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain("different start and end");
  expect(runTransaction).not.toHaveBeenCalled();
});

test("deleting the last community saves an empty list without resurrecting defaults", async () => {
  await openPanel(); fireEvent.click(screen.getByRole("button", { name: "Delete Northgate" }));
  fireEvent.click(screen.getByRole("button", { name: "Save delivery settings" }));
  await screen.findByText(/Delivery settings saved/);
  expect(state.saved.communities).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved settings" }));
  await waitFor(() => expect(screen.getByRole("group").disabled).toBe(false));
  expect(screen.queryByText("Northgate")).toBeNull();
});

test("concurrent edits are rejected without overwriting another admin's settings", async () => {
  await openPanel(); add("Westgate");
  state.saved = { communities: ["Another community"], startTime: "18:00", endTime: "20:00", version: 1 };
  fireEvent.click(screen.getByRole("button", { name: "Save delivery settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Another admin changed");
  expect(state.writes).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved settings" }));
  await screen.findByText("Another community");
});

test("load and save failures keep the form safe and retain unsaved edits", async () => {
  getDoc.mockRejectedValueOnce(new Error("denied"));
  render(<CommunityDeliveryAdmin />);
  await screen.findByRole("alert"); expect(screen.getByRole("group").disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Reload saved settings" }));
  await waitFor(() => expect(screen.getByRole("group").disabled).toBe(false));
  add("Westgate"); runTransaction.mockRejectedValueOnce(new Error("permission denied"));
  fireEvent.click(screen.getByRole("button", { name: "Save delivery settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Could not save");
  expect(screen.getByText("Westgate")).toBeTruthy(); expect(screen.getByText("Unsaved changes")).toBeTruthy();
});
