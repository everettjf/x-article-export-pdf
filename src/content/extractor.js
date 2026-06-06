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
      segments.push({ type: "math", html: span.outerHTML, display });
    });
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

  function extractThread() {
    const articles = Array.from(document.querySelectorAll("article"));
    const segments = [];

    articles.forEach((art, idx) => {
      const textBlocks = Array.from(
        art.querySelectorAll('[data-testid="tweetText"]')
      );
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

      art
        .querySelectorAll('img[src*="pbs.twimg.com/media/"]')
        .forEach((img) => {
          segments.push({
            type: "image",
            src: upgradeImageUrl(img.src),
            alt: img.alt || "",
          });
        });

      if (idx < articles.length - 1) segments.push({ type: "separator" });
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
    return extractThread();
  };

  // Force lazy-loaded media to attach by sweeping the article into view, then
  // returning to the original scroll position. Resolves when settled.
  XAEP.preloadMedia = async function preloadMedia() {
    const startY = window.scrollY;
    const step = Math.max(window.innerHeight * 0.85, 600);
    const maxScroll = document.body.scrollHeight;
    for (let y = 0; y <= maxScroll; y += step) {
      window.scrollTo(0, y);
      await delay(120);
    }
    window.scrollTo(0, startY);
    await delay(150);

    // Wait (briefly) for currently-attached images to finish decoding.
    const imgs = Array.from(document.images).filter((i) => !i.complete);
    await Promise.race([
      Promise.all(
        imgs.map(
          (img) =>
            new Promise((res) => {
              img.addEventListener("load", res, { once: true });
              img.addEventListener("error", res, { once: true });
            })
        )
      ),
      delay(2500),
    ]);
  };

  function delay(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }
})();
