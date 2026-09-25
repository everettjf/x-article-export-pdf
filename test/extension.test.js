"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const katex = require("katex");

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

test("exports only the status named by the URL, ignoring nearby recommendations", () => {
  const threadHtml = `<!doctype html><html><head><title>Jane on X</title></head><body>
    <article><a href="/other/status/100"><time>Yesterday</time></a>
      <a href="/janedev/status/123">Quoted link to requested tweet</a>
      <div data-testid="User-Name">Other User
@other</div>
      <div data-testid="tweetText">Unrelated tweet</div></article>
    <article><a href="/janedev/status/123"><time>Today</time></a>
      <div data-testid="User-Name">Jane Dev
@janedev</div>
      <div data-testid="tweetText">Requested tweet</div>
      <img src="https://pbs.twimg.com/media/t1.jpg"></article>
    <article><a href="/other/status/456"><time>Today</time></a>
      <div data-testid="tweetText">Recommended tweet</div></article>
  </body></html>`;
  const w = load(threadHtml);
  const d = w.XAEP.detect();
  assert.equal(d.mode, "thread");
  const segs = w.XAEP.extract(d);
  const types = segs.map((s) => s.type);
  assert.deepEqual(Array.from(types), ["text", "image"]);
  assert.equal(segs[0].html, "Requested tweet");
  assert.equal(w.XAEP.getByline(d.container).name, "Jane Dev");
  assert.equal(w.XAEP.getByline(d.container).handle, "@janedev");
});

test("does not guess which tweet to export when the status cannot be identified", () => {
  const w = load(`<!doctype html><body>
    <article><div data-testid="tweetText">Unrelated one</div></article>
    <article><div data-testid="tweetText">Unrelated two</div></article>
  </body>`);
  assert.deepEqual(Array.from(w.XAEP.extract(w.XAEP.detect())), []);
});

test("does not present a feed tweet as the current tweet", () => {
  const w = load(`<!doctype html><body><article><div data-testid="tweetText">Feed item</div></article></body>`, "https://x.com/home");
  assert.equal(w.XAEP.detect().mode, "none");
});

test("short, loaded articles do not scroll the page", async () => {
  const w = load(ARTICLE_HTML);
  // Pretend every image is already loaded.
  w.document.querySelectorAll("img").forEach((img) =>
    Object.defineProperty(img, "complete", { value: true, configurable: true })
  );
  const calls = [];
  w.scrollTo = (x, y) => calls.push([x, y]);

  await w.XAEP.extractComplete(w.XAEP.detect());
  assert.equal(calls.length, 0, "should not disturb the page's scroll position");
});

test("captures text-only article blocks before virtualized views disappear", async () => {
  const w = load(`<!doctype html><body><article><div data-testid="twitterArticleReadView">
    <div data-block="true">First</div><div data-block="true">Second</div>
  </div></article></body>`);
  const scope = w.document.querySelector('[data-testid="twitterArticleReadView"]');
  Object.defineProperty(w, "innerHeight", { value: 600, configurable: true });
  scope.getBoundingClientRect = () => ({ top: 0, height: 1200 });
  w.scrollTo = (_x, y) => {
    if (y >= 1000) scope.innerHTML = '<div data-block="true">Third</div><div data-block="true">Fourth</div>';
    else if (y >= 500) scope.innerHTML = '<div data-block="true">Second</div><div data-block="true">Third</div>';
    else scope.innerHTML = '<div data-block="true">First</div><div data-block="true">Second</div>';
  };
  const segments = await w.XAEP.extractComplete(w.XAEP.detect());
  assert.deepEqual(Array.from(segments, (s) => s.html), ["First", "Second", "Third", "Fourth"]);
});

test("removes untrusted markup from KaTeX while retaining TeX annotation", () => {
  const html = ARTICLE_HTML.replace(
    '<span class="katex"><math',
    '<span class="katex" onclick="bad()" style="background:url(https://evil.example/x)"><img src="https://evil.example/x" onerror="bad()"><math'
  );
  const w = load(html);
  const math = w.XAEP.extract(w.XAEP.detect()).find((s) => s.type === "math");
  assert.ok(math);
  assert.doesNotMatch(math.html, /onclick|onerror|evil\.example|<img/);
  assert.match(math.html, /annotation encoding="application\/x-tex"/);
});

test("keeps the SVG and MathML needed for complex KaTeX formulas", () => {
  const formula = katex.renderToString("\\frac{a}{b}+\\sqrt{x}", { displayMode: true });
  const w = load(`<!doctype html><body><article><div data-testid="twitterArticleReadView">
    <div data-block="true">${formula}</div>
  </div></article></body>`);
  const math = w.XAEP.extract(w.XAEP.detect()).find((s) => s.type === "math");
  assert.match(math.html, /<svg[^>]+viewBox=/);
  assert.match(math.html, /<path[^>]+d=/);
  assert.match(math.html, /<annotation encoding="application\/x-tex">/);
});

test("reports 'none' when there is no content", () => {
  const w = load(`<!doctype html><html><head><title>X</title></head><body></body></html>`);
  assert.equal(w.XAEP.detect().mode, "none");
});
