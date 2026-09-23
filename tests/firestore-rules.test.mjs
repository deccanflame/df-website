import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";

const projectId = "demo-deccan-flame";
let environment;
let guest, alice, bob, admin;
const path = "specialPolls/current";
const vote = (db, uid, optionId = "one", extra = {}) => setDoc(doc(db, `${path}/votes/${uid}`), { optionId, updatedAt: serverTimestamp(), ...extra });

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080, rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
  guest = environment.unauthenticatedContext().firestore();
  alice = environment.authenticatedContext("alice", { email: "alice@example.com" }).firestore();
  bob = environment.authenticatedContext("bob", { email: "bob@example.com" }).firestore();
  admin = environment.authenticatedContext("owner", { email: "owner@example.com" }).firestore();
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "users/owner"), { role: "admin", email: "owner@example.com" });
    batch.set(doc(db, "users/alice"), { role: "user", email: "alice@example.com" });
    batch.set(doc(db, "users/bob"), { role: "user", email: "bob@example.com" });
    batch.set(doc(db, path), { acceptingVotes: true, title: "Poll" });
    batch.set(doc(db, `${path}/options/one`), { active: true, name: "Marag" });
    batch.set(doc(db, `${path}/options/two`), { active: true, name: "Chicken" });
    batch.set(doc(db, `${path}/options/hidden`), { active: false, name: "Hidden" });
    await batch.commit();
  });
});
after(async () => environment?.cleanup());

test("guests can read the poll and dish options", async () => {
  await assertSucceeds(getDoc(doc(guest, path)));
  await assertSucceeds(getDocs(collection(guest, `${path}/options`)));
});
test("guests cannot read member profiles or vote totals", async () => {
  await assertFails(getDoc(doc(guest, "users/alice")));
  await assertFails(getDocs(collection(guest, `${path}/votes`)));
});
test("guests cannot vote", async () => assertFails(vote(guest, "alice")));
test("members can create their own vote and read results", async () => {
  await assertSucceeds(vote(alice, "alice"));
  assert.equal((await assertSucceeds(getDocs(collection(alice, `${path}/votes`)))).size, 1);
});
test("changing a vote replaces it instead of creating a duplicate", async () => {
  await vote(alice, "alice");
  await assertSucceeds(vote(alice, "alice", "two"));
  const votes = await getDocs(collection(admin, `${path}/votes`));
  assert.equal(votes.size, 1);
  assert.equal(votes.docs[0].data().optionId, "two");
});
test("concurrent updates still leave exactly one vote per member", async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => vote(alice, "alice", i % 2 ? "one" : "two")));
  assert.equal((await getDocs(collection(admin, `${path}/votes`))).size, 1);
});
test("members cannot create or replace someone else's vote", async () => {
  await assertFails(vote(alice, "bob"));
  await vote(bob, "bob");
  await assertFails(vote(alice, "bob", "two"));
});
test("a closed poll rejects both new votes and changes", async () => {
  await vote(alice, "alice");
  await updateDoc(doc(admin, path), { acceptingVotes: false });
  await assertFails(vote(bob, "bob"));
  await assertFails(vote(alice, "alice", "two"));
});
test("hidden or nonexistent options cannot receive votes", async () => {
  await assertFails(vote(alice, "alice", "hidden"));
  await assertFails(vote(alice, "alice", "missing"));
});
test("votes with client timestamps or unexpected fields are rejected", async () => {
  await assertFails(vote(alice, "alice", "one", { updatedAt: new Date(0) }));
  await assertFails(vote(alice, "alice", "one", { role: "admin" }));
});
test("malformed option IDs cannot bypass the rules", async () => {
  for (const optionId of [null, 5, [], {}, "../users/owner"]) await assertFails(vote(alice, "alice", optionId));
});
test("members cannot delete votes, while admins can", async () => {
  await vote(alice, "alice");
  await assertFails(deleteDoc(doc(alice, `${path}/votes/alice`)));
  await assertSucceeds(deleteDoc(doc(admin, `${path}/votes/alice`)));
});
test("members cannot change poll settings or options", async () => {
  await assertFails(updateDoc(doc(alice, path), { acceptingVotes: false }));
  await assertFails(updateDoc(doc(alice, `${path}/options/one`), { active: false }));
  await assertFails(setDoc(doc(alice, `${path}/options/new`), { active: true }));
  await assertFails(deleteDoc(doc(alice, `${path}/options/one`)));
});
test("admins can create, edit, hide and remove options", async () => {
  const option = doc(admin, `${path}/options/new`);
  await assertSucceeds(setDoc(option, { active: true, name: "Starter" }));
  await assertSucceeds(updateDoc(option, { active: false, name: "Updated" }));
  await assertSucceeds(deleteDoc(option));
});
test("new members can create only their own normal profile", async () => {
  const db = environment.authenticatedContext("new", { email: "new@example.com" }).firestore();
  await assertFails(setDoc(doc(db, "users/new"), { role: "admin", email: "new@example.com" }));
  await assertFails(setDoc(doc(db, "users/someone-else"), { role: "user", email: "new@example.com" }));
  await assertFails(setDoc(doc(db, "users/new"), { role: "user", email: "forged@example.com" }));
  await assertSucceeds(setDoc(doc(db, "users/new"), { role: "user", email: "new@example.com", displayName: "New Guest", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
});
test("members cannot promote themselves or delete their profiles", async () => {
  await assertFails(updateDoc(doc(alice, "users/alice"), { role: "admin" }));
  await assertFails(deleteDoc(doc(alice, "users/alice")));
});
test("new profiles reject unexpected fields, oversized names and forged timestamps", async () => {
  const db = environment.authenticatedContext("new", { email: "new@example.com" }).firestore();
  const profile = { role: "user", email: "new@example.com", displayName: "Guest", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  for (const changes of [{ admin: true }, { displayName: "x".repeat(101) }, { displayName: {} }, { createdAt: new Date(0) }]) {
    await assertFails(setDoc(doc(db, "users/new"), { ...profile, ...changes }));
  }
});
test("ordering rate-limit records cannot be read or modified through browser clients", async () => {
  for (const db of [guest, alice, admin]) {
    await assertFails(getDoc(doc(db, "_orderingRateLimits/bucket")));
    await assertFails(setDoc(doc(db, "_orderingRateLimits/bucket"), { count: 0 }));
  }
});
test("members can read only their own profile; admins can read others", async () => {
  await assertSucceeds(getDoc(doc(alice, "users/alice")));
  await assertFails(getDoc(doc(alice, "users/bob")));
  await assertSucceeds(getDoc(doc(admin, "users/bob")));
});
test("admin role revocation immediately removes write access", async () => {
  await environment.withSecurityRulesDisabled((context) => updateDoc(doc(context.firestore(), "users/owner"), { role: "user" }));
  await assertFails(updateDoc(doc(admin, path), { acceptingVotes: false }));
});
test("unknown collections deny reads and writes", async () => {
  await assertFails(getDoc(doc(admin, "private/unexpected")));
  await assertFails(setDoc(doc(admin, "private/unexpected"), { value: "x" }));
});
test("real-time listeners receive a second user's vote", async () => {
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error("Snapshot timeout")); }, 10000);
    const stop = onSnapshot(collection(alice, `${path}/votes`), (snapshot) => {
      if (!snapshot.metadata.fromCache && snapshot.size === 1) { clearTimeout(timer); stop(); resolve(snapshot.docs[0].id); }
    }, reject);
  });
  await vote(bob, "bob");
  assert.equal(await result, "bob");
});
