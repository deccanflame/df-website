import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authChanged: null, stopAuth: null, profiles: [] }));
vi.mock("../lib/firebase", () => ({ firebaseConfigured: true, firebaseAuth: {}, firestore: {} }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth, callback) => {
    state.authChanged = callback; state.stopAuth = vi.fn(); return state.stopAuth;
  },
  createUserWithEmailAndPassword: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(), signOut: vi.fn(), updateProfile: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db, collection, uid) => ({ path: `${collection}/${uid}` }),
  serverTimestamp: vi.fn(), setDoc: vi.fn(),
  onSnapshot: (ref, success, error) => {
    const stop = vi.fn(); state.profiles.push({ ref, success, error, stop }); return stop;
  },
}));
import { AuthProvider, useAuth } from "../app/providers";

function Probe() {
  const { user, profile, loading } = useAuth();
  return <output>{JSON.stringify({ uid: user?.uid ?? null, role: profile?.role ?? null, loading })}</output>;
}
const value = () => JSON.parse(screen.getByRole("status").textContent);
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);
const signIn = (uid) => act(() => state.authChanged({ uid, email: `${uid}@example.com` }));
const profile = (role) => act(() => state.profiles.at(-1).success({ data: () => ({ role }) }));

beforeEach(() => { state.profiles = []; state.authChanged = null; });

it("waits for a profile snapshot before finishing account loading", () => {
  mount(); signIn("member");
  expect(value()).toEqual({ uid: "member", role: null, loading: true });
  profile("user");
  expect(value()).toEqual({ uid: "member", role: "user", loading: false });
});
it("clears the old admin role immediately when accounts change", () => {
  mount(); signIn("owner"); profile("admin");
  expect(value().role).toBe("admin");
  signIn("member");
  expect(value()).toEqual({ uid: "member", role: null, loading: true });
  expect(state.profiles[0].stop).toHaveBeenCalledOnce();
  profile("user"); expect(value().role).toBe("user");
});
it("sign-out clears account state and stops the profile listener", () => {
  mount(); signIn("owner"); profile("admin");
  act(() => state.authChanged(null));
  expect(value()).toEqual({ uid: null, role: null, loading: false });
  expect(state.profiles[0].stop).toHaveBeenCalledOnce();
});
it("a failed profile read does not grant admin rights", () => {
  mount(); signIn("member");
  act(() => state.profiles[0].error(new Error("permission denied")));
  expect(value()).toEqual({ uid: "member", role: "user", loading: false });
});
it("unmount stops both authentication and profile subscriptions", () => {
  const { unmount } = mount(); signIn("member"); unmount();
  expect(state.stopAuth).toHaveBeenCalledOnce();
  expect(state.profiles[0].stop).toHaveBeenCalledOnce();
});
