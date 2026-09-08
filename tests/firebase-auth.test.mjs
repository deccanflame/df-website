import assert from "node:assert/strict";
import { after, test } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile, confirmPasswordReset } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

const projectId = "demo-deccan-flame";
const app = initializeApp({ projectId, apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com` }, "auth-integration");
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
const email = `guest-${Date.now()}@example.com`;
let uid;
after(() => deleteApp(app));

test("registration creates an account and the app's normal member profile", async () => {
  const credential = await createUserWithEmailAndPassword(auth, email, "Test-only-Password123!");
  uid = credential.user.uid;
  await updateProfile(credential.user, { displayName: "Test Guest" });
  await setDoc(doc(db, "users", uid), {
    displayName: "Test Guest", email, role: "user", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  assert.equal(auth.currentUser.displayName, "Test Guest");
  assert.equal((await getDoc(doc(db, "users", uid))).data().role, "user");
});
test("duplicate registration is rejected", async () => {
  await assert.rejects(createUserWithEmailAndPassword(auth, email, "Test-only-Password123!"), { code: "auth/email-already-in-use" });
});
test("sign-out is delivered to the authentication listener", async () => {
  const signedOut = new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (user) => { if (!user) { stop(); resolve(); } });
  });
  await signOut(auth); await signedOut;
  assert.equal(auth.currentUser, null);
});
test("wrong passwords fail and correct passwords restore the same account", async () => {
  await assert.rejects(signInWithEmailAndPassword(auth, email, "wrong-password"));
  const credential = await signInWithEmailAndPassword(auth, email, "Test-only-Password123!");
  assert.equal(credential.user.uid, uid);
});
test("password reset completes entirely inside the emulator", async () => {
  await sendPasswordResetEmail(auth, email);
  const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/oobCodes`);
  assert.equal(response.status, 200);
  const { oobCodes } = await response.json();
  const code = oobCodes.find((item) => item.email === email && item.requestType === "PASSWORD_RESET");
  assert.ok(code);
  await confirmPasswordReset(auth, code.oobCode, "New-Test-only-Password123!");
  await signOut(auth);
  await assert.rejects(signInWithEmailAndPassword(auth, email, "Test-only-Password123!"));
  assert.equal((await signInWithEmailAndPassword(auth, email, "New-Test-only-Password123!")).user.uid, uid);
});
