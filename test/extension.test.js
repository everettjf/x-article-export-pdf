"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const CONTENT_FILES = [
  "namespace.js",
  "sanitize.js",
  "detector.js",
  "extractor.js",
  "renderer.js",
  "markdown.js",
].map((f) => path.join(__dirname, "..", "src", "content", f));

// Load the content modules into a fresh jsdom window and return its XAEP.
function load(html, url = "https://x.com/janedev/status/123") {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  for (const file of CONTENT_FILES) {
    dom.window.eval(fs.readFileSync(file, "utf8"));
  }
  return dom.window;
}

// A synthetic Article read view that mirrors X's Draft.js structure.
const ARTICLE_HTML = `<!doctype html><html><head><title>My Great Article / X</title></head>
<body>
<div data-testid="User-Name">Jane Dev
@janedev</div>
<article role="article">
  <div data-testid="twitterArticleReadView">
    <h1 data-block="true">My Great Article</h1>
    <div data-block="true">Intro with a <a href="https://t.co/x">https://example.com</a> and <strong>bold</strong> text.</div>
    <div data-block="true">\\n</div>
    <h2 data-block="true">Section One</h2>
    <ul>
      <li data-block="true">First item</li>
      <li data-block="true">Second <em>emphasised</em> item</li>
    </ul>
    <ol>
      <li data-block="true">Step one</li>
      <li data-block="true">Step two</li>
    </ol>
    <div data-testid="markdown-code-block"><span>python</span><pre>def hi():
    print("hello")</pre></div>
    <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/abc.jpg?name=small" alt="A diagram"></div>
    <blockquote data-block="true">A wise quote here</blockquote>
    <div data-block="true">Euler: <span class="katex"><math display="inline"><semantics><annotation encoding="application/x-tex">e^{i\\pi}+1=0</annotation></semantics></math></span></div>
  </div>
</article>
</body></html>`;

test("detects article mode and title/byline", () => {
  const w = load(ARTICLE_HTML);
  const d = w.XAEP.detect();
  assert.equal(d.mode, "article");
  assert.equal(d.title, "My Great Article");
  const byline = w.XAEP.getByline();
  assert.equal(byline.name, "Jane Dev");
  assert.equal(byline.handle, "@janedev");
});

test("cleanDocTitle strips the X suffix", () => {
  const w = load(ARTICLE_HTML);
  assert.equal(w.XAEP.cleanDocTitle(), "My Great Article");
});

test("extracts a structured, ordered segment list", () => {
  const w = load(ARTICLE_HTML);
  const segs = w.XAEP.extract(w.XAEP.detect());
  const types = segs.map((s) => s.type);

  assert.deepEqual(Array.from(types), [
    "heading", // H1
    "text", // intro (the \n filler block is dropped)
    "heading", // H2
    "list", // ul
    "list", // ol
    "code",
    "image",
    "quote",
    "text", // "Euler:"
    "math",
  ]);
});

test("preserves links and inline emphasis, resolving t.co to the visible URL", () => {
  const w = load(ARTICLE_HTML);
  const segs = w.XAEP.extract(w.XAEP.detect());
  const intro = segs.find((s) => s.type === "text");
  assert.match(intro.html, /<a href="https:\/\/example\.com">https:\/\/example\.com<\/a>/);
  assert.match(intro.html, /<strong>bold<\/strong>/);
});

test("groups list items and tracks ordered vs unordered", () => {
  const w = load(ARTICLE_HTML);
  const lists = w.XAEP.extract(w.XAEP.detect()).filter((s) => s.type === "list");
  assert.equal(lists.length, 2);
  assert.equal(lists[0].ordered, false);
  assert.equal(lists[0].items.length, 2);
  assert.match(lists[0].items[1], /<em>emphasised<\/em>/);
  assert.equal(lists[1].ordered, true);
});

