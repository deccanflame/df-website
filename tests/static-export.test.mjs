import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const output = new URL("../out/", import.meta.url);
for (const page of ["index.html", "menu/index.html", "dashboard/index.html", "404.html"]) {
  test(`static export provides ${page} with locally available assets`, async () => {
    const html = await readFile(new URL(page, output), "utf8");
    const dom = new JSDOM(html);
    const document = dom.window.document;
    assert.ok(document.querySelector("title")?.textContent);
    if (page === "404.html") assert.match(document.querySelector("h1")?.textContent ?? "", /404/);
    else assert.match(document.querySelector("title").textContent, /Deccan Flame/);
    assert.ok(document.querySelector('meta[name="viewport"]'));
    const paths = new Set();
    for (const element of document.querySelectorAll("[src], link[href]")) {
      const value = element.getAttribute("src") ?? element.getAttribute("href");
      if (value?.startsWith("/") && !value.startsWith("//")) paths.add(value.split("?")[0].slice(1));
    }
    assert.ok(paths.size > 0);
    for (const path of paths) assert.ok((await stat(new URL(path, output))).isFile(), `Missing static asset ${path}`);
    dom.window.close();
  });
}

test("homepage anchors, image descriptions, and canonical social URLs survive export", async () => {
  const dom = new JSDOM(await readFile(new URL("index.html", output), "utf8"));
  const document = dom.window.document;
  for (const link of document.querySelectorAll('a[href^="#"]')) {
    assert.ok(document.getElementById(link.getAttribute("href").slice(1)), `Broken anchor ${link.outerHTML}`);
  }
  for (const image of document.images) assert.ok(image.hasAttribute("alt"), `Missing alt: ${image.src}`);
  assert.equal(document.querySelector('meta[property="og:image"]').content, "https://deccanflame.com/og.png");
  assert.ok(document.querySelector('a[href="mailto:deccanflame1@gmail.com"]'));
  assert.equal(document.querySelectorAll("h1").length, 1);
  dom.window.close();
});

test("full menu and back home links are text-only, including mobile", async () => {
  for (const [page, label] of [["index.html", "View full menu"], ["menu/index.html", "Back home"]]) {
    const dom = new JSDOM(await readFile(new URL(page, output), "utf8"));
    const link = [...dom.window.document.querySelectorAll("a")].find(node => node.textContent.includes(label));
    assert.ok(link, `Missing ${label} link`);
    assert.equal(link.textContent.trim(), label);
    assert.equal(link.querySelector("svg, i, [aria-hidden]"), null);
    dom.window.close();
  }
});
