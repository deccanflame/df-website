import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ auth: {}, listeners: [], batches: [] }));
vi.mock("../app/providers", () => ({ useAuth: () => state.auth }));
vi.mock("../lib/firebase", () => ({ firestore: {}, firebaseConfigured: true }));
vi.mock("next/link", () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
vi.mock("firebase/firestore", () => ({
  doc: (_db, ...parts) => ({ path: parts.join("/") }),
  collection: (_db, ...parts) => ({ path: parts.join("/") }),
  query: (ref) => ref,
  orderBy: vi.fn(), where: vi.fn(), serverTimestamp: () => "SERVER_TIME",
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn().mockResolvedValue({ data: () => ({ acceptingVotes: true }) }),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  addDoc: vi.fn().mockResolvedValue({ id: "new" }),
  onSnapshot: (ref, success, error) => {
    const stop = vi.fn();
    state.listeners.push({ ...ref, success, error, stop });
    return stop;
  },
  writeBatch: () => {
    const batch = { delete: vi.fn(), set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    state.batches.push(batch);
    return batch;
  },
}));

import { AuthModal } from "../components/AuthModal";
import { VoteWidget } from "../components/VoteWidget";
import DashboardPage from "../app/dashboard/page";
import Home from "../app/page";
import { deleteDocuments } from "../lib/deleteDocuments";
import { setDoc, updateDoc, getDocs } from "firebase/firestore";

beforeEach(() => {
  vi.clearAllMocks();
  state.listeners = [];
  state.batches = [];
  state.auth = {
    authOpen: true, authMode: "login", configured: true, loading: false,
    user: null, profile: null, closeAuth: vi.fn(), openAuth: vi.fn(),
    setAuthMode: vi.fn(), register: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue(undefined), resetPassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };
});

function emit(path, data, collection = false) {
  const listener = state.listeners.find((item) => item.path === path);
  if (!listener) throw new Error(`No listener for ${path}`);
  act(() => listener.success(collection ? {
    docs: data.map(({ id, ...fields }) => ({ id, data: () => fields })), size: data.length, empty: !data.length,
  } : { data: () => data }));
}

const pollPath = "specialPolls/current";
function loadPoll(options = [
  { id: "one", name: "Marag", description: "Broth", category: "Soup", active: true },
  { id: "two", name: "Chicken", description: "Dum", category: "Classic", active: true },
]) {
  emit(pollPath, { acceptingVotes: true, title: "Choose a dish" });
  emit(`${pollPath}/options`, options, true);
}

describe("account dialog", () => {
  it("does not render when closed", () => {
    state.auth.authOpen = false;
    render(<AuthModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("explains missing Firebase setup", () => {
    state.auth.configured = false;
    render(<AuthModal />);
    expect(screen.getByText("Connect your Firebase project.")).toBeTruthy();
  });
  it("rejects mismatched registration passwords", async () => {
    state.auth.authMode = "register";
    render(<AuthModal />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Guest" } });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), { target: { value: "abcdef" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different" } });
    fireEvent.submit(screen.getByRole("button", { name: /Create account/ }).closest("form"));
    expect(screen.getByRole("status").textContent).toContain("Passwords do not match");
    expect(state.auth.register).not.toHaveBeenCalled();
  });
  it("rejects whitespace-only names", () => {
    state.auth.authMode = "register";
    render(<AuthModal />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("button", { name: /Create account/ }).closest("form"));
    expect(screen.getByRole("status").textContent).toBe("Enter your name.");
  });
  it("submits trimmed email and preserves password characters", async () => {
    render(<AuthModal />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "guest@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: " password " } });
    fireEvent.submit(screen.getByLabelText("Password").closest("form"));
    await waitFor(() => expect(state.auth.login).toHaveBeenCalledWith("guest@example.com", " password "));
  });
  it("shows a friendly error for invalid credentials", async () => {
    state.auth.login.mockRejectedValueOnce({ code: "auth/invalid-credential" });
    render(<AuthModal />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcdef" } });
    fireEvent.submit(screen.getByLabelText("Password").closest("form"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("doesn’t match"));
  });
  it("requires an email before requesting a password reset", async () => {
    render(<AuthModal />);
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(state.auth.resetPassword).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Enter your email first");
  });
  it("requests a password reset using the supplied email", async () => {
    render(<AuthModal />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "guest@example.com" } });
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(state.auth.resetPassword).toHaveBeenCalledWith("guest@example.com");
    expect(screen.getByRole("status").textContent).toContain("Password reset email sent");
  });
  it("traps keyboard focus and restores it on close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener); opener.focus();
    const { unmount } = render(<AuthModal />);
    expect(document.activeElement).toBe(screen.getByLabelText("Close account dialog"));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reset password" }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Close account dialog"));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
    opener.remove();
  });
  it("closes on Escape", async () => {
    render(<AuthModal />);
    await userEvent.keyboard("{Escape}");
    expect(state.auth.closeAuth).toHaveBeenCalledOnce();
  });
  it("clears sensitive fields after closing and reopening", () => {
    const { rerender } = render(<AuthModal />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-password" } });
    state.auth.authOpen = false; rerender(<AuthModal />);
    state.auth.authOpen = true; rerender(<AuthModal />);
    expect(screen.getByLabelText("Password").value).toBe("");
  });
});

describe("voting", () => {
  it("asks a guest to register without writing a vote", async () => {
    render(<VoteWidget />); loadPoll();
    await userEvent.click(screen.getByRole("button", { name: "Marag" }));
    expect(state.auth.openAuth).toHaveBeenCalledWith("register");
    expect(setDoc).not.toHaveBeenCalled();
  });
  it("stores a member vote under their uid with a server timestamp", async () => {
    state.auth.user = { uid: "member" };
    render(<VoteWidget />); loadPoll();
    await userEvent.click(screen.getByRole("button", { name: /Marag/ }));
    expect(setDoc).toHaveBeenCalledWith({ path: `${pollPath}/votes/member` }, { optionId: "one", updatedAt: "SERVER_TIME" });
  });
  it("disables every option when the poll is closed", () => {
    render(<VoteWidget />); loadPoll();
    emit(pollPath, { acceptingVotes: false });
    expect(screen.getAllByRole("button").every((button) => button.disabled)).toBe(true);
  });
  it("fails closed if the poll document is missing", () => {
    render(<VoteWidget />); loadPoll(); emit(pollPath, undefined);
    expect(screen.getByText("Voting closed")).toBeTruthy();
  });
  it("fails closed and reports a poll listener error", () => {
    render(<VoteWidget />); loadPoll();
    act(() => state.listeners.find((item) => item.path === pollPath).error(new Error("denied")));
    expect(screen.getByRole("status").textContent).toContain("could not be loaded");
    expect(screen.getAllByRole("button").every((button) => button.disabled)).toBe(true);
  });
  it("handles a poll containing only hidden options", () => {
    render(<VoteWidget />);
    loadPoll([{ id: "hidden", name: "Hidden dish", active: false }]);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("being prepared");
  });
  it("excludes hidden contenders from the visible percentage denominator", () => {
    state.auth.user = { uid: "member" };
    render(<VoteWidget />); loadPoll();
    emit(`${pollPath}/votes`, [
      { id: "member", optionId: "one" }, { id: "other", optionId: "two" }, { id: "old", optionId: "hidden" },
    ], true);
    expect(screen.getByRole("button", { name: "Marag, 50 percent" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Chicken, 50 percent" })).toBeTruthy();
  });
  it("reports a failed write and permits retry", async () => {
    state.auth.user = { uid: "member" };
    setDoc.mockRejectedValueOnce(new Error("offline"));
    render(<VoteWidget />); loadPoll();
    await userEvent.click(screen.getByRole("button", { name: /Marag/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("could not be saved"));
    expect(screen.getByRole("button", { name: /Marag/ }).disabled).toBe(false);
  });
  it("unsubscribes every Firestore listener on unmount", () => {
    state.auth.user = { uid: "member" };
    const { unmount } = render(<VoteWidget />); unmount();
    expect(state.listeners).toHaveLength(3);
    state.listeners.forEach((listener) => expect(listener.stop).toHaveBeenCalledOnce());
  });
});

describe("admin dashboard", () => {
  it("requires sign-in before showing the dashboard", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Sign in to continue.")).toBeTruthy();
    expect(state.listeners).toHaveLength(0);
  });
  it("denies normal members and never subscribes to admin data", () => {
    state.auth.user = { uid: "member" }; state.auth.profile = { role: "user" };
    render(<DashboardPage />);
    expect(screen.getByText("This account does not have admin rights.")).toBeTruthy();
    expect(state.listeners).toHaveLength(0);
  });
  it("renders management controls for admins", () => {
    state.auth.user = { uid: "admin" }; state.auth.profile = { role: "admin", displayName: "Owner" };
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Add a contender" })).toBeTruthy();
    expect(state.listeners).toHaveLength(3);
  });
  it("reports subscription errors instead of appearing empty", () => {
    state.auth.user = { uid: "admin" }; state.auth.profile = { role: "admin", displayName: "Owner" };
    render(<DashboardPage />);
    act(() => state.listeners[0].error(new Error("permission denied")));
    expect(screen.getByRole("status").textContent).toContain("could not be loaded");
  });
  it("closes voting before deleting votes and restores the previous state", async () => {
    state.auth.user = { uid: "admin" }; state.auth.profile = { role: "admin", displayName: "Owner" };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    getDocs.mockResolvedValueOnce({ docs: [{ ref: { path: "vote1" } }] });
    render(<DashboardPage />);
    emit(`${pollPath}/votes`, [{ id: "member", optionId: "one" }], true);
    await userEvent.click(screen.getByRole("button", { name: "Reset votes" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("have been reset"));
    expect(updateDoc.mock.calls[0][1].acceptingVotes).toBe(false);
    expect(updateDoc.mock.calls[1][1].acceptingVotes).toBe(true);
    expect(updateDoc.mock.invocationCallOrder[0]).toBeLessThan(getDocs.mock.invocationCallOrder[0]);
  });
});

describe("large vote deletion", () => {
  it("does not create a batch for an empty collection", async () => {
    await deleteDocuments({}, []); expect(state.batches).toHaveLength(0);
  });
  it("deletes 1001 documents in bounded batches", async () => {
    await deleteDocuments({}, Array.from({ length: 1001 }, (_, index) => ({ id: index })));
    expect(state.batches.map((batch) => batch.delete.mock.calls.length)).toEqual([400, 400, 201]);
    state.batches.forEach((batch) => expect(batch.commit).toHaveBeenCalledOnce());
  });
});

describe("navigation", () => {
  it("opens the menu, closes with Escape, and restores the trigger focus", async () => {
    render(<Home />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open menu" }));
  });
});