test("captures code with language and exact whitespace", () => {
  const w = load(ARTICLE_HTML);
  const code = w.XAEP.extract(w.XAEP.detect()).find((s) => s.type === "code");
  assert.equal(code.language, "python");
  assert.match(code.text, /def hi\(\):\n {4}print\("hello"\)/);
});

test("upgrades image URLs to original resolution", () => {
  const w = load(ARTICLE_HTML);
  const img = w.XAEP.extract(w.XAEP.detect()).find((s) => s.type === "image");
  assert.match(img.src, /name=orig/);
  assert.equal(img.alt, "A diagram");
});

test("drops Draft.js \\n filler blocks", () => {
  const w = load(ARTICLE_HTML);
  const segs = w.XAEP.extract(w.XAEP.detect());
  for (const s of segs.filter((x) => x.type === "text")) {
    assert.notEqual(s.html.trim(), "\\n");
  }
});

test("renders a safe HTML body and escapes code", () => {
  const w = load(ARTICLE_HTML.replace("def hi():", "x < 1 && y > 2"));
  const d = w.XAEP.detect();
  const segs = w.XAEP.extract(d);
  const body = w.XAEP.buildBody(segs, {
    title: d.title,
    url: "https://x.com/janedev/status/123",
    byline: w.XAEP.getByline(),
  }, { theme: "modern", includeSource: true });

  assert.match(body, /<h1 class="xa-title">My Great Article<\/h1>/);
  assert.match(body, /class="xa-byline"/);
  assert.match(body, /x &lt; 1 &amp;&amp; y &gt; 2/); // code is escaped
  assert.match(body, /Source: <a href="https:\/\/x\.com/);
});

test("buildStyles honors page size and theme", () => {
  const w = load(ARTICLE_HTML);
  assert.match(w.XAEP.buildStyles({ pageSize: "letter" }), /size:letter/);
  assert.match(w.XAEP.buildStyles({ pageSize: "a4" }), /size:A4/);
});

test("serializes Markdown with headings, lists, code, links and math", () => {
  const w = load(ARTICLE_HTML);
  const d = w.XAEP.detect();
  const segs = w.XAEP.extract(d);
  const md = w.XAEP.buildMarkdown(segs, {
    title: d.title,
    url: "https://x.com/janedev/status/123",
    byline: w.XAEP.getByline(),
  }, { includeSource: true });

  assert.match(md, /^# My Great Article/m);
  assert.match(md, /\*by Jane Dev \(@janedev\)\*/);
  assert.match(md, /## Section One/);
  assert.match(md, /- First item/);
  assert.match(md, /1\. Step one/);
  assert.match(md, /```python\ndef hi\(\):/);
  assert.match(md, /\[https:\/\/example\.com\]\(https:\/\/example\.com\)/);
  assert.match(md, /\*\*bold\*\*/);
  assert.match(md, /!\[A diagram\]\(https:\/\/pbs\.twimg\.com/);
  assert.match(md, /\$e\^\{i\\pi\}\+1=0\$/); // TeX recovered from KaTeX annotation
});

test("falls back to thread extraction when no article view exists", () => {
  const threadHtml = `<!doctype html><html><head><title>Jane on X</title></head><body>
    <article><div data-testid="tweetText">First tweet body</div>
      <img src="https://pbs.twimg.com/media/t1.jpg"></article>
    <article><div data-testid="tweetText">Second tweet body</div></article>
  </body></html>`;
  const w = load(threadHtml);
  const d = w.XAEP.detect();
  assert.equal(d.mode, "thread");
  const segs = w.XAEP.extract(d);
  const types = segs.map((s) => s.type);
  assert.deepEqual(Array.from(types), ["text", "image", "separator", "text"]);
  assert.equal(segs[0].html, "First tweet body");
});

test("reports 'none' when there is no content", () => {
  const w = load(`<!doctype html><html><head><title>X</title></head><body></body></html>`);
  assert.equal(w.XAEP.detect().mode, "none");
});
