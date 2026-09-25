/*!
 * X Article Export — content extractor
 *
 * Turns a detected container into an ordered list of structured segments
 * (headings, paragraphs, code, math, lists, quotes, images). The renderer and
 * the Markdown serializer both consume this neutral representation, so the
 * scraping rules live in exactly one place.
 *
 * The Article read view is a Draft.js tree:
 *   - block-level content  ->  [data-block="true"] elements (H1..H6 / LI / DIV)
 *   - code blocks          ->  [data-testid="markdown-code-block"]
 *   - images               ->  [data-testid="tweetPhoto"] > img
 *   - math                 ->  .katex spans
 */
(function () {
  "use strict";

  const XAEP = (window.XAEP = window.XAEP || {});
  const { sanitizeInline, plainText, normalizeForCompare, isFillerText } = XAEP;

  // ---- Article (Draft.js read view) ------------------------------------------

  function extractArticle(container) {
    const segments = [];
    const seenBlocks = new WeakSet();
    const seenCode = new WeakSet();

    let pendingList = null; // { ordered, items: [] }

    const flushList = () => {
      if (pendingList && pendingList.items.length) segments.push(pendingList);
      pendingList = null;
    };

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!el.getAttribute) continue;

      const testId = el.getAttribute("data-testid");

      // ----- Code blocks --------------------------------------------------
      if (testId === "markdown-code-block") {
        if (seenCode.has(el)) continue;
        seenCode.add(el);
        flushList();

        // Mark every Draft block inside the code container as consumed so its
        // duplicated plain-text rendering is not picked up again.
        el.querySelectorAll('[data-block="true"]').forEach((n) =>
          seenBlocks.add(n)
        );
        const ancestor = el.closest('[data-block="true"]');
        if (ancestor) seenBlocks.add(ancestor);

        const langSpan = el.querySelector("span");
        const language = langSpan ? XAEP.text(langSpan).trim() : "";
        const pre = el.querySelector("pre");
        const text = pre ? (pre.textContent || "").replace(/\s+$/, "") : "";

        if (text) segments.push({ type: "code", language, text });
        continue;
      }

      // ----- Images -------------------------------------------------------
      if (testId === "tweetPhoto") {
        const img = el.querySelector("img");
        if (img && img.src) {
          flushList();
          segments.push({
            type: "image",
            src: upgradeImageUrl(img.src),
            alt: img.alt || "",
          });
        }
        continue;
      }

      // ----- Block-level Draft content -----------------------------------
      if (el.getAttribute("data-block") === "true") {
        if (seenBlocks.has(el)) continue;
        seenBlocks.add(el);

        const tag = el.tagName.toUpperCase();

        // List items -> accumulate into a single list segment.
        if (tag === "LI") {
          const ordered = !!el.closest("ol");
          if (!pendingList || pendingList.ordered !== ordered) {
            flushList();
            pendingList = { type: "list", ordered, items: [] };
          }
          const html = sanitizeInline(el);
          if (html) pendingList.items.push(html);
          continue;
        }

        flushList();

        // Headings (H1..H6).
        if (/^H[1-6]$/.test(tag)) {
          const level = Number(tag.slice(1));
          const clone = el.cloneNode(true);
          clone.querySelectorAll(".katex").forEach((n) => n.remove());
          const html = sanitizeInline(clone);
          if (html) segments.push({ type: "heading", level, html });
          pushMath(el, segments);
          continue;
        }

        // Blockquote.
        if (tag === "BLOCKQUOTE") {
          const html = sanitizeInline(el);
          if (html) segments.push({ type: "quote", html });
          continue;
        }

        // Block containing math: emit the prose, then each formula.
        if (el.querySelector(".katex")) {
          const clone = el.cloneNode(true);
          clone.querySelectorAll(".katex").forEach((n) => n.remove());
          const html = sanitizeInline(clone);
          if (html && !isFillerText(plainText(clone))) {
            segments.push({ type: "text", html });
          }
          pushMath(el, segments);
          continue;
        }

        // Plain paragraph.
        const html = sanitizeInline(el);
        if (html && !isFillerText(plainText(el))) {
          segments.push({ type: "text", html });
        }
        continue;
      }
    }

    flushList();
    return dedupeCodeEcho(segments);
  }

  function pushMath(el, segments) {
    el.querySelectorAll(".katex").forEach((span) => {
      const mathNode = span.querySelector("math");
      const display =
        mathNode && mathNode.getAttribute("display") === "block"
          ? "block"
          : "inline";
      segments.push({ type: "math", html: sanitizeKatex(span), display });
    });
  }

  // KaTeX markup comes from the page, not from this extension. Rebuild only the
  // presentation and MathML subset needed for printing; never copy event
  // handlers, links, embedded resources, or arbitrary CSS into our origin.
  const KATEX_TAGS = new Set([
    "span", "math", "semantics", "annotation", "mrow", "mi", "mn", "mo",
    "mtext", "mspace", "msup", "msub", "msubsup", "mfrac", "msqrt",
    "mroot", "mover", "munder", "munderover", "mtable", "mtr", "mtd",
    "mpadded", "mphantom", "mstyle", "menclose", "svg", "path", "line", "rect",
  ]);
  const KATEX_ATTRS = new Set([
    "aria-hidden", "encoding", "display", "mathvariant", "stretchy", "fence",
    "separator", "lspace", "rspace", "displaystyle", "scriptlevel",
    "columnalign", "rowalign", "accent", "accentunder", "xmlns", "viewbox", "width",
    "height", "fill", "stroke", "stroke-width", "x", "y", "x1", "y1",
    "x2", "y2", "d", "preserveaspectratio",
  ]);
  const KATEX_CSS = new Set([
    "height", "width", "min-width", "vertical-align", "top", "left", "right",
    "margin-left", "margin-right", "padding-left", "border-bottom-width",
  ]);

  function sanitizeKatex(root) {
    function serialize(node) {
      if (node.nodeType === Node.TEXT_NODE) return XAEP.escapeHtml(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.localName.toLowerCase();
      if (!KATEX_TAGS.has(tag)) return "";
      const attrs = [];
      for (const attr of node.attributes) {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        if (name === "class" && /^[\w\s-]+$/.test(value)) {
          attrs.push(`class="${XAEP.escapeHtml(value)}"`);
        } else if (name === "style") {
          const safe = value.split(";").map((rule) => {
            const split = rule.indexOf(":");
            if (split < 0) return "";
            const prop = rule.slice(0, split).trim().toLowerCase();
            const val = rule.slice(split + 1).trim();
            return KATEX_CSS.has(prop) && /^[-+\d.\s%a-z]+$/i.test(val) &&
              !/url|expression|var|calc/i.test(val)
              ? `${prop}:${val}` : "";
          }).filter(Boolean).join(";");
          if (safe) attrs.push(`style="${XAEP.escapeHtml(safe)}"`);
        } else if (KATEX_ATTRS.has(name) && /^[\w\s.,:+\-()%#\/]*$/.test(value)) {
          const outputName = name === "viewbox" ? "viewBox" :
            name === "preserveaspectratio" ? "preserveAspectRatio" : name;
          attrs.push(`${outputName}="${XAEP.escapeHtml(value)}"`);
        }
      }
      const inside = Array.from(node.childNodes).map(serialize).join("");
      return `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>${inside}</${tag}>`;
    }
    return serialize(root);
  }

  // Draft sometimes emits a paragraph that is just the unstyled echo of the code
  // block that follows it ("python\n<same code>"). Drop those.
  function dedupeCodeEcho(segments) {
    const out = [];
    for (let i = 0; i < segments.length; i++) {
      const cur = segments[i];
      const next = segments[i + 1];
      if (cur && cur.type === "text" && next && next.type === "code") {
        const textNorm = normalizeForCompare(stripTags(cur.html));
        const codeNorm = normalizeForCompare(next.text);
        const langCode = normalizeForCompare(
          (next.language || "") + " " + next.text
        );
        if (textNorm === codeNorm || textNorm === langCode) continue;
      }
      out.push(cur);
    }
    return out;
  }

  function stripTags(html) {
    return String(html || "").replace(/<[^>]*>/g, " ");
  }

  // Request the original-resolution media instead of the sized thumbnail X
  // happens to be showing.
  function upgradeImageUrl(src) {
    try {
      const u = new URL(src);
      if (/pbs\.twimg\.com\/media\//.test(u.href)) {
        u.searchParams.set("name", "orig");
      }
      return u.href;
    } catch (_) {
      return src;
    }
  }

  // ---- Thread / single tweet fallback ----------------------------------------

  function extractThread(container) {
    const segments = [];

    if (!container) return segments;
    const art = container;
    const textBlocks = Array.from(art.querySelectorAll('[data-testid="tweetText"]'));
    if (textBlocks.length) {
      textBlocks.forEach((b) => {
        const html = sanitizeInline(b);
        if (html && !isFillerText(plainText(b))) {
          segments.push({ type: "text", html });
        }
      });
    } else {
      const html = sanitizeInline(art);
      if (html && !isFillerText(plainText(art))) {
        segments.push({ type: "text", html });
      }
    }

    art.querySelectorAll('img[src*="pbs.twimg.com/media/"]').forEach((img) => {
      segments.push({
        type: "image",
        src: upgradeImageUrl(img.src),
        alt: img.alt || "",
      });
    });

    return segments;
  }

  // ---- Public API ------------------------------------------------------------

  XAEP.extract = function extract(detection) {
    if (!detection || detection.mode === "none") return [];
    if (detection.mode === "article") {
      const segs = extractArticle(detection.container);
      if (segs.length) return segs;
    }
    return extractThread(detection.container);
  };

  function waitForImages(imgs, timeoutMs) {
    const pending = imgs.filter((i) => !i.complete);
    if (!pending.length) return Promise.resolve();
    return Promise.race([
      Promise.all(
        pending.map(
          (img) =>
            new Promise((res) => {
              img.addEventListener("load", res, { once: true });
              img.addEventListener("error", res, { once: true });
            })
        )
      ),
      delay(timeoutMs),
    ]);
  }

  // Merge successive views of a virtualized article. X may unmount blocks as
  // the user scrolls, so extracting only after the sweep can omit its start.
  function mergeSnapshots(existing, next) {
    if (!next.length) return existing;
    if (!existing.length) return next;
    const oldKeys = existing.map((s) => JSON.stringify(s));
    const newKeys = next.map((s) => JSON.stringify(s));
    const contains = (haystack, needle) => {
      for (let i = 0; i <= haystack.length - needle.length; i++) {
        if (needle.every((key, j) => haystack[i + j] === key)) return true;
      }
      return false;
    };
    if (contains(newKeys, oldKeys)) return next;
    if (contains(oldKeys, newKeys)) return existing;
    for (let n = Math.min(oldKeys.length, newKeys.length); n > 0; n--) {
      if (oldKeys.slice(-n).every((key, i) => key === newKeys[i])) {
        return existing.concat(next.slice(n));
      }
    }
    return existing.concat(next);
  }

  // Capture each viewport before X can unmount it. A tall article is swept
  // even when it has no images; otherwise text-only articles can be truncated.
  XAEP.extractComplete = async function extractComplete(detection) {
    if (!detection || detection.mode !== "article") return XAEP.extract(detection);
    const scope =
      detection && detection.container && detection.container.querySelectorAll
        ? detection.container
        : document;

    const initial = XAEP.extract(detection);
    const imgs = Array.from(scope.querySelectorAll("img"));
    const rect = scope.getBoundingClientRect();
    const needsSweep = rect.height > window.innerHeight * 1.2 ||
      imgs.some((img) => !img.complete);
    if (!needsSweep) return initial;

    const startX = window.scrollX;
    const startY = window.scrollY;
    const top = Math.max(0, rect.top + startY);
    const bottom = top + Math.max(rect.height, scope.scrollHeight);
    const step = Math.max(window.innerHeight * 0.8, 500);
    let captured = [];

    try {
      for (let y = top; y <= bottom; y += step) {
        window.scrollTo(startX, y);
        await delay(140);
        const current = XAEP.detect();
        if (current.mode === "article") {
          captured = mergeSnapshots(captured, XAEP.extract(current));
        }
      }
    } finally {
      window.scrollTo(startX, startY);
    }
    // Let X remount the original viewport before the popup reports success.
    await delay(120);
    await waitForImages(Array.from(scope.querySelectorAll("img")), 2500);
    return captured.length >= initial.length ? captured : initial;
  };

  function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }
})();
