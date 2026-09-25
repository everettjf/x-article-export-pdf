"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "src/print/printable.html"), "utf8");
const script = fs.readFileSync(path.join(__dirname, "..", "src/print/printable.js"), "utf8");

test("concurrent print pages consume only their own jobs", async () => {
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const jobs = new Map([
    [`xaepPrintJob:${firstId}`, { title: "First", body: "<p>First body</p>" }],
    [`xaepPrintJob:${secondId}`, { title: "Second", body: "<p>Second body</p>" }],
  ]);
  const removed = [];
  let bothPrinted;
  let printCount = 0;
  const printed = new Promise((resolve) => { bothPrinted = resolve; });

  function open(id) {
    const dom = new JSDOM(html, {
      url: `https://extension.test/printable.html?job=${id}`,
      runScripts: "outside-only",
    });
    const w = dom.window;
    w.print = () => {
      printCount++;
      if (printCount === 2) bothPrinted();
    };
    w.focus = () => {};
    w.chrome = { storage: { session: {
      get: async (key) => ({ [key]: jobs.get(key) }),
      remove: async (key) => {
        removed.push(key);
        jobs.delete(key);
      },
    } } };
    w.eval(script);
    return dom;
  }

  const first = open(firstId);
  const second = open(secondId);
  let timeout;
  await Promise.race([
    printed,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("print jobs timed out")), 1000);
    }),
  ]);
  clearTimeout(timeout);

  assert.equal(first.window.document.title, "First");
  assert.equal(second.window.document.title, "Second");
  assert.match(first.window.document.querySelector("#xa-root").textContent, /First body/);
  assert.match(second.window.document.querySelector("#xa-root").textContent, /Second body/);
  assert.deepEqual(removed.sort(), [`xaepPrintJob:${firstId}`, `xaepPrintJob:${secondId}`]);
  assert.equal(jobs.size, 0);
  first.window.close();
  second.window.close();
});
