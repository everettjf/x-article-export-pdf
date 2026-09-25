"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("extension uses click-scoped permissions and packages its math assets", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);

  const html = fs.readFileSync(path.join(root, "src/print/printable.html"), "utf8");
  assert.match(html, /href="katex\/katex\.min\.css"/);
  const css = fs.readFileSync(path.join(root, "src/print/katex/katex.min.css"), "utf8");
  for (const [, font] of css.matchAll(/url\((?:"|')?(fonts\/[^)'" ]+)/g)) {
    assert.ok(fs.existsSync(path.join(root, "src/print/katex", font)), `${font} is packaged`);
  }
});
