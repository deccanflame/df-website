import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete Deccan Flame experience in the intended order", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Deccan Flame \| Hyderabadi Cuisine, Reignited<\/title>/i);
  assert.match(html, /Signature menu/);
  assert.match(html, /The people’s special/);
  assert.match(html, /Demand your Dish/);
  assert.match(html, /class="poll-options/);
  assert.doesNotMatch(html, /class="vote-dish/);
  assert.match(html, /Catering enquiries/);
  assert.match(html, /mailto:deccanflame1@gmail.com/);
  assert.match(html, /https:\/\/deccanflame.com\/og.png/);
  assert.match(html, /Sign in or register/);
  assert.match(html, /mutton-dum-biryani\.png/);
  assert.match(html, /mutton-haleem\.png/);
  assert.match(html, /mirchi-ka-salan-v3\.png/);
  assert.match(html, /double-ka-meetha\.png/);
  assert.doesNotMatch(html, /Come hungry|Leave lit/i);

  const menuIndex = html.indexOf('id="menu"');
  const voteIndex = html.indexOf('id="vote"');
  const cateringIndex = html.indexOf('id="catering"');
  assert.ok(menuIndex >= 0 && voteIndex > menuIndex && cateringIndex > voteIndex);
});

test("unknown routes return a real 404 response", async () => {
  assert.equal((await render("/does-not-exist")).status, 404);
});

test("ships Firebase auth, live voting, and role-gated admin controls", async () => {
  const [dashboardResponse, provider, widget, dashboard, rules, envExample] = await Promise.all([
    render("/dashboard"),
    readFile(new URL("../app/providers.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/VoteWidget.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.equal(dashboardResponse.status, 200);
  assert.match(await dashboardResponse.text(), /Firebase setup required|Checking access…/);
  assert.match(provider, /createUserWithEmailAndPassword/);
  assert.match(provider, /signInWithEmailAndPassword/);
  assert.match(provider, /role:\s*"user"/);
  assert.match(widget, /specialPolls/);
  assert.match(widget, /votes", user\.uid/);
  assert.match(dashboard, /profile\?\.role === "admin"/);
  assert.match(dashboard, /Add a contender/);
  assert.match(rules, /function isAdmin\(\)/);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(envExample, /NEXT_PUBLIC_FIREBASE_PROJECT_ID/);
});
